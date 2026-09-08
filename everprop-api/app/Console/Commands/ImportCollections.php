<?php

namespace App\Console\Commands;

use App\Domain\Collections\CollectionsController;
use App\Domain\Collections\CollectionsPolicy;
use App\Domain\Collections\FixedSchedule;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Ramsey\Uuid\Uuid;

final class ImportCollections extends Command
{
    protected $signature = 'everprop:collections:import {tenant} {file} {admin : Tenant administrator public UUID} {--apply : Commit the reviewed import; default rolls back}';

    protected $description = 'Validate a reviewed browser export through collections API rules, preview by default';

    public function handle(): int
    {
        $path = realpath($this->argument('file'));
        $root = realpath(base_path('..')).DIRECTORY_SEPARATOR;
        if (! $path || ! str_starts_with($path, $root)) {
            $this->error('Place the reviewed JSON file inside this repository.');

            return self::FAILURE;
        }
        $tenant = Tenant::query()->where('slug', $this->argument('tenant'))->where('status', 'ACTIVE')->firstOrFail();
        $admin = User::query()->where('tenant_id', $tenant->id)->where('public_id', $this->argument('admin'))->firstOrFail();
        if (! $admin->isActive() || $admin->role() !== RoleCode::TENANT_ADMIN) {
            $this->error('An active tenant administrator is required.');

            return self::FAILURE;
        }
        $context = TenantContext::forTenant($tenant);
        $controller = new CollectionsController($context, new CollectionsPolicy);
        try {
            $document = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            Validator::make($document, [
                'approvedAgreementIds' => 'required|array|min:1', 'approvedAgreementIds.*' => 'required|string|distinct',
                'leadMap' => 'required|array', 'agreements' => 'required|array', 'installments' => 'required|array',
            ])->validate();
            DB::beginTransaction();
            $count = 0;
            foreach ($document['approvedAgreementIds'] as $legacyId) {
                $matches = array_values(array_filter($document['agreements'], fn ($row) => ($row['id'] ?? null) === $legacyId));
                if (count($matches) !== 1) {
                    throw new \RuntimeException("Ambiguous or missing agreement: {$legacyId}");
                }
                $source = $matches[0];
                $leadId = $document['leadMap'][$source['leadId']] ?? null;
                if (! $leadId) {
                    throw new \RuntimeException("Map the lead before importing {$legacyId}.");
                }
                if (! in_array($source['status'] ?? '', ['ACTIVE', 'COMPLETED'], true)) {
                    throw new \RuntimeException('Only active/completed fixed agreements may be imported.');
                }
                $payload = array_intersect_key($source, array_flip([
                    'projectName', 'propertyTitle', 'currency', 'modality', 'totalPrice', 'downPayment',
                    'monthlyRatePct', 'totalInstallments', 'dayOfMonthDue', 'startDate',
                ]));
                $payload['leadId'] = $leadId;
                if (! empty($source['propertyId'])) {
                    $payload['propertyId'] = $document['propertyMap'][$source['propertyId']] ?? null;
                    if (! $payload['propertyId']) {
                        throw new \RuntimeException("Map the property for {$legacyId}.");
                    }
                }
                $payload['notes'] = "Imported browser agreement {$legacyId}. ".($source['notes'] ?? '');
                $payload['idempotencyKey'] = Uuid::uuid5(Uuid::NAMESPACE_URL, "collections-import:{$tenant->id}:{$legacyId}")->toString();
                $makeRequest = static function (array $data) use ($admin): Request {
                    $request = Request::create('/api/v1/admin/payment-agreements', 'POST', $data);
                    $request->setUserResolver(static fn () => $admin);

                    return $request;
                };
                $response = $controller->store($makeRequest($payload))->getData(true);
                $agreement = DB::table('payment_agreements')->where('tenant_id', $tenant->id)->where('public_id', $response['data']['id'])->first();
                $generated = DB::table('installments')->where('tenant_id', $tenant->id)->where('agreement_id', $agreement->id)->orderBy('installment_number')->get();
                $legacy = array_values(array_filter($document['installments'], fn ($row) => ($row['agreementId'] ?? null) === $legacyId));
                usort($legacy, fn ($a, $b) => $a['installmentNumber'] <=> $b['installmentNumber']);
                if (count($legacy) !== $generated->count()) {
                    throw new \RuntimeException("Incomplete schedule for {$legacyId}.");
                }
                foreach ($generated as $index => $installment) {
                    $old = $legacy[$index];
                    Validator::make($old, [
                        'amountExpected' => 'required|numeric|decimal:0,2|min:0.01',
                        'amountPaid' => 'nullable|numeric|decimal:0,2|min:0',
                        'dueDate' => 'required|date_format:Y-m-d', 'installmentNumber' => 'required|integer',
                        'status' => 'required|in:PENDING,DUE_TODAY,OVERDUE,PARTIALLY_PAID,PAID',
                    ])->validate();
                    if ((int) $old['installmentNumber'] !== (int) $installment->installment_number
                        || $old['dueDate'] !== $installment->due_date
                        || FixedSchedule::cents($old['amountExpected']) !== FixedSchedule::cents($installment->amount_expected)) {
                        throw new \RuntimeException("Schedule mismatch for {$legacyId}, installment {$installment->installment_number}. Review dates, rounding and interest before import.");
                    }
                    if (($old['amountPaid'] ?? 0) > 0) {
                        $controller->pay($makeRequest([
                            'amountPaid' => $old['amountPaid'], 'paymentMethod' => $old['paymentMethod'] ?? '',
                            'paymentReceiptNumber' => $old['paymentReceiptNumber'] ?? '', 'paidAt' => $old['paidAt'] ?? '',
                            'notes' => "Imported payment snapshot for {$legacyId}, installment {$installment->installment_number}.",
                            'idempotencyKey' => Uuid::uuid5(Uuid::NAMESPACE_URL, "collections-import:{$tenant->id}:{$legacyId}:{$installment->installment_number}:payment")->toString(),
                        ]), $installment->public_id);
                    } elseif ($old['status'] === 'PAID') {
                        throw new \RuntimeException('A paid installment must include its actual payment amount and receipt.');
                    }
                }
                $count++;
            }
            if ($this->option('apply')) {
                DB::commit();
            } else {
                DB::rollBack();
            }
            $this->info(($this->option('apply') ? 'Imported' : 'Preview valid (rolled back)').": {$count} agreements. No sample data selected automatically.");

            return self::SUCCESS;
        } catch (\Throwable $error) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->error($error->getMessage());

            return self::FAILURE;
        }
    }
}

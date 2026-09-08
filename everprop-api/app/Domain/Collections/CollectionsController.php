<?php

namespace App\Domain\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class CollectionsController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly CollectionsPolicy $policy) {}

    public function leads(Request $request): JsonResponse
    {
        abort_unless($this->policy->view($request->user(), $this->context->id()), 403);
        $query = DB::table('leads as l')->where('l.tenant_id', $this->context->id())->whereNull('l.deleted_at')
            ->join('contacts as c', function ($join) {
                $join->on('c.id', '=', 'l.contact_id')->on('c.tenant_id', '=', 'l.tenant_id');
            })->leftJoin('users as u', function ($join) {
                $join->on('u.id', '=', 'l.assigned_user_id')->on('u.tenant_id', '=', 'l.tenant_id');
            });
        if ($request->user()->role() === RoleCode::SALES_ADVISOR) {
            $query->where('l.assigned_user_id', $request->user()->id);
        }
        $page = $query->select('l.public_id as id', 'c.display_name as name', 'c.phone_e164 as phone', 'u.public_id as agentId')
            ->orderBy('l.id')->paginate(100);

        return response()->json(['data' => $page->items(), 'meta' => ['last_page' => $page->lastPage()]]);
    }

    private function scope(Request $request): Builder
    {
        abort_unless($this->policy->view($request->user(), $this->context->id()), 403);
        $query = DB::table('payment_agreements as a')
            ->join('leads as l', function ($join) {
                $join->on('l.id', '=', 'a.lead_id')->on('l.tenant_id', '=', 'a.tenant_id');
            })
            ->leftJoin('users as u', function ($join) {
                $join->on('u.id', '=', 'l.assigned_user_id')->on('u.tenant_id', '=', 'a.tenant_id');
            })
            ->where('a.tenant_id', $this->context->id())->whereNull('l.deleted_at');
        if ($request->user()->role() === RoleCode::SALES_ADVISOR) {
            $query->where('l.assigned_user_id', $request->user()->id);
        }
        if ($request->filled('leadId')) {
            $query->where('l.public_id', $request->string('leadId')->toString());
        }

        return $query;
    }

    private function lead(Request $request, int|string $id, bool $public = false): object
    {
        $lead = DB::table('leads')->where('tenant_id', $this->context->id())
            ->where($public ? 'public_id' : 'id', $id)->whereNull('deleted_at')->first();
        abort_unless($lead && $this->policy->view($request->user(), $this->context->id(), $lead), 404);

        return $lead;
    }

    /** @return array<string, mixed> */
    private function agreementData(object $row): array
    {
        return [
            'id' => $row->public_id, 'publicId' => $row->public_id,
            'companyId' => (string) $row->tenant_id, 'leadId' => $row->lead_public_id,
            'advisorId' => $row->advisor_public_id, 'projectName' => $row->project_name,
            'propertyTitle' => $row->property_title, 'currency' => $row->currency,
            'modality' => $row->modality, 'totalPrice' => (float) $row->total_price,
            'downPayment' => (float) $row->down_payment, 'financedBalance' => (float) $row->financed_balance,
            'monthlyRatePct' => (float) $row->monthly_rate_pct, 'totalInstallments' => $row->total_installments,
            'dayOfMonthDue' => $row->day_of_month_due, 'startDate' => $row->start_date,
            'status' => $row->status, 'notes' => $row->notes,
            'createdAt' => $row->created_at, 'updatedAt' => $row->updated_at,
        ];
    }

    public function agreements(Request $request): JsonResponse
    {
        $page = $this->scope($request)->select('a.*', 'l.public_id as lead_public_id', 'u.public_id as advisor_public_id')
            ->orderBy('a.id')->paginate(100);

        return response()->json(['data' => collect($page->items())->map(fn ($row) => $this->agreementData($row)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    public function show(Request $request, string $agreement): JsonResponse
    {
        $row = $this->scope($request)->where('a.public_id', $agreement)
            ->select('a.*', 'l.public_id as lead_public_id', 'u.public_id as advisor_public_id')->first();
        abort_unless($row !== null, 404);
        $this->lead($request, $row->lead_id);

        return response()->json(['data' => $this->agreementData($row)]);
    }

    private function installmentQuery(Request $request): Builder
    {
        $monthStart = substr($this->today(), 0, 7).'-01';
        $paid = DB::table('installment_payments')->where('tenant_id', $this->context->id())->whereNull('reversed_at')
            ->selectRaw('installment_id, SUM(amount) as amount_paid, MAX(paid_at) as paid_at, SUM(CASE WHEN paid_at >= ? THEN amount ELSE 0 END) as paid_this_month', [$monthStart])->groupBy('installment_id');

        return $this->scope($request)->join('installments as i', function ($join) {
            $join->on('i.agreement_id', '=', 'a.id')->on('i.tenant_id', '=', 'a.tenant_id');
        })->leftJoinSub($paid, 'p', 'p.installment_id', '=', 'i.id')
            ->select('i.*', 'a.public_id as agreement_public_id', 'a.currency', 'a.status as agreement_status',
                'l.public_id as lead_public_id', 'u.public_id as advisor_public_id', 'p.paid_at')
            ->selectRaw('COALESCE(p.amount_paid, 0) as amount_paid, COALESCE(p.paid_this_month, 0) as paid_this_month');
    }

    private function today(): string
    {
        $zone = DB::table('tenants')->where('id', $this->context->id())->value('timezone');

        return CarbonImmutable::now($zone ?: 'America/Argentina/Salta')->toDateString();
    }

    /** @return array<string, mixed> */
    private function installmentData(object $row, string $today): array
    {
        $remaining = max(0, FixedSchedule::cents($row->amount_expected) - FixedSchedule::cents($row->amount_paid));
        $status = $row->cancelled_at || $row->agreement_status === 'CANCELLED' ? 'CANCELLED'
            : ($remaining === 0 ? 'PAID' : ($row->due_date < $today ? 'OVERDUE'
                : ($row->due_date === $today ? 'DUE_TODAY' : ((float) $row->amount_paid > 0 ? 'PARTIALLY_PAID' : 'PENDING'))));

        return [
            'id' => $row->public_id, 'agreementId' => $row->agreement_public_id,
            'leadId' => $row->lead_public_id, 'advisorId' => $row->advisor_public_id,
            'companyId' => (string) $row->tenant_id, 'installmentNumber' => $row->installment_number,
            'dueDate' => $row->due_date, 'amountExpected' => (float) $row->amount_expected,
            'amountPaid' => (float) $row->amount_paid, 'amountRemaining' => (float) FixedSchedule::decimal($remaining),
            'paidThisMonth' => (float) $row->paid_this_month,
            'paidAt' => $row->paid_at, 'currency' => $row->currency, 'status' => $status,
            'daysOverdue' => $status === 'OVERDUE' ? (int) CarbonImmutable::parse($row->due_date)->diffInDays(CarbonImmutable::parse($today)) : 0,
            'noticeCount' => 0, 'serverManaged' => true,
        ];
    }

    public function installments(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => 'sometimes|in:overdue,dueToday,next7Days,paid',
            'projectName' => 'sometimes|string|max:160',
            'dueFrom' => 'sometimes|date_format:Y-m-d', 'dueTo' => 'sometimes|date_format:Y-m-d',
            'search' => 'sometimes|string|max:160',
        ]);
        $query = $this->installmentQuery($request);
        if ($request->filled('agreementId')) {
            $query->where('a.public_id', $request->string('agreementId')->toString());
        }
        $today = $this->today();
        if (isset($filters['projectName'])) {
            $query->where('a.project_name', $filters['projectName']);
        }
        if (isset($filters['dueFrom'])) {
            $query->where('i.due_date', '>=', $filters['dueFrom']);
        }
        if (isset($filters['dueTo'])) {
            $query->where('i.due_date', '<=', $filters['dueTo']);
        }
        if (isset($filters['search'])) {
            $query->whereExists(function ($sub) use ($filters) {
                $sub->selectRaw('1')->from('contacts as c')->whereColumn('c.id', 'l.contact_id')
                    ->where('c.tenant_id', $this->context->id())->where('c.display_name', 'like', '%'.$filters['search'].'%');
            });
        }
        if (isset($filters['status'])) {
            $query->whereNull('i.cancelled_at')->where('a.status', '!=', 'CANCELLED');
            $query->whereRaw($filters['status'] === 'paid' ? 'i.amount_expected <= COALESCE(p.amount_paid,0)' : 'i.amount_expected > COALESCE(p.amount_paid,0)');
            if ($filters['status'] === 'overdue') {
                $query->where('i.due_date', '<', $today);
            }
            if ($filters['status'] === 'dueToday') {
                $query->where('i.due_date', $today);
            }
            if ($filters['status'] === 'next7Days') {
                $query->whereBetween('i.due_date', [$today, CarbonImmutable::parse($today)->addDays(7)->toDateString()]);
            }
        }
        $page = $query->orderBy('i.id')->paginate(100);

        return response()->json(['data' => collect($page->items())->map(fn ($row) => $this->installmentData($row, $today)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    public function summary(Request $request): JsonResponse
    {
        $result = [];
        $today = $this->today();
        foreach ($this->installmentQuery($request)->orderBy('i.id')->cursor() as $row) {
            $item = $this->installmentData($row, $today);
            $currency = $item['currency'];
            $result[$currency] ??= ['outstanding' => 0, 'overdue' => 0, 'overdueCount' => 0, 'paid' => 0];
            $result[$currency]['paid'] += FixedSchedule::cents($row->amount_paid);
            if ($item['status'] !== 'CANCELLED') {
                $result[$currency]['outstanding'] += FixedSchedule::cents($item['amountRemaining']);
                if ($item['status'] === 'OVERDUE') {
                    $result[$currency]['overdue'] += FixedSchedule::cents($item['amountRemaining']);
                    $result[$currency]['overdueCount']++;
                }
            }
        }
        foreach ($result as &$totals) {
            foreach (['outstanding', 'overdue', 'paid'] as $key) {
                $totals[$key] = FixedSchedule::decimal($totals[$key]);
            }
        }

        return response()->json(['data' => $result]);
    }

    /** @param array<string, mixed> $data */
    private function hash(array $data): string
    {
        ksort($data);

        return hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => 'prohibited', 'companyId' => 'prohibited',
            'leadId' => 'required|uuid', 'propertyId' => 'nullable|uuid',
            'projectName' => 'nullable|string|max:160', 'propertyTitle' => 'nullable|string|max:255',
            'currency' => 'required|in:ARS,USD', 'modality' => 'required|in:FIXED',
            'totalPrice' => 'required|numeric|decimal:0,2|min:0.01|max:1000000000',
            'downPayment' => 'required|numeric|decimal:0,2|min:0|lt:totalPrice',
            'monthlyRatePct' => 'sometimes|numeric|decimal:0,4|min:0|max:100',
            'totalInstallments' => 'required|integer|min:1|max:360',
            'dayOfMonthDue' => 'required|integer|min:1|max:31',
            'startDate' => 'required|date_format:Y-m-d|after_or_equal:2000-01-01|before:2100-01-01',
            'notes' => 'nullable|string|max:10000', 'idempotencyKey' => 'required|uuid',
        ]);
        $lead = $this->lead($request, $data['leadId'], true);
        abort_unless($this->policy->write($request->user(), $this->context->id(), $lead), 403);
        $id = DB::transaction(function () use ($request, $data, $lead) {
            // Serialize creation per tenant, including concurrent idempotent retries.
            DB::table('tenants')->where('id', $this->context->id())->lockForUpdate()->first();
            $lead = DB::table('leads')->where('tenant_id', $this->context->id())->where('id', $lead->id)->whereNull('deleted_at')->lockForUpdate()->first();
            abort_unless($lead && $this->policy->write($request->user(), $this->context->id(), $lead), 403);
            $existing = DB::table('payment_agreements')->where('tenant_id', $this->context->id())
                ->where('idempotency_key', $data['idempotencyKey'])->first();
            if ($existing) {
                abort_unless($existing->request_hash === $this->hash($data), 409, 'La clave ya corresponde a otro acuerdo.');

                return $existing->public_id;
            }
            $propertyId = null;
            if (! empty($data['propertyId'])) {
                $propertyId = DB::table('properties')->where('tenant_id', $this->context->id())
                    ->where('public_id', $data['propertyId'])->whereNull('deleted_at')->value('id');
                abort_unless($propertyId, 422, 'Propiedad inválida.');
            }
            $balance = FixedSchedule::cents($data['totalPrice']) - FixedSchedule::cents($data['downPayment']);
            abort_unless($balance >= (int) $data['totalInstallments'], 422, 'El saldo debe cubrir al menos un centavo por cuota.');
            $publicId = (string) Str::uuid();
            $agreementId = DB::table('payment_agreements')->insertGetId([
                'tenant_id' => $this->context->id(), 'public_id' => $publicId, 'lead_id' => $lead->id,
                'property_id' => $propertyId, 'created_by' => $request->user()->id,
                'project_name' => $data['projectName'] ?? null, 'property_title' => $data['propertyTitle'] ?? null,
                'currency' => $data['currency'], 'modality' => 'FIXED', 'total_price' => $data['totalPrice'],
                'down_payment' => $data['downPayment'], 'financed_balance' => FixedSchedule::decimal($balance),
                'monthly_rate_pct' => $data['monthlyRatePct'] ?? 0, 'total_installments' => $data['totalInstallments'],
                'day_of_month_due' => $data['dayOfMonthDue'], 'start_date' => $data['startDate'],
                'notes' => $data['notes'] ?? null, 'idempotency_key' => $data['idempotencyKey'], 'request_hash' => $this->hash($data),
            ]);
            foreach (FixedSchedule::make($balance, (int) $data['totalInstallments'], (string) ($data['monthlyRatePct'] ?? 0), $data['startDate'], (int) $data['dayOfMonthDue']) as $row) {
                DB::table('installments')->insert($row + ['tenant_id' => $this->context->id(),
                    'agreement_id' => $agreementId, 'public_id' => (string) Str::uuid()]);
            }

            return $publicId;
        });

        return $this->show($request, $id)->setStatusCode(201);
    }

    private function paymentTarget(Request $request, string $installment): object
    {
        $row = $this->installmentQuery($request)->where('i.public_id', $installment)->first();
        abort_unless($row !== null, 404);

        return $row;
    }

    public function payments(Request $request, string $installment): JsonResponse
    {
        $row = $this->paymentTarget($request, $installment);

        return response()->json(['data' => DB::table('installment_payments')->where('tenant_id', $this->context->id())
            ->where('installment_id', $row->id)->orderByDesc('id')->get([
                'public_id as id', 'amount', 'method', 'receipt_number as receiptNumber', 'paid_at as paidAt',
                'notes', 'reversed_at as reversedAt', 'reversal_reason as reversalReason', 'created_at as createdAt',
            ])]);
    }

    public function pay(Request $request, string $installment): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => 'prohibited', 'companyId' => 'prohibited',
            'amountPaid' => 'required|numeric|decimal:0,2|min:0.01|max:1000000000',
            'paymentMethod' => 'required|in:TRANSFER,CASH,CHECK,DEPOSIT',
            'paymentReceiptNumber' => 'required|string|max:120',
            'paidAt' => 'required|date_format:Y-m-d|after_or_equal:2000-01-01|before_or_equal:'.$this->today(),
            'notes' => 'nullable|string|max:10000', 'idempotencyKey' => 'required|uuid',
        ]);
        $target = $this->paymentTarget($request, $installment);
        $agreement = DB::table('payment_agreements')->where('tenant_id', $this->context->id())->where('id', $target->agreement_id)->first();
        $lead = $this->lead($request, $agreement->lead_id);
        abort_unless($this->policy->write($request->user(), $this->context->id(), $lead), 403);
        DB::transaction(function () use ($request, $data, $target) {
            DB::table('tenants')->where('id', $this->context->id())->lockForUpdate()->first();
            $agreement = DB::table('payment_agreements')->where('tenant_id', $this->context->id())->where('id', $target->agreement_id)->lockForUpdate()->first();
            $lead = DB::table('leads')->where('tenant_id', $this->context->id())->where('id', $agreement->lead_id)->whereNull('deleted_at')->lockForUpdate()->first();
            abort_unless($lead && $this->policy->write($request->user(), $this->context->id(), $lead), 403);
            $row = DB::table('installments')->where('tenant_id', $this->context->id())->where('id', $target->id)->lockForUpdate()->first();
            $hash = $this->hash($data + ['installmentId' => $row->public_id]);
            $existing = DB::table('installment_payments')->where('tenant_id', $this->context->id())->where('idempotency_key', $data['idempotencyKey'])->first();
            if ($existing) {
                abort_unless($existing->request_hash === $hash, 409, 'La clave ya corresponde a otro pago.');

                return;
            }
            abort_unless($agreement->status === 'ACTIVE' && ! $row->cancelled_at, 422, 'El acuerdo no admite pagos.');
            $paid = DB::table('installment_payments')->where('tenant_id', $this->context->id())->where('installment_id', $row->id)->whereNull('reversed_at')->sum('amount');
            abort_if(FixedSchedule::cents($data['amountPaid']) > FixedSchedule::cents($row->amount_expected) - FixedSchedule::cents($paid), 422, 'El pago supera el saldo pendiente.');
            DB::table('installment_payments')->insert([
                'tenant_id' => $this->context->id(), 'public_id' => (string) Str::uuid(), 'installment_id' => $row->id,
                'amount' => $data['amountPaid'], 'method' => $data['paymentMethod'], 'receipt_number' => $data['paymentReceiptNumber'],
                'paid_at' => $data['paidAt'], 'recorded_by' => $request->user()->id, 'notes' => $data['notes'] ?? null,
                'idempotency_key' => $data['idempotencyKey'], 'request_hash' => $hash,
            ]);
            $unpaid = $this->installmentQuery($request)->where('a.id', $agreement->id)
                ->whereNull('i.cancelled_at')->whereRaw('i.amount_expected > COALESCE(p.amount_paid,0)')->exists();
            if (! $unpaid) {
                DB::table('payment_agreements')->where('tenant_id', $this->context->id())->where('id', $agreement->id)->update(['status' => 'COMPLETED']);
            }
        });

        return $this->payments($request, $installment)->setStatusCode(201);
    }

    public function reverse(Request $request, string $payment): JsonResponse
    {
        $data = $request->validate(['reason' => 'required|string|min:3|max:500']);
        $row = DB::table('installment_payments')->where('tenant_id', $this->context->id())->where('public_id', $payment)->first();
        abort_unless($row !== null, 404);
        $inst = DB::table('installments')->where('tenant_id', $this->context->id())->where('id', $row->installment_id)->first();
        $target = $this->paymentTarget($request, $inst->public_id);
        $agreement = DB::table('payment_agreements')->where('tenant_id', $this->context->id())->where('id', $target->agreement_id)->first();
        $lead = $this->lead($request, $agreement->lead_id);
        abort_unless($this->policy->reverse($request->user(), $this->context->id(), $lead), 403);
        DB::transaction(function () use ($request, $row, $agreement, $data) {
            DB::table('tenants')->where('id', $this->context->id())->lockForUpdate()->first();
            DB::table('payment_agreements')->where('tenant_id', $this->context->id())->where('id', $agreement->id)->lockForUpdate()->first();
            $lead = DB::table('leads')->where('tenant_id', $this->context->id())->where('id', $agreement->lead_id)->whereNull('deleted_at')->lockForUpdate()->first();
            abort_unless($lead && $this->policy->reverse($request->user(), $this->context->id(), $lead), 403);
            DB::table('installment_payments')->where('tenant_id', $this->context->id())->where('id', $row->id)->whereNull('reversed_at')
                ->update(['reversed_at' => now(), 'reversed_by' => $request->user()->id, 'reversal_reason' => $data['reason']]);
            DB::table('payment_agreements')->where('tenant_id', $this->context->id())->where('id', $agreement->id)
                ->where('status', 'COMPLETED')->update(['status' => 'ACTIVE']);
        });

        return response()->json(['data' => ['id' => $payment, 'reversed' => true]]);
    }
}

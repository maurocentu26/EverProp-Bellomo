<?php

namespace App\Domain\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class CollectionBillingController
{
    public function __construct(private readonly CollectionsPolicy $policy) {}

    public function export(Request $request): JsonResponse
    {
        $context = $request->attributes->get(TenantContext::class);
        abort_unless($context instanceof TenantContext, 403);
        abort_unless($this->policy->view($request->user(), $context->id())
            && in_array($request->user()->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER], true), 403);
        $data = $request->validate([
            'paidFrom' => 'required|date_format:Y-m-d|after_or_equal:2000-01-01',
            'paidTo' => 'required|date_format:Y-m-d|after_or_equal:paidFrom|before:2100-01-01',
            'tenant_id' => 'prohibited', 'companyId' => 'prohibited',
        ]);
        // One bounded query is a consistent payment snapshot; never silently truncate.
        $rows = DB::table('installment_payments as p')->where('p.tenant_id', $context->id())
            ->join('installments as i', function ($join) {
                $join->on('i.id', '=', 'p.installment_id')->on('i.tenant_id', '=', 'p.tenant_id');
            })->join('payment_agreements as a', function ($join) {
                $join->on('a.id', '=', 'i.agreement_id')->on('a.tenant_id', '=', 'i.tenant_id');
            })->join('leads as l', function ($join) {
                $join->on('l.id', '=', 'a.lead_id')->on('l.tenant_id', '=', 'a.tenant_id');
            })->join('contacts as c', function ($join) {
                $join->on('c.id', '=', 'l.contact_id')->on('c.tenant_id', '=', 'l.tenant_id');
            })->leftJoin('properties as property', function ($join) {
                $join->on('property.id', '=', 'a.property_id')->on('property.tenant_id', '=', 'a.tenant_id');
            })->whereNull('l.deleted_at')->whereNull('c.deleted_at')
            ->whereBetween('p.paid_at', [$data['paidFrom'], $data['paidTo']])->orderBy('p.id')->limit(5001)
            ->get(['p.public_id as paymentId', 'p.paid_at as paidAt', 'p.amount', 'p.method',
                'p.receipt_number as receiptReference', 'p.reversed_at as reversedAt', 'p.reversal_reason as reversalReason',
                'i.public_id as installmentId', 'i.installment_number as installmentNumber',
                'a.public_id as agreementId', 'a.currency', 'a.project_name as projectName',
                'c.public_id as customerId', 'c.display_name as customerName',
                'property.legacy_ed_id as legacyProjectId', 'property.legacy_pis as legacyFloor', 'property.legacy_dep as legacyUnit']);
        abort_if($rows->count() > 5000, 422, 'Hay más de 5000 pagos. Reducí el intervalo de fechas para exportar.');

        return response()->json(['data' => $rows->map(function ($row) {
            $row->amount = (string) $row->amount;
            $row->status = $row->reversedAt ? 'REVERSED' : 'RECORDED';

            return $row;
        }), 'meta' => ['version' => 1, 'purpose' => 'PAYMENT_RECONCILIATION_NOT_FISCAL_INVOICE',
            'paidFrom' => $data['paidFrom'], 'paidTo' => $data['paidTo'], 'exportedAt' => now()->toIso8601String(),
            'count' => $rows->count()]])->header('Cache-Control', 'no-store');
    }
}

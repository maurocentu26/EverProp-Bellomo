<?php

namespace App\Domain\Collections;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class CollectionEmail
{
    public function query(int $tenantId): Builder
    {
        $paid = DB::table('installment_payments')->where('tenant_id', $tenantId)->whereNull('reversed_at')
            ->selectRaw('installment_id, SUM(amount) AS paid')->groupBy('installment_id');

        return DB::table('installments as i')->where('i.tenant_id', $tenantId)
            ->join('payment_agreements as a', function ($join) {
                $join->on('a.id', '=', 'i.agreement_id')->on('a.tenant_id', '=', 'i.tenant_id');
            })->join('leads as l', function ($join) {
                $join->on('l.id', '=', 'a.lead_id')->on('l.tenant_id', '=', 'a.tenant_id');
            })->join('contacts as c', function ($join) {
                $join->on('c.id', '=', 'l.contact_id')->on('c.tenant_id', '=', 'l.tenant_id');
            })->leftJoinSub($paid, 'p', 'p.installment_id', '=', 'i.id')
            ->whereNull('l.deleted_at')->whereNull('c.deleted_at')
            ->select('i.*', 'a.status as agreement_status', 'a.currency', 'l.assigned_user_id',
                'c.email', 'c.display_name')->selectRaw('COALESCE(p.paid, 0) AS paid');
    }

    /** @return array<string, mixed> */
    public function preview(object $row, object $tenant): array
    {
        $today = CarbonImmutable::now($tenant->timezone)->toDateString();
        $remaining = max(0, FixedSchedule::cents($row->amount_expected) - FixedSchedule::cents($row->paid));
        $reason = match (true) {
            $row->agreement_status !== 'ACTIVE', $row->cancelled_at !== null => 'El acuerdo o la cuota no están activos.',
            $remaining === 0 => 'La cuota está pagada.',
            $row->due_date > $today => 'La cuota todavía no venció.',
            ! filter_var($row->email, FILTER_VALIDATE_EMAIL) => 'El cliente no tiene un correo válido en su ficha.',
            default => null,
        };
        $amount = FixedSchedule::decimal($remaining);
        $subject = "Recordatorio de cuota {$row->installment_number} — {$tenant->name}";
        $body = "Hola {$row->display_name},\n\nSegún nuestros registros al {$today}, la cuota {$row->installment_number}, con vencimiento {$row->due_date}, tiene un saldo pendiente de {$row->currency} {$amount}.\n\nSi ya realizaste el pago, por favor respondé a este correo para que podamos verificarlo. Para cualquier consulta, contactá a nuestro equipo de cobranzas.\n\n{$tenant->name}";
        $provisioned = config('collections_mail.tenant') === $tenant->slug;

        return ['eligible' => $reason === null, 'reason' => $reason,
            'recipient' => $row->email, 'subject' => $subject, 'body' => $body,
            'amountRemaining' => $amount, 'currency' => $row->currency, 'businessDate' => $today,
            'sender' => $provisioned ? config('collections_mail.from_address') : null,
            'deliveryEnabled' => $provisioned && (bool) config('collections_mail.enabled')];
    }
}

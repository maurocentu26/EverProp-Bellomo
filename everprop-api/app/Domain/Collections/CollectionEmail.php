<?php

namespace App\Domain\Collections;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Collection emails to the client. OVERDUE: reminder of an overdue installment (operator-triggered).
 * UPCOMING (EVP-31): notice that an installment is about to fall due, modelled on a utility's "digital invoice"
 * (amount, due date, installment n of N, how to pay). Text, recipient and amount always come from the server.
 */
final class CollectionEmail
{
    public const UPCOMING = 'UPCOMING';

    public const OVERDUE = 'OVERDUE';

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
            ->select('i.*', 'a.status as agreement_status', 'a.currency', 'a.total_installments', 'a.property_title',
                'l.assigned_user_id', 'c.email', 'c.display_name')->selectRaw('COALESCE(p.paid, 0) AS paid');
    }

    /** @return array<string, mixed> */
    public function preview(object $row, object $tenant, string $kind = self::OVERDUE): array
    {
        $now = CarbonImmutable::now($tenant->timezone);
        $today = $now->toDateString();
        $remaining = max(0, FixedSchedule::cents($row->amount_expected) - FixedSchedule::cents($row->paid));
        $upcomingUntil = $now->addDays(max(0, (int) config('collections_mail.upcoming_days')))->toDateString();
        $reason = match (true) {
            $row->agreement_status !== 'ACTIVE', $row->cancelled_at !== null => 'El acuerdo o la cuota no están activos.',
            $remaining === 0 => 'La cuota está pagada.',
            $kind === self::OVERDUE && $row->due_date > $today => 'La cuota todavía no venció.',
            $kind === self::UPCOMING && $row->due_date < $today => 'La cuota ya venció: corresponde un recordatorio de deuda.',
            $kind === self::UPCOMING && $row->due_date > $upcomingUntil => 'Todavía falta para el aviso de esta cuota.',
            ! filter_var($row->email, FILTER_VALIDATE_EMAIL) => 'El cliente no tiene un correo válido en su ficha.',
            default => null,
        };
        $amount = FixedSchedule::decimal($remaining);
        [$subject, $body] = $kind === self::UPCOMING
            ? $this->upcoming($row, $tenant, $amount)
            : $this->overdue($row, $tenant, $amount, $today);
        $provisioned = config('collections_mail.tenant') === $tenant->slug;

        return ['eligible' => $reason === null, 'reason' => $reason, 'kind' => $kind,
            'recipient' => $row->email, 'subject' => $subject, 'body' => $body,
            'amountRemaining' => $amount, 'currency' => $row->currency, 'businessDate' => $today,
            'sender' => $provisioned ? config('collections_mail.from_address') : null,
            'deliveryEnabled' => $provisioned && (bool) config('collections_mail.enabled')];
    }

    /** @return array{0: string, 1: string} */
    private function upcoming(object $row, object $tenant, string $amount): array
    {
        $due = CarbonImmutable::parse($row->due_date)->format('d/m/Y');
        $property = $row->property_title ? " — {$row->property_title}" : '';
        $instructions = trim((string) config('collections_mail.payment_instructions'));

        return [
            "Tu cuota {$row->installment_number} de {$row->total_installments} vence el {$due} — {$tenant->name}",
            "Hola {$row->display_name},\n\n"
            ."Te recordamos el próximo vencimiento de tu plan de pagos{$property}:\n\n"
            ."  Cuota: {$row->installment_number} de {$row->total_installments}\n"
            ."  Vencimiento: {$due}\n"
            ."  Importe a pagar: {$row->currency} {$amount}\n\n"
            .($instructions !== '' ? "Cómo pagar:\n{$instructions}\n\n" : '')
            .'Si ya realizaste el pago, no tenés que hacer nada: este aviso se genera según nuestros registros y puede no '
            ."reflejar pagos de los últimos días. Ante cualquier duda, respondé este correo.\n\n"
            ."{$tenant->name}",
        ];
    }

    /** @return array{0: string, 1: string} */
    private function overdue(object $row, object $tenant, string $amount, string $today): array
    {
        return [
            "Recordatorio de cuota {$row->installment_number} — {$tenant->name}",
            "Hola {$row->display_name},\n\nSegún nuestros registros al {$today}, la cuota {$row->installment_number}, con vencimiento {$row->due_date}, tiene un saldo pendiente de {$row->currency} {$amount}.\n\nSi ya realizaste el pago, por favor respondé a este correo para que podamos verificarlo. Para cualquier consulta, contactá a nuestro equipo de cobranzas.\n\n{$tenant->name}",
        ];
    }
}

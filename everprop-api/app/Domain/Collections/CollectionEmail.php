<?php

namespace App\Domain\Collections;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Collection emails to the client. OVERDUE: reminder of an overdue installment (operator-triggered).
 * UPCOMING (EVP-31): notice that an installment is about to fall due, modelled on a utility's "digital invoice"
 * (amount, due date, installment n of N, how to pay). EVP-53 completes the sequence: DUE_TODAY on the due date and
 * PAST_DUE once, a few days after. Text, recipient and amount always come from the server; the HTML part is the same
 * statement with every value escaped, and the plain text stays for clients that block HTML.
 */
final class CollectionEmail
{
    public const UPCOMING = 'UPCOMING';

    public const OVERDUE = 'OVERDUE';

    public const DUE_TODAY = 'DUE_TODAY';

    public const PAST_DUE = 'PAST_DUE';

    /** Sent by the scheduler, each at most once per installment; OVERDUE stays the operator's manual reminder. */
    public const SEQUENCE = [self::DUE_TODAY, self::PAST_DUE, self::UPCOMING];

    /** @return list<string> kinds whose existing attempt means this notice must not go out */
    public static function alreadyCovered(string $kind): array
    {
        return $kind === self::PAST_DUE ? [self::PAST_DUE, self::OVERDUE] : [$kind];
    }

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
        [$pastDueFrom, $pastDueUntil] = $this->pastDueWindow($now);
        $reason = match (true) {
            $row->agreement_status !== 'ACTIVE', $row->cancelled_at !== null => 'El acuerdo o la cuota no están activos.',
            $remaining === 0 => 'La cuota está pagada.',
            $kind === self::OVERDUE && $row->due_date > $today => 'La cuota todavía no venció.',
            $kind === self::UPCOMING && $row->due_date < $today => 'La cuota ya venció: corresponde un recordatorio de deuda.',
            $kind === self::UPCOMING && $row->due_date === $today => 'Vence hoy: corresponde el aviso del día.',
            $kind === self::UPCOMING && $row->due_date > $upcomingUntil => 'Todavía falta para el aviso de esta cuota.',
            $kind === self::DUE_TODAY && $row->due_date !== $today => 'La cuota no vence hoy.',
            $kind === self::PAST_DUE && $row->due_date > $pastDueUntil => 'Todavía no corresponde el aviso de cuota pendiente.',
            $kind === self::PAST_DUE && $row->due_date < $pastDueFrom => 'Venció hace más tiempo: el aviso de deuda lo decide una persona.',
            ! filter_var($row->email, FILTER_VALIDATE_EMAIL) => 'El cliente no tiene un correo válido en su ficha.',
            default => null,
        };
        $amount = self::money($row->currency, FixedSchedule::decimal($remaining));
        [$subject, $body, $html] = match ($kind) {
            self::UPCOMING => $this->upcoming($row, $tenant, $amount),
            self::DUE_TODAY => $this->dueToday($row, $tenant, $amount),
            self::PAST_DUE => $this->pastDue($row, $tenant, $amount),
            default => [...$this->overdue($row, $tenant, $amount, $today), null],
        };
        $provisioned = config('collections_mail.tenant') === $tenant->slug;

        return ['eligible' => $reason === null, 'reason' => $reason, 'kind' => $kind,
            'recipient' => $row->email, 'subject' => $subject, 'body' => $body, 'html' => $html,
            'amountRemaining' => $amount, 'currency' => $row->currency, 'businessDate' => $today,
            'sender' => $provisioned ? config('collections_mail.from_address') : null,
            'deliveryEnabled' => $provisioned && (bool) config('collections_mail.enabled')];
    }

    /** "$ 450.000,00" / "US$ 1.250,50": the format a buyer in Argentina reads on any bill. */
    public static function money(?string $currency, string $decimal): string
    {
        $symbol = match ($currency) {
            'ARS' => '$',
            'USD' => 'US$',
            default => (string) $currency,
        };

        return trim($symbol.' '.number_format((float) $decimal, 2, ',', '.'));
    }

    /** @return array{0: string, 1: string} */
    public function pastDueWindow(CarbonImmutable $now): array
    {
        return [$now->subDays(max(1, (int) config('collections_mail.past_due_max_days')))->toDateString(),
            $now->subDays(max(1, (int) config('collections_mail.past_due_days')))->toDateString()];
    }

    /** @return array{0: string, 1: string, 2: string} */
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
            ."  Importe a pagar: {$amount}\n\n"
            .($instructions !== '' ? "Cómo pagar:\n{$instructions}\n\n" : '')
            .'Si ya realizaste el pago, no tenés que hacer nada: este aviso se genera según nuestros registros y puede no '
            ."reflejar pagos de los últimos días. Ante cualquier duda, respondé este correo.\n\n"
            ."{$tenant->name}",
            $this->html($row, $tenant, $amount, "Tu cuota vence el {$due}", 'Te recordamos el próximo vencimiento de tu plan de pagos.'),
        ];
    }

    /** @return array{0: string, 1: string, 2: string} */
    private function dueToday(object $row, object $tenant, string $amount): array
    {
        $property = $row->property_title ? " — {$row->property_title}" : '';
        $instructions = trim((string) config('collections_mail.payment_instructions'));

        return [
            "Hoy vence tu cuota {$row->installment_number} de {$row->total_installments} — {$tenant->name}",
            "Hola {$row->display_name},\n\n"
            ."Hoy vence la cuota {$row->installment_number} de {$row->total_installments} de tu plan de pagos{$property}.\n\n"
            ."  Importe a pagar: {$amount}\n\n"
            .($instructions !== '' ? "Cómo pagar:\n{$instructions}\n\n" : '')
            ."Si ya pagaste, no tenés que hacer nada. Ante cualquier duda, respondé este correo.\n\n"
            ."{$tenant->name}",
            $this->html($row, $tenant, $amount, 'Hoy vence tu cuota', 'Si ya pagaste, no tenés que hacer nada.'),
        ];
    }

    /** @return array{0: string, 1: string, 2: string} */
    private function pastDue(object $row, object $tenant, string $amount): array
    {
        $due = CarbonImmutable::parse($row->due_date)->format('d/m/Y');
        $instructions = trim((string) config('collections_mail.payment_instructions'));

        return [
            "Tu cuota {$row->installment_number} quedó pendiente — {$tenant->name}",
            "Hola {$row->display_name},\n\n"
            ."Según nuestros registros, la cuota {$row->installment_number} de {$row->total_installments}, que venció el {$due}, "
            ."tiene un saldo pendiente de {$amount}.\n\n"
            .($instructions !== '' ? "Cómo pagar:\n{$instructions}\n\n" : '')
            .'Si ya realizaste el pago, respondé este correo con el comprobante y lo verificamos. Este aviso puede no '
            ."reflejar pagos de los últimos días.\n\n"
            ."{$tenant->name}",
            $this->html($row, $tenant, $amount, "Tu cuota venció el {$due}",
                'Si ya realizaste el pago, respondé este correo con el comprobante y lo verificamos.'),
        ];
    }

    /**
     * The statement as a small table-based HTML email (what mail clients render reliably). Every value is escaped:
     * names, property titles and payment instructions are typed by people.
     */
    private function html(object $row, object $tenant, string $amount, string $headline, string $note): string
    {
        $e = static fn (mixed $value): string => htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $due = CarbonImmutable::parse($row->due_date)->format('d/m/Y');
        $instructions = trim((string) config('collections_mail.payment_instructions'));
        $line = static fn (string $label, string $value): string => '<tr><td style="padding:6px 0;color:#555">'.$label
            .'</td><td style="padding:6px 0;text-align:right;font-weight:600">'.$value.'</td></tr>';

        return '<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">'
            .'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">'
            .'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:24px">'
            .$this->brand($tenant, $e)
            .'<tr><td style="padding-top:8px;font-size:22px;font-weight:700">'.$e($headline).'</td></tr>'
            .'<tr><td style="padding-top:12px">Hola '.$e($row->display_name).',</td></tr>'
            .'<tr><td style="padding:16px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;border-radius:8px;padding:16px">'
            .'<tr><td style="color:#555">Importe a pagar</td></tr>'
            .'<tr><td style="font-size:28px;font-weight:700">'.$e($amount).'</td></tr>'
            .'<tr><td style="padding-top:4px;color:#555">Vencimiento: <strong>'.$e($due).'</strong></td></tr></table></td></tr>'
            .'<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            .$line('Cuota', $e($row->installment_number).' de '.$e($row->total_installments))
            .($row->property_title ? $line('Propiedad', $e($row->property_title)) : '')
            .'</table></td></tr>'
            .($instructions !== '' ? '<tr><td style="padding-top:16px;font-weight:600">Cómo pagar</td></tr><tr><td style="white-space:pre-line">'.$e($instructions).'</td></tr>' : '')
            .'<tr><td style="padding-top:16px;color:#555;font-size:13px">'.$e($note).' Este aviso se genera según nuestros registros '
            .'y puede no reflejar pagos de los últimos días. Ante cualquier duda, respondé este correo.</td></tr>'
            .'</table></td></tr></table></body></html>';
    }

    /**
     * The company logo when an https URL is configured (mail clients only show remote images, never local files),
     * otherwise its name. The alt text keeps the name visible when images are blocked.
     */
    private function brand(object $tenant, \Closure $e): string
    {
        $logo = (string) config('collections_mail.logo_url');
        if (! str_starts_with($logo, 'https://') || filter_var($logo, FILTER_VALIDATE_URL) === false) {
            return '<tr><td style="font-size:14px;color:#555">'.$e($tenant->name).'</td></tr>';
        }

        return '<tr><td><img src="'.$e($logo).'" alt="'.$e($tenant->name).'" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0"></td></tr>';
    }

    /** @return array{0: string, 1: string} */
    private function overdue(object $row, object $tenant, string $amount, string $today): array
    {
        $today = CarbonImmutable::parse($today)->format('d/m/Y');
        $due = CarbonImmutable::parse($row->due_date)->format('d/m/Y');

        return [
            "Recordatorio de cuota {$row->installment_number} — {$tenant->name}",
            "Hola {$row->display_name},\n\nSegún nuestros registros al {$today}, la cuota {$row->installment_number}, con vencimiento {$due}, tiene un saldo pendiente de {$amount}.\n\nSi ya realizaste el pago, por favor respondé a este correo para que podamos verificarlo. Para cualquier consulta, contactá a nuestro equipo de cobranzas.\n\n{$tenant->name}",
        ];
    }
}

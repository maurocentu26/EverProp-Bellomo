<?php

namespace App\Domain\Collections;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * One audited collection email (EVP-31: shared by the operator command and the daily upcoming run).
 * The claim rechecks balance and state under the tenant lock payments use; SENDING is stored before SMTP is
 * contacted, and an ambiguous outcome stays UNKNOWN and blocks every later attempt until a person reviews it.
 */
final class CollectionMailer
{
    public const SENT = 'SENT';

    public const UNKNOWN = 'UNKNOWN';

    public const SKIPPED = 'SKIPPED';

    public function __construct(private readonly CollectionEmail $email) {}

    /** Why delivery cannot happen for this tenant right now, or null when it can. Never touches the network. */
    public function blocker(object $tenant): ?string
    {
        $mailer = (string) config('collections_mail.mailer');

        return match (true) {
            ! (bool) config('collections_mail.enabled') => 'El envío de cobranzas está deshabilitado.',
            config('collections_mail.tenant') !== $tenant->slug => 'El envío no está habilitado para esta empresa.',
            ! filter_var(config('collections_mail.from_address'), FILTER_VALIDATE_EMAIL),
            ! filter_var(config('collections_mail.reply_to'), FILTER_VALIDATE_EMAIL) => 'Falta el remitente o el correo de respuesta.',
            config("mail.mailers.{$mailer}.transport") !== 'smtp', ! config("mail.mailers.{$mailer}.host") => 'Falta configurar el servidor SMTP.',
            trim((string) config('collections_mail.payment_instructions')) === '' => 'Faltan los datos de pago aprobados.',
            ! Schema::hasColumn('collection_email_attempts', 'kind') => 'Falta aplicar el esquema de auditoría de correos.',
            default => null,
        };
    }

    public function deliver(object $tenant, int $installmentId, string $kind): string
    {
        $claim = DB::transaction(function () use ($tenant, $installmentId, $kind) {
            $active = DB::table('tenants')->where('id', $tenant->id)->lockForUpdate()->first();
            $attempts = DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->where('installment_id', $installmentId);
            if (! $active || $active->status !== 'ACTIVE'
                || (clone $attempts)->whereIn('status', ['SENDING', 'UNKNOWN'])->exists()
                // The upcoming notice goes out once per installment, whatever happened to it.
                || ($kind === CollectionEmail::UPCOMING && (clone $attempts)->where('kind', CollectionEmail::UPCOMING)->exists())) {
                return null;
            }
            $fresh = $this->email->query($tenant->id)->where('i.id', $installmentId)->first();
            $preview = $fresh ? $this->email->preview($fresh, $tenant, $kind) : null;
            if (! $preview || ! $preview['eligible']) {
                return null;
            }
            $inserted = DB::table('collection_email_attempts')->insertOrIgnore([
                'tenant_id' => $tenant->id, 'installment_id' => $installmentId, 'kind' => $kind,
                'business_date' => $preview['businessDate'], 'status' => 'SENDING', 'recipient' => $preview['recipient'],
                'sender' => $preview['sender'], 'remaining_amount' => $preview['amountRemaining'],
            ]);

            return $inserted ? $preview : null;
        });
        if (! $claim) {
            return self::SKIPPED;
        }
        $attempt = DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)
            ->where('installment_id', $installmentId)->where('business_date', $claim['businessDate']);
        try {
            $sent = Mail::mailer((string) config('collections_mail.mailer'))->raw($claim['body'], function ($message) use ($claim) {
                $message->to($claim['recipient'])->from($claim['sender'], config('collections_mail.from_name'))
                    ->replyTo(config('collections_mail.reply_to'))->subject($claim['subject']);
            });
            if (! $sent) {
                throw new \RuntimeException('Transport did not acknowledge submission.');
            }
            $attempt->update(['status' => 'SENT', 'sent_at' => now()]);

            return self::SENT;
        } catch (Throwable) {
            // SMTP timeout can mean accepted: never retry automatically, never log provider text (credentials/PII).
            $attempt->update(['status' => 'UNKNOWN']);

            return self::UNKNOWN;
        }
    }
}

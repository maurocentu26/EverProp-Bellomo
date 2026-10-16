<?php

namespace App\Domain\AgentRuntime\Tools;

use Illuminate\Support\Facades\DB;

/**
 * Contact data the visitor declares in chat. It only fills EMPTY fields of the conversation's own
 * contact and is flagged in profile_json.unverified_fields; it never overwrites CRM data and is
 * never used to look up or merge other contacts (that would let a visitor attach to someone else).
 */
final class ContactDetails
{
    public const SCHEMA = [
        'contact_name' => ['type' => 'string', 'maxLength' => 120, 'minLength' => 2],
        'contact_phone' => ['type' => 'string', 'maxLength' => 32, 'format' => 'phone'],
        'contact_email' => ['type' => 'string', 'maxLength' => 254, 'format' => 'email'],
    ];

    /** @param array<string, mixed> $arguments */
    public function assertReachable(ToolContext $context, array $arguments): void
    {
        $contact = DB::table('contacts')->where('tenant_id', $context->tenantId)->where('id', $context->contactId)->first(['phone_e164', 'email', 'profile_json']);
        $declared = isset((json_decode((string) $contact?->profile_json, true) ?: [])['declared_phone']);
        if ($contact?->phone_e164 === null && $contact?->email === null && ! $declared && ! isset($arguments['contact_phone']) && ! isset($arguments['contact_email'])) {
            throw new ToolError('VALIDATION_ERROR', 'Falta un teléfono o email de contacto: pedíselo al visitante y volvé a intentar.');
        }
    }

    /** Only unambiguous international numbers (+CC... or 54...) become E.164. */
    public function e164(string $raw): ?string
    {
        $digits = (string) preg_replace('/\D/', '', $raw);
        $international = str_starts_with(trim($raw), '+') || str_starts_with($digits, '54');
        if (! $international || str_starts_with($digits, '0') || strlen($digits) < 10 || strlen($digits) > 15) {
            return null;
        }

        return '+'.$digits;
    }

    /**
     * Must run inside the tool transaction.
     *
     * @param  array<string, mixed>  $arguments
     */
    public function fill(ToolContext $context, array $arguments, string $now): void
    {
        $contact = DB::table('contacts')->where('tenant_id', $context->tenantId)->where('id', $context->contactId)->lockForUpdate()
            ->first(['display_name', 'phone_e164', 'email', 'profile_json']);
        $changes = [];
        $profile = json_decode((string) $contact->profile_json, true) ?: [];
        if (isset($arguments['contact_phone']) && $contact->phone_e164 === null) {
            $e164 = $this->e164($arguments['contact_phone']);
            if ($e164 !== null) {
                $changes['phone_e164'] = $e164;
            } elseif (! isset($profile['declared_phone'])) {
                // Local formats ("0388 15 ...") are ambiguous: kept verbatim for the advisor, never as E.164.
                $profile['declared_phone'] = mb_substr(trim($arguments['contact_phone']), 0, 32);
                $changes['declared_phone'] = true;
            }
        }
        if (isset($arguments['contact_email']) && $contact->email === null) {
            $changes['email'] = mb_strtolower(trim($arguments['contact_email']));
        }
        if (isset($arguments['contact_name']) && in_array($contact->display_name, [null, ''], true)) {
            $changes['display_name'] = trim($arguments['contact_name']);
        }
        if ($changes === []) {
            return;
        }
        unset($changes['declared_phone']);
        $profile['unverified_fields'] = array_values(array_unique(array_merge($profile['unverified_fields'] ?? [], array_keys($changes + (isset($profile['declared_phone']) ? ['declared_phone' => true] : [])))));
        $changes['profile_json'] = json_encode($profile, JSON_THROW_ON_ERROR);
        $changes['updated_at'] = $now;
        DB::table('contacts')->where('tenant_id', $context->tenantId)->where('id', $context->contactId)->update($changes);
    }
}

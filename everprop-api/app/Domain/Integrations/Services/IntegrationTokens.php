<?php

namespace App\Domain\Integrations\Services;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use SensitiveParameter;

/**
 * Provider access tokens per tenant integration. Stored encrypted with the app key, so a database
 * dump alone never exposes them; the plaintext only exists in memory while a request is built.
 * The static config map (access_token_secret_ref) remains as the development/legacy fallback.
 */
final class IntegrationTokens
{
    public function __construct(private readonly ConfigWebhookSecretResolver $legacy) {}

    /**
     * Caller contract (Embedded Signup, W4): $tenantId comes from TenantContext, never from the request;
     * only a tenant admin may connect; a foreign integration must surface as NOT_FOUND, not this exception.
     * Revoking means status <> ACTIVE: storing clears the legacy reference so it can never come back.
     */
    public function store(int $tenantId, int $integrationId, #[SensitiveParameter] string $token, ?CarbonImmutable $expiresAt = null): void
    {
        $updated = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)->update([
            'access_token_ciphertext' => Crypt::encryptString($token),
            'access_token_secret_ref' => null,
            'token_expires_at' => $expiresAt?->utc()->format('Y-m-d H:i:s.v'),
        ]);
        if ($updated !== 1) {
            throw new \RuntimeException('Integración inexistente para este tenant.');
        }
    }

    /** Usable token for an ACTIVE integration of this tenant, or null (missing, expired, revoked, unreadable). */
    public function forSending(int $tenantId, int $integrationId): ?string
    {
        $row = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)
            ->where('status', 'ACTIVE')->first(['access_token_ciphertext', 'access_token_secret_ref', 'token_expires_at']);
        if ($row === null || ($row->token_expires_at !== null && CarbonImmutable::parse($row->token_expires_at, 'UTC')->isPast())) {
            return null;
        }
        if ($row->access_token_ciphertext !== null) {
            try {
                return Crypt::decryptString($row->access_token_ciphertext);
            } catch (DecryptException $error) {
                report($error); // rotated APP_KEY or tampered row: the message never contains the token

                return null;
            }
        }

        return $row->access_token_secret_ref === null ? null : $this->legacy->resolve((string) $row->access_token_secret_ref);
    }
}

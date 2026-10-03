<?php

namespace App\Domain\Integrations\Services;

use App\Domain\Integrations\Exceptions\OnboardingFailed;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use SensitiveParameter;

/**
 * Meta Embedded Signup, Tech Provider steps (Plan W4): exchange the 30-second code server-side,
 * prove with the business token that the phone number belongs to the WABA (the browser-supplied ids
 * are never trusted), refuse a number owned by another tenant, subscribe the app to the WABA's
 * webhooks, store integration + channel + encrypted token, then register the number with a PIN.
 */
final class WhatsAppOnboarding
{
    public function __construct(private readonly IntegrationTokens $tokens) {}

    /**
     * @param  array{code: string, waba_id: string, phone_number_id: string, business_id: string|null}  $signup
     * @return array{integration_id: string, channel_id: string, display_phone_number: string, state: 'ACTIVE'|'REGISTRATION_PENDING'}
     */
    public function connect(int $tenantId, User $actor, #[SensitiveParameter] array $signup): array
    {
        if (! config('services.meta.onboarding_enabled') || ! config('services.meta.app_id') || ! config('services.meta.app_secret')) {
            throw new OnboardingFailed('ONBOARDING_DISABLED', 'La conexión con WhatsApp no está habilitada en este entorno.', 503);
        }

        return $this->withWabaLock($signup['waba_id'], fn () => $this->connectLocked($tenantId, $actor, $signup));
    }

    /**
     * @param  array{code: string, waba_id: string, phone_number_id: string, business_id: string|null}  $signup
     * @return array{integration_id: string, channel_id: string, display_phone_number: string, state: 'ACTIVE'|'REGISTRATION_PENDING'}
     */
    private function connectLocked(int $tenantId, User $actor, #[SensitiveParameter] array $signup): array
    {
        $token = $this->exchange($signup['code']);
        $phone = $this->phoneInWaba($signup['waba_id'], $signup['phone_number_id'], $token);

        // whatsapp_phone_number_id is unique platform-wide: another tenant's number is a hard stop.
        $owner = DB::table('channel_accounts')->where('whatsapp_phone_number_id', $signup['phone_number_id'])->value('tenant_id');
        if ($owner !== null && (int) $owner !== $tenantId) {
            throw new OnboardingFailed('PHONE_TAKEN', 'Ese número ya está conectado a otra cuenta. Desconectalo allí antes de volver a intentarlo.', 409);
        }

        $subscribed = $this->graph($token)->post($this->url($signup['waba_id'].'/subscribed_apps'));
        if (! $subscribed->successful()) {
            Log::warning('whatsapp.onboarding.subscribe_failed', ['status' => $subscribed->status(), 'code' => $subscribed->json('error.code')]);
            throw new OnboardingFailed('SUBSCRIBE_FAILED', 'Meta no permitió recibir los mensajes de esa cuenta. Volvé a intentarlo.', 502);
        }

        try {
            [$integrationId, $channelId, $pin, $wasActive] = $this->persist($tenantId, $actor, $signup, $phone, $token);
        } catch (UniqueConstraintViolationException) {
            // The platform-wide unique key decided a concurrent attempt: say who won without naming anyone.
            $owner = DB::table('channel_accounts')->where('whatsapp_phone_number_id', $signup['phone_number_id'])->value('tenant_id');
            throw (int) $owner === $tenantId
                ? new OnboardingFailed('CONNECT_IN_PROGRESS', 'Ya hay una conexión de este número en curso. Esperá unos segundos y revisá el estado.', 409)
                : new OnboardingFailed('PHONE_TAKEN', 'Ese número ya está conectado a otra cuenta. Desconectalo allí antes de volver a intentarlo.', 409);
        }

        // Registering is a separate step on Meta's side: if it fails the connection is kept and retried, not lost.
        try {
            $registered = $this->graph($token)->post($this->url($signup['phone_number_id'].'/register'), ['messaging_product' => 'whatsapp', 'pin' => $pin]);
            $ok = $registered->successful();
            $failure = ['status' => $registered->status(), 'code' => $registered->json('error.code')];
        } catch (ConnectionException) {
            $ok = false;
            $failure = ['status' => 0, 'code' => 'connection'];
        }
        // A failed re-registration never takes down a number that was already working; success always restores ACTIVE.
        if (! $ok) {
            Log::warning('whatsapp.onboarding.register_failed', $failure);
        }
        DB::transaction(function () use ($tenantId, $integrationId, $token, $ok, $wasActive): void {
            $current = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)
                ->lockForUpdate()->value('status');
            $stored = $this->tokens->stored($tenantId, $integrationId);
            // An account_update or token rejection during the HTTP call must remain revoked.
            if (! in_array($current, ['ACTIVE', 'PENDING', 'DEGRADED'], true) || $stored === null || ! hash_equals($token, $stored)) {
                throw new OnboardingFailed('CONNECTION_CHANGED', 'El acceso cambió durante la conexión. Volvé a iniciar el proceso.', 409);
            }
            if ($ok || ! $wasActive) {
                DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)->update(['status' => $ok ? 'ACTIVE' : 'DEGRADED']);
            }
        });

        return [
            'integration_id' => (string) DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)->value('public_id'),
            'channel_id' => (string) DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $channelId)->value('public_id'),
            'display_phone_number' => $phone['display_phone_number'],
            'state' => $ok ? 'ACTIVE' : 'REGISTRATION_PENDING',
        ];
    }

    /**
     * @param  array{code: string, waba_id: string, phone_number_id: string, business_id: string|null}  $signup
     * @param  array{display_phone_number: string, verified_name: string}  $phone
     * @return array{0: int, 1: int, 2: string, 3: bool} integration id, channel id, PIN, whether it was ACTIVE before
     */
    private function persist(int $tenantId, User $actor, array $signup, array $phone, #[SensitiveParameter] string $token): array
    {
        return DB::transaction(function () use ($tenantId, $actor, $signup, $phone, $token): array {
            $channel = DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('channel_type', 'WHATSAPP')
                ->where('provider_account_id', $signup['phone_number_id'])->lockForUpdate()->first(['id', 'integration_id']);
            $integrationId = $channel?->integration_id ? (int) $channel->integration_id : (int) DB::table('integration_connections')->insertGetId([
                'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'provider' => 'META', 'status' => 'PENDING',
                'name' => mb_substr('WhatsApp '.$phone['display_phone_number'].' · '.$signup['phone_number_id'], 0, 120),
            ]);
            $current = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)->lockForUpdate()->first(['status', 'settings_json']);
            $wasActive = $channel !== null && $current?->status === 'ACTIVE';
            $settings = json_decode((string) $current?->settings_json, true) ?: [];
            $pin = isset($settings['registration_pin']) ? Crypt::decryptString($settings['registration_pin']) : str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)->update([
                'status' => $wasActive ? 'ACTIVE' : 'PENDING', 'provider_app_id' => config('services.meta.app_id'), 'provider_business_id' => $signup['business_id'],
                'api_version' => config('services.meta.graph_version'),
                'settings_json' => json_encode(['waba_id' => $signup['waba_id'], 'registration_pin' => Crypt::encryptString($pin)] + $settings, JSON_THROW_ON_ERROR),
            ]);
            $this->tokens->store($tenantId, $integrationId, $token);

            $metadata = json_encode(['waba_id' => $signup['waba_id'], 'display_phone_number' => $phone['display_phone_number'], 'verified_name' => $phone['verified_name']], JSON_THROW_ON_ERROR);
            $channelId = $channel?->id ? (int) $channel->id : (int) DB::table('channel_accounts')->insertGetId([
                'tenant_id' => $tenantId, 'integration_id' => $integrationId, 'public_id' => (string) Str::uuid(), 'channel_type' => 'WHATSAPP',
                'provider_account_id' => $signup['phone_number_id'], 'display_name' => mb_substr($phone['verified_name'] ?: $phone['display_phone_number'], 0, 120),
                'metadata_json' => $metadata,
            ]);
            DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $channelId)->update(['status' => 'ACTIVE', 'metadata_json' => $metadata]);
            DB::table('audit_logs')->insert([
                'tenant_id' => $tenantId, 'actor_type' => 'USER', 'actor_user_id' => $actor->id, 'action_code' => 'WHATSAPP_CONNECTED',
                'entity_type' => 'INTEGRATION_CONNECTION', 'entity_id' => $integrationId, 'occurred_at' => now(),
                'metadata_json' => json_encode(['waba_id' => $signup['waba_id'], 'phone_number_id' => $signup['phone_number_id']], JSON_THROW_ON_ERROR),
            ]);

            return [$integrationId, $channelId, $pin, $wasActive];
        }, 3);
    }

    /**
     * Disconnect a tenant's WhatsApp account (Plan W9a). Meta is told best-effort (unsubscribe from the
     * WABA's webhooks); locally it always happens: integration REVOKED, numbers DISCONNECTED, and no
     * credential kept (token and registration PIN erased). Reconnecting is a new Embedded Signup.
     */
    public function disconnect(int $tenantId, User $actor, string $integrationPublicId): void
    {
        $integration = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('public_id', $integrationPublicId)
            ->where('provider', 'META')->first(['settings_json']);
        if ($integration === null) {
            throw new OnboardingFailed('NOT_FOUND', 'No encontramos esa conexión de WhatsApp.', 404);
        }
        $wabaId = json_decode((string) $integration->settings_json, true)['waba_id'] ?? null;
        $this->withWabaLock(is_string($wabaId) ? $wabaId : $integrationPublicId, function () use ($tenantId, $actor, $integrationPublicId, $wabaId): void {
            $this->disconnectLocked($tenantId, $actor, $integrationPublicId, $wabaId);
        });
    }

    private function disconnectLocked(int $tenantId, User $actor, string $integrationPublicId, mixed $expectedWaba): void
    {
        [$token, $wabaId] = DB::transaction(function () use ($tenantId, $actor, $integrationPublicId, $expectedWaba): array {
            $integration = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('public_id', $integrationPublicId)
                ->where('provider', 'META')->lockForUpdate()->first(['id', 'settings_json']);
            if ($integration === null) {
                throw new OnboardingFailed('NOT_FOUND', 'No encontramos esa conexión de WhatsApp.', 404);
            }
            $settings = json_decode((string) $integration->settings_json, true) ?: [];
            $wabaId = is_string($settings['waba_id'] ?? null) ? $settings['waba_id'] : null;
            if ($wabaId !== $expectedWaba) {
                throw new OnboardingFailed('CONNECTION_CHANGED', 'La conexión cambió. Actualizá el estado y volvé a intentarlo.', 409);
            }
            $token = $this->tokens->stored($tenantId, (int) $integration->id);

            DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integration->id)
                ->update(['status' => 'REVOKED'] + IntegrationTokens::erased());
            // Free the number platform-wide (it may move to another account later); the original id stays in metadata.
            DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('integration_id', $integration->id)
                ->where('provider_account_id', 'not like', 'disconnected:%')->update([
                    'metadata_json' => DB::raw("JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.disconnected_phone_number_id', provider_account_id)"),
                    'provider_account_id' => DB::raw("CONCAT('disconnected:', id)"),
                    'status' => 'DISCONNECTED',
                ]);
            DB::table('audit_logs')->insert([
                'tenant_id' => $tenantId, 'actor_type' => 'USER', 'actor_user_id' => $actor->id, 'action_code' => 'WHATSAPP_DISCONNECTED',
                'entity_type' => 'INTEGRATION_CONNECTION', 'entity_id' => $integration->id, 'occurred_at' => now(),
                'metadata_json' => json_encode(['waba_id' => $wabaId], JSON_THROW_ON_ERROR),
            ]);

            return [$token, $wabaId];
        });

        // Subscription belongs to the WABA, not to a phone or tenant. Keep it for any live sibling.
        $hasSibling = $wabaId !== null && DB::table('integration_connections')->where('provider', 'META')
            ->where('settings_json->waba_id', $wabaId)->whereIn('status', ['ACTIVE', 'PENDING', 'DEGRADED'])->exists();
        if ($token !== null && $wabaId !== null && ! $hasSibling) {
            try {
                $response = $this->graph($token)->delete($this->url($wabaId.'/subscribed_apps'));
                if (! $response->successful()) {
                    Log::warning('whatsapp.disconnect.unsubscribe_failed', ['status' => $response->status(), 'code' => $response->json('error.code')]);
                }
            } catch (ConnectionException) {
                Log::warning('whatsapp.disconnect.unsubscribe_failed', ['status' => 0, 'code' => 'connection']);
            }
        }
    }

    /**
     * Serialize WABA-wide HTTP effects with their local commits, without an expiring cache lease.
     *
     * @template T
     *
     * @param  callable(): T  $operation
     * @return T
     */
    private function withWabaLock(string $wabaId, callable $operation): mixed
    {
        $connection = DB::connection();
        $lock = 'meta-waba:'.substr(hash('sha256', $connection->getDatabaseName().':'.$wabaId), 0, 40);
        if ((int) $connection->selectOne('SELECT GET_LOCK(?, 0) AS acquired', [$lock])->acquired !== 1) {
            throw new OnboardingFailed('CONNECT_IN_PROGRESS', 'Hay una operación de WhatsApp en curso. Esperá unos segundos y volvé a intentarlo.', 409);
        }
        try {
            return $operation();
        } finally {
            $connection->selectOne('SELECT RELEASE_LOCK(?) AS released', [$lock]);
        }
    }

    /**
     * WhatsApp connections of this tenant for the settings card (no tokens, no PIN).
     *
     * @return list<array{id: string, status: string, display_phone_number: string|null}>
     */
    public function connections(int $tenantId): array
    {
        return DB::table('integration_connections as ic')
            ->leftJoin('channel_accounts as ca', fn ($j) => $j->on('ca.integration_id', '=', 'ic.id')->on('ca.tenant_id', '=', 'ic.tenant_id'))
            ->where('ic.tenant_id', $tenantId)->where('ic.provider', 'META')->whereIn('ic.status', ['ACTIVE', 'DEGRADED', 'PENDING'])
            ->orderBy('ic.id')->get(['ic.public_id', 'ic.status', 'ca.metadata_json'])
            ->map(fn ($row) => [
                'id' => (string) $row->public_id,
                'status' => (string) $row->status,
                'display_phone_number' => json_decode((string) $row->metadata_json, true)['display_phone_number'] ?? null,
            ])->values()->all();
    }

    private function exchange(#[SensitiveParameter] string $code): string
    {
        try {
            $response = Http::timeout(10)->get($this->url('oauth/access_token'), [
                'client_id' => config('services.meta.app_id'), 'client_secret' => config('services.meta.app_secret'), 'code' => $code,
            ]);
        } catch (ConnectionException) {
            throw new OnboardingFailed('META_UNREACHABLE', 'No pudimos comunicarnos con Meta. Volvé a intentarlo.', 502);
        }
        $token = $response->json('access_token');
        if (! $response->successful() || ! is_string($token) || $token === '') {
            Log::warning('whatsapp.onboarding.exchange_failed', ['status' => $response->status(), 'code' => $response->json('error.code')]);
            throw new OnboardingFailed('EXCHANGE_FAILED', 'Meta no confirmó la conexión (el código vence en segundos). Volvé a iniciar el proceso.', 502);
        }

        return $token;
    }

    /** @return array{display_phone_number: string, verified_name: string} */
    private function phoneInWaba(string $wabaId, string $phoneNumberId, #[SensitiveParameter] string $token): array
    {
        $response = $this->graph($token)->get($this->url($wabaId.'/phone_numbers'), ['fields' => 'id,display_phone_number,verified_name']);
        foreach ((array) $response->json('data', []) as $phone) {
            if (is_array($phone) && (string) ($phone['id'] ?? '') === $phoneNumberId) {
                return ['display_phone_number' => (string) ($phone['display_phone_number'] ?? ''), 'verified_name' => (string) ($phone['verified_name'] ?? '')];
            }
        }
        Log::warning('whatsapp.onboarding.phone_not_in_waba', ['status' => $response->status(), 'code' => $response->json('error.code')]);
        throw new OnboardingFailed('PHONE_NOT_IN_WABA', 'Meta no confirmó que ese número pertenezca a la cuenta elegida. Volvé a iniciar el proceso.', 422);
    }

    private function graph(#[SensitiveParameter] string $token): PendingRequest
    {
        return Http::withToken($token)->timeout(10);
    }

    private function url(string $path): string
    {
        return sprintf('https://graph.facebook.com/%s/%s', config('services.meta.graph_version'), $path);
    }
}

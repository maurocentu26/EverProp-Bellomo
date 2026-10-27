<?php

namespace App\Domain\Integrations\Services;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Integrations\Exceptions\OnboardingFailed;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use SensitiveParameter;

/** Instagram Login uses the panel's first-party session; only the server exchanges or stores credentials. */
final class InstagramOnboarding
{
    public function __construct(private readonly IntegrationTokens $tokens) {}

    public function enabled(Tenant $tenant): bool
    {
        $uri = (string) config('services.meta.instagram_redirect_uri');
        $host = parse_url($uri, PHP_URL_HOST);
        $selector = config('tenancy.hosts', [])[$host ?? ''] ?? null;
        $scheme = parse_url($uri, PHP_URL_SCHEME);

        return (bool) config('services.meta.instagram_onboarding_enabled')
            && (app()->environment(['local', 'testing']) || config('cache.default') === 'redis')
            && preg_match('/^\d{1,32}$/', (string) config('services.meta.instagram_app_id')) === 1
            && (string) config('services.meta.instagram_app_secret') !== ''
            && in_array($selector, [$tenant->slug, $tenant->public_id], true)
            && ($scheme === 'https' || (app()->environment(['local', 'testing']) && $scheme === 'http' && in_array($host, ['localhost', '127.0.0.1'], true)))
            && parse_url($uri, PHP_URL_PATH) === '/integrations/instagram/callback'
            && ! parse_url($uri, PHP_URL_QUERY) && ! parse_url($uri, PHP_URL_FRAGMENT)
            && ! parse_url($uri, PHP_URL_USER) && ! parse_url($uri, PHP_URL_PASS);
    }

    public function authorize(Tenant $tenant, User $user, string $sessionId): string
    {
        $this->requireEnabled($tenant);
        $state = bin2hex(random_bytes(32));
        Cache::put($this->stateKey($tenant->id, $user->id, $state), [
            'session' => hash('sha256', $sessionId), 'redirect' => config('services.meta.instagram_redirect_uri'),
        ], now()->addMinutes(10));

        return 'https://www.instagram.com/oauth/authorize?'.http_build_query([
            'client_id' => config('services.meta.instagram_app_id'), 'redirect_uri' => config('services.meta.instagram_redirect_uri'),
            'response_type' => 'code', 'scope' => 'instagram_business_basic,instagram_business_manage_messages', 'state' => $state,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /** @return array<string, mixed> */
    public function connect(Tenant $tenant, User $user, string $sessionId, #[SensitiveParameter] string $state, #[SensitiveParameter] ?string $code, bool $cancelled): array
    {
        $this->requireEnabled($tenant);
        $key = $this->stateKey($tenant->id, $user->id, $state);
        $consumed = Cache::lock($key.':consume', 10)->get(function () use ($key, $sessionId): bool {
            $entry = Cache::get($key);
            if (! is_array($entry) || ! hash_equals((string) ($entry['session'] ?? ''), hash('sha256', $sessionId))
                || ($entry['redirect'] ?? null) !== config('services.meta.instagram_redirect_uri')) {
                return false;
            }
            Cache::forget($key);

            return true;
        });
        if ($consumed !== true) {
            throw new OnboardingFailed('INVALID_STATE', 'La conexión venció o pertenece a otra sesión. Volvé a iniciarla desde Ajustes.', 422);
        }
        if ($cancelled || $code === null) {
            throw new OnboardingFailed('CANCELLED', 'No se conectó Instagram. Podés volver a intentarlo desde Ajustes.', 422);
        }
        $exchange = Http::asForm()->timeout(10)->post('https://api.instagram.com/oauth/access_token', [
            'client_id' => config('services.meta.instagram_app_id'), 'client_secret' => config('services.meta.instagram_app_secret'),
            'grant_type' => 'authorization_code', 'redirect_uri' => config('services.meta.instagram_redirect_uri'), 'code' => $code,
        ]);
        $this->successful($exchange);
        $short = $exchange->json('data.0', $exchange->json());
        if (! is_array($short)) {
            throw new OnboardingFailed('TOKEN_FAILED', 'Meta no confirmó el acceso a Instagram. Volvé a conectar.', 502);
        }
        $permissions = $short['permissions'] ?? [];
        $permissions = is_string($permissions) ? explode(',', $permissions) : $permissions;
        if (! is_array($permissions) || count(array_filter($permissions, 'is_string')) !== count($permissions)
            || array_diff(['instagram_business_basic', 'instagram_business_manage_messages'], $permissions) !== []) {
            throw new OnboardingFailed('PERMISSIONS_REQUIRED', 'Instagram necesita acceso al perfil profesional y a los mensajes. Volvé a conectar y autorizá ambos permisos.', 422);
        }
        $shortToken = $this->token($short['access_token'] ?? null);
        $long = Http::timeout(10)->get('https://graph.instagram.com/access_token', [
            'grant_type' => 'ig_exchange_token', 'client_secret' => config('services.meta.instagram_app_secret'), 'access_token' => $shortToken,
        ]);
        $this->successful($long);
        $token = $this->token($long->json('access_token'));
        $expires = $this->expires($long);
        $identityResponse = Http::withToken($token)->timeout(10)->get($this->url('me'), ['fields' => 'id,user_id,username']);
        $this->successful($identityResponse);
        $identity = $identityResponse->json('data.0', $identityResponse->json());
        if (! is_array($identity)) {
            throw new OnboardingFailed('IDENTITY_FAILED', 'Meta no confirmó la identidad de la cuenta profesional. Volvé a conectar.', 502);
        }
        $accountId = (string) ($identity['user_id'] ?? '');
        $appScopedId = (string) ($identity['id'] ?? '');
        $username = $identity['username'] ?? null;
        // OAuth returns the app-scoped ID; webhooks and channel routing use the professional account ID.
        if (! preg_match('/^\d{1,32}$/', $accountId) || ! preg_match('/^\d{1,32}$/', $appScopedId)
            || $appScopedId !== (string) ($short['user_id'] ?? '')
            || ! is_string($username) || ! preg_match('/^[a-zA-Z0-9_.]{1,30}$/', $username)) {
            throw new OnboardingFailed('IDENTITY_FAILED', 'Meta no confirmó la identidad de la cuenta profesional. Volvé a conectar.', 502);
        }

        return $this->withAccountLock($accountId, function () use ($tenant, $user, $accountId, $username, $token, $expires): array {
            // Global exclusivity check: the same Instagram account must never route messages to two tenants.
            $owner = DB::table('channel_accounts')->where('channel_type', 'INSTAGRAM_DM')->where('provider_account_id', $accountId)->first();
            if ($owner !== null && (int) $owner->tenant_id !== (int) $tenant->id) {
                throw new OnboardingFailed('ACCOUNT_TAKEN', 'Esta cuenta no está disponible para conectar. Contactá al administrador.', 409);
            }
            $subscribe = Http::withToken($token)->timeout(10)->post($this->url($accountId.'/subscribed_apps'), ['subscribed_fields' => 'messages,messaging_seen']);
            $this->successful($subscribe);
            if ($subscribe->json('success') !== true) {
                throw new OnboardingFailed('SUBSCRIPTION_FAILED', 'Meta no confirmó la recepción de mensajes. Volvé a conectar.', 502);
            }

            return DB::transaction(function () use ($tenant, $user, $owner, $accountId, $username, $token, $expires): array {
                $this->activeActor($tenant->id, $user->id);
                $now = now();
                $integration = $owner === null ? null : DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $owner->integration_id)->lockForUpdate()->first();
                if ($owner !== null && ($integration === null || $integration->provider !== 'META'
                    || (json_decode((string) $integration->settings_json, true)['instagram_login'] ?? false) !== true)) {
                    throw new OnboardingFailed('CONNECTION_CONFLICT', 'La conexión existente necesita revisión del administrador.', 409);
                }
                $settings = $integration === null ? [] : json_decode((string) $integration->settings_json, true);
                $values = ['status' => 'ACTIVE', 'api_version' => config('services.meta.graph_version'), 'name' => 'Instagram '.$username,
                    'settings_json' => json_encode(array_merge($settings ?? [], ['instagram_login' => true, 'token_issued_at' => $now->toIso8601String()]), JSON_THROW_ON_ERROR)];
                if ($integration === null) {
                    $integrationId = (int) DB::table('integration_connections')->insertGetId($values + ['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => 'META']);
                    DB::table('channel_accounts')->insert(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'integration_id' => $integrationId,
                        'channel_type' => 'INSTAGRAM_DM', 'provider_account_id' => $accountId, 'display_name' => 'Instagram '.$username,
                        'metadata_json' => json_encode(['username' => $username], JSON_THROW_ON_ERROR), 'status' => 'ACTIVE']);
                } else {
                    $integrationId = (int) $integration->id;
                    DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $integrationId)->update($values);
                    $metadata = json_decode((string) $owner->metadata_json, true) ?? [];
                    DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('id', $owner->id)->update([
                        'status' => 'ACTIVE', 'display_name' => 'Instagram '.$username, 'metadata_json' => json_encode(array_merge($metadata, ['username' => $username]), JSON_THROW_ON_ERROR),
                    ]);
                }
                $this->tokens->store($tenant->id, $integrationId, $token, $expires);
                $this->audit($tenant->id, $user->id, $integrationId, 'INSTAGRAM_CONNECTED');

                return $this->connection($tenant->id, $integrationId);
            });
        });
    }

    /** @return array<string, mixed> */
    public function refresh(Tenant $tenant, User $user, string $publicId): array
    {
        $channel = DB::table('channel_accounts as ca')->join('integration_connections as ic', fn ($j) => $j->on('ic.id', '=', 'ca.integration_id')->on('ic.tenant_id', '=', 'ca.tenant_id'))
            ->where('ca.tenant_id', $tenant->id)->where('ic.public_id', $publicId)->where('ic.provider', 'META')->where('ca.channel_type', 'INSTAGRAM_DM')->first(['ca.provider_account_id', 'ic.id']);
        abort_if($channel === null, 404);

        return $this->withAccountLock($channel->provider_account_id, function () use ($tenant, $user, $channel): array {
            $row = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $channel->id)->first();
            $token = $this->tokens->forSending($tenant->id, $channel->id);
            $settings = json_decode((string) $row->settings_json, true) ?? [];
            if ($token === null || $row->token_expires_at === null || empty($settings['token_issued_at']) || ($settings['instagram_login'] ?? false) !== true) {
                throw new OnboardingFailed('RECONNECT_REQUIRED', 'Volvé a conectar Instagram para renovar el acceso y confirmar su vigencia.', 422);
            }
            if (CarbonImmutable::parse($settings['token_issued_at'])->addDay()->isFuture()) {
                throw new OnboardingFailed('REFRESH_TOO_EARLY', 'Meta permite renovar el acceso después de las primeras 24 horas.', 422);
            }
            $response = Http::timeout(10)->get('https://graph.instagram.com/refresh_access_token', ['grant_type' => 'ig_refresh_token', 'access_token' => $token]);
            $this->successful($response);
            $newToken = $this->token($response->json('access_token'));
            $expires = $this->expires($response);

            return DB::transaction(function () use ($tenant, $user, $channel, $token, $newToken, $expires, $settings): array {
                $this->activeActor($tenant->id, $user->id);
                DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $channel->id)->lockForUpdate()->first();
                if (! hash_equals($token, (string) $this->tokens->forSending($tenant->id, $channel->id))) {
                    throw new OnboardingFailed('CONNECTION_CHANGED', 'La conexión cambió durante la renovación. Revisá su estado antes de continuar.', 409);
                }
                $this->tokens->store($tenant->id, $channel->id, $newToken, $expires);
                $settings['token_issued_at'] = now()->toIso8601String();
                DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $channel->id)->update(['settings_json' => json_encode($settings, JSON_THROW_ON_ERROR)]);
                $this->audit($tenant->id, $user->id, $channel->id, 'INSTAGRAM_TOKEN_REFRESHED');

                return $this->connection($tenant->id, $channel->id);
            });
        });
    }

    /** @return list<array<string, mixed>> */
    public function connections(int $tenantId): array
    {
        return DB::table('channel_accounts as ca')->join('integration_connections as ic', fn ($j) => $j->on('ic.id', '=', 'ca.integration_id')->on('ic.tenant_id', '=', 'ca.tenant_id'))
            ->where('ca.tenant_id', $tenantId)->where('ca.channel_type', 'INSTAGRAM_DM')->where('ic.provider', 'META')->orderBy('ca.id')
            ->get(['ic.public_id', 'ic.status', 'ic.token_expires_at', 'ca.metadata_json', 'ca.display_name'])->map(function ($row): array {
                $expiry = $row->token_expires_at === null ? null : CarbonImmutable::parse($row->token_expires_at, 'UTC');

                return ['id' => $row->public_id, 'status' => $row->status,
                    'username' => json_decode((string) $row->metadata_json, true)['username'] ?? null,
                    'display_name' => $row->display_name, 'expires_at' => $expiry?->toIso8601String(),
                    'token_status' => $row->status !== 'ACTIVE' ? 'REVOKED' : ($expiry === null ? 'UNKNOWN' : ($expiry->isPast() ? 'EXPIRED' : 'VALID'))];
            })->values()->all();
    }

    /** @return array<string, mixed> */
    private function connection(int $tenantId, int $integrationId): array
    {
        $publicId = DB::table('integration_connections')->where('tenant_id', $tenantId)->where('id', $integrationId)->value('public_id');

        return array_values(array_filter($this->connections($tenantId), fn ($row) => $row['id'] === $publicId))[0];
    }

    private function requireEnabled(Tenant $tenant): void
    {
        if (! $this->enabled($tenant)) {
            throw new OnboardingFailed('ONBOARDING_DISABLED', 'La conexión con Instagram todavía no está habilitada en este entorno.', 503);
        }
    }

    private function activeActor(int $tenantId, int $userId): void
    {
        $tenant = Tenant::query()->whereKey($tenantId)->where('status', 'ACTIVE')->lockForUpdate()->first();
        $actor = User::query()->where('tenant_id', $tenantId)->whereKey($userId)->lockForUpdate()->first();
        abort_unless($tenant !== null && $actor !== null && app(AuthorizationService::class)->allows($actor, Capability::MANAGE_INTEGRATIONS), 403);
    }

    private function stateKey(int $tenantId, int $userId, #[SensitiveParameter] string $state): string
    {
        return 'ig:oauth:'.$tenantId.':'.$userId.':'.hash('sha256', $state);
    }

    private function successful(Response $response): void
    {
        if (! $response->successful()) {
            throw new OnboardingFailed('META_FAILED', 'Meta no pudo completar la conexión. Volvé a iniciarla desde Ajustes.', 502);
        }
    }

    private function url(string $path): string
    {
        return 'https://graph.instagram.com/'.config('services.meta.graph_version').'/'.$path;
    }

    private function token(#[SensitiveParameter] mixed $value): string
    {
        if (! is_string($value) || $value === '') {
            throw new OnboardingFailed('TOKEN_FAILED', 'Meta no confirmó el acceso a Instagram. Volvé a conectar.', 502);
        }

        return $value;
    }

    private function expires(Response $response): CarbonImmutable
    {
        $seconds = $response->json('expires_in');
        if (! is_int($seconds) || $seconds <= 0 || $seconds > 5184000) {
            throw new OnboardingFailed('EXPIRY_FAILED', 'Meta no confirmó la vigencia del acceso. Volvé a conectar.', 502);
        }

        return CarbonImmutable::now()->addSeconds($seconds);
    }

    /** @param callable(): array<string, mixed> $operation
     * @return array<string, mixed> */
    private function withAccountLock(string $accountId, callable $operation): array
    {
        // Same global lock as connect-own: account ownership is exclusive across tenants and both entry points.
        $lock = 'ig-connect:'.substr(hash('sha256', DB::getDatabaseName().':'.$accountId), 0, 48);
        if ((int) DB::selectOne('SELECT GET_LOCK(?, 0) AS acquired', [$lock])->acquired !== 1) {
            throw new OnboardingFailed('CONNECTION_BUSY', 'Hay otra conexión en curso. Volvé a intentarlo en unos segundos.', 409);
        }
        try {
            return $operation();
        } finally {
            DB::selectOne('SELECT RELEASE_LOCK(?) AS released', [$lock]);
        }
    }

    private function audit(int $tenantId, int $userId, int $integrationId, string $action): void
    {
        DB::table('audit_logs')->insert(['tenant_id' => $tenantId, 'actor_type' => 'USER', 'actor_user_id' => $userId,
            'action_code' => $action, 'entity_type' => 'INTEGRATION_CONNECTION', 'entity_id' => $integrationId, 'occurred_at' => now()]);
    }
}

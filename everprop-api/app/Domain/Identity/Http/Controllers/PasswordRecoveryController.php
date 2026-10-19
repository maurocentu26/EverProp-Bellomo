<?php

namespace App\Domain\Identity\Http\Controllers;

use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Throwable;

use function Illuminate\Support\defer;

final class PasswordRecoveryController
{
    public function requestLink(Request $request, TenantContext $tenant): JsonResponse
    {
        $data = $request->validate(['email' => 'required|string|email:rfc|max:320', 'tenant_id' => 'prohibited', 'tenant' => 'prohibited']);
        $frontends = config('auth.password_reset_frontends');
        $origin = is_array($frontends) ? ($frontends[$tenant->tenant()->slug] ?? '') : '';
        abort_unless(is_string($origin) && filter_var($origin, FILTER_VALIDATE_URL)
            && parse_url($origin, PHP_URL_SCHEME) === 'https'
            && ! parse_url($origin, PHP_URL_USER) && ! parse_url($origin, PHP_URL_PASS)
            && ! parse_url($origin, PHP_URL_QUERY) && ! parse_url($origin, PHP_URL_FRAGMENT)
            && in_array(parse_url($origin, PHP_URL_PATH), [null, '', '/'], true)
            && filled(config('services.resend.key'))
            && filter_var(config('mail.from.address'), FILTER_VALIDATE_EMAIL), 503, 'La recuperación no está disponible. Contactá a administración.');

        $tenantId = $tenant->id();
        $email = strtolower(trim($data['email']));
        // Work runs after the response, so account existence and provider timing cannot change the public response.
        defer(function () use ($tenantId, $email, $origin): void {
            try {
                Cache::lock($this->lockKey($tenantId, $email), 30)->block(3, function () use ($tenantId, $email, $origin): void {
                    Password::broker('recovery')->sendResetLink(
                        ['tenant_id' => $tenantId, 'email' => $email, 'status' => 'ACTIVE'],
                        function (User $user, string $token) use ($origin): void {
                            if ($user->password_hash === null) {
                                return;
                            }
                            $url = rtrim($origin, '/').'/recuperar#'.http_build_query(['token' => $token, 'email' => $user->email]);
                            $body = "Para elegir una nueva contraseña, abrí este enlace:\n\n{$url}\n\nVence en 60 minutos y puede usarse una sola vez. Si no lo solicitaste, ignorá este correo.";
                            // Bound HTTPS below the account lock lease; never fall back to a log mailer.
                            $sent = Http::withToken((string) config('services.resend.key'))
                                ->connectTimeout(5)->timeout(10)->withoutRedirecting()
                                ->post('https://api.resend.com/emails', [
                                    'from' => (string) config('mail.from.name').' <'.config('mail.from.address').'>',
                                    'to' => [$user->email],
                                    'subject' => 'Recuperar acceso a EverProp',
                                    'text' => $body,
                                ])->throw()->json('id');
                            if (! is_string($sent) || $sent === '') {
                                throw new \RuntimeException('Recovery delivery not acknowledged');
                            }
                        },
                    );
                });
            } catch (Throwable) {
                // Provider exceptions can contain credentials, addresses or the bearer link.
                Log::warning('password_recovery_delivery_failed', ['tenant_id' => $tenantId]);
            }
        });

        return response()->json(['message' => 'Si el correo corresponde a una cuenta activa, recibirás un enlace para cambiar la contraseña.'])->header('Cache-Control', 'no-store');
    }

    public function reset(Request $request, TenantContext $tenant): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|string|email:rfc|max:320', 'token' => 'required|string|size:64',
            'password' => ['required', 'string', 'max:4096', 'confirmed', PasswordRule::min(12)->letters()->numbers()],
            'tenant_id' => 'prohibited', 'tenant' => 'prohibited',
        ]);
        $data['email'] = strtolower(trim($data['email']));
        $status = Cache::lock($this->lockKey($tenant->id(), $data['email']), 30)->block(3, function () use ($tenant, $data): string {
            return DB::transaction(function () use ($tenant, $data): string {
                // Serialize password changes with other updates to the same account.
                User::query()->forTenant($tenant->id())->where('email', $data['email'])->lockForUpdate()->first();

                return Password::broker('recovery')->reset($data + ['tenant_id' => $tenant->id(), 'status' => 'ACTIVE'], function (User $user, string $password): void {
                    $previous = clone $user;
                    $user->forceFill(['password_hash' => $password])->save();
                    /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
                    $broker = Password::broker('recovery');
                    $broker->deleteToken($previous);
                    event(new PasswordReset($user));
                });
            });
        });
        abort_unless($status === Password::PASSWORD_RESET, 422, 'El enlace no es válido, venció o ya fue utilizado.');

        return response()->json(['message' => 'Contraseña actualizada. Volvé a iniciar sesión.'])->header('Cache-Control', 'no-store');
    }

    private function lockKey(int $tenantId, string $email): string
    {
        return 'password-recovery:'.hash('sha256', $tenantId.'|'.$email);
    }
}

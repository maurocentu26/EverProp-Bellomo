<?php

namespace App\Domain\Identity\Http\Requests;

use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email:rfc', 'max:320'],
            'password' => ['required', 'string', 'max:4096'],
            'tenant_id' => ['prohibited'],
            'tenant' => ['prohibited'],
            'role_code' => ['prohibited'],
        ];
    }

    public function authenticate(TenantContext $tenantContext): User
    {
        if (! $this->hasSession()) {
            throw new HttpException(419, 'A stateful SPA session is required.');
        }

        $this->ensureIsNotRateLimited($tenantContext);

        $authenticated = Auth::guard('web')->attempt([
            'tenant_id' => $tenantContext->id(),
            'email' => Str::lower($this->string('email')->toString()),
            'status' => 'ACTIVE',
            'password' => $this->string('password')->toString(),
        ]);

        if (! $authenticated) {
            RateLimiter::hit($this->throttleKey($tenantContext), 60);

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are invalid.'],
            ]);
        }

        RateLimiter::clear($this->throttleKey($tenantContext));
        $this->session()->regenerate();

        $user = Auth::guard('web')->user();

        if (! $user instanceof User || (int) $user->tenant_id !== $tenantContext->id()) {
            Auth::guard('web')->logout();
            $this->session()->invalidate();
            $this->session()->regenerateToken();

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are invalid.'],
            ]);
        }

        $user->forceFill(['last_login_at' => now()])->saveQuietly();

        return $user;
    }

    private function ensureIsNotRateLimited(TenantContext $tenantContext): void
    {
        $limit = (int) config('security.login_rate_limit_per_minute', 5);

        if (! RateLimiter::tooManyAttempts($this->throttleKey($tenantContext), $limit)) {
            return;
        }

        throw ValidationException::withMessages([
            'email' => ['Too many login attempts. Please try again later.'],
        ]);
    }

    private function throttleKey(TenantContext $tenantContext): string
    {
        $normalizedEmail = Str::transliterate(Str::lower($this->string('email')->toString()));
        $identityHash = hash_hmac('sha256', $normalizedEmail, (string) config('app.key'));

        return 'login|'.$tenantContext->id().'|'.$identityHash.'|'.$this->ip();
    }
}

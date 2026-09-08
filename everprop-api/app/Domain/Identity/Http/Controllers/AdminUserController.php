<?php

namespace App\Domain\Identity\Http\Controllers;

use App\Domain\Identity\Policies\UserPolicy;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

final class AdminUserController
{
    public function index(Request $request, TenantContext $tenant, UserPolicy $policy)
    {
        abort_unless($policy->viewAny($request->user()), 403);

        return response()->json(['data' => User::query()->where('tenant_id', $tenant->id())
            ->orderBy('display_name')->get(['public_id', 'display_name', 'email', 'phone_e164', 'role_code', 'status'])]);
    }

    public function store(Request $request, TenantContext $tenant, UserPolicy $policy)
    {
        abort_unless($policy->create($request->user()), 403);
        $data = $request->validate([
            'tenant_id' => 'prohibited', 'password' => 'prohibited',
            'firstName' => 'required|string|max:79', 'lastName' => 'required|string|max:79',
            'email' => ['required', 'email', 'max:320', Rule::unique('users')->where('tenant_id', $tenant->id())],
            'phone' => ['required', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'role' => ['required', Rule::in(['SALES_ADVISOR', 'INVENTORY_MANAGER'])],
        ]);
        $token = Str::random(64);
        $user = DB::transaction(function () use ($data, $tenant, $token) {
            $user = new User([
                'public_id' => (string) Str::uuid(), 'display_name' => trim($data['firstName'].' '.$data['lastName']),
                'email' => strtolower(trim($data['email'])), 'phone_e164' => $data['phone'],
                'role_code' => $data['role'], 'status' => 'PAUSED',
            ]);
            $user->tenant_id = $tenant->id();
            $user->save();
            DB::table('user_inventory_settings')->insert([
                'tenant_id' => $tenant->id(), 'user_id' => $user->id, 'visibility_mode' => 'ALL',
                'can_view_prices' => true, 'can_manage_inventory' => $data['role'] === 'INVENTORY_MANAGER',
                'can_manage_prices' => $data['role'] === 'INVENTORY_MANAGER',
            ]);
            Cache::put('user-activation:'.hash('sha256', $token), ['tenant' => $tenant->id(), 'user' => $user->id], now()->addHours(24));

            return $user;
        });

        return response()->json(['data' => ['id' => $user->public_id, 'activationToken' => $token, 'expiresInHours' => 24]], 201)->header('Cache-Control', 'no-store');
    }

    public function activate(Request $request, TenantContext $tenant)
    {
        $data = $request->validate(['token' => 'required|string|size:64', 'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers()], 'tenant_id' => 'prohibited']);
        $key = 'user-activation:'.hash('sha256', $data['token']);
        $pending = Cache::get($key);
        abort_unless($pending && $pending['tenant'] === $tenant->id(), 422, 'El enlace venció o ya fue utilizado.');

        return Cache::lock('activation-user:'.$tenant->id().':'.$pending['user'], 10)->block(3, function () use ($key, $tenant, $data) {
            $pending = Cache::get($key);
            abort_unless($pending && $pending['tenant'] === $tenant->id(), 422, 'El enlace venció o ya fue utilizado.');
            $user = User::query()->where('tenant_id', $tenant->id())->where('id', $pending['user'])->where('status', 'PAUSED')->whereNull('password_hash')->first();
            abort_unless($user, 422, 'La cuenta ya fue activada.');
            $user->password_hash = $data['password'];
            $user->status = 'ACTIVE';
            $user->save();
            Cache::forget($key);

            return response()->json(['status' => 'activated']);
        });
    }

    public function renew(Request $request, TenantContext $tenant, UserPolicy $policy, string $user)
    {
        $target = User::query()->where('tenant_id', $tenant->id())->where('public_id', $user)->firstOrFail();
        abort_unless($policy->update($request->user(), $target), 403);
        abort_unless($target->statusCode()->value === 'PAUSED' && $target->password_hash === null, 422, 'La cuenta ya está activada.');
        $token = Str::random(64);
        Cache::put('user-activation:'.hash('sha256', $token), ['tenant' => $tenant->id(), 'user' => $target->id], now()->addHours(24));

        return response()->json(['data' => ['activationToken' => $token, 'expiresInHours' => 24]])->header('Cache-Control', 'no-store');
    }
}

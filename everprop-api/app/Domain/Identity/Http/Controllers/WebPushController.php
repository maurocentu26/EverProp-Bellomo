<?php

namespace App\Domain\Identity\Http\Controllers;

use App\Domain\Identity\Policies\WebPushPolicy;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

final class WebPushController extends Controller
{
    public function __construct(private TenantContext $tenantContext) {}

    private function owner(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && (new WebPushPolicy)->manage($user, $this->tenantContext->id()), 403);

        return $user;
    }

    public function config(Request $request): JsonResponse
    {
        $user = $this->owner($request);
        $hashes = DB::table('web_push_subscriptions')->where('tenant_id', $this->tenantContext->id())->where('user_id', $user->id)->pluck('endpoint_hash');

        return response()->json(['subscriptionHashes' => $hashes, 'publicKey' => config('webpush.public_key'), 'enabled' => (bool) (config('webpush.public_key') && config('webpush.private_key') && config('webpush.subject'))]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $this->owner($request);
        abort_unless(config('webpush.public_key') && config('webpush.private_key'), 503, 'Las notificaciones push todavía no están configuradas.');
        $data = $request->validate(['endpoint' => 'required|url:https|max:2048', 'keys.p256dh' => 'required|string|max:200', 'keys.auth' => 'required|string|max:100']);
        $host = strtolower(parse_url($data['endpoint'], PHP_URL_HOST) ?? '');
        abort_unless(in_array($host, ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'], true), 422, 'Proveedor push no admitido.');
        abort_if(parse_url($data['endpoint'], PHP_URL_USER) || parse_url($data['endpoint'], PHP_URL_PASS) || (parse_url($data['endpoint'], PHP_URL_PORT) ?? 443) !== 443, 422);
        foreach (['p256dh' => 65, 'auth' => 16] as $key => $length) {
            $decoded = base64_decode(strtr($data['keys'][$key], '-_', '+/'), true);
            abort_unless($decoded !== false && strlen($decoded) === $length, 422, 'Clave de suscripción inválida.');
        }
        $hash = hash('sha256', $data['endpoint']);
        $existing = DB::table('web_push_subscriptions')->where('endpoint_hash', $hash)->first();
        abort_if($existing && ((int) $existing->user_id !== (int) $user->id || (int) $existing->tenant_id !== $this->tenantContext->id()), 409, 'Desactivá los avisos de la cuenta anterior en este dispositivo.');
        DB::table('web_push_subscriptions')->updateOrInsert(['tenant_id' => $this->tenantContext->id(), 'user_id' => $user->id, 'endpoint_hash' => $hash], ['subscription' => Crypt::encryptString(json_encode($data)), 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['status' => 'subscribed']);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $this->owner($request);
        $data = $request->validate(['endpoint' => 'required|string|max:2048']);
        DB::table('web_push_subscriptions')->where('tenant_id', $this->tenantContext->id())->where('user_id', $user->id)->where('endpoint_hash', hash('sha256', $data['endpoint']))->delete();

        return response()->json(['status' => 'unsubscribed']);
    }
}

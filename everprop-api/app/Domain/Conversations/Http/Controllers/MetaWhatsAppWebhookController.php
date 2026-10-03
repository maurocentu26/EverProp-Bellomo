<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\Conversations\Jobs\ProcessMetaWebhookReceipt;
use App\Domain\Conversations\Services\MetaWebhookProcessor;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * WhatsApp Cloud API webhook for the EverSys Meta app (one endpoint for every tenant).
 *
 * Verified against Meta docs on 2026-09-29: GET handshake with hub.mode/hub.verify_token/
 * hub.challenge; POST signed with X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw
 * body); payload entry[].changes[] with field "messages" and value.metadata.phone_number_id;
 * payloads up to 3 MB; non-200 answers are retried by Meta.
 *
 * Plan W6: each "messages" change is stored as a durable webhook_receipt (deduplicated per
 * integration) before the 200, then applied by ProcessMetaWebhookReceipt in the worker, so a slow
 * database or AI turn never makes Meta time out and redeliver. account_update stays inline: it is
 * one small update and must not wait behind a queue.
 */
final class MetaWhatsAppWebhookController extends Controller
{
    private const MAX_BYTES = 3 * 1024 * 1024;

    public function verify(Request $request): Response
    {
        $expected = (string) config('services.meta.webhook_verify_token');
        $token = (string) $request->query('hub_verify_token', '');
        $challenge = (string) $request->query('hub_challenge', '');

        if ($expected === '' || $request->query('hub_mode') !== 'subscribe' || ! hash_equals($expected, $token)
            || preg_match('/\A[0-9A-Za-z_-]{1,128}\z/', $challenge) !== 1) {
            return response('Forbidden', 403);
        }

        return response($challenge, 200)->header('Content-Type', 'text/plain');
    }

    public function receive(Request $request, MetaWebhookProcessor $processor): Response
    {
        $secret = (string) config('services.meta.app_secret');
        if ($secret === '') {
            return response('Not configured', 503);
        }

        if ((int) $request->header('Content-Length', '0') > self::MAX_BYTES) {
            return response('Payload too large', 413);
        }
        $raw = $request->getContent();
        if (strlen($raw) > self::MAX_BYTES) {
            return response('Payload too large', 413);
        }

        $signature = (string) $request->header('X-Hub-Signature-256', '');
        if (preg_match('/\Asha256=([a-f0-9]{64})\z/i', $signature, $m) !== 1
            || ! hash_equals(hash_hmac('sha256', $raw, $secret), strtolower($m[1]))) {
            return response('Invalid signature', 401);
        }

        $payload = json_decode($raw, true);
        if (! is_array($payload) || ($payload['object'] ?? null) !== 'whatsapp_business_account') {
            return response('Ignored', 200);
        }

        // Malformed elements are skipped (a 500 would make Meta redeliver the batch forever);
        // database failures still bubble up so the delivery is retried.
        foreach ($processor->arrays($payload['entry'] ?? null) as $entry) {
            $wabaId = is_scalar($entry['id'] ?? null) ? (string) $entry['id'] : null;
            foreach ($processor->arrays($entry['changes'] ?? null) as $change) {
                if (! is_array($change['value'] ?? null)) {
                    continue;
                }
                if (($change['field'] ?? null) === 'account_update' && $wabaId !== null) {
                    $processor->accountUpdate($wabaId, $change['value']);
                } elseif (($change['field'] ?? null) === 'messages') {
                    $this->store($processor, $change['value'], $wabaId);
                }
            }
        }

        // Every change above is durably stored (or deliberately ignored) before acknowledging.
        return response('EVENT_RECEIVED', 200);
    }

    /** @param array<string, mixed> $value */
    private function store(MetaWebhookProcessor $processor, array $value, ?string $wabaId): void
    {
        $phoneNumberId = is_scalar($value['metadata']['phone_number_id'] ?? null) ? (string) $value['metadata']['phone_number_id'] : '';
        // The tenant comes only from the platform-wide phone mapping; unknown numbers are ignored here,
        // and the processor re-checks status and WABA before applying anything.
        $channel = $processor->channelFor($phoneNumberId);
        if ($channel === null) {
            Log::warning('whatsapp.webhook.unmapped_phone_number', ['mapped' => false]);

            return;
        }
        $json = json_encode(['waba_id' => $wabaId, 'value' => $value], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $digest = hash('sha256', $json, true);
        // An identical redelivery maps to the same receipt (unique per integration + digest).
        DB::table('webhook_receipts')->insertOrIgnore([
            'tenant_id' => $channel->tenant_id, 'integration_id' => $channel->integration_id, 'provider' => 'META',
            'idempotency_key' => 'wa-change:'.bin2hex($digest), 'provider_object' => 'whatsapp_messages',
            'provider_object_id' => mb_substr($phoneNumberId, 0, 191), 'signature_algorithm' => 'HMAC-SHA256', 'signature_valid' => 1,
            'payload_sha256' => $digest, 'raw_payload' => $json, 'processing_status' => 'RECEIVED',
            // Client text is dropped once processed; failed receipts keep it this long for review, then the reconciler redacts it.
            'expires_at' => now()->addDays(30),
        ]);
        $receipt = DB::table('webhook_receipts')->where('integration_id', $channel->integration_id)
            ->where('idempotency_key', 'wa-change:'.bin2hex($digest))->first(['id', 'processing_status']);
        if ($receipt === null) {
            // INSERT IGNORE turned an error into a warning: never acknowledge a change that is not stored.
            throw new \RuntimeException('WhatsApp webhook receipt was not stored.');
        }
        if (! in_array($receipt->processing_status, ['RECEIVED', 'RETRY'], true)) {
            return;
        }
        try {
            ProcessMetaWebhookReceipt::dispatch((int) $channel->tenant_id, (int) $receipt->id);
        } catch (\Throwable $error) {
            // The receipt is already durable: the reconciler requeues it, so Meta still gets its 200.
            report($error);
        }
    }
}

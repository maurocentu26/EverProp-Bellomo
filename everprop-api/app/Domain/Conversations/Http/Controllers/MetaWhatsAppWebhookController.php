<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
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
 * payloads up to 3 MB; non-200 answers are retried by Meta. The statuses[] shape is not covered
 * by that page and is parsed defensively.
 */
final class MetaWhatsAppWebhookController extends Controller
{
    private const MAX_BYTES = 3 * 1024 * 1024;

    private const STATUS_RANK = ['QUEUED' => 1, 'UNKNOWN' => 1, 'SENT' => 2, 'DELIVERED' => 3, 'READ' => 4];

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

    public function receive(Request $request, InboundMessageService $inbound): Response
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
        foreach ($this->arrays($payload['entry'] ?? null) as $entry) {
            foreach ($this->arrays($entry['changes'] ?? null) as $change) {
                if (($change['field'] ?? null) !== 'messages' || ! is_array($change['value'] ?? null)) {
                    continue;
                }
                $this->handleValue($change['value'], is_scalar($entry['id'] ?? null) ? (string) $entry['id'] : null, $inbound);
            }
        }

        // Everything above is persisted (or deliberately ignored) before acknowledging.
        return response('EVENT_RECEIVED', 200);
    }

    /** @param array<string, mixed> $value */
    private function handleValue(array $value, ?string $wabaId, InboundMessageService $inbound): void
    {
        $phoneNumberId = is_scalar($value['metadata']['phone_number_id'] ?? null) ? (string) $value['metadata']['phone_number_id'] : '';
        // whatsapp_phone_number_id is unique platform-wide (2026-09-29.002), so at most one row.
        $channel = $phoneNumberId === '' ? null : DB::table('channel_accounts as ca')
            ->join('integration_connections as ic', fn ($j) => $j->on('ic.id', '=', 'ca.integration_id')->on('ic.tenant_id', '=', 'ca.tenant_id'))
            ->where('ca.whatsapp_phone_number_id', $phoneNumberId)
            ->first(['ca.id', 'ca.tenant_id', 'ca.status', 'ca.metadata_json', 'ic.provider', 'ic.status as integration_status']);

        // The tenant comes only from this verified mapping; anything else fails closed.
        $expectedWaba = $channel === null ? null : (json_decode((string) $channel->metadata_json, true)['waba_id'] ?? null);
        if ($channel === null || $channel->status !== 'ACTIVE' || $channel->provider !== 'META' || $channel->integration_status !== 'ACTIVE'
            || ($expectedWaba !== null && $expectedWaba !== $wabaId)) {
            Log::warning('whatsapp.webhook.unmapped_phone_number', ['mapped' => $channel !== null]);

            return;
        }
        $names = collect($this->arrays($value['contacts'] ?? null))
            ->filter(fn ($c) => is_scalar($c['wa_id'] ?? null))
            ->mapWithKeys(fn ($c) => [(string) $c['wa_id'] => is_string($c['profile']['name'] ?? null) ? $c['profile']['name'] : null]);

        foreach ($this->arrays($value['messages'] ?? null) as $message) {
            $from = is_scalar($message['from'] ?? null) ? (string) $message['from'] : '';
            $id = is_scalar($message['id'] ?? null) ? (string) $message['id'] : '';
            if ($from === '' || $id === '' || preg_match('/\A[0-9]{6,20}\z/', $from) !== 1) {
                continue;
            }
            $type = is_string($message['type'] ?? null) ? $message['type'] : 'unknown';
            $body = $message['text']['body'] ?? null;
            $inbound->accept(new InboundMessage(
                tenantId: (int) $channel->tenant_id,
                channelAccountId: (int) $channel->id,
                identityChannelType: 'WHATSAPP',
                senderProviderId: $from,
                threadId: 'wa:'.$from,
                providerMessageId: mb_substr($id, 0, 191),
                type: $this->messageType($type),
                text: $type === 'text' && is_string($body) ? mb_substr($body, 0, 4096) : null,
                occurredAt: $this->timestamp($message['timestamp'] ?? null),
                senderDisplayName: is_string($names[$from] ?? null) ? mb_substr($names[$from], 0, 200) : null,
                senderPhoneE164: '+'.$from,
                // Minimized: only the campaign identifiers needed for attribution.
                metadata: array_filter([
                    'native_type' => $type,
                    'context_id' => is_scalar($message['context']['id'] ?? null) ? (string) $message['context']['id'] : null,
                    'referral' => is_array($message['referral'] ?? null) ? array_filter(array_intersect_key($message['referral'], array_flip(['source_type', 'source_id', 'ctwa_clid'])), 'is_scalar') ?: null : null,
                ]),
            ));
        }

        foreach ($this->arrays($value['statuses'] ?? null) as $status) {
            $this->applyStatus((int) $channel->tenant_id, (int) $channel->id, $status);
        }
    }

    /** @param array<string, mixed> $status */
    private function applyStatus(int $tenantId, int $channelId, array $status): void
    {
        $new = is_string($status['status'] ?? null) ? strtoupper($status['status']) : '';
        $providerId = is_scalar($status['id'] ?? null) ? (string) $status['id'] : '';
        if ($providerId === '' || ! in_array($new, ['SENT', 'DELIVERED', 'READ', 'FAILED'], true)) {
            return;
        }

        DB::transaction(function () use ($tenantId, $channelId, $providerId, $new, $status): void {
            $message = DB::table('messages')->where('tenant_id', $tenantId)->where('channel_account_id', $channelId)
                ->where('provider_message_id', $providerId)->where('direction', 'OUTBOUND')->lockForUpdate()->first(['id', 'delivery_status']);
            if ($message === null) {
                return;
            }
            $current = (string) $message->delivery_status;
            // Out-of-order callbacks never move a message backwards (READ never returns to SENT).
            $advance = $new === 'FAILED'
                ? in_array($current, ['QUEUED', 'SENT', 'UNKNOWN'], true)
                : self::STATUS_RANK[$new] > (self::STATUS_RANK[$current] ?? 99);
            if (! $advance) {
                return;
            }
            $at = $this->timestamp($status['timestamp'] ?? null)->format('Y-m-d H:i:s.v');
            DB::table('messages')->where('tenant_id', $tenantId)->where('id', $message->id)->update(array_filter([
                'delivery_status' => $new,
                'sent_at' => $new === 'SENT' ? $at : null,
                'delivered_at' => $new === 'DELIVERED' ? $at : null,
                'read_at' => $new === 'READ' ? $at : null,
                'failed_at' => $new === 'FAILED' ? $at : null,
                'provider_error_code' => $new === 'FAILED' ? mb_substr(is_scalar($status['errors'][0]['code'] ?? null) ? (string) $status['errors'][0]['code'] : 'FAILED', 0, 80) : null,
            ], fn ($v) => $v !== null));
        });
    }

    /** @return list<array<string, mixed>> */
    private function arrays(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, 'is_array')) : [];
    }

    private function messageType(string $native): string
    {
        return match ($native) {
            'text' => 'TEXT', 'image' => 'IMAGE', 'video' => 'VIDEO', 'audio' => 'AUDIO', 'document' => 'DOCUMENT',
            'location' => 'LOCATION', 'contacts' => 'CONTACT', 'sticker' => 'STICKER', 'reaction' => 'REACTION',
            'interactive', 'button' => 'INTERACTIVE', default => 'SYSTEM',
        };
    }

    private function timestamp(mixed $value): CarbonImmutable
    {
        return is_numeric($value) ? CarbonImmutable::createFromTimestampUTC((int) $value) : CarbonImmutable::now('UTC');
    }
}

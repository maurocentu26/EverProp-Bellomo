<?php

namespace App\Domain\Conversations\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Whether a message may go out on a channel right now (Plan W2; evaluation-and-security.md: the
 * dispatcher asks at send time and fails closed; a human cannot bypass channel rules either).
 *
 * WhatsApp (Meta docs, verified 2026-10-03): a message from the user opens a 24-hour customer
 * service window that resets with each new message; inside it any service message may be sent, once
 * it closes only pre-approved templates. Here the window is per conversation and per number: only an
 * inbound CONTACT message of this conversation on this channel counts. Calls do not reach this system.
 * The exact 24 h mark counts as closed. Free-entry-point windows (72 h, click-to-WhatsApp ads) are not
 * modelled: they are never assumed open.
 *
 * Templates are not sent by EverSys yet; the rule is ready for when they are: a template is allowed
 * only if listed as approved for this number in channel metadata (`approved_templates`, to be synced
 * from Meta).
 */
final class ChannelPolicy
{
    public const WINDOW_HOURS = 24;

    /**
     * @param  array<string, mixed>  $channel  channel_accounts row of the conversation
     * @return string|null null when sending is allowed, else a stable reason code
     */
    public function check(int $tenantId, int $conversationId, array $channel, ?string $template = null): ?string
    {
        if ((int) ($channel['tenant_id'] ?? 0) !== $tenantId || ($channel['status'] ?? null) !== 'ACTIVE') {
            return 'CHANNEL_INACTIVE';
        }

        return match ($channel['channel_type'] ?? null) {
            'WEB_CHAT' => null, // our own widget: no provider window
            'WHATSAPP' => $template === null ? $this->whatsappWindow($tenantId, $conversationId, (int) $channel['id']) : $this->approvedTemplate($channel, $template),
            default => 'CHANNEL_UNSUPPORTED',
        };
    }

    /** When the current WhatsApp service window closes, or null if it is closed / never opened. */
    public function windowClosesAt(int $tenantId, int $conversationId, int $channelId): ?CarbonImmutable
    {
        $last = DB::table('messages')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
            ->where('channel_account_id', $channelId)->where('direction', 'INBOUND')->where('sender_type', 'CONTACT')
            // occurred_at is Meta's timestamp; capping it at our receipt time means a future-dated one can't extend the window.
            ->max(DB::raw('LEAST(occurred_at, created_at)'));
        $closes = $last === null ? null : CarbonImmutable::parse((string) $last, 'UTC')->addHours(self::WINDOW_HOURS);

        return $closes !== null && CarbonImmutable::now('UTC')->lessThan($closes) ? $closes : null;
    }

    private function whatsappWindow(int $tenantId, int $conversationId, int $channelId): ?string
    {
        return $this->windowClosesAt($tenantId, $conversationId, $channelId) === null ? 'OUTSIDE_SERVICE_WINDOW' : null;
    }

    /** @param array<string, mixed> $channel */
    private function approvedTemplate(array $channel, string $template): ?string
    {
        $approved = json_decode((string) ($channel['metadata_json'] ?? ''), true)['approved_templates'] ?? [];

        return is_array($approved) && in_array($template, $approved, true) ? null : 'TEMPLATE_NOT_APPROVED';
    }
}

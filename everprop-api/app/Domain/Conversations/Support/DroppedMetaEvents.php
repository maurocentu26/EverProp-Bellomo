<?php

namespace App\Domain\Conversations\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * EVP-138: Meta webhook events dropped on purpose (unmapped account, incomplete event, channel changed) used to leave
 * only a warning, so a misconfigured channel lost every message unnoticed. Each drop is counted per hour and logged with
 * its reason and account id (never the client's text: an unmapped account has no tenant), and the THRESHOLD-th drop of a
 * reason in an hour logs an error, which is what the platform alerts on.
 */
final class DroppedMetaEvents
{
    public const REASONS = ['UNMAPPED_ACCOUNT', 'INCOMPLETE_EVENT', 'CHANNEL_CHANGED'];

    // ponytail: fixed hourly window and threshold, counted in the cache; move to config or a table if ops needs history.
    public const THRESHOLD = 5;

    public static function record(string $reason, string $channelType, string $accountId): void
    {
        $key = self::key($reason, intdiv(time(), 3600));
        // A cache outage must not turn the 200 into a 500 (Meta would redeliver the batch forever): the log still records it.
        $count = (int) rescue(function () use ($key) {
            Cache::add($key, 0, 7200);

            return Cache::increment($key);
        }, 0);
        $context = ['reason' => $reason, 'channel_type' => $channelType, 'account_id' => mb_substr($accountId, 0, 64), 'count_this_hour' => $count];
        Log::warning('meta.webhook.dropped_event', $context);
        if ($count === self::THRESHOLD) {
            Log::error('meta.webhook.dropped_events_alert', $context + [
                'hint' => 'Revisá que el canal exista, esté ACTIVE y tenga el ID de cuenta correcto (instagram_login incluido).',
            ]);
        }
    }

    /** @return array<string, array{this_hour: int, previous_hour: int}> */
    public static function counts(): array
    {
        $hour = intdiv(time(), 3600);

        return collect(self::REASONS)->mapWithKeys(fn (string $reason) => [$reason => [
            'this_hour' => (int) Cache::get(self::key($reason, $hour), 0),
            'previous_hour' => (int) Cache::get(self::key($reason, $hour - 1), 0),
        ]])->all();
    }

    private static function key(string $reason, int $hour): string
    {
        return "meta-webhook-dropped:{$reason}:{$hour}";
    }
}

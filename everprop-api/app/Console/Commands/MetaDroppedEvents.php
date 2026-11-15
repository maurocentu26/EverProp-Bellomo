<?php

namespace App\Console\Commands;

use App\Domain\Conversations\Support\DroppedMetaEvents;
use Illuminate\Console\Command;

/** EVP-138: how many Meta webhook events were dropped this hour and the previous one, by reason. */
final class MetaDroppedEvents extends Command
{
    protected $signature = 'everprop:meta:dropped-events';

    protected $description = 'Print the Meta webhook events dropped (unmapped account, incomplete event, channel changed) per hour';

    public function handle(): int
    {
        $this->table(['Motivo', 'Esta hora', 'Hora anterior'], collect(DroppedMetaEvents::counts())
            ->map(fn (array $c, string $reason) => [$reason, $c['this_hour'], $c['previous_hour']])->values()->all());
        $this->line('Alerta (log error meta.webhook.dropped_events_alert) al llegar a '.DroppedMetaEvents::THRESHOLD.' por motivo en la hora. Detalle por cuenta: log meta.webhook.dropped_event.');

        return self::SUCCESS;
    }
}

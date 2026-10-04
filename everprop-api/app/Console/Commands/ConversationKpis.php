<?php

namespace App\Console\Commands;

use App\Domain\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Minimal pilot KPIs (S16, plan F1), for the weekly review against a human sample.
 *
 * Cohort: conversations of one tenant whose first customer message arrived in [from, to) UTC.
 * Conversations with no customer message never enter it. Per channel:
 * - first human response: first advisor message that left (SENT/DELIVERED/READ) after the first
 *   customer message (p50/p95 in minutes, wall-clock: business hours are not modelled);
 * - without human response: no such message (a bot reply, a queued or unconfirmed send do not count);
 * - conversations with lead: the contact got a lead inside the range, after the conversation started,
 *   from this channel or with no source channel; complete = the contact has a phone, an email or a
 *   declared phone. Counts conversations, not leads. A request is never counted as a confirmed visit;
 * - duplicates: contacts with more than one lead in the range, and identical advisor texts sent twice
 *   within 60 s in the same conversation (gate F1: 0).
 *
 * ponytail: reads the whole cohort into memory; fine for a pilot week, move to SQL aggregates or a
 * reporting table before a tenant reaches tens of thousands of conversations per range.
 */
final class ConversationKpis extends Command
{
    protected $signature = 'everprop:conversations:kpis {--tenant= : tenant slug or public id} {--from= : first day, YYYY-MM-DD (UTC); default 7 days ago} {--to= : day after the last, YYYY-MM-DD (UTC); default today}';

    protected $description = 'Print the pilot KPIs of a tenant (first human response, unanswered, leads, duplicates) as JSON';

    public function handle(): int
    {
        $tenant = Tenant::query()->where('public_id', (string) $this->option('tenant'))->orWhere('slug', (string) $this->option('tenant'))->first();
        $day = fn (?string $value, CarbonImmutable $default): ?CarbonImmutable => $value === null ? $default
            : (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1 ? CarbonImmutable::parse($value, 'UTC') : null);
        $to = $day($this->option('to'), CarbonImmutable::now('UTC')->startOfDay());
        $from = $day($this->option('from'), ($to ?? CarbonImmutable::now('UTC'))->subDays(7));
        if ($tenant === null || $from === null || $to === null || ! $from->lessThan($to)) {
            $this->error('Indicá --tenant válido y, si querés, --from y --to como YYYY-MM-DD con from < to.');

            return self::FAILURE;
        }

        $this->line(json_encode($this->compute((int) $tenant->id, $from, $to), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));

        return self::SUCCESS;
    }

    /** @return array<string, mixed> */
    public function compute(int $tenantId, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $format = 'Y-m-d H:i:s.v';
        $conversations = DB::table('conversations as c')
            ->join('channel_accounts as ca', fn ($j) => $j->on('ca.id', '=', 'c.channel_account_id')->on('ca.tenant_id', '=', 'c.tenant_id'))
            ->where('c.tenant_id', $tenantId)->where('c.first_inbound_at', '>=', $from->format($format))->where('c.first_inbound_at', '<', $to->format($format))
            ->get(['c.id', 'c.contact_id', 'c.channel_account_id', 'c.first_inbound_at', 'ca.channel_type']);
        $ids = $conversations->pluck('id')->all();
        $contactIds = $conversations->pluck('contact_id')->unique()->all();

        // Only messages that left (any provider status after SENT), and only after the customer wrote.
        $firstHuman = DB::table('messages as m')
            ->join('conversations as c', fn ($j) => $j->on('c.id', '=', 'm.conversation_id')->on('c.tenant_id', '=', 'm.tenant_id'))
            ->where('m.tenant_id', $tenantId)->whereIn('m.conversation_id', $ids)
            ->where('m.direction', 'OUTBOUND')->where('m.sender_type', 'USER')->whereIn('m.delivery_status', ['SENT', 'DELIVERED', 'READ'])
            ->whereColumn('m.occurred_at', '>=', 'c.first_inbound_at')
            ->groupBy('m.conversation_id')->selectRaw('m.conversation_id, MIN(m.occurred_at) AS at')->pluck('at', 'conversation_id');
        // Leads created inside the range; a lead with a known source channel only counts for that channel.
        // ponytail: leads.created_at comes from MySQL's clock; the DB connection must run in UTC like the app.
        $leads = DB::table('leads')->where('tenant_id', $tenantId)->whereIn('contact_id', $contactIds)->whereNull('deleted_at')
            ->where('created_at', '>=', $from->format($format))->where('created_at', '<', $to->format($format))
            ->get(['contact_id', 'created_at', 'source_channel_account_id'])->groupBy('contact_id');
        $reachable = DB::table('contacts')->where('tenant_id', $tenantId)->whereIn('id', $contactIds)->get(['id', 'phone_e164', 'email', 'profile_json'])
            ->filter(fn ($c) => $c->phone_e164 !== null || $c->email !== null || isset((json_decode((string) $c->profile_json, true) ?: [])['declared_phone']))
            ->pluck('id')->flip();
        // Sent twice = same text, same conversation, within 60 s, whatever the provider status became (UNKNOWN may have left too).
        $duplicateSends = DB::table('messages')->where('tenant_id', $tenantId)->whereIn('conversation_id', $ids)
            ->where('direction', 'OUTBOUND')->where('sender_type', 'USER')->whereNotNull('text_body')
            ->whereIn('delivery_status', ['SENT', 'DELIVERED', 'READ', 'UNKNOWN'])
            ->orderBy('conversation_id')->orderBy('occurred_at')->get(['conversation_id', 'text_body', 'occurred_at'])
            ->groupBy(fn ($m) => $m->conversation_id.'|'.$m->text_body)
            ->sum(fn ($same) => $same->sliding(2)->filter(fn ($pair) => CarbonImmutable::parse($pair->first()->occurred_at)
                ->diffInSeconds(CarbonImmutable::parse($pair->last()->occurred_at)) <= 60)->count());

        $byChannel = [];
        foreach ($conversations->groupBy('channel_type') as $channel => $rows) {
            $minutes = [];
            $leadCount = $complete = 0;
            foreach ($rows as $row) {
                $start = CarbonImmutable::parse($row->first_inbound_at, 'UTC');
                if (isset($firstHuman[$row->id])) {
                    $minutes[] = $start->diffInSeconds(CarbonImmutable::parse($firstHuman[$row->id], 'UTC')) / 60;
                }
                $hasLead = ($leads[$row->contact_id] ?? collect())->contains(fn ($l) => CarbonImmutable::parse($l->created_at, 'UTC')->greaterThanOrEqualTo($start)
                    && ($l->source_channel_account_id === null || (int) $l->source_channel_account_id === (int) $row->channel_account_id));
                $leadCount += $hasLead ? 1 : 0;
                $complete += $hasLead && isset($reachable[$row->contact_id]) ? 1 : 0;
            }
            sort($minutes);
            $byChannel[$channel] = [
                'conversations' => $rows->count(),
                'first_human_response_minutes' => ['answered' => count($minutes), 'p50' => $this->percentile($minutes, 50), 'p95' => $this->percentile($minutes, 95)],
                'without_human_response' => $rows->count() - count($minutes),
                'conversations_with_lead' => $leadCount, 'conversations_with_complete_lead' => $complete,
            ];
        }

        return [
            'tenant_id' => $tenantId, 'from' => $from->toDateString(), 'to_exclusive' => $to->toDateString(), 'timezone' => 'UTC',
            'by_channel' => $byChannel,
            'duplicates' => ['contacts_with_several_leads' => $leads->filter(fn ($l) => $l->count() > 1)->count(), 'advisor_messages_sent_twice' => (int) $duplicateSends],
        ];
    }

    /** @param list<float> $sorted */
    private function percentile(array $sorted, int $p): ?float
    {
        return $sorted === [] ? null : round($sorted[(int) ceil($p / 100 * count($sorted)) - 1], 1);
    }
}

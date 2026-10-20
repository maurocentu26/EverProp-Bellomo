<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\LeadAccessPolicy;
use App\Domain\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class CommercialStatisticsController
{
    public function __construct(private readonly TenantContext $tenantContext) {}

    public function __invoke(Request $request): JsonResponse
    {
        $tenantId = $this->tenantContext->id();
        abort_unless((new LeadAccessPolicy)->statistics($request->user(), $tenantId), 403);
        $input = $request->validate([
            'tenant_id' => ['prohibited'], 'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'], 'advisor' => ['nullable', 'uuid'],
        ]);
        $from = CarbonImmutable::parse($input['from'], 'America/Argentina/Buenos_Aires')->startOfDay();
        $to = CarbonImmutable::parse($input['to'], 'America/Argentina/Buenos_Aires')->addDay()->startOfDay();
        if ($from->diffInDays($to) > 366) {
            throw ValidationException::withMessages(['to' => 'El período máximo es de 366 días.']);
        }
        $from = $from->utc()->format('Y-m-d H:i:s');
        $to = $to->utc()->format('Y-m-d H:i:s');
        $advisorId = null;
        if (! empty($input['advisor'])) {
            $advisorId = DB::table('users')->where('tenant_id', $tenantId)->where('public_id', $input['advisor'])->value('id');
            abort_if($advisorId === null, 404);
        }
        $users = DB::table('users')->where('tenant_id', $tenantId)->orderBy('display_name')->get(['id', 'public_id', 'display_name', 'deleted_at']);
        foreach ($users as $user) {
            if ($user->deleted_at !== null) {
                $user->display_name .= ' (dado de baja)';
            }
        }
        $empty = array_fill_keys(['leads', 'active', 'won', 'lost', 'attended', 'period_won', 'undated_won', 'conversations', 'answered', 'resolved', 'response_seconds', 'resolution_seconds'], 0);
        $rows = [];
        $rows[0] = ['id' => null, 'name' => 'Sin asignar'] + $empty;
        foreach ($users as $user) {
            $rows[$user->id] = ['id' => $user->public_id, 'name' => $user->display_name] + $empty;
        }
        $followed = DB::table('lead_follow_ups')->where('tenant_id', $tenantId)->whereColumn('lead_id', 'l.id')->where('type', '<>', 'note');
        $leads = DB::table('leads as l')->join('pipeline_stages as s', fn ($j) => $j->on('s.id', '=', 'l.stage_id')->on('s.tenant_id', '=', 'l.tenant_id'))
            ->where('l.tenant_id', $tenantId)->whereNull('l.deleted_at')
            ->when($advisorId, fn ($q) => $q->where('l.assigned_user_id', $advisorId))
            ->where(fn ($q) => $q->where(fn ($q) => $q->where('l.created_at', '>=', $from)->where('l.created_at', '<', $to))
                ->orWhere(fn ($q) => $q->where('l.won_at', '>=', $from)->where('l.won_at', '<', $to))
                ->orWhere(fn ($q) => $q->where('s.code', 'WON')->whereNull('l.won_at')))
            ->select(['l.assigned_user_id', 'l.created_at', 'l.won_at', 's.code'])->selectRaw('EXISTS ('.$followed->selectRaw('1')->toSql().') as attended', $followed->getBindings());
        // Stream the cohort: no pagination truncation or full message/lead collections in memory.
        foreach ($leads->cursor() as $lead) {
            $key = isset($rows[$lead->assigned_user_id ?? 0]) ? ($lead->assigned_user_id ?? 0) : 0;
            if ($lead->created_at >= $from && $lead->created_at < $to) {
                $rows[$key]['leads']++;
                $rows[$key][match ($lead->code) {
                    'WON' => 'won', 'LOST' => 'lost', default => 'active'
                }]++;
                $rows[$key]['attended'] += (int) $lead->attended;
            }
            if ($lead->code === 'WON') {
                $rows[$key]['undated_won'] += $lead->won_at === null ? 1 : 0;
                $rows[$key]['period_won'] += $lead->won_at !== null && $lead->won_at >= $from && $lead->won_at < $to ? 1 : 0;
            }
        }
        $responses = DB::table('messages')->where('tenant_id', $tenantId)->where('direction', 'OUTBOUND')->where('sender_type', 'USER')
            ->whereIn('delivery_status', ['SENT', 'DELIVERED', 'READ'])->whereRaw('COALESCE(sent_at, delivered_at, read_at, occurred_at) >= c.first_inbound_at')
            ->selectRaw('MIN(COALESCE(sent_at, delivered_at, read_at, occurred_at))');
        $conversations = DB::table('conversations as c')->where('c.tenant_id', $tenantId)
            ->where('c.first_inbound_at', '>=', $from)->where('c.first_inbound_at', '<', $to)
            ->when($advisorId, fn ($q) => $q->where('c.assigned_user_id', $advisorId))
            ->select(['c.assigned_user_id', 'c.first_inbound_at', 'c.closed_at', 'c.status'])
            ->selectSub($responses->whereColumn('conversation_id', 'c.id'), 'first_response');
        foreach ($conversations->cursor() as $conversation) {
            $key = isset($rows[$conversation->assigned_user_id ?? 0]) ? ($conversation->assigned_user_id ?? 0) : 0;
            $rows[$key]['conversations']++;
            if ($conversation->first_response !== null) {
                $rows[$key]['answered']++;
                $rows[$key]['response_seconds'] += CarbonImmutable::parse($conversation->first_inbound_at)->diffInSeconds(CarbonImmutable::parse($conversation->first_response));
            }
            if ($conversation->status === 'RESOLVED' && $conversation->closed_at !== null && $conversation->closed_at >= $conversation->first_inbound_at) {
                $rows[$key]['resolved']++;
                $rows[$key]['resolution_seconds'] += CarbonImmutable::parse($conversation->first_inbound_at)->diffInSeconds(CarbonImmutable::parse($conversation->closed_at));
            }
        }
        $total = $empty;
        $visible = [];
        foreach ($rows as $row) {
            if ($row['leads'] + $row['period_won'] + $row['undated_won'] + $row['conversations'] === 0) {
                continue;
            }
            foreach ($total as $field => $value) {
                $total[$field] += $row[$field];
            }
            $visible[] = $this->metrics($row);
        }

        return response()->json(['data' => ['total' => $this->metrics($total), 'advisors' => $visible,
            'advisor_options' => $users->map(fn ($u) => ['id' => $u->public_id, 'name' => $u->display_name]),
            'from' => $input['from'], 'to' => $input['to'], 'timezone' => 'America/Argentina/Buenos_Aires']]);
    }

    /** @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function metrics(array $row): array
    {
        $row['conversion'] = $row['leads'] ? round(100 * $row['won'] / $row['leads'], 2) : null;
        $row['close_rate'] = $row['won'] + $row['lost'] ? round(100 * $row['won'] / ($row['won'] + $row['lost']), 2) : null;
        $row['response_minutes'] = $row['answered'] ? round($row['response_seconds'] / $row['answered'] / 60, 2) : null;
        $row['resolution_minutes'] = $row['resolved'] ? round($row['resolution_seconds'] / $row['resolved'] / 60, 2) : null;
        unset($row['response_seconds'], $row['resolution_seconds']);

        return $row;
    }
}

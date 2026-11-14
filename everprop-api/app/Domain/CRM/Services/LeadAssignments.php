<?php

namespace App\Domain\CRM\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * EVP-133: a manual change of a lead's owner (panel or advisor taking it from a conversation) left no history,
 * kept assignment_method UNASSIGNED and never set the assignment dates. Automatic routing records this inside
 * sp_create_or_get_open_lead; this does the same for manual changes. Call it in the transaction that holds the lead.
 */
final class LeadAssignments
{
    public function change(int $tenantId, int $leadId, ?int $fromUserId, ?int $toUserId, ?int $actorUserId): void
    {
        if ($fromUserId === $toUserId) {
            return;
        }
        $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
        $reason = $toUserId === null ? 'UNASSIGNED' : ($fromUserId === null ? 'MANUAL' : 'REASSIGNMENT');

        DB::table('lead_assignments')->where('tenant_id', $tenantId)->where('lead_id', $leadId)->whereNull('ended_at')
            ->update(['ended_at' => $now]);
        DB::table('lead_assignments')->insert([
            'tenant_id' => $tenantId, 'lead_id' => $leadId, 'from_user_id' => $fromUserId, 'to_user_id' => $toUserId,
            'actor_user_id' => $actorUserId, 'reason_code' => $reason, 'assigned_at' => $now,
        ]);
        DB::table('leads')->where('tenant_id', $tenantId)->where('id', $leadId)->update(['assigned_user_id' => $toUserId, 'assignment_method' => $reason]
            + ($toUserId === null ? [] : ['first_assigned_at' => DB::raw('COALESCE(first_assigned_at, '.DB::getPdo()->quote($now).')'), 'last_assigned_at' => $now]));
    }
}

<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\LeadAccessPolicy;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class AdminLeadFollowUpController extends Controller
{
    public function __construct(private readonly TenantContext $tenantContext) {}

    public function indexAll(Request $request): JsonResponse
    {
        $this->ensureTableExists();

        $tenantId = $this->tenantContext->id();
        $user = $request->user();
        abort_unless($user && (new LeadAccessPolicy)->viewAny($user, $tenantId), 403);

        $query = DB::table('lead_follow_ups')
            ->join('leads', 'leads.id', '=', 'lead_follow_ups.lead_id')
            ->leftJoin('users', 'users.id', '=', 'lead_follow_ups.user_id')
            ->where('lead_follow_ups.tenant_id', $tenantId)
            ->where('leads.tenant_id', $tenantId)
            ->whereNull('leads.deleted_at')
            ->select([
                'lead_follow_ups.id',
                'lead_follow_ups.public_id',
                'lead_follow_ups.type',
                'lead_follow_ups.occurred_at',
                'lead_follow_ups.summary',
                'lead_follow_ups.result',
                'lead_follow_ups.next_action',
                'lead_follow_ups.next_contact_at',
                'lead_follow_ups.created_at',
                'leads.public_id as lead_public_id',
                'users.id as user_id',
                'users.public_id as user_public_id',
                'users.display_name as user_name',
            ])
            ->orderBy('lead_follow_ups.id');

        if ($user->role() === RoleCode::SALES_ADVISOR) {
            $query->where('leads.assigned_user_id', $user->id);
        }

        $page = $query->simplePaginate(500);
        $followUps = collect($page->items());

        return response()->json([
            'meta' => ['next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null],
            'data' => $followUps->map(function ($item) {
                return [
                    'id' => $item->public_id,
                    'sequence' => $item->id,
                    'companyId' => 'c1',
                    'leadId' => $item->lead_public_id,
                    'agentId' => $item->user_public_id ?: (string) $item->user_id,
                    'agentName' => $item->user_name,
                    'agentAvatar' => null,
                    'type' => $item->type,
                    'occurredAt' => $item->occurred_at ? Carbon::parse($item->occurred_at, 'UTC')->toISOString() : null,
                    'summary' => $item->summary,
                    'result' => $item->result,
                    'nextAction' => $item->next_action,
                    'nextContactAt' => $item->next_contact_at ? Carbon::parse($item->next_contact_at, 'UTC')->toISOString() : null,
                    'createdAt' => $item->created_at ? Carbon::parse($item->created_at, 'UTC')->toISOString() : null,
                ];
            }),
        ]);
    }

    public function index(Request $request, string $leadPublicId): JsonResponse
    {
        $this->ensureTableExists();

        $tenantId = $this->tenantContext->id();

        $lead = DB::table('leads')
            ->where('tenant_id', $tenantId)
            ->where('public_id', $leadPublicId)
            ->whereNull('deleted_at')
            ->first();

        if (! $lead) {
            return response()->json(['error' => 'Lead not found'], 404);
        }

        abort_unless($request->user() && (new LeadAccessPolicy)->view($request->user(), $tenantId, $lead), 403);

        $followUps = DB::table('lead_follow_ups')
            ->leftJoin('users', 'users.id', '=', 'lead_follow_ups.user_id')
            ->where('lead_follow_ups.tenant_id', $tenantId)
            ->where('lead_follow_ups.lead_id', $lead->id)
            ->select([
                'lead_follow_ups.id',
                'lead_follow_ups.public_id',
                'lead_follow_ups.type',
                'lead_follow_ups.occurred_at',
                'lead_follow_ups.summary',
                'lead_follow_ups.result',
                'lead_follow_ups.next_action',
                'lead_follow_ups.next_contact_at',
                'lead_follow_ups.created_at',
                'users.id as user_id',
                'users.public_id as user_public_id',
                'users.display_name as user_name',
            ])
            ->orderByDesc('lead_follow_ups.occurred_at')
            ->get();

        return response()->json([
            'data' => $followUps->map(function ($item) use ($leadPublicId) {
                return [
                    'id' => $item->public_id,
                    'sequence' => $item->id,
                    'companyId' => 'c1',
                    'leadId' => $leadPublicId,
                    'agentId' => $item->user_public_id ?: (string) $item->user_id,
                    'agentName' => $item->user_name,
                    'agentAvatar' => null,
                    'type' => $item->type,
                    'occurredAt' => $item->occurred_at ? Carbon::parse($item->occurred_at, 'UTC')->toISOString() : null,
                    'summary' => $item->summary,
                    'result' => $item->result,
                    'nextAction' => $item->next_action,
                    'nextContactAt' => $item->next_contact_at ? Carbon::parse($item->next_contact_at, 'UTC')->toISOString() : null,
                    'createdAt' => $item->created_at ? Carbon::parse($item->created_at, 'UTC')->toISOString() : null,
                ];
            }),
        ]);
    }

    public function store(Request $request, string $leadPublicId): JsonResponse
    {
        $this->ensureTableExists();

        $tenantId = $this->tenantContext->id();

        $lead = DB::table('leads')
            ->where('tenant_id', $tenantId)
            ->where('public_id', $leadPublicId)
            ->whereNull('deleted_at')
            ->first();

        if (! $lead) {
            return response()->json(['error' => 'Lead not found'], 404);
        }

        abort_unless($request->user() && (new LeadAccessPolicy)->update($request->user(), $tenantId, $lead), 403);

        $validated = $request->validate([
            'type' => 'required|string|in:call,whatsapp,email,meeting,visit,note',
            'occurred_at' => 'required|date|before_or_equal:now',
            'summary' => 'required|string|max:500',
            'result' => 'required|string|max:5000',
            'next_action' => 'nullable|string|max:500',
            'next_contact_at' => 'nullable|date|after_or_equal:occurred_at',
            'agent_id' => 'nullable',
        ]);

        // The authenticated actor is the audit author; a client cannot impersonate an advisor.
        $userId = $request->user()->id;

        if (! $userId) {
            return response()->json([
                'error' => 'El lead debe tener un asesor asignado antes de registrar un seguimiento.',
            ], 422);
        }

        $occurredAt = Carbon::parse($validated['occurred_at'])->setTimezone('UTC');
        $nextContactAt = ! empty($validated['next_contact_at'])
            ? Carbon::parse($validated['next_contact_at'])->setTimezone('UTC')
            : null;

        $now = Carbon::now('UTC');
        $followUpUuid = (string) Str::uuid();

        return DB::transaction(function () use (
            $tenantId,
            $lead,
            $leadPublicId,
            $userId,
            $validated,
            $occurredAt,
            $nextContactAt,
            $now,
            $followUpUuid
        ) {
            DB::table('leads')->where('tenant_id', $tenantId)->where('id', $lead->id)->lockForUpdate()->first();
            // 1. Insert follow-up record
            $followUpId = DB::table('lead_follow_ups')->insertGetId([
                'tenant_id' => $tenantId,
                'public_id' => $followUpUuid,
                'lead_id' => $lead->id,
                'user_id' => $userId,
                'type' => $validated['type'],
                'occurred_at' => $occurredAt,
                'summary' => $validated['summary'],
                'result' => $validated['result'],
                'next_action' => $validated['next_action'] ?? null,
                'next_contact_at' => $nextContactAt,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // Notes and backdated records must not move the last actual contact.
            if ($validated['type'] !== 'note') {
                $latestContact = DB::table('lead_follow_ups')->where('tenant_id', $tenantId)
                    ->where('lead_id', $lead->id)->where('type', '<>', 'note')->max('occurred_at');
                DB::table('leads')->where('tenant_id', $tenantId)->where('id', $lead->id)
                    ->update(['last_touch_at' => $latestContact, 'updated_at' => $now]);
            }

            // Supersede only appointments generated from an earlier contact, never manual visits.
            $latestId = DB::table('lead_follow_ups')->where('tenant_id', $tenantId)
                ->where('lead_id', $lead->id)->where('type', '<>', 'note')
                ->orderByDesc('occurred_at')->orderByDesc('id')->value('id');
            $isLatestContact = $validated['type'] !== 'note' && (int) $latestId === $followUpId;
            if ($isLatestContact) {
                DB::table('visits')->where('tenant_id', $tenantId)->where('lead_id', $lead->id)
                    ->whereNotNull('follow_up_id')->where('status', 'SCHEDULED')
                    ->update(['status' => 'CANCELLED', 'cancelled_at' => $now, 'updated_at' => $now,
                        'outcome' => 'Reemplazada por un nuevo seguimiento comercial.']);
            }
            if ($isLatestContact && $nextContactAt) {
                $visitUuid = (string) Str::uuid();
                DB::table('visits')->insert([
                    'tenant_id' => $tenantId,
                    'public_id' => $visitUuid,
                    'follow_up_id' => $followUpId,
                    'lead_id' => $lead->id,
                    'property_id' => null,
                    'assigned_user_id' => $lead->assigned_user_id ?: $userId,
                    'created_by_user_id' => $userId,
                    'visit_type' => in_array($validated['type'], ['visit', 'meeting']) ? 'PHYSICAL' : 'VIRTUAL',
                    'scheduled_at' => $nextContactAt,
                    'scheduled_end_at' => (clone $nextContactAt)->addHour(),
                    'status' => 'SCHEDULED',
                    'notes' => ($validated['next_action'] ?? null) ?: ('Próximo contacto · '.(['call' => 'Llamada', 'whatsapp' => 'WhatsApp', 'email' => 'Correo', 'meeting' => 'Reunión', 'visit' => 'Visita', 'note' => 'Nota interna'][$validated['type']])),
                    'outcome' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            // Retrieve advisor display info
            $user = DB::table('users')->where('id', $userId)->first(['public_id', 'display_name']);

            return response()->json([
                'data' => [
                    'id' => $followUpUuid,
                    'sequence' => $followUpId,
                    'companyId' => 'c1',
                    'leadId' => $leadPublicId,
                    'agentId' => $user?->public_id ?: (string) $userId,
                    'agentName' => $user?->display_name,
                    'agentAvatar' => null,
                    'type' => $validated['type'],
                    'occurredAt' => $occurredAt->toIso8601String(),
                    'summary' => $validated['summary'],
                    'result' => $validated['result'],
                    'nextAction' => $validated['next_action'] ?? null,
                    'nextContactAt' => $nextContactAt?->toIso8601String(),
                    'createdAt' => $now->toIso8601String(),
                ],
            ], 201);
        });
    }

    private function ensureTableExists(): void
    {
        if (! Schema::hasTable('lead_follow_ups')) {
            DB::unprepared('
                CREATE TABLE IF NOT EXISTS `lead_follow_ups` (
                    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `tenant_id` BIGINT UNSIGNED NOT NULL,
                    `public_id` CHAR(36) NOT NULL,
                    `lead_id` BIGINT UNSIGNED NOT NULL,
                    `user_id` BIGINT UNSIGNED NOT NULL,
                    `type` VARCHAR(32) NOT NULL,
                    `occurred_at` DATETIME(3) NOT NULL,
                    `summary` VARCHAR(500) NOT NULL,
                    `result` TEXT NOT NULL,
                    `next_action` VARCHAR(500) NULL,
                    `next_contact_at` DATETIME(3) NULL,
                    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `uq_lead_follow_ups_public_id` (`public_id`),
                    KEY `ix_lead_follow_ups_lead` (`tenant_id`, `lead_id`, `occurred_at`),
                    KEY `ix_lead_follow_ups_user` (`tenant_id`, `user_id`, `occurred_at`),
                    CONSTRAINT `fk_lead_follow_ups_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
                    CONSTRAINT `fk_lead_follow_ups_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
                    CONSTRAINT `fk_lead_follow_ups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ');
        }
    }
}

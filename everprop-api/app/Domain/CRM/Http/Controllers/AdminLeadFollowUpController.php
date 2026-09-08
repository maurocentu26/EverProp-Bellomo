<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class AdminLeadFollowUpController extends Controller
{
    public function __construct(
        private readonly TenantContext $tenantContext,
        private readonly AuthorizationService $authorization,
    ) {}

    public function indexAll(Request $request): JsonResponse
    {
        $tenantId = $this->tenantContext->id();
        $user = $this->authorizedUser($request, Capability::VIEW_ANY);
        $pagination = $this->pagination($request);

        $query = DB::table('lead_follow_ups')
            ->join('leads', function ($join): void {
                $join->on('leads.id', '=', 'lead_follow_ups.lead_id')
                    ->on('leads.tenant_id', '=', 'lead_follow_ups.tenant_id');
            })
            ->leftJoin('users', function ($join): void {
                $join->on('users.id', '=', 'lead_follow_ups.user_id')
                    ->on('users.tenant_id', '=', 'lead_follow_ups.tenant_id');
            })
            ->where('lead_follow_ups.tenant_id', $tenantId)
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
            ->orderByDesc('lead_follow_ups.occurred_at')
            ->orderByDesc('lead_follow_ups.id');

        if ($user->role() === RoleCode::SALES_ADVISOR) {
            $query->where(function ($q) use ($user) {
                $q->where('leads.assigned_user_id', $user->id)
                    ->orWhere('lead_follow_ups.user_id', $user->id);
            });
        }

        $paginator = $query->paginate($pagination['per_page'], ['*'], 'page', $pagination['page']);
        $followUps = collect($paginator->items());

        return response()->json([
            'data' => $followUps->map(function ($item) {
                return [
                    'id' => $item->public_id,
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
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    public function index(Request $request, string $leadPublicId): JsonResponse
    {
        $tenantId = $this->tenantContext->id();
        $user = $this->authorizedUser($request, Capability::VIEW);
        $pagination = $this->pagination($request);

        $leadQuery = DB::table('leads')
            ->where('tenant_id', $tenantId)
            ->where('public_id', $leadPublicId);

        if ($user->role() === RoleCode::SALES_ADVISOR) {
            $leadQuery->where('assigned_user_id', $user->id);
        }

        $lead = $leadQuery->first();

        if (! $lead) {
            return response()->json(['error' => 'Lead not found'], 404);
        }

        $followUps = DB::table('lead_follow_ups')
            ->leftJoin('users', function ($join): void {
                $join->on('users.id', '=', 'lead_follow_ups.user_id')
                    ->on('users.tenant_id', '=', 'lead_follow_ups.tenant_id');
            })
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
            ->orderByDesc('lead_follow_ups.id')
            ->paginate($pagination['per_page'], ['*'], 'page', $pagination['page']);

        $items = collect($followUps->items());

        return response()->json([
            'data' => $items->map(function ($item) use ($leadPublicId) {
                return [
                    'id' => $item->public_id,
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
            'meta' => $this->paginationMeta($followUps),
        ]);
    }

    public function store(Request $request, string $leadPublicId): JsonResponse
    {
        $tenantId = $this->tenantContext->id();
        $user = $this->authorizedUser($request, Capability::CREATE);

        $leadQuery = DB::table('leads')
            ->where('tenant_id', $tenantId)
            ->where('public_id', $leadPublicId);

        if ($user->role() === RoleCode::SALES_ADVISOR) {
            $leadQuery->where('assigned_user_id', $user->id);
        }

        $lead = $leadQuery->first();

        if (! $lead) {
            return response()->json(['error' => 'Lead not found'], 404);
        }

        $validated = $request->validate([
            'type' => 'required|string|in:call,whatsapp,email,meeting,visit,note',
            'occurred_at' => 'required|string',
            'summary' => 'required|string|max:500',
            'result' => 'required|string|max:5000',
            'next_action' => 'nullable|string|max:500',
            'next_contact_at' => 'nullable|string',
            'agent_id' => 'nullable',
        ]);

        $requestedAgentId = $this->resolveUserId($validated['agent_id'] ?? null, $tenantId);
        if (! empty($validated['agent_id']) && $requestedAgentId === null) {
            throw ValidationException::withMessages([
                'agent_id' => ['The selected advisor is not available for this tenant.'],
            ]);
        }
        if ($requestedAgentId !== null && $requestedAgentId !== (int) $user->id) {
            $this->authorization->authorize($user, Capability::ASSIGN);
        }

        $userId = $requestedAgentId ?? $user->id ?? $lead->assigned_user_id;

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
            $followUpUuid,
            $user,
        ) {
            // 1. Insert follow-up record
            DB::table('lead_follow_ups')->insert([
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

            // 2. Update lead's last_touch_at
            DB::table('leads')
                ->where('tenant_id', $tenantId)
                ->where('id', $lead->id)
                ->update([
                    'last_touch_at' => $occurredAt,
                    'updated_at' => $now,
                ]);

            // 3. Sychronize next contact date with `visits` for Calendar / Agenda
            if ($nextContactAt) {
                $visitUuid = (string) Str::uuid();
                DB::table('visits')->insert([
                    'tenant_id' => $tenantId,
                    'public_id' => $visitUuid,
                    'lead_id' => $lead->id,
                    'property_id' => null,
                    'assigned_user_id' => $userId,
                    'created_by_user_id' => $user->id,
                    'visit_type' => in_array($validated['type'], ['visit', 'meeting']) ? 'PHYSICAL' : 'VIRTUAL',
                    'scheduled_at' => $nextContactAt,
                    'scheduled_end_at' => (clone $nextContactAt)->addHour(),
                    'status' => 'SCHEDULED',
                    'notes' => $validated['next_action'] ?: ('Próximo contacto · '.ucfirst($validated['type'])),
                    'outcome' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            // Retrieve advisor display info
            $followUpUser = DB::table('users')
                ->where('tenant_id', $tenantId)
                ->where('id', $userId)
                ->first(['public_id', 'display_name']);

            return response()->json([
                'data' => [
                    'id' => $followUpUuid,
                    'companyId' => 'c1',
                    'leadId' => $leadPublicId,
                    'agentId' => $followUpUser?->public_id ?: (string) $userId,
                    'agentName' => $followUpUser?->display_name,
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

    /** @return array{page: int, per_page: int} */
    private function pagination(Request $request): array
    {
        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        return [
            'page' => (int) ($validated['page'] ?? 1),
            'per_page' => (int) ($validated['per_page'] ?? 100),
        ];
    }

    /**
     * @param  LengthAwarePaginator<int, \stdClass>  $paginator
     * @return array{current_page: int, last_page: int, per_page: int, total: int}
     */
    private function paginationMeta(LengthAwarePaginator $paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ];
    }

    private function authorizedUser(Request $request, Capability $capability): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        $this->authorization->authorize($user, $capability);

        return $user;
    }

    private function resolveUserId(mixed $agentId, int $tenantId): ?int
    {
        if (empty($agentId)) {
            return null;
        }

        if (is_numeric($agentId)) {
            $user = DB::table('users')
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $agentId)
                ->first(['id']);

            return $user ? (int) $user->id : null;
        }

        if (is_string($agentId)) {
            $user = DB::table('users')
                ->where('tenant_id', $tenantId)
                ->where('public_id', $agentId)
                ->first(['id']);

            return $user ? (int) $user->id : null;
        }

        return null;
    }
}

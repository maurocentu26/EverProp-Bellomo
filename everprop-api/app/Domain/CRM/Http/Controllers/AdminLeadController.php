<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AdminLeadController extends Controller
{
    public function __construct(private readonly TenantContext $tenantContext) {}

    public function index(Request $request): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();
            $user = $request->user();

            $query = DB::table('leads')
                ->join('contacts', 'contacts.id', '=', 'leads.contact_id')
                ->join('pipeline_stages', 'pipeline_stages.id', '=', 'leads.stage_id')
                ->leftJoin('users', 'users.id', '=', 'leads.assigned_user_id')
                ->where('leads.tenant_id', $tenantId)
                ->whereNull('leads.deleted_at')
                ->select([
                    'leads.id',
                    'leads.public_id',
                    'leads.title',
                    'leads.priority',
                    'leads.qualification',
                    'leads.budget_min',
                    'leads.budget_max',
                    'leads.currency_code',
                    'leads.is_open',
                    'leads.first_touch_at',
                    'leads.last_touch_at',
                    'leads.notes',
                    'leads.created_at',
                    'leads.updated_at',
                    'contacts.public_id as contact_public_id',
                    'contacts.display_name as contact_name',
                    'contacts.email as contact_email',
                    'contacts.phone_e164 as contact_phone',
                    'pipeline_stages.code as stage_code',
                    'pipeline_stages.name as stage_name',
                    'users.id as assigned_user_id',
                    'users.display_name as assigned_user_name',
                ])
                ->orderByDesc('leads.updated_at');

            // Advisor isolation: Advisors only see their assigned leads
            if ($user && isset($user->role_code) && $user->role_code === RoleCode::SALES_ADVISOR) {
                $query->where('leads.assigned_user_id', $user->id);
            }

            $leads = $query->limit(200)->get();

            return response()->json([
                'data' => $leads->map(function ($lead) {
                    return [
                        'id' => $lead->public_id,
                        'db_id' => $lead->id,
                        'name' => $lead->contact_name ?: $lead->title,
                        'email' => $lead->contact_email,
                        'phone' => $lead->contact_phone,
                        'title' => $lead->title,
                        'stage' => $lead->stage_code,
                        'stage_label' => $lead->stage_name,
                        'priority' => strtolower($lead->priority),
                        'budget' => $lead->budget_max ? (float) $lead->budget_max : null,
                        'currency' => $lead->currency_code ?: 'USD',
                        'notes' => $lead->notes,
                        'agent_id' => $lead->assigned_user_id,
                        'agent_name' => $lead->assigned_user_name,
                        'created_at' => $lead->created_at,
                        'updated_at' => $lead->updated_at,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ], 500);
        }
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();
            $user = $request->user();

            $validated = $request->validate([
                'name' => 'required|string|max:200',
                'email' => 'nullable|email|max:320',
                'phone' => 'nullable|string|max:32',
                'stage' => 'nullable|string|max:40',
                'priority' => 'nullable|string|in:LOW,NORMAL,HIGH,URGENT,low,normal,high,urgent',
                'budget' => 'nullable|numeric|min:0',
                'currency' => 'nullable|string|in:USD,ARS',
                'notes' => 'nullable|string|max:10000',
                'agent_id' => 'nullable|integer',
            ]);

            return DB::transaction(function () use ($tenantId, $user, $validated) {
                $now = Carbon::now('UTC');
                $contactUuid = (string) Str::uuid();

                // 1. Create contact
                $contactId = DB::table('contacts')->insertGetId([
                    'tenant_id' => $tenantId,
                    'public_id' => $contactUuid,
                    'display_name' => $validated['name'],
                    'first_name' => explode(' ', $validated['name'])[0] ?? $validated['name'],
                    'email' => $validated['email'] ?? null,
                    'phone_e164' => $validated['phone'] ?? null,
                    'first_seen_at' => $now,
                    'last_seen_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // 2. Resolve stage
                $stageCode = strtoupper($validated['stage'] ?? 'NEW');
                $stage = DB::table('pipeline_stages')
                    ->where('tenant_id', $tenantId)
                    ->where('code', $stageCode)
                    ->first();

                if (! $stage) {
                    $stage = DB::table('pipeline_stages')
                        ->where('tenant_id', $tenantId)
                        ->where('code', 'NEW')
                        ->first();
                }

                // 3. Resolve assigned agent
                $assignedId = $validated['agent_id'] ?? ($user ? $user->id : null);

                // 4. Create lead
                $leadUuid = (string) Str::uuid();
                $leadId = DB::table('leads')->insertGetId([
                    'tenant_id' => $tenantId,
                    'public_id' => $leadUuid,
                    'contact_id' => $contactId,
                    'stage_id' => $stage ? $stage->id : 1,
                    'assigned_user_id' => $assignedId,
                    'assignment_method' => $assignedId ? 'MANUAL' : 'UNASSIGNED',
                    'source_channel' => 'WEB_FORM',
                    'source_kind' => 'ADMIN_MANUAL',
                    'title' => 'Interés: ' . $validated['name'],
                    'priority' => strtoupper($validated['priority'] ?? 'NORMAL'),
                    'budget_max' => $validated['budget'] ?? null,
                    'currency_code' => $validated['currency'] ?? 'USD',
                    'notes' => $validated['notes'] ?? null,
                    'first_touch_at' => $now,
                    'last_touch_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                return response()->json([
                    'data' => [
                        'id' => $leadUuid,
                        'name' => $validated['name'],
                        'email' => $validated['email'] ?? null,
                        'phone' => $validated['phone'] ?? null,
                        'stage' => $stage ? $stage->code : 'NEW',
                        'priority' => strtolower($validated['priority'] ?? 'normal'),
                        'agent_id' => $assignedId,
                    ],
                ], 201);
            });
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ], 500);
        }
    }

    public function update(Request $request, string $leadPublicId): JsonResponse
    {
        $tenantId = $this->tenantContext->id();

        $validated = $request->validate([
            'name' => 'nullable|string|max:160',
            'email' => 'nullable|string|max:160',
            'phone' => 'nullable|string|max:40',
            'stage' => 'nullable|string|max:40',
            'notes' => 'nullable|string|max:10000',
            'priority' => 'nullable|string|in:LOW,NORMAL,HIGH,URGENT',
            'agent_id' => 'nullable|integer',
        ]);

        $lead = DB::table('leads')
            ->where('tenant_id', $tenantId)
            ->where('public_id', $leadPublicId)
            ->first();

        if (! $lead) {
            return response()->json(['error' => 'Lead not found'], 404);
        }

        $contactUpdates = [];
        if (array_key_exists('name', $validated) && ! empty($validated['name'])) {
            $contactUpdates['first_name'] = $validated['name'];
        }
        if (array_key_exists('email', $validated)) {
            $contactUpdates['email'] = $validated['email'];
        }
        if (array_key_exists('phone', $validated)) {
            $contactUpdates['phone'] = $validated['phone'];
        }

        if (! empty($contactUpdates) && $lead->contact_id) {
            $contactUpdates['updated_at'] = Carbon::now('UTC');
            DB::table('contacts')->where('id', $lead->contact_id)->update($contactUpdates);
        }

        $updates = [
            'updated_at' => Carbon::now('UTC'),
        ];

        if (! empty($validated['stage'])) {
            $stage = DB::table('pipeline_stages')
                ->where('tenant_id', $tenantId)
                ->where('code', strtoupper($validated['stage']))
                ->first();
            if ($stage) {
                $updates['stage_id'] = $stage->id;
            }
        }

        if (array_key_exists('notes', $validated)) {
            $updates['notes'] = $validated['notes'];
        }

        if (! empty($validated['priority'])) {
            $updates['priority'] = strtoupper($validated['priority']);
        }

        if (array_key_exists('agent_id', $validated)) {
            $updates['assigned_user_id'] = $validated['agent_id'];
        }

        DB::table('leads')
            ->where('id', $lead->id)
            ->update($updates);

        return response()->json(['status' => 'updated']);
    }
}

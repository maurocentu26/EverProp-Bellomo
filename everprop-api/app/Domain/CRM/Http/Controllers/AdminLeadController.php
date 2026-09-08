<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\Notifications\LeadAssignedNotification;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
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
                    'users.public_id as assigned_user_id',
                    'users.display_name as assigned_user_name',
                ])
                ->orderByDesc('leads.updated_at');

            // Advisor isolation: Advisors only see their assigned leads
            if ($user && isset($user->role_code) && $user->role_code === RoleCode::SALES_ADVISOR) {
                $query->where('leads.assigned_user_id', $user->id);
            }

            $leads = $query->limit(200)->get();

            $leadIds = $leads->pluck('id')->all();
            $linkedPropertiesMap = [];
            $linkedPropertyIds = [];

            if (! empty($leadIds)) {
                $linkedProps = DB::table('lead_properties')
                    ->join('properties', 'properties.id', '=', 'lead_properties.property_id')
                    ->leftJoin('projects', 'projects.id', '=', 'properties.project_id')
                    ->where('lead_properties.tenant_id', $tenantId)
                    ->whereIn('lead_properties.lead_id', $leadIds)
                    ->select([
                        'lead_properties.lead_id',
                        'lead_properties.interest_level',
                        'lead_properties.status as interest_status',
                        'lead_properties.notes as interest_notes',
                        'properties.public_id as property_public_id',
                        'properties.title as property_title',
                        'properties.price as property_price',
                        'properties.currency_code as property_currency',
                        'properties.category as property_category',
                        'properties.unit_number',
                        'properties.sector_name',
                        'projects.public_id as project_public_id',
                        'projects.name as project_name',
                    ])
                    ->get();

                foreach ($linkedProps as $prop) {
                    $linkedPropertyIds[$prop->lead_id][] = $prop->property_public_id;
                    $linkedPropertiesMap[$prop->lead_id][] = [
                        'id' => $prop->property_public_id,
                        'title' => $prop->property_title,
                        'price' => $prop->property_price ? (float) $prop->property_price : null,
                        'currency' => $prop->property_currency,
                        'category' => $prop->property_category,
                        'project_id' => $prop->project_public_id,
                        'project_name' => $prop->project_name,
                        'unit_number' => $prop->unit_number,
                        'sector_name' => $prop->sector_name,
                        'interest_level' => $prop->interest_level,
                        'status' => $prop->interest_status ?: 'ACTIVE',
                        'notes' => $prop->interest_notes,
                    ];
                }
            }

            return response()->json([
                'data' => $leads->map(function ($lead) use ($linkedPropertyIds, $linkedPropertiesMap) {
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
                        'last_touch_at' => $lead->last_touch_at ? Carbon::parse($lead->last_touch_at, 'UTC')->toISOString() : null,
                        'follow_up_updated_at' => $lead->last_touch_at ? Carbon::parse($lead->last_touch_at, 'UTC')->toISOString() : null,
                        'property_ids' => $linkedPropertyIds[$lead->id] ?? [],
                        'properties' => $linkedPropertiesMap[$lead->id] ?? [],
                        'created_at' => $lead->created_at ? Carbon::parse($lead->created_at, 'UTC')->toISOString() : null,
                        'updated_at' => $lead->updated_at ? Carbon::parse($lead->updated_at, 'UTC')->toISOString() : null,
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
                'agent_id' => 'nullable',
                'property_id' => 'nullable|string',
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
                $assignedId = $this->resolveUserId($validated['agent_id'] ?? null, $tenantId)
                    ?? ($user ? $user->id : null);

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

                // 4.1 Attach initial property if provided
                $linkedPropertyIds = [];
                if (! empty($validated['property_id'])) {
                    $propIdentifier = $validated['property_id'];
                    $property = DB::table('properties')
                        ->where('tenant_id', $tenantId)
                        ->where(function ($q) use ($propIdentifier) {
                            $q->where('public_id', $propIdentifier);
                            if (is_numeric($propIdentifier)) {
                                $q->orWhere('id', (int) $propIdentifier);
                            }
                        })
                        ->first();

                    if ($property) {
                        DB::table('lead_properties')->insert([
                            'tenant_id' => $tenantId,
                            'lead_id' => $leadId,
                            'property_id' => $property->id,
                            'linked_by_user_id' => $assignedId,
                            'interest_level' => 'MEDIUM',
                            'status' => 'ACTIVE',
                            'notes' => null,
                            'quoted_price' => $property->price,
                            'quoted_currency_code' => $property->currency_code,
                            'linked_at' => $now,
                            'last_activity_at' => $now,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                        $linkedPropertyIds[] = $property->public_id;
                    }
                }

                // 5. Notify assigned agent
                if ($assignedId) {
                    try {
                        $assignedUser = User::find($assignedId);
                        if ($assignedUser) {
                            $assignedUser->notify(new LeadAssignedNotification(
                                leadPublicId: $leadUuid,
                                leadName: $validated['name'],
                                eventType: 'LEAD_CREATED',
                                title: 'Nuevo lead asignado',
                                message: "Se te ha asignado el nuevo lead '{$validated['name']}'",
                                actionUrl: "/admin/leads/{$leadUuid}"
                            ));
                        }
                    } catch (\Throwable) {
                        // Keep transaction intact if notification fails
                    }
                }

                return response()->json([
                    'data' => [
                        'id' => $leadUuid,
                        'name' => $validated['name'],
                        'email' => $validated['email'] ?? null,
                        'phone' => $validated['phone'] ?? null,
                        'stage' => $stage ? $stage->code : 'NEW',
                        'priority' => strtolower($validated['priority'] ?? 'normal'),
                        'agent_id' => $assignedId,
                        'property_ids' => $linkedPropertyIds,
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

    public function show(Request $request, string $leadPublicId): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();
            $user = $request->user();

            $query = DB::table('leads')
                ->join('contacts', 'contacts.id', '=', 'leads.contact_id')
                ->join('pipeline_stages', 'pipeline_stages.id', '=', 'leads.stage_id')
                ->leftJoin('users', 'users.id', '=', 'leads.assigned_user_id')
                ->where('leads.tenant_id', $tenantId)
                ->where('leads.public_id', $leadPublicId)
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
                    'users.public_id as assigned_user_id',
                    'users.display_name as assigned_user_name',
                ]);

            if ($user && isset($user->role_code) && $user->role_code === RoleCode::SALES_ADVISOR) {
                $query->where('leads.assigned_user_id', $user->id);
            }

            $lead = $query->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }

            $linkedProps = DB::table('lead_properties')
                ->join('properties', 'properties.id', '=', 'lead_properties.property_id')
                ->leftJoin('projects', 'projects.id', '=', 'properties.project_id')
                ->where('lead_properties.tenant_id', $tenantId)
                ->where('lead_properties.lead_id', $lead->id)
                ->select([
                    'lead_properties.interest_level',
                    'lead_properties.status as interest_status',
                    'lead_properties.notes as interest_notes',
                    'properties.public_id as property_public_id',
                    'properties.title as property_title',
                    'properties.price as property_price',
                    'properties.currency_code as property_currency',
                    'properties.category as property_category',
                    'properties.unit_number',
                    'properties.sector_name',
                    'projects.public_id as project_public_id',
                    'projects.name as project_name',
                ])
                ->get();

            $propertyIds = $linkedProps->pluck('property_public_id')->all();
            $propertiesList = $linkedProps->map(function ($prop) {
                return [
                    'id' => $prop->property_public_id,
                    'title' => $prop->property_title,
                    'price' => $prop->property_price ? (float) $prop->property_price : null,
                    'currency' => $prop->property_currency,
                    'category' => $prop->property_category,
                    'project_id' => $prop->project_public_id,
                    'project_name' => $prop->project_name,
                    'unit_number' => $prop->unit_number,
                    'sector_name' => $prop->sector_name,
                    'interest_level' => $prop->interest_level,
                    'status' => $prop->interest_status ?: 'ACTIVE',
                    'notes' => $prop->interest_notes,
                ];
            })->all();

            return response()->json([
                'data' => [
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
                    'last_touch_at' => $lead->last_touch_at ? Carbon::parse($lead->last_touch_at, 'UTC')->toISOString() : null,
                    'follow_up_updated_at' => $lead->last_touch_at ? Carbon::parse($lead->last_touch_at, 'UTC')->toISOString() : null,
                    'property_ids' => $propertyIds,
                    'properties' => $propertiesList,
                    'created_at' => $lead->created_at ? Carbon::parse($lead->created_at, 'UTC')->toISOString() : null,
                    'updated_at' => $lead->updated_at ? Carbon::parse($lead->updated_at, 'UTC')->toISOString() : null,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function update(Request $request, string $leadPublicId): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();

            $validated = $request->validate([
                'name' => 'nullable|string|max:160',
                'email' => 'nullable|string|max:160',
                'phone' => 'nullable|string|max:40',
                'stage' => 'nullable|string|max:40',
                'notes' => 'nullable|string|max:10000',
                'priority' => 'nullable|string|in:LOW,NORMAL,HIGH,URGENT',
                'agent_id' => 'nullable',
            ]);

            $lead = DB::table('leads')
                ->where('tenant_id', $tenantId)
                ->where('public_id', $leadPublicId)
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }

            $contactUpdates = [];
            $updates = [
                'updated_at' => Carbon::now('UTC'),
            ];

            if (array_key_exists('name', $validated) && ! empty($validated['name'])) {
                $contactUpdates['first_name'] = $validated['name'];
                $contactUpdates['display_name'] = $validated['name'];
                $updates['title'] = 'Interés: ' . $validated['name'];
            }
            if (array_key_exists('email', $validated)) {
                $contactUpdates['email'] = $validated['email'];
            }
            if (array_key_exists('phone', $validated)) {
                $contactUpdates['phone_e164'] = $validated['phone'];
            }

            if (! empty($contactUpdates) && $lead->contact_id) {
                $contactUpdates['updated_at'] = Carbon::now('UTC');
                DB::table('contacts')->where('id', $lead->contact_id)->update($contactUpdates);
            }

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
                $newAssignedId = $this->resolveUserId($validated['agent_id'], $tenantId);
                $oldAssignedId = $lead->assigned_user_id ? (int) $lead->assigned_user_id : null;

                $updates['assigned_user_id'] = $newAssignedId;

                if ($newAssignedId && $newAssignedId !== $oldAssignedId) {
                    try {
                        $assignedUser = User::find($newAssignedId);
                        if ($assignedUser) {
                            $contact = DB::table('contacts')->where('id', $lead->contact_id)->first(['display_name']);
                            $leadName = $contact?->display_name ?: $lead->title;
                            $assignedUser->notify(new LeadAssignedNotification(
                                leadPublicId: $lead->public_id,
                                leadName: $leadName,
                                eventType: 'LEAD_REASSIGNED',
                                title: 'Lead reasignado',
                                message: "Se te ha reasignado el lead '{$leadName}'",
                                actionUrl: "/admin/leads/{$lead->public_id}"
                            ));
                        }
                    } catch (\Throwable) {
                        // Ignore notification errors
                    }
                }
            }

            DB::table('leads')
                ->where('id', $lead->id)
                ->update($updates);

            return response()->json(['status' => 'updated']);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function attachProperty(Request $request, string $leadPublicId): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();
            $user = $request->user();

            $lead = DB::table('leads')
                ->where('tenant_id', $tenantId)
                ->where('public_id', $leadPublicId)
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }

            $validated = $request->validate([
                'property_id' => 'required',
                'interest_level' => 'nullable|string|in:LOW,MEDIUM,HIGH,HOT,low,medium,high,hot',
                'status' => 'nullable|string|max:24',
                'notes' => 'nullable|string|max:5000',
                'quoted_price' => 'nullable|numeric|min:0',
                'quoted_currency_code' => 'nullable|string|in:USD,ARS',
            ]);

            $propertyIdentifier = $validated['property_id'];
            $property = DB::table('properties')
                ->where('tenant_id', $tenantId)
                ->where(function ($q) use ($propertyIdentifier) {
                    $q->where('public_id', $propertyIdentifier);
                    if (is_numeric($propertyIdentifier)) {
                        $q->orWhere('id', (int) $propertyIdentifier);
                    }
                })
                ->first();

            if (! $property) {
                return response()->json(['error' => 'Property not found'], 404);
            }

            $now = Carbon::now('UTC');
            $interestLevel = strtoupper($validated['interest_level'] ?? 'MEDIUM');
            $status = strtoupper($validated['status'] ?? 'ACTIVE');

            DB::table('lead_properties')->updateOrInsert(
                [
                    'tenant_id' => $tenantId,
                    'lead_id' => $lead->id,
                    'property_id' => $property->id,
                ],
                [
                    'linked_by_user_id' => $user?->id ?? $lead->assigned_user_id,
                    'interest_level' => $interestLevel,
                    'status' => $status,
                    'notes' => $validated['notes'] ?? null,
                    'quoted_price' => $validated['quoted_price'] ?? $property->price,
                    'quoted_currency_code' => $validated['quoted_currency_code'] ?? $property->currency_code,
                    'last_activity_at' => $now,
                    'updated_at' => $now,
                ]
            );

            return response()->json([
                'status' => 'ok',
                'data' => [
                    'lead_id' => $leadPublicId,
                    'property_id' => $property->public_id,
                    'title' => $property->title,
                    'interest_level' => $interestLevel,
                    'status' => $status,
                    'notes' => $validated['notes'] ?? null,
                ],
            ], 200);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateProperty(Request $request, string $leadPublicId, string $propertyPublicId): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();

            $lead = DB::table('leads')
                ->where('tenant_id', $tenantId)
                ->where('public_id', $leadPublicId)
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }

            $property = DB::table('properties')
                ->where('tenant_id', $tenantId)
                ->where(function ($q) use ($propertyPublicId) {
                    $q->where('public_id', $propertyPublicId);
                    if (is_numeric($propertyPublicId)) {
                        $q->orWhere('id', (int) $propertyPublicId);
                    }
                })
                ->first();

            if (! $property) {
                return response()->json(['error' => 'Property not found'], 404);
            }

            $validated = $request->validate([
                'status' => 'nullable|string|max:24',
                'interest_level' => 'nullable|string|max:16',
                'notes' => 'nullable|string|max:5000',
            ]);

            $updates = [
                'updated_at' => Carbon::now('UTC'),
                'last_activity_at' => Carbon::now('UTC'),
            ];

            if (array_key_exists('status', $validated)) {
                $rawStatus = strtoupper(trim((string) $validated['status']));
                $statusMap = [
                    'NEW' => 'ACTIVE',
                    'CONTACTED' => 'ACTIVE',
                    'QUALIFIED' => 'ACTIVE',
                    'ACTIVE' => 'ACTIVE',
                    'VISIT_SCHEDULED' => 'VISIT_SCHEDULED',
                    'VISITING' => 'VISIT_SCHEDULED',
                    'NEGOTIATION' => 'NEGOTIATING',
                    'NEGOTIATING' => 'NEGOTIATING',
                    'IN_NEGOTIATION' => 'NEGOTIATING',
                    'WON' => 'CONVERTED',
                    'CLOSING' => 'CONVERTED',
                    'CONVERTED' => 'CONVERTED',
                    'DISCARDED' => 'DISCARDED',
                    'LOST' => 'DISCARDED',
                ];
                $updates['status'] = $statusMap[$rawStatus] ?? 'ACTIVE';
            }
            if (array_key_exists('interest_level', $validated)) {
                $rawLevel = strtoupper(trim((string) $validated['interest_level']));
                $levelMap = [
                    'LOW' => 'LOW',
                    'BAJO' => 'LOW',
                    'MEDIUM' => 'MEDIUM',
                    'MEDIO' => 'MEDIUM',
                    'HIGH' => 'HIGH',
                    'ALTO' => 'HIGH',
                    'HOT' => 'HOT',
                ];
                $updates['interest_level'] = $levelMap[$rawLevel] ?? 'MEDIUM';
            }
            if (array_key_exists('notes', $validated)) {
                $updates['notes'] = $validated['notes'];
            }

            DB::table('lead_properties')
                ->updateOrInsert(
                    [
                        'tenant_id' => $tenantId,
                        'lead_id' => $lead->id,
                        'property_id' => $property->id,
                    ],
                    $updates
                );

            return response()->json([
                'status' => 'ok',
                'data' => [
                    'lead_id' => $leadPublicId,
                    'property_id' => $propertyPublicId,
                    'status' => $updates['status'] ?? null,
                ],
            ], 200);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function detachProperty(Request $request, string $leadPublicId, string $propertyPublicId): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();

            $lead = DB::table('leads')
                ->where('tenant_id', $tenantId)
                ->where('public_id', $leadPublicId)
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }

            $property = DB::table('properties')
                ->where('tenant_id', $tenantId)
                ->where(function ($q) use ($propertyPublicId) {
                    $q->where('public_id', $propertyPublicId);
                    if (is_numeric($propertyPublicId)) {
                        $q->orWhere('id', (int) $propertyPublicId);
                    }
                })
                ->first();

            if (! $property) {
                return response()->json(['error' => 'Property not found'], 404);
            }

            DB::table('lead_properties')
                ->where('tenant_id', $tenantId)
                ->where('lead_id', $lead->id)
                ->where('property_id', $property->id)
                ->delete();

            return response()->json(['status' => 'ok'], 200);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
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

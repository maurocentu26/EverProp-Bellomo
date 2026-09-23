<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\LeadAccessPolicy;
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
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class AdminLeadController extends Controller
{
    public function __construct(private readonly TenantContext $tenantContext) {}

    public function advisors(Request $request): JsonResponse
    {
        $tenantId = $this->tenantContext->id();
        abort_unless((new LeadAccessPolicy)->assign($request->user(), $tenantId), 403);
        $advisors = DB::table('users')->where('tenant_id', $tenantId)->where('status', 'ACTIVE')
            ->where('role_code', 'SALES_ADVISOR')->whereNull('deleted_at')
            ->orderBy('display_name')->get(['public_id as id', 'display_name as name']);

        return response()->json(['data' => $advisors]);
    }

    public function index(Request $request): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();
            $user = $request->user();
            abort_unless($user && (new LeadAccessPolicy)->viewAny($user, $tenantId), 403);

            $query = DB::table('leads')
                ->join('contacts', 'contacts.id', '=', 'leads.contact_id')
                ->join('pipeline_stages', 'pipeline_stages.id', '=', 'leads.stage_id')
                ->leftJoin('users', 'users.id', '=', 'leads.assigned_user_id')
                ->where('leads.tenant_id', $tenantId)
                ->where('contacts.tenant_id', $tenantId)
                ->whereNull('leads.deleted_at')
                ->select([
                    'leads.id',
                    'leads.public_id',
                    'leads.title',
                    'leads.source_channel',
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
                ->orderBy('leads.id');

            // Advisor isolation: Advisors only see their assigned leads
            if ($user->role() === RoleCode::SALES_ADVISOR) {
                $query->where('leads.assigned_user_id', $user->id);
            }

            $page = $query->simplePaginate(200);
            $leads = collect($page->items());

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
                'meta' => ['next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null],
                'data' => $leads->map(function ($lead) use ($linkedPropertyIds, $linkedPropertiesMap) {
                    return [
                        'id' => $lead->public_id,
                        'db_id' => $lead->id,
                        'name' => $lead->contact_name ?: $lead->title,
                        'source_channel' => $lead->source_channel,
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
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
            ], 500);
        }
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();
            $user = $request->user();

            abort_unless($user && (new LeadAccessPolicy)->viewAny($user, $tenantId) && $user->role() !== RoleCode::READ_ONLY, 403);
            $validated = $request->validate([
                'name' => 'required|string|max:200',
                'email' => 'nullable|email|max:320',
                'phone' => 'nullable|string|max:32',
                'source_channel' => 'nullable|string|in:WHATSAPP,WEB_FORM,PORTAL,REFERRAL,INSTAGRAM',
                'stage' => 'nullable|string|max:40',
                'priority' => 'nullable|string|in:LOW,NORMAL,HIGH,URGENT,low,normal,high,urgent',
                'budget' => 'nullable|numeric|min:0',
                'currency' => 'nullable|string|in:USD,ARS',
                'notes' => 'nullable|string|max:10000',
                'agent_id' => 'nullable',
                'property_id' => 'nullable|string',
            ]);

            if ($user->role() === RoleCode::SALES_ADVISOR) {
                $validated['agent_id'] = $user->public_id;
            }
            if (in_array(strtoupper($validated['stage'] ?? 'NEW'), ['CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'NEGOTIATION'], true)) {
                throw ValidationException::withMessages(['stage' => 'Creá el lead como Nuevo y registrá un contacto antes de avanzar su etapa.']);
            }

            return DB::transaction(function () use ($tenantId, $validated) {
                $now = Carbon::now('UTC');
                $contactUuid = (string) Str::uuid();

                // 1. Create contact
                $contactId = DB::table('contacts')->insertGetId([
                    'tenant_id' => $tenantId,
                    'public_id' => $contactUuid,
                    'display_name' => $validated['name'],
                    'first_name' => explode(' ', $validated['name'])[0],
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
                    throw ValidationException::withMessages(['stage' => 'La etapa seleccionada no está disponible.']);
                }

                // 3. Resolve assigned agent
                $assignedId = $this->resolveUserId($validated['agent_id'] ?? null, $tenantId);
                if (! empty($validated['agent_id']) && ! $assignedId) {
                    throw ValidationException::withMessages(['agent_id' => 'Seleccioná un responsable comercial activo de esta empresa.']);
                }

                // 4. Create lead
                $leadUuid = (string) Str::uuid();
                $leadId = DB::table('leads')->insertGetId([
                    'tenant_id' => $tenantId,
                    'public_id' => $leadUuid,
                    'contact_id' => $contactId,
                    'stage_id' => $stage->id,
                    'assigned_user_id' => $assignedId,
                    'assignment_method' => $assignedId ? 'MANUAL' : 'UNASSIGNED',
                    'source_channel' => $validated['source_channel'] ?? 'WEB_FORM',
                    'source_kind' => 'ADMIN_MANUAL',
                    'title' => 'Interés: '.$validated['name'],
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

                    if (! $property) {
                        throw ValidationException::withMessages(['property_id' => 'La propiedad seleccionada no está disponible en esta empresa.']);
                    }

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
                    } catch (\Throwable $notificationError) {
                        throw $notificationError; // Roll back the operation rather than silently lose its notification.
                    }
                }

                return response()->json([
                    'data' => [
                        'id' => $leadUuid,
                        'name' => $validated['name'],
                        'source_channel' => $validated['source_channel'] ?? 'WEB_FORM',
                        'email' => $validated['email'] ?? null,
                        'phone' => $validated['phone'] ?? null,
                        'stage' => $stage->code,
                        'priority' => strtolower($validated['priority'] ?? 'normal'),
                        'agent_id' => $assignedId,
                        'property_ids' => $linkedPropertyIds,
                    ],
                ], 201);
            });
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
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
                    'leads.source_channel',
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

            if ($user->role() === RoleCode::SALES_ADVISOR) {
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
                    'source_channel' => $lead->source_channel,
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
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
            ], 500);
        }
    }

    public function update(Request $request, string $leadPublicId): JsonResponse
    {
        try {
            return DB::transaction(function () use ($request, $leadPublicId) {
                $tenantId = $this->tenantContext->id();

                $validated = $request->validate([
                    'name' => 'nullable|string|max:160',
                    'email' => 'nullable|email|max:320',
                    'phone' => 'nullable|string|max:40',
                    'source_channel' => 'nullable|string|in:WHATSAPP,WEB_FORM,PORTAL,REFERRAL,INSTAGRAM',
                    'stage' => 'nullable|string|max:40',
                    'notes' => 'nullable|string|max:10000',
                    'priority' => 'nullable|string|in:LOW,NORMAL,HIGH,URGENT',
                    'agent_id' => 'nullable',
                ]);

                $lead = DB::table('leads')
                    ->where('tenant_id', $tenantId)
                    ->where('public_id', $leadPublicId)
                    ->whereNull('deleted_at')
                    ->lockForUpdate()
                    ->first();

                if (! $lead) {
                    return response()->json(['error' => 'Lead not found'], 404);
                }

                $actor = $request->user();
                abort_unless($actor && (new LeadAccessPolicy)->update($actor, $tenantId, $lead), 403);
                if (array_key_exists('agent_id', $validated)) {
                    abort_unless(in_array($actor->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER], true), 403);
                }
                $stageCode = strtoupper($validated['stage'] ?? '');
                if (in_array($stageCode, ['CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'NEGOTIATION'], true)) {
                    $hasContact = DB::table('lead_follow_ups')->where('tenant_id', $tenantId)
                        ->where('lead_id', $lead->id)->where('type', '<>', 'note')->exists();
                    if (! $hasContact) {
                        throw ValidationException::withMessages([
                            'stage' => 'Registrá un contacto comercial antes de avanzar la etapa.',
                        ]);
                    }
                }
                $stage = null;
                if ($stageCode !== '') {
                    $stage = DB::table('pipeline_stages')->where('tenant_id', $tenantId)->where('code', $stageCode)->first();
                    if (! $stage) {
                        throw ValidationException::withMessages(['stage' => 'Etapa inválida.']);
                    }
                }
                $contactUpdates = [];
                $updates = [
                    'updated_at' => Carbon::now('UTC'),
                ];
                if (array_key_exists('source_channel', $validated)) {
                    $updates['source_channel'] = $validated['source_channel'];
                }

                if (array_key_exists('name', $validated) && ! empty($validated['name'])) {
                    $contactUpdates['first_name'] = $validated['name'];
                    $contactUpdates['display_name'] = $validated['name'];
                    $updates['title'] = 'Interés: '.$validated['name'];
                }
                if (array_key_exists('email', $validated)) {
                    $contactUpdates['email'] = $validated['email'];
                }
                if (array_key_exists('phone', $validated)) {
                    $contactUpdates['phone_e164'] = $validated['phone'];
                }

                if (! empty($contactUpdates) && $lead->contact_id) {
                    $contactUpdates['updated_at'] = Carbon::now('UTC');
                    DB::table('contacts')->where('tenant_id', $tenantId)->where('id', $lead->contact_id)->update($contactUpdates);
                }

                if ($stage) {
                    $updates['stage_id'] = $stage->id;
                    $updates['is_open'] = ! in_array($stageCode, ['WON', 'LOST'], true);
                }

                if (array_key_exists('notes', $validated)) {
                    $updates['notes'] = $validated['notes'];
                }

                if (! empty($validated['priority'])) {
                    $updates['priority'] = strtoupper($validated['priority']);
                }

                if (array_key_exists('agent_id', $validated)) {
                    $newAssignedId = $this->resolveUserId($validated['agent_id'], $tenantId);
                    if (! empty($validated['agent_id']) && ! $newAssignedId) {
                        throw ValidationException::withMessages(['agent_id' => 'Responsable comercial no disponible.']);
                    }
                    $oldAssignedId = $lead->assigned_user_id ? (int) $lead->assigned_user_id : null;

                    $updates['assigned_user_id'] = $newAssignedId;
                    DB::table('visits')->where('tenant_id', $tenantId)->where('lead_id', $lead->id)
                        ->where('status', 'SCHEDULED')->update(['assigned_user_id' => $newAssignedId, 'updated_at' => Carbon::now('UTC')]);

                    if ($newAssignedId && $newAssignedId !== $oldAssignedId) {
                        try {
                            $assignedUser = User::where('tenant_id', $tenantId)->where('id', $newAssignedId)->first();
                            if ($assignedUser) {
                                $contact = DB::table('contacts')->where('tenant_id', $tenantId)->where('id', $lead->contact_id)->first(['display_name']);
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
                        } catch (\Throwable $notificationError) {
                            throw $notificationError; // Roll back the operation rather than silently lose its notification.
                        }
                    }
                }

                DB::table('leads')
                    ->where('tenant_id', $tenantId)
                    ->where('id', $lead->id)
                    ->update($updates);

                return response()->json(['status' => 'updated']);
            });
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
            ], 500);
        }
    }

    public function destroy(Request $request, string $leadPublicId): JsonResponse
    {
        try {
            $tenantId = $this->tenantContext->id();

            $lead = DB::table('leads')
                ->where('tenant_id', $tenantId)
                ->where('public_id', $leadPublicId)
                ->whereNull('deleted_at')
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }

            $actor = $request->user();
            abort_unless($actor && in_array($actor->role()->value, ['SUPER_ADMIN', 'TENANT_ADMIN'], true), 403, 'Solo los administradores pueden eliminar leads.');

            DB::table('leads')
                ->where('id', $lead->id)
                ->update(['deleted_at' => \Carbon\Carbon::now('UTC')]);

            return response()->json(['status' => 'success']);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error("Failed to delete lead", ['id' => $leadPublicId, 'error' => $e->getMessage()]);
            return response()->json(['error' => 'Failed to delete lead'], 500);
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
                ->whereNull('deleted_at')
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }
            $actor = $request->user();
            abort_unless($actor && (new LeadAccessPolicy)->update($actor, $tenantId, $lead), 403);

            $validated = $request->validate([
                'property_id' => 'required',
                'replaces_property_id' => 'nullable|uuid',
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

            DB::transaction(function () use ($tenantId, $lead, $property, $user, $interestLevel, $status, $validated, $now) {
                DB::table('lead_properties')->updateOrInsert(
                    [
                        'tenant_id' => $tenantId,
                        'lead_id' => $lead->id,
                        'property_id' => $property->id,
                    ],
                    [
                        'linked_by_user_id' => $user->id,
                        'interest_level' => $interestLevel,
                        'status' => $status,
                        'notes' => $validated['notes'] ?? null,
                        'quoted_price' => $validated['quoted_price'] ?? $property->price,
                        'quoted_currency_code' => $validated['quoted_currency_code'] ?? $property->currency_code,
                        'last_activity_at' => $now,
                        'updated_at' => $now,
                    ]
                );

                if (! empty($validated['replaces_property_id']) && $validated['replaces_property_id'] !== $property->public_id) {
                    $previousId = DB::table('properties')->where('tenant_id', $tenantId)
                        ->where('public_id', $validated['replaces_property_id'])->value('id');
                    if ($previousId) {
                        DB::table('lead_properties')->where('tenant_id', $tenantId)
                            ->where('lead_id', $lead->id)->where('property_id', $previousId)->delete();
                    }
                }
            });

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
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
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
                ->whereNull('deleted_at')
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }
            $actor = $request->user();
            abort_unless($actor && (new LeadAccessPolicy)->update($actor, $tenantId, $lead), 403);

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
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
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
                ->whereNull('deleted_at')
                ->first();

            if (! $lead) {
                return response()->json(['error' => 'Lead not found'], 404);
            }
            $actor = $request->user();
            abort_unless($actor && (new LeadAccessPolicy)->update($actor, $tenantId, $lead), 403);

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
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No se pudo completar la operación. Intentá nuevamente.',
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
                ->where('status', 'ACTIVE')
                ->where('role_code', 'SALES_ADVISOR')
                ->whereNull('deleted_at')
                ->where('id', (int) $agentId)
                ->first(['id']);

            return $user ? (int) $user->id : null;
        }

        if (is_string($agentId)) {
            $user = DB::table('users')
                ->where('tenant_id', $tenantId)
                ->where('status', 'ACTIVE')
                ->where('role_code', 'SALES_ADVISOR')
                ->whereNull('deleted_at')
                ->where('public_id', $agentId)
                ->first(['id']);

            return $user ? (int) $user->id : null;
        }

        return null;
    }
}


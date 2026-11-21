<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\LeadAccessPolicy;
use App\Domain\CRM\Services\LeadInterests;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** EVP-178: CRUD of a lead's interest sheets; tenant from the server context, access by LeadAccessPolicy. */
final class LeadInterestController extends Controller
{
    private const PARTICIPANT_ROLES = 'FAMILY,COTITULAR,GUARANTOR';

    public function __construct(
        private readonly TenantContext $tenantContext,
        private readonly InventoryAccess $inventoryAccess,
        private readonly LeadInterests $interests,
    ) {}

    public function suggestions(Request $request): JsonResponse
    {
        $tenantId = $this->tenantContext->id();
        abort_unless($request->user() && (new LeadAccessPolicy)->viewAny($request->user(), $tenantId), 403);

        return response()->json(['data' => $this->interests->suggestions($tenantId)]);
    }

    public function store(Request $request, string $leadPublicId): JsonResponse
    {
        [$tenantId, $actor, $lead] = $this->writableLead($request, $leadPublicId);
        $data = $request->validate($this->rules(creating: true));
        $refs = $this->references($actor, $data, null);

        $id = DB::transaction(function () use ($tenantId, $actor, $lead, $data, $refs): int {
            $id = (int) DB::table('lead_interests')->insertGetId(['public_id' => (string) Str::uuid(), 'tenant_id' => $tenantId, 'lead_id' => $lead->id]
                + $refs + $this->columns($data));
            $this->interests->syncUnitLink($tenantId, (int) $lead->id, $refs['property_id'], (int) $actor->id);

            return $id;
        });

        return response()->json(['data' => $this->find($tenantId, $id, $actor)], 201);
    }

    public function update(Request $request, string $leadPublicId, string $interestPublicId): JsonResponse
    {
        [$tenantId, $actor, $lead] = $this->writableLead($request, $leadPublicId);
        $interest = $this->interest($tenantId, (int) $lead->id, $interestPublicId);
        $data = $request->validate($this->rules(creating: false));
        $refs = $this->references($actor, $data, $interest);

        DB::transaction(function () use ($tenantId, $actor, $lead, $interest, $data, $refs): void {
            DB::table('lead_interests')->where('tenant_id', $tenantId)->where('id', $interest->id)
                ->update($refs + $this->columns($data) + ['updated_at' => Carbon::now('UTC')]);
            foreach (array_unique([$interest->property_id, $refs['property_id'] ?? $interest->property_id]) as $propertyId) {
                $this->interests->syncUnitLink($tenantId, (int) $lead->id, $propertyId === null ? null : (int) $propertyId, (int) $actor->id);
            }
        });

        return response()->json(['data' => $this->find($tenantId, (int) $interest->id, $actor)]);
    }

    public function destroy(Request $request, string $leadPublicId, string $interestPublicId): JsonResponse
    {
        [$tenantId, $actor, $lead] = $this->writableLead($request, $leadPublicId);
        $interest = $this->interest($tenantId, (int) $lead->id, $interestPublicId);

        DB::transaction(function () use ($tenantId, $actor, $lead, $interest): void {
            DB::table('lead_interests')->where('tenant_id', $tenantId)->where('id', $interest->id)
                ->update(['deleted_at' => Carbon::now('UTC')]);
            $this->interests->syncUnitLink($tenantId, (int) $lead->id, $interest->property_id === null ? null : (int) $interest->property_id, (int) $actor->id);
        });

        return response()->json(['status' => 'ok']);
    }

    /** @return array{int, User, object} */
    private function writableLead(Request $request, string $leadPublicId): array
    {
        $tenantId = $this->tenantContext->id();
        $actor = $request->user();
        abort_unless($actor instanceof User, 403);
        $lead = Str::isUuid($leadPublicId) ? DB::table('leads')->where('tenant_id', $tenantId)
            ->where('public_id', $leadPublicId)->whereNull('deleted_at')->first() : null;
        abort_unless($lead !== null, 404, 'Lead not found');
        abort_unless((new LeadAccessPolicy)->update($actor, $tenantId, $lead), 403);

        return [$tenantId, $actor, $lead];
    }

    private function interest(int $tenantId, int $leadId, string $publicId): object
    {
        $interest = Str::isUuid($publicId) ? DB::table('lead_interests')->where('tenant_id', $tenantId)
            ->where('lead_id', $leadId)->where('public_id', $publicId)->whereNull('deleted_at')->first() : null;
        abort_unless($interest !== null, 404, 'Interest not found');

        return $interest;
    }

    /** @return array<string, mixed> */
    private function find(int $tenantId, int $id, User $actor): array
    {
        $interest = $this->interests->one($tenantId, $id, $actor->role() === RoleCode::ROTATOR || $this->inventoryAccess->mayViewPriceFields($actor),
            (new LeadAccessPolicy)->viewSensitiveProfile($actor));
        abort_unless($interest !== null, 404);

        return $interest;
    }

    /** @return array<string, mixed> */
    private function rules(bool $creating): array
    {
        $optional = $creating ? 'nullable' : 'sometimes|nullable';

        return [
            'project_id' => "$optional|uuid",
            'property_id' => "$optional|uuid",
            'operation' => ($creating ? 'required_without:property_id|nullable' : 'sometimes|required').'|in:SALE,RENT,TEMPORARY,LEASING,UNKNOWN',
            'tenant_id' => 'prohibited',
            'category' => "$optional|in:LOT,GARAGE,LOCAL,TRADITIONAL,APARTMENT,HOUSE,UNKNOWN",
            'prototype_label' => "$optional|string|max:160",
            'how_heard' => "$optional|string|max:120",
            'first_contact_at' => "$optional|date",
            'first_contact_channel' => "$optional|string|max:64",
            'payment_method' => "$optional|string|max:120",
            'installments_count' => "$optional|integer|min:1|max:600",
            'interest_level' => ($creating ? 'nullable' : 'sometimes|required').'|in:LOW,MEDIUM,HIGH,HOT',
            'status' => ($creating ? 'nullable' : 'sometimes|required').'|in:ACTIVE,VISIT_SCHEDULED,NEGOTIATING,DISCARDED,CONVERTED',
            'quoted_price' => "$optional|numeric|min:0|max:9999999999999999|required_with:quoted_currency_code",
            'quoted_currency_code' => "$optional|in:USD,ARS|required_with:quoted_price",
            'preferences' => "$optional|string|max:5000",
            'notes' => "$optional|string|max:5000",
            // Unknown keys are rejected (array:<keys>), not silently dropped.
            'participants' => "$optional|array|max:20",
            'participants.*' => 'array:role,name,document,phone,relationship,income',
            'participants.*.role' => 'required|in:'.self::PARTICIPANT_ROLES,
            'participants.*.name' => 'required|string|max:160',
            'participants.*.document' => 'nullable|string|max:32',
            'participants.*.phone' => 'nullable|string|max:32',
            'participants.*.relationship' => 'nullable|string|max:80',
            'participants.*.income' => 'nullable|numeric|min:0|max:9999999999999999',
        ];
    }

    /**
     * Resolves project/property public ids inside the tenant and the actor's inventory scope (404 otherwise). A
     * property fixes the project; an unchanged reference on update is kept even if it later left the scope.
     *
     * @param  array<string, mixed>  $data
     * @return array{project_id?: int|null, property_id?: int|null, operation?: string, category?: string|null}
     */
    private function references(User $actor, array $data, ?object $current): array
    {
        $refs = $current === null ? ['project_id' => null, 'property_id' => null] : [];
        if (array_key_exists('project_id', $data)) {
            $refs['project_id'] = $data['project_id'] === null ? null
                : $this->resolve(Project::class, $actor, (string) $data['project_id'], $current?->project_id)->getKey();
        }
        if (! empty($data['property_id'])) {
            /** @var Property $property */
            $property = $this->resolve(Property::class, $actor, (string) $data['property_id'], $current?->property_id);
            $projectId = array_key_exists('project_id', $refs) ? $refs['project_id'] : $current->project_id;
            if ($projectId !== null && (int) $projectId !== (int) $property->project_id) {
                throw ValidationException::withMessages(['property_id' => 'La unidad no pertenece al proyecto indicado.']);
            }
            $refs['property_id'] = (int) $property->id;
            $refs['project_id'] = $property->project_id === null ? null : (int) $property->project_id;
            $refs['operation'] = $data['operation'] ?? ($current->operation ?? $property->operation->value);
            $refs['category'] = array_key_exists('category', $data) ? $data['category'] : ($current->category ?? $property->category->value);
        } elseif (array_key_exists('property_id', $data)) {
            $refs['property_id'] = null;
        }

        return $refs;
    }

    /**
     * @param  class-string<Project>|class-string<Property>  $model
     */
    private function resolve(string $model, User $actor, string $publicId, mixed $currentId): Project|Property
    {
        $table = (new $model)->getTable();
        $record = $model::withTrashed()->where("$table.tenant_id", $this->tenantContext->id())->where("$table.public_id", $publicId)->first();
        $keep = $record && $currentId !== null && (int) $currentId === (int) $record->getKey();
        $scope = fn (): bool => $model === Project::class
            ? $this->inventoryAccess->scopeProjects(Project::query(), $actor)->whereKey($record?->getKey())->exists()
            : $this->inventoryAccess->scopeProperties(Property::query(), $actor)->whereKey($record?->getKey())->exists();
        abort_unless($record && ($keep || (! $record->trashed() && $scope())), 404, class_basename($model).' not found');

        return $record;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function columns(array $data): array
    {
        $columns = [];
        foreach (['operation', 'category', 'prototype_label', 'how_heard', 'first_contact_channel', 'payment_method',
            'installments_count', 'interest_level', 'status', 'quoted_price', 'quoted_currency_code', 'preferences', 'notes'] as $field) {
            if (array_key_exists($field, $data)) {
                $value = $data[$field];
                $columns[$field] = is_string($value) ? (trim($value) === '' ? null : trim($value)) : $value;
            }
        }
        foreach (['interest_level' => 'MEDIUM', 'status' => 'ACTIVE'] as $field => $default) {
            if (array_key_exists($field, $columns) && $columns[$field] === null) {
                $columns[$field] = $default;
            }
        }
        if (array_key_exists('first_contact_at', $data)) {
            $columns['first_contact_at'] = $data['first_contact_at'] === null ? null : Carbon::parse((string) $data['first_contact_at'])->utc();
        }
        if (array_key_exists('participants', $data)) {
            $columns['participants_json'] = $data['participants'] === null ? null : json_encode(array_map(fn (array $p): array => [
                'role' => $p['role'], 'name' => trim((string) $p['name']), 'document' => $p['document'] ?? null,
                'phone' => $p['phone'] ?? null, 'relationship' => $p['relationship'] ?? null,
                'income' => isset($p['income']) ? (float) $p['income'] : null,
            ], array_values($data['participants'])), JSON_THROW_ON_ERROR);
        }

        return $columns;
    }
}

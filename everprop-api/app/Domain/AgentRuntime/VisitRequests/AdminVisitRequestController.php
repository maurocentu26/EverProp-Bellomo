<?php

namespace App\Domain\AgentRuntime\VisitRequests;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Human confirmation of visits the assistant REQUESTED (S13). Only here a `visits` row
 * (SCHEDULED) is created. Advisors see requests of conversations assigned to them or unassigned;
 * managers/admins see all of the tenant. The visitor is told by the advisor, not automatically.
 */
final class AdminVisitRequestController extends Controller
{
    private const WRITE_ROLES = [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR];

    private function tenantId(): int
    {
        return app(TenantContext::class)->id();
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request, [...self::WRITE_ROLES, RoleCode::READ_ONLY]);
        $status = $request->validate(['status' => 'nullable|in:REQUESTED,CONFIRMED,DECLINED,CANCELLED'])['status'] ?? 'REQUESTED';

        $rows = $this->visible($user)->where('vr.status', $status)->orderBy('vr.created_at')->limit(200)->get([
            'vr.public_id', 'vr.status', 'vr.preferred_slots_json', 'vr.note', 'vr.created_at',
            'p.public_id as property_id', 'p.code as property_code', 'p.title as property_title',
            'ct.display_name', 'ct.phone_e164', 'ct.email', 'ct.profile_json', 'c.public_id as conversation_id', 'v.public_id as visit_id',
        ]);

        return response()->json(['data' => $rows->map(fn ($r) => [
            'id' => $r->public_id, 'status' => $r->status, 'created_at' => CarbonImmutable::parse($r->created_at, 'UTC')->toIso8601String(),
            'slots' => json_decode((string) $r->preferred_slots_json, true), 'note' => $r->note,
            'property' => ['id' => $r->property_id, 'code' => $r->property_code, 'title' => $r->property_title],
            'contact' => ['name' => $r->display_name, 'phone' => $r->phone_e164 ?? (json_decode((string) $r->profile_json, true)['declared_phone'] ?? null),
                'email' => $r->email, 'unverified' => json_decode((string) $r->profile_json, true)['unverified_fields'] ?? []],
            'conversation_id' => $r->conversation_id, 'visit_id' => $r->visit_id,
        ])->all()]);
    }

    public function confirm(Request $request, string $visitRequest): JsonResponse
    {
        $user = $this->user($request, self::WRITE_ROLES);
        $data = $request->validate(['scheduled_at' => 'required|date|after:now', 'notes' => 'nullable|string|max:2000']);
        $row = $this->visible($user)->where('vr.public_id', $visitRequest)->first(['vr.id']);
        abort_unless($row !== null, 404);
        $tenantId = $this->tenantId();

        $visitId = DB::transaction(function () use ($tenantId, $row, $user, $data): string {
            $vr = DB::table('visit_requests')->where('tenant_id', $tenantId)->where('id', $row->id)->lockForUpdate()->first();
            if ($vr->status === 'CONFIRMED') {
                return (string) DB::table('visits')->where('tenant_id', $tenantId)->where('id', $vr->visit_id)->value('public_id');
            }
            abort_unless($vr->status === 'REQUESTED', 409, 'La solicitud ya fue resuelta.');
            $contact = DB::table('contacts')->where('tenant_id', $tenantId)->where('id', $vr->contact_id)->first(['display_name', 'phone_e164', 'email', 'profile_json']);
            $leadId = DB::table('chatbot_sessions')->where('tenant_id', $tenantId)->where('conversation_id', $vr->conversation_id)
                ->whereNotNull('lead_id')->orderByDesc('id')->value('lead_id');
            $publicId = (string) Str::uuid();
            $id = (int) DB::table('visits')->insertGetId([
                'tenant_id' => $tenantId, 'public_id' => $publicId, 'lead_id' => $leadId, 'property_id' => $vr->property_id,
                'assigned_user_id' => $user->id, 'created_by_user_id' => $user->id,
                'guest_name' => $leadId ? null : mb_substr((string) ($contact->display_name ?: 'Visitante del chat'), 0, 160),
                'guest_phone' => $leadId ? null : (mb_substr((string) ($contact->phone_e164 ?? (json_decode((string) $contact->profile_json, true)['declared_phone'] ?? '')), 0, 40) ?: null),
                'guest_email' => $leadId ? null : $contact->email,
                'scheduled_at' => CarbonImmutable::parse($data['scheduled_at'])->utc()->format('Y-m-d H:i:s.v'),
                'notes' => $data['notes'] ?? $vr->note, 'status' => 'SCHEDULED',
            ]);
            DB::table('visit_requests')->where('tenant_id', $tenantId)->where('id', $vr->id)->update(['status' => 'CONFIRMED', 'visit_id' => $id]);
            DB::table('domain_outbox')->insert([
                'tenant_id' => $tenantId, 'aggregate_type' => 'VISIT_REQUEST', 'aggregate_id' => $vr->id, 'event_type' => 'VISIT_REQUEST_CONFIRMED',
                'idempotency_key' => 'visit-request-confirmed:'.$vr->id, 'status' => 'PENDING', 'available_at' => now(),
                'payload_json' => json_encode(['schema_version' => 1, 'visit_request_id' => $vr->id, 'visit_id' => $id, 'user_id' => $user->id], JSON_THROW_ON_ERROR),
            ]);

            return $publicId;
        }, 3);

        return response()->json(['data' => ['id' => $visitRequest, 'status' => 'CONFIRMED', 'visit_id' => $visitId]]);
    }

    public function decline(Request $request, string $visitRequest): JsonResponse
    {
        $user = $this->user($request, self::WRITE_ROLES);
        $row = $this->visible($user)->where('vr.public_id', $visitRequest)->first(['vr.id']);
        abort_unless($row !== null, 404);
        $updated = DB::table('visit_requests')->where('tenant_id', $this->tenantId())->where('id', $row->id)->where('status', 'REQUESTED')
            ->update(['status' => 'DECLINED']);
        abort_unless($updated === 1, 409, 'La solicitud ya fue resuelta.');

        return response()->json(['data' => ['id' => $visitRequest, 'status' => 'DECLINED']]);
    }

    private function visible(User $user): Builder
    {
        return DB::table('visit_requests as vr')
            ->join('conversations as c', fn ($j) => $j->on('c.id', '=', 'vr.conversation_id')->on('c.tenant_id', '=', 'vr.tenant_id'))
            ->join('properties as p', fn ($j) => $j->on('p.id', '=', 'vr.property_id')->on('p.tenant_id', '=', 'vr.tenant_id'))
            ->join('contacts as ct', fn ($j) => $j->on('ct.id', '=', 'vr.contact_id')->on('ct.tenant_id', '=', 'vr.tenant_id'))
            ->leftJoin('visits as v', fn ($j) => $j->on('v.id', '=', 'vr.visit_id')->on('v.tenant_id', '=', 'vr.tenant_id'))
            ->where('vr.tenant_id', $this->tenantId())
            ->when($user->role() === RoleCode::SALES_ADVISOR, fn ($q) => $q->where(fn ($o) => $o->where('c.assigned_user_id', $user->id)
                ->orWhereNull('c.assigned_user_id')));
    }

    /** @param list<RoleCode> $roles */
    private function user(Request $request, array $roles): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(in_array($user->role(), $roles, true), 403);

        return $user;
    }
}

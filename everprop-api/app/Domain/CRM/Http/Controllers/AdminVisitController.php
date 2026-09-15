<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\LeadAccessPolicy;
use App\Domain\CRM\VisitPolicy;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AdminVisitController extends Controller
{
    public function today(Request $request, TenantContext $context, VisitPolicy $policy): JsonResponse
    {
        $user = $request->user();
        abort_unless($user && $policy->viewAny($user, $context->id()), 403);
        $start = Carbon::now('America/Argentina/Buenos_Aires')->startOfDay();
        $end = $start->copy()->addDay();
        $query = $this->query($request, $context, $policy)
            ->where('v.status', 'SCHEDULED')->whereNull('v.cancelled_at')
            ->where('v.scheduled_at', '>=', $start->copy()->utc())
            ->where('v.scheduled_at', '<', $end->copy()->utc());
        $total = (clone $query)->count();
        $rows = $query->orderBy('v.scheduled_at')->orderBy('v.id')->limit(10)
            ->get(['v.public_id', 'v.scheduled_at', 'v.notes', 'l.public_id as lead_id', 'c.display_name', 'v.guest_name']);

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'id' => $row->public_id,
                'lead' => ['id' => $row->lead_id, 'name' => $row->display_name ?: $row->guest_name ?: 'Cita sin cliente vinculado'],
                'scheduledAt' => Carbon::parse($row->scheduled_at, 'UTC')->toISOString(),
                'notes' => $row->notes,
            ]),
            'meta' => ['total' => $total, 'date' => $start->toDateString(), 'timezone' => 'America/Argentina/Buenos_Aires'],
        ]);
    }

    private function query(Request $request, TenantContext $context, VisitPolicy $policy): Builder
    {
        $user = $request->user();
        abort_unless($user && $policy->viewAny($user, $context->id()), 403);
        $query = DB::table('visits as v')
            ->leftJoin('leads as l', function ($join) {
                $join->on('l.id', '=', 'v.lead_id')->on('l.tenant_id', '=', 'v.tenant_id');
            })
            ->leftJoin('contacts as c', function ($join) {
                $join->on('c.id', '=', 'l.contact_id')->on('c.tenant_id', '=', 'v.tenant_id');
            })
            ->where('v.tenant_id', $context->id())->whereNull('l.deleted_at');
        if ($user->role() === RoleCode::SALES_ADVISOR) {
            $query->where('v.assigned_user_id', $user->id)->where(function ($q) use ($user) {
                $q->whereNull('v.lead_id')->orWhere('l.assigned_user_id', $user->id);
            });
        }

        return $query;
    }

    public function index(Request $request, TenantContext $context, VisitPolicy $policy): JsonResponse
    {
        $query = $this->query($request, $context, $policy)
            ->leftJoin('properties as p', function ($join) {
                $join->on('p.id', '=', 'v.property_id')->on('p.tenant_id', '=', 'v.tenant_id');
            })
            ->leftJoin('users as u', function ($join) {
                $join->on('u.id', '=', 'v.assigned_user_id')->on('u.tenant_id', '=', 'v.tenant_id');
            });
        $page = $query->orderBy('v.id')->simplePaginate(200, [
            'v.*', 'l.public_id as lead_public_id', 'c.display_name', 'c.phone_e164', 'c.email',
            'p.public_id as property_public_id', 'p.title as property_title',
            'u.public_id as agent_public_id', 'u.display_name as agent_name',
        ]);

        return response()->json([
            'meta' => ['next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null],
            'data' => collect($page->items())->map(fn ($row) => [
                'id' => $row->public_id, 'leadId' => $row->lead_public_id,
                'leadName' => $row->display_name ?: $row->guest_name ?: 'Visitante',
                'phone' => $row->phone_e164 ?: $row->guest_phone, 'email' => $row->email ?: $row->guest_email,
                'propertyId' => $row->property_public_id, 'propertyTitle' => $row->property_title,
                'agentId' => $row->agent_public_id, 'agentName' => $row->agent_name,
                'scheduledAt' => Carbon::parse($row->scheduled_at, 'UTC')->toISOString(),
                'status' => strtolower($row->status), 'notes' => $row->notes,
            ]),
        ]);
    }

    public function store(Request $request, TenantContext $context, VisitPolicy $policy): JsonResponse
    {
        $user = $request->user();
        abort_unless($user && $policy->viewAny($user, $context->id()) && $user->role() !== RoleCode::READ_ONLY, 403);
        $data = $request->validate([
            'lead_id' => 'nullable|uuid', 'property_id' => 'nullable|uuid', 'agent_id' => 'nullable|uuid',
            'guest_name' => 'required_without:lead_id|nullable|string|max:160',
            'guest_phone' => 'nullable|string|max:40', 'guest_email' => 'nullable|email|max:160',
            'scheduled_at' => 'required|date|after:now', 'notes' => 'nullable|string|max:5000',
        ]);
        $lead = null;
        if (! empty($data['lead_id'])) {
            $lead = DB::table('leads')->where('tenant_id', $context->id())
                ->where('public_id', $data['lead_id'])->whereNull('deleted_at')->first();
            abort_unless($lead && (new LeadAccessPolicy)->update($user, $context->id(), $lead), 403);
        }
        $agentId = $lead?->assigned_user_id ?: $user->id;
        if ($user->role() !== RoleCode::SALES_ADVISOR && ! empty($data['agent_id'])) {
            $agentId = DB::table('users')->where('tenant_id', $context->id())->where('status', 'ACTIVE')
                ->whereIn('role_code', ['TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR'])
                ->where('public_id', $data['agent_id'])->value('id');
            abort_unless($agentId, 422, 'Asesor no disponible.');
        }
        if ($user->role() === RoleCode::SALES_ADVISOR) {
            $agentId = $user->id;
        }
        abort_if($lead && $lead->assigned_user_id && (int) $agentId !== (int) $lead->assigned_user_id, 422, 'La cita debe quedar con el responsable del lead. Reasigná primero el cliente desde su ficha.');
        $propertyId = null;
        if (! empty($data['property_id'])) {
            $propertyId = DB::table('properties')->where('tenant_id', $context->id())
                ->where('public_id', $data['property_id'])->value('id');
            abort_unless($propertyId, 422, 'Propiedad no disponible.');
        }
        $id = (string) Str::uuid();
        DB::table('visits')->insert([
            'tenant_id' => $context->id(), 'public_id' => $id, 'lead_id' => $lead?->id,
            'property_id' => $propertyId, 'assigned_user_id' => $agentId, 'created_by_user_id' => $user->id,
            'guest_name' => $data['guest_name'] ?? null, 'guest_phone' => $data['guest_phone'] ?? null,
            'guest_email' => $data['guest_email'] ?? null,
            'scheduled_at' => Carbon::parse($data['scheduled_at'])->utc(), 'notes' => $data['notes'] ?? null,
            'status' => 'SCHEDULED', 'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['data' => ['id' => $id]], 201);
    }

    public function cancel(Request $request, TenantContext $context, VisitPolicy $policy, string $visit): JsonResponse
    {
        abort_if($request->user()?->role() === RoleCode::READ_ONLY, 403);
        $row = $this->query($request, $context, $policy)->where('v.public_id', $visit)->first(['v.id', 'v.status']);
        abort_unless($row !== null, 404);
        abort_unless($row->status === 'SCHEDULED', 422, 'Solo se puede cancelar una cita pendiente.');
        DB::table('visits')->where('tenant_id', $context->id())->where('id', $row->id)
            ->where('status', 'SCHEDULED')->update(['status' => 'CANCELLED', 'cancelled_at' => now(), 'updated_at' => now()]);

        return response()->json(['data' => ['id' => $visit, 'status' => 'cancelled']]);
    }
}

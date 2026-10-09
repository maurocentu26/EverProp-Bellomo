<?php

namespace App\Domain\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class CollectionEmailController
{
    public function __construct(private readonly CollectionsPolicy $policy,
        private readonly CollectionEmail $email) {}

    public function preview(Request $request, string $installment): JsonResponse
    {
        $context = $request->attributes->get(TenantContext::class);
        abort_unless($context instanceof TenantContext, 403);
        abort_unless($this->policy->view($request->user(), $context->id()), 403);
        $query = $this->email->query($context->id())->where('i.public_id', $installment);
        if ($request->user()->role() === RoleCode::SALES_ADVISOR) {
            $query->where('l.assigned_user_id', $request->user()->id);
        }
        $row = $query->first();
        abort_unless($row !== null, 404);
        abort_unless($this->policy->write($request->user(), $context->id(), $row), 403);
        $tenant = DB::table('tenants')->where('id', $context->id())->where('status', 'ACTIVE')->first();
        abort_unless($tenant !== null, 404);

        return response()->json(['data' => $this->email->preview($row, $tenant)])
            ->header('Cache-Control', 'no-store');
    }
}

<?php

namespace App\Domain\AgentRuntime\Knowledge\Http;

use App\Domain\AgentRuntime\Knowledge\KnowledgeService;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Knowledge base for the assistant (S09). Only admins/managers write or approve: an approved
 * document is what the assistant may say to any visitor. Everyone in the tenant can read the list.
 */
final class AdminKnowledgeController extends Controller
{
    private const WRITE_ROLES = [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER];

    private const VIEW_ROLES = [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::BOT_OPERATOR, RoleCode::READ_ONLY];

    public function __construct(private readonly KnowledgeService $knowledge) {}

    private function tenantId(): int
    {
        return app(TenantContext::class)->id();
    }

    public function index(Request $request): JsonResponse
    {
        $this->user($request, self::VIEW_ROLES);
        $rows = DB::table('knowledge_documents')->where('tenant_id', $this->tenantId())->orderByDesc('updated_at')->limit(200)
            ->get(['public_id', 'title', 'audience', 'status', 'version', 'valid_until', 'approved_at', 'updated_at']);

        return response()->json(['data' => $rows->map(fn ($d) => [
            'id' => $d->public_id, 'title' => $d->title, 'audience' => $d->audience, 'status' => $d->status,
            'version' => (int) $d->version, 'valid_until' => $d->valid_until, 'approved_at' => $d->approved_at, 'updated_at' => $d->updated_at,
        ])->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request, self::WRITE_ROLES);
        $data = $request->validate([
            'title' => 'required|string|max:200',
            'body' => 'required|string|max:60000',
            'audience' => 'nullable|in:PUBLIC,INTERNAL',
            'valid_until' => 'nullable|date|after:now',
        ]);

        return response()->json(['data' => ['id' => $this->knowledge->create($this->tenantId(), (int) $user->id, $data), 'status' => 'DRAFT']], 201);
    }

    public function approve(Request $request, string $document): JsonResponse
    {
        $user = $this->user($request, self::WRITE_ROLES);
        abort_unless($this->knowledge->approve($this->tenantId(), $document, (int) $user->id), 404);

        return response()->json(['data' => ['id' => $document, 'status' => 'APPROVED']]);
    }

    public function revoke(Request $request, string $document): JsonResponse
    {
        $this->user($request, self::WRITE_ROLES);
        abort_unless($this->knowledge->revoke($this->tenantId(), $document), 404);

        return response()->json(['data' => ['id' => $document, 'status' => 'REVOKED']]);
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

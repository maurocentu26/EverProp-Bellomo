<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\CRM\Services\ContactIdentityResolver;
use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin-only staging QA sessions for testing the assistant (EVP-207):
 * creates real WEB_CHAT conversations, lets admins rate each reply (GOOD/BAD + note),
 * finish sessions with a closing note, and export the full annotated trace.
 */
final class AdminAssistantTestSessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->admin($request);
        $tenantId = $this->tenantId();

        $rows = DB::table('assistant_test_sessions as s')
            ->join('conversations as c', fn ($j) => $j->on('c.id', '=', 's.conversation_id')->on('c.tenant_id', '=', 's.tenant_id'))
            ->leftJoin('users as u', fn ($j) => $j->on('u.id', '=', 's.created_by_user_id')->on('u.tenant_id', '=', 's.tenant_id'))
            ->where('s.tenant_id', $tenantId)
            ->orderByDesc('s.created_at')
            ->limit(100)
            ->get([
                's.id', 's.public_id', 's.title', 's.status', 's.closing_note',
                's.finished_at', 's.created_at', 's.updated_at',
                'c.public_id as conversation_id',
                'u.display_name as created_by_name',
            ]);

        $sessionIds = $rows->pluck('id')->all();
        $reviewCounts = $sessionIds === [] ? collect() : DB::table('assistant_test_message_reviews')
            ->where('tenant_id', $tenantId)
            ->whereIn('session_id', $sessionIds)
            ->selectRaw("session_id, SUM(CASE WHEN rating = 'GOOD' THEN 1 ELSE 0 END) as good_count, SUM(CASE WHEN rating = 'BAD' THEN 1 ELSE 0 END) as bad_count, SUM(CASE WHEN note IS NOT NULL AND note <> '' THEN 1 ELSE 0 END) as noted_count")
            ->groupBy('session_id')
            ->get()
            ->keyBy('session_id');

        $conversationIds = DB::table('assistant_test_sessions')
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $sessionIds === [] ? [0] : $sessionIds)
            ->pluck('conversation_id', 'id');

        $messageCounts = $conversationIds->isEmpty() ? collect() : DB::table('messages')
            ->where('tenant_id', $tenantId)
            ->whereIn('conversation_id', $conversationIds->values()->all())
            ->where(fn ($q) => $q->where('direction', 'INBOUND')
                ->orWhere(fn ($out) => $out->where('direction', 'OUTBOUND')->whereIn('delivery_status', ['SENT', 'DELIVERED', 'READ'])))
            ->selectRaw('conversation_id, COUNT(*) as total')
            ->groupBy('conversation_id')
            ->pluck('total', 'conversation_id');

        return response()->json([
            'data' => $rows->map(function (object $row) use ($reviewCounts, $conversationIds, $messageCounts): array {
                $counts = $reviewCounts->get($row->id);
                $convDbId = $conversationIds->get($row->id);

                return [
                    'id' => (string) $row->public_id,
                    'conversation_id' => (string) $row->conversation_id,
                    'title' => $row->title !== null ? (string) $row->title : null,
                    'status' => (string) $row->status,
                    'closing_note' => $row->closing_note !== null ? (string) $row->closing_note : null,
                    'created_by_name' => $row->created_by_name !== null ? (string) $row->created_by_name : null,
                    'created_at' => (string) $row->created_at,
                    'finished_at' => $row->finished_at !== null ? (string) $row->finished_at : null,
                    'message_count' => (int) ($convDbId !== null ? ($messageCounts->get($convDbId) ?? 0) : 0),
                    'good_count' => (int) ($counts->good_count ?? 0),
                    'bad_count' => (int) ($counts->bad_count ?? 0),
                    'noted_count' => (int) ($counts->noted_count ?? 0),
                ];
            })->values()->all(),
            'meta' => [
                'ai_enabled' => InboundMessageService::aiEnabled($tenantId),
                'has_web_channel' => $this->activeWebChannelId($tenantId) !== null,
            ],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request, ContactIdentityResolver $contacts): JsonResponse
    {
        $user = $this->admin($request);
        $tenantId = $this->tenantId();
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:160'],
        ]);

        $channelId = $this->activeWebChannelId($tenantId);
        if ($channelId === null) {
            return response()->json(['message' => 'No hay un canal de chat web activo configurado para este entorno.'], 422);
        }

        $sessionPublicId = (string) Str::uuid();
        $conversationPublicId = (string) Str::uuid();
        $now = CarbonImmutable::now('UTC');
        $ai = InboundMessageService::aiEnabled($tenantId);
        $title = isset($data['title']) && trim($data['title']) !== '' ? trim($data['title']) : null;

        $contact = $contacts->resolve(
            $tenantId,
            ['display_name' => trim('Prueba · '.($title ?? $user->display_name))],
            ['channel_type' => 'WEB_CHAT', 'provider_user_id' => 'test:'.$sessionPublicId],
            $now,
        );

        DB::transaction(function () use ($tenantId, $channelId, $sessionPublicId, $conversationPublicId, $now, $contact, $ai, $user, $title): void {
            $conversationId = (int) DB::table('conversations')->insertGetId([
                'tenant_id' => $tenantId,
                'public_id' => $conversationPublicId,
                'contact_id' => $contact['id'],
                'channel_account_id' => $channelId,
                'provider_thread_id' => 'web:'.$sessionPublicId,
                'status' => 'OPEN',
                'bot_mode' => $ai ? 'BOT_FIRST' : 'HUMAN_FIRST',
                'control_state' => $ai ? 'AI_ACTIVE' : 'WAITING_HUMAN',
                'last_activity_at' => $now->format('Y-m-d H:i:s.v'),
            ]);
            DB::table('assistant_test_sessions')->insert([
                'tenant_id' => $tenantId,
                'public_id' => $sessionPublicId,
                'conversation_id' => $conversationId,
                'created_by_user_id' => $user->id,
                'title' => $title,
                'status' => 'OPEN',
                'created_at' => $now->format('Y-m-d H:i:s.v'),
                'updated_at' => $now->format('Y-m-d H:i:s.v'),
            ]);
        });

        return response()->json([
            'data' => [
                'id' => $sessionPublicId,
                'conversation_id' => $conversationPublicId,
                'title' => $title,
                'status' => 'OPEN',
                'closing_note' => null,
                'created_by_name' => (string) $user->display_name,
                'created_at' => $now->toIso8601ZuluString('millisecond'),
                'finished_at' => null,
                'message_count' => 0,
                'good_count' => 0,
                'bad_count' => 0,
                'noted_count' => 0,
            ],
        ], 201)->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, string $session): JsonResponse
    {
        $this->admin($request);
        $tenantId = $this->tenantId();
        $row = $this->findSession($tenantId, $session);

        $reviews = DB::table('assistant_test_message_reviews as r')
            ->leftJoin('users as u', fn ($j) => $j->on('u.id', '=', 'r.reviewed_by_user_id')->on('u.tenant_id', '=', 'r.tenant_id'))
            ->where('r.tenant_id', $tenantId)
            ->where('r.session_id', $row->id)
            ->get(['r.message_sequence', 'r.rating', 'r.note', 'r.updated_at', 'u.display_name as reviewed_by_name'])
            ->keyBy('message_sequence');

        $messages = DB::table('messages')
            ->where('tenant_id', $tenantId)
            ->where('conversation_id', $row->conversation_id)
            ->where(fn ($q) => $q->where('direction', 'INBOUND')
                ->orWhere(fn ($out) => $out->where('direction', 'OUTBOUND')->whereIn('delivery_status', ['SENT', 'DELIVERED', 'READ'])))
            ->orderBy('sequence')
            ->get(['sequence', 'direction', 'sender_type', 'text_body', 'occurred_at'])
            ->map(function (object $m) use ($reviews): array {
                $review = $reviews->get($m->sequence);

                return [
                    'sequence' => (int) $m->sequence,
                    'from' => $m->direction === 'INBOUND' ? 'visitor' : ($m->sender_type === 'BOT' ? 'assistant' : 'advisor'),
                    'text' => $m->text_body !== null ? (string) $m->text_body : null,
                    'at' => (string) $m->occurred_at,
                    'review' => $review !== null ? [
                        'rating' => $review->rating !== null ? (string) $review->rating : null,
                        'note' => $review->note !== null ? (string) $review->note : null,
                        'reviewed_by_name' => $review->reviewed_by_name !== null ? (string) $review->reviewed_by_name : null,
                        'updated_at' => (string) $review->updated_at,
                    ] : null,
                ];
            })->values()->all();

        return response()->json([
            'data' => [
                'id' => (string) $row->public_id,
                'conversation_id' => (string) $row->conversation_public_id,
                'title' => $row->title !== null ? (string) $row->title : null,
                'status' => (string) $row->status,
                'closing_note' => $row->closing_note !== null ? (string) $row->closing_note : null,
                'created_by_name' => $row->created_by_name !== null ? (string) $row->created_by_name : null,
                'created_at' => (string) $row->created_at,
                'finished_at' => $row->finished_at !== null ? (string) $row->finished_at : null,
                'ai_enabled' => InboundMessageService::aiEnabled($tenantId),
                'messages' => $messages,
            ],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function sendMessage(Request $request, string $session, InboundMessageService $inbound): JsonResponse
    {
        $this->admin($request);
        $tenantId = $this->tenantId();
        $row = $this->findSession($tenantId, $session);
        if ($row->status === 'FINISHED') {
            return response()->json(['message' => 'Esta sesión ya fue finalizada. Creá una nueva sesión para seguir probando.'], 409);
        }

        $data = $request->validate([
            'client_message_id' => ['required', 'uuid'],
            'text' => ['required', 'string', 'max:'.(int) config('conversations.web_message_max_chars', 2000)],
        ]);

        $result = $inbound->accept(new InboundMessage(
            tenantId: $tenantId,
            channelAccountId: (int) $row->channel_account_id,
            identityChannelType: 'WEB_CHAT',
            senderProviderId: 'test:'.$row->public_id,
            threadId: 'web:'.$row->public_id,
            providerMessageId: 'web:'.$row->public_id.':'.$data['client_message_id'],
            type: 'TEXT',
            text: $data['text'],
            occurredAt: CarbonImmutable::now('UTC'),
        ));

        if ($row->title === null) {
            $autoTitle = Str::limit((string) preg_replace('/\s+/', ' ', trim($data['text'])), 60, '…');
            if ($autoTitle !== '') {
                DB::table('assistant_test_sessions')
                    ->where('tenant_id', $tenantId)
                    ->where('id', $row->id)
                    ->whereNull('title')
                    ->update(['title' => $autoTitle]);
            }
        }

        return response()->json([
            'data' => ['sequence' => $result['sequence'], 'replayed' => $result['replayed']],
        ], $result['replayed'] ? 200 : 201)->header('Cache-Control', 'private, no-store');
    }

    public function reviewMessage(Request $request, string $session, int $sequence): JsonResponse
    {
        $user = $this->admin($request);
        $tenantId = $this->tenantId();
        $row = $this->findSession($tenantId, $session);

        $exists = DB::table('messages')
            ->where('tenant_id', $tenantId)
            ->where('conversation_id', $row->conversation_id)
            ->where('sequence', $sequence)
            ->exists();
        abort_unless($exists, 404);

        $data = $request->validate([
            'rating' => ['nullable', 'in:GOOD,BAD'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $rating = $data['rating'] ?? null;
        $note = isset($data['note']) && trim($data['note']) !== '' ? trim($data['note']) : null;
        $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');

        DB::table('assistant_test_message_reviews')->updateOrInsert(
            ['tenant_id' => $tenantId, 'session_id' => $row->id, 'message_sequence' => $sequence],
            [
                'rating' => $rating,
                'note' => $note,
                'reviewed_by_user_id' => $user->id,
                'updated_at' => $now,
                'created_at' => $now,
            ],
        );

        return response()->json([
            'data' => [
                'sequence' => $sequence,
                'rating' => $rating,
                'note' => $note,
                'reviewed_by_name' => (string) $user->display_name,
                'updated_at' => $now,
            ],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function finish(Request $request, string $session): JsonResponse
    {
        $this->admin($request);
        $tenantId = $this->tenantId();
        $row = $this->findSession($tenantId, $session);

        $data = $request->validate([
            'closing_note' => ['nullable', 'string', 'max:5000'],
        ]);

        $note = isset($data['closing_note']) && trim($data['closing_note']) !== '' ? trim($data['closing_note']) : null;
        $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
        $finishedAt = $row->finished_at !== null ? (string) $row->finished_at : $now;

        DB::table('assistant_test_sessions')
            ->where('tenant_id', $tenantId)
            ->where('id', $row->id)
            ->update([
                'status' => 'FINISHED',
                'closing_note' => $note,
                'finished_at' => $finishedAt,
                'updated_at' => $now,
            ]);

        return response()->json([
            'data' => [
                'id' => (string) $row->public_id,
                'status' => 'FINISHED',
                'closing_note' => $note,
                'finished_at' => $finishedAt,
            ],
        ])->header('Cache-Control', 'private, no-store');
    }

    private function findSession(int $tenantId, string $publicId): object
    {
        $row = DB::table('assistant_test_sessions as s')
            ->join('conversations as c', fn ($j) => $j->on('c.id', '=', 's.conversation_id')->on('c.tenant_id', '=', 's.tenant_id'))
            ->leftJoin('users as u', fn ($j) => $j->on('u.id', '=', 's.created_by_user_id')->on('u.tenant_id', '=', 's.tenant_id'))
            ->where('s.tenant_id', $tenantId)
            ->where('s.public_id', $publicId)
            ->first([
                's.id', 's.public_id', 's.conversation_id', 's.title', 's.status',
                's.closing_note', 's.finished_at', 's.created_at',
                'c.public_id as conversation_public_id',
                'c.channel_account_id',
                'u.display_name as created_by_name',
            ]);
        abort_unless($row !== null, 404);

        return $row;
    }

    private function activeWebChannelId(int $tenantId): ?int
    {
        $id = DB::table('channel_accounts')
            ->where('tenant_id', $tenantId)
            ->where('channel_type', 'WEB_CHAT')
            ->where('status', 'ACTIVE')
            ->orderBy('id')
            ->value('id');

        return $id !== null ? (int) $id : null;
    }

    private function tenantId(): int
    {
        return app(TenantContext::class)->id();
    }

    /** Existing RBAC (D05): tenant admin of the resolved tenant. */
    private function admin(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(app(AuthorizationService::class)->allows($user, Capability::MANAGE_INTEGRATIONS), 403);

        return $user;
    }
}

<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Coordinator\CopilotFailure;
use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Services\ChannelPolicy;
use App\Domain\Conversations\Services\ConversationAttachments;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Conversations\Services\OutboundDispatcher;
use App\Domain\Conversations\Services\WhatsAppMediaFetcher;
use App\Domain\CRM\Services\CreateOrGetOpenLeadProcedure;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Shared inbox API (S04 backend) and handoff actions (S07).
 * Visibility: TENANT_ADMIN / SALES_MANAGER / READ_ONLY see every conversation of the tenant;
 * SALES_ADVISOR sees conversations assigned to them plus unassigned ones waiting for a human.
 */
final class AdminConversationController extends Controller
{
    private const VIEW_ROLES = [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY];

    public function __construct(private readonly ConversationControl $control) {}

    // Resolved per call: controllers are cached on the route, the tenant context is per request.
    private function tenantId(): int
    {
        return app(TenantContext::class)->id();
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->viewer($request);
        $filters = $request->validate([
            'state' => 'nullable|in:AI_ACTIVE,WAITING_TOOL,WAITING_HUMAN,TRANSITION_PENDING,HUMAN_ACTIVE,CLOSED',
            'mine' => 'nullable|boolean', 'unread' => 'nullable|boolean', 'q' => 'nullable|string|min:2|max:100',
        ]);
        $page = $this->visible($user)
            ->when($filters['state'] ?? null, fn ($q, $s) => $q->where('c.control_state', $s))
            ->when(trim($filters['q'] ?? ''), fn ($q, $term) => $this->search($q, $term))
            ->when($request->boolean('mine'), fn ($q) => $q->where('c.assigned_user_id', $user->id))
            ->when($request->boolean('unread'), fn ($q) => $q->where('c.unread_count', '>', 0))
            ->leftJoin('contacts as ct', fn ($j) => $j->on('ct.id', '=', 'c.contact_id')->on('ct.tenant_id', '=', 'c.tenant_id'))
            ->join('channel_accounts as ca', fn ($j) => $j->on('ca.id', '=', 'c.channel_account_id')->on('ca.tenant_id', '=', 'c.tenant_id'))
            ->leftJoin('users as u', fn ($j) => $j->on('u.id', '=', 'c.assigned_user_id')->on('u.tenant_id', '=', 'c.tenant_id'))
            ->orderByDesc('c.last_activity_at')->orderByDesc('c.id')
            ->select(['c.public_id', 'c.control_state', 'c.control_epoch', 'c.unread_count', 'c.last_activity_at', 'c.status',
                'ca.channel_type', 'ct.display_name', 'u.public_id as assigned_user_id', 'u.display_name as assigned_user_name'])
            // Last message preview: one row per conversation through uq_messages_sequence.
            ->selectSub($this->lastMessage('LEFT(m.text_body, 140)'), 'preview_text')
            ->selectSub($this->lastMessage('m.sender_type'), 'preview_sender')
            ->selectSub($this->lastMessage('m.message_type'), 'preview_type')
            ->simplePaginate(50);

        return response()->json([
            'meta' => ['next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null],
            'data' => collect($page->items())->map(fn ($c) => [
                'id' => $c->public_id, 'state' => $c->control_state, 'epoch' => (int) $c->control_epoch,
                'channel' => $c->channel_type, 'contact_name' => $c->display_name, 'unread' => (int) $c->unread_count,
                'assigned_user' => $c->assigned_user_id ? ['id' => $c->assigned_user_id, 'name' => $c->assigned_user_name] : null,
                'last_activity_at' => CarbonImmutable::parse($c->last_activity_at, 'UTC')->toISOString(),
                'last_message' => $c->preview_sender === null ? null : ['text' => $c->preview_text, 'sender' => $c->preview_sender, 'type' => $c->preview_type],
            ])->all(),
        ]);
    }

    /**
     * Inbox search (S04): contact name, email or phone, or any text in the thread, including team notes
     * (whoever lists the conversation can already read them). Case and accent insensitive (utf8mb4_0900_ai_ci).
     * Phone matching only runs when the term looks like a phone, so "lote 2024" does not match numbers. Searching
     * by phone or email can confirm those of contacts the user already lists; accepted (advisors reply to them).
     * ponytail: LIKE '%term%' scans the tenant's messages; fine for the pilot, move to a FULLTEXT index on
     * messages (forward script) once a tenant has hundreds of thousands of messages.
     */
    private function search(Builder $query, string $term): Builder
    {
        $like = '%'.addcslashes($term, '%_\\').'%';
        $digits = preg_match('/^[\d\s()+.\-]+$/', $term) === 1 ? (preg_replace('/\D+/', '', $term) ?? '') : '';

        return $query->where(fn ($w) => $w
            ->whereExists(fn ($ct) => $ct->from('contacts as sc')->whereColumn('sc.tenant_id', 'c.tenant_id')->whereColumn('sc.id', 'c.contact_id')
                ->where(fn ($f) => $f->where('sc.display_name', 'like', $like)->orWhere('sc.email', 'like', $like)
                    ->when(strlen($digits) >= 4, fn ($p) => $p->orWhere('sc.phone_e164', 'like', '%'.$digits.'%'))))
            ->orWhereExists(fn ($m) => $m->from('messages as sm')->whereColumn('sm.tenant_id', 'c.tenant_id')->whereColumn('sm.conversation_id', 'c.id')
                ->where('sm.text_body', 'like', $like)));
    }

    private function lastMessage(string $column): Builder
    {
        return DB::table('messages as m')->selectRaw($column)
            ->whereColumn('m.tenant_id', 'c.tenant_id')->whereColumn('m.conversation_id', 'c.id')
            ->whereIn('m.direction', ['INBOUND', 'OUTBOUND'])->orderByDesc('m.sequence')->limit(1);
    }

    public function messages(Request $request, string $conversation): JsonResponse
    {
        $user = $this->viewer($request);
        $row = $this->find($user, $conversation);
        $after = max(0, (int) $request->query('after', 0));
        $messages = DB::table('messages')->where('tenant_id', $row->tenant_id)->where('conversation_id', $row->id)
            ->where('sequence', '>', $after)->orderBy('sequence')->limit(200)
            ->get(['sequence', 'direction', 'sender_type', 'text_body', 'delivery_status', 'occurred_at', 'metadata_json', 'media_json']);
        $noteAuthor = fn ($m): ?int => $m->direction === 'INTERNAL' ? (json_decode((string) $m->metadata_json, true)['author_user_id'] ?? null) : null;
        $authors = DB::table('users')->where('tenant_id', $row->tenant_id)->whereIn('id', $messages->map($noteAuthor)->filter()->unique()->all())->pluck('display_name', 'id');
        if ($user->role() !== RoleCode::READ_ONLY && (int) $row->assigned_user_id === (int) $user->id) {
            DB::table('conversations')->where('tenant_id', $row->tenant_id)->where('id', $row->id)->update(['unread_count' => 0]);
        }
        // WhatsApp's 24 h service window (Plan W2), so the advisor knows before writing. null = the channel has none.
        $isWhatsApp = DB::table('channel_accounts')->where('tenant_id', $row->tenant_id)->where('id', $row->channel_account_id)->value('channel_type') === 'WHATSAPP';

        return response()->json([
            'conversation' => ['id' => $row->public_id, 'state' => $row->control_state, 'epoch' => (int) $row->control_epoch,
                'ai_enabled' => InboundMessageService::aiEnabled(),
                'copilot_enabled' => (bool) config('conversations.copilot_enabled') && config('agent.llm_provider') !== 'disabled',
                'reply_window' => $isWhatsApp ? ['closes_at' => app(ChannelPolicy::class)
                    ->windowClosesAt((int) $row->tenant_id, (int) $row->id, (int) $row->channel_account_id)?->toISOString()] : null],
            'data' => $messages->map(fn ($m) => [
                'sequence' => (int) $m->sequence, 'direction' => $m->direction, 'sender' => $m->sender_type,
                'text' => $m->text_body, 'status' => $m->delivery_status,
                'at' => CarbonImmutable::parse($m->occurred_at, 'UTC')->toISOString(),
                'media' => ConversationAttachments::present($m->media_json, "/api/v1/admin/conversations/{$row->public_id}/media/{$m->sequence}"),
            ] + ($m->direction === 'INTERNAL' ? ['author' => $authors[$noteAuthor($m)] ?? null] : []))->all(),
        ]);
    }

    public function takeover(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $result = $this->control->takeover((int) $row->tenant_id, (int) $row->id, $user);

        // "confirmed" is only true once no bot send can still be in flight (ADR D11).
        return response()->json(['data' => $result + ['confirmed' => $result['state'] === 'HUMAN_ACTIVE']]);
    }

    public function resume(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $this->assertControls($user, $row);
        $data = $request->validate(['reason' => 'required|string|max:500']);

        return response()->json(['data' => $this->control->resume((int) $row->tenant_id, (int) $row->id, $user, $data['reason'])]);
    }

    public function reply(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $data = $request->validate(['text' => 'required|string|max:4096', 'idempotency_key' => 'required|string|min:16|max:120',
            'suggestion_id' => 'nullable|uuid']);
        $result = $this->control->humanReply((int) $row->tenant_id, (int) $row->id, $user, $data['text'], $data['idempotency_key']);
        if (! $result['replayed']) {
            DispatchOutboundJob::dispatch((int) $row->tenant_id, $result['job_id']);
        }
        if (isset($data['suggestion_id'])) {
            $this->recordCopilotAcceptance($row, $data['suggestion_id'], $data['text'], $result['sequence']);
        }

        return response()->json(['data' => ['sequence' => $result['sequence'], 'replayed' => $result['replayed']]], $result['replayed'] ? 200 : 202);
    }

    /** Copilot draft for the advisor in control: nothing is sent; the advisor edits it and replies as usual. */
    public function suggest(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        // Any role: only whoever can answer may spend the tenant's budget on a draft.
        if ($row->control_state !== 'HUMAN_ACTIVE' || (int) $row->controlled_by_user_id !== (int) $user->id) {
            return response()->json(['error' => ['code' => 'NOT_IN_CONTROL', 'message' => 'Tomá el control de la conversación para pedir una sugerencia.']], 409);
        }
        try {
            return response()->json(['data' => app(AgentCoordinator::class)->suggest((int) $row->tenant_id, (int) $row->id)]);
        } catch (CopilotFailure $e) {
            $action = ['registrar_interes' => 'registrar el interés', 'solicitar_visita' => 'pedir la visita', 'derivar_a_asesor' => 'derivar la conversación'][$e->action ?? ''] ?? 'hacer esa acción';
            [$status, $message] = match ($e->errorCode) {
                'ACTION_NEEDED' => [422, "La IA sugiere {$action}: hacelo vos con «Lead y visita» y respondé al cliente."],
                'TOO_MANY_DRAFTS' => [429, 'Ya pediste varias sugerencias para este mensaje. Escribí la respuesta vos.'],
                'COPILOT_DISABLED' => [409, 'El copiloto está apagado.'],
                'NOT_IN_CONTROL' => [409, 'Tomá el control de la conversación para pedir una sugerencia.'],
                'NOTHING_TO_ANSWER' => [422, 'El cliente todavía no escribió nada para responder.'],
                'UNSAFE_DRAFT' => [422, 'No pude sugerir una respuesta con datos verificados. Escribila vos.'],
                'QUOTA_EXCEEDED' => [429, 'Se alcanzó el tope de gasto de la IA. Escribí la respuesta vos.'],
                default => [503, 'La IA no está disponible ahora. Escribí la respuesta vos.'],
            };

            return response()->json(['error' => ['code' => $e->errorCode, 'message' => $message] + ($e->action ? ['action' => $e->action] : [])], $status);
        }
    }

    /**
     * Copilot acceptance, judged by the server (sent text vs the stored draft): the measure for letting the
     * assistant answer on its own, so it never trusts a flag from the client. Only valid drafts of this
     * conversation, once.
     */
    private function recordCopilotAcceptance(object $row, string $suggestionId, string $text, int $sequence): void
    {
        $runs = fn () => DB::table('chatbot_runs')->where('tenant_id', $row->tenant_id)->where('conversation_id', $row->id)
            ->where('provider_run_id', 'suggest:'.$suggestionId)->where('status', 'SUCCEEDED')->where('decision', 'REPLY')->whereNull('output_message_id');
        $draftHash = json_decode((string) $runs()->value('trace_json'), true)['draft_sha256'] ?? null;
        if ($draftHash === null) {
            return;
        }
        $outcome = hash_equals($draftHash, hash('sha256', trim($text))) ? 'SENT_AS_IS' : 'SENT_EDITED';
        $messageId = DB::table('messages')->where('tenant_id', $row->tenant_id)->where('conversation_id', $row->id)->where('sequence', $sequence)->value('id');
        $runs()->update(['output_message_id' => $messageId, 'trace_json' => DB::raw("JSON_SET(trace_json, '$.advisor', '".$outcome."')")]);
    }

    /**
     * The conversation's open lead, created if missing with the same idempotent procedure the assistant uses
     * (one open lead per contact, no duplicates). The advisor qualifies it and books the visit from the lead page.
     * Advisors: only from a conversation of theirs; an unassigned lead becomes theirs, and one held by another
     * advisor is never taken (they are told who should follow it instead of getting a page they cannot open).
     */
    public function lead(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $advisor = $user->role() === RoleCode::SALES_ADVISOR;
        if ($advisor && (int) $row->assigned_user_id !== (int) $user->id && (int) $row->controlled_by_user_id !== (int) $user->id) {
            return response()->json(['error' => ['code' => 'NOT_IN_CONTROL', 'message' => 'Tomá la conversación primero.']], 409);
        }
        $channel = (string) DB::table('channel_accounts')->where('tenant_id', $row->tenant_id)->where('id', $row->channel_account_id)->value('channel_type');
        $contactId = (int) DB::table('conversations')->where('tenant_id', $row->tenant_id)->where('id', $row->id)->value('contact_id');
        try {
            $lead = app(CreateOrGetOpenLeadProcedure::class)->execute((int) $row->tenant_id, $contactId, $channel, 'CONVERSATION',
                'Consulta por conversación', 'NORMAL', CarbonImmutable::now('UTC'));
        } catch (QueryException $e) {
            // The procedure refuses inactive or merged contacts with SIGNAL 45000.
            abort_unless($e->getCode() === '45000', 500);

            return response()->json(['error' => ['code' => 'CONTACT_UNAVAILABLE', 'message' => 'Este contacto no está activo: revisalo en Leads.']], 409);
        }
        $leads = fn () => DB::table('leads')->where('tenant_id', $row->tenant_id)->where('id', $lead['lead_id']);
        if ($advisor && $lead['assigned_user_id'] === null) {
            $leads()->whereNull('assigned_user_id')->update(['assigned_user_id' => $user->id]);
        }
        $lead = (array) $leads()->first(['public_id', 'assigned_user_id']) + $lead; // the current owner wins
        if ($advisor && (int) $lead['assigned_user_id'] !== (int) $user->id) {
            return response()->json(['error' => ['code' => 'LEAD_OF_ANOTHER_ADVISOR',
                'message' => 'El lead de este cliente lo sigue otro asesor. Avisale a tu gerente.']], 409);
        }

        return response()->json(['data' => ['lead_id' => (string) $lead['public_id'], 'created' => $lead['created']]], $lead['created'] ? 201 : 200);
    }

    /**
     * Photo or PDF from the advisor in control (Fase 4), with an optional caption. Web chat only for now:
     * WhatsApp needs Meta's media upload, which cannot be exercised while sending to Meta is off.
     */
    public function attach(Request $request, string $conversation, ConversationAttachments $attachments): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $data = $request->validate(['file' => 'required|file|max:'.(ConversationAttachments::MAX_BYTES / 1024),
            'caption' => 'nullable|string|max:1024', 'idempotency_key' => 'required|string|min:16|max:120']);
        // Checked again under lock by humanReply; here so nothing is stored for a send that cannot happen.
        if ($row->control_state !== 'HUMAN_ACTIVE' || (int) $row->controlled_by_user_id !== (int) $user->id) {
            return response()->json(['error' => ['code' => 'NOT_IN_CONTROL', 'message' => 'Tomá el control de la conversación antes de responder.']], 409);
        }
        if (! in_array(DB::table('channel_accounts')->where('tenant_id', $row->tenant_id)->where('id', $row->channel_account_id)->value('channel_type'), ['WEB_CHAT', 'WHATSAPP'], true)) {
            return response()->json(['error' => ['code' => 'MEDIA_NOT_SUPPORTED_ON_CHANNEL', 'message' => 'Este canal no acepta archivos.']], 409);
        }
        // Storage quota per tenant and day (D14 spirit: no single tenant or advisor can fill the disk).
        $quotaKey = 'attachments:'.$row->tenant_id.':'.now()->toDateString();
        if ((int) Cache::get($quotaKey, 0) + (int) $data['file']->getSize() > (int) config('conversations.attachments_daily_mb') * 1024 * 1024) {
            return response()->json(['error' => ['code' => 'ATTACHMENT_QUOTA', 'message' => 'Se alcanzó el límite diario de archivos. Probá mañana o mandá un link.']], 429);
        }
        $media = $attachments->store((int) $row->tenant_id, (int) $row->id, $data['file'])
            ?? abort(response()->json(['error' => ['code' => 'MEDIA_NOT_ALLOWED', 'message' => 'Solo fotos JPG, PNG o WebP y PDF de hasta 10 MB.']], 422));
        try {
            $result = $this->control->humanReply((int) $row->tenant_id, (int) $row->id, $user, trim((string) ($data['caption'] ?? '')), $data['idempotency_key'], $media);
        } catch (\Throwable $e) {
            $attachments->discardIfUnused((int) $row->tenant_id, $media); // never an orphan file

            throw $e;
        }
        if (! $result['replayed']) {
            Cache::add($quotaKey, 0, now()->addDay());
            Cache::increment($quotaKey, $media['size']);
        }
        if (! $result['replayed']) {
            DispatchOutboundJob::dispatch((int) $row->tenant_id, $result['job_id']);
        }

        return response()->json(['data' => ['sequence' => $result['sequence'], 'replayed' => $result['replayed']]], $result['replayed'] ? 200 : 202);
    }

    /** The file of a message, for whoever can see the conversation. */
    public function media(Request $request, string $conversation, int $sequence, ConversationAttachments $attachments): StreamedResponse
    {
        $row = $this->find($this->viewer($request), $conversation);
        $message = DB::table('messages')->where('tenant_id', $row->tenant_id)->where('conversation_id', $row->id)
            ->where('sequence', $sequence)->whereIn('direction', ['INBOUND', 'OUTBOUND'])->first(['id', 'direction', 'media_json']);
        abort_if($message?->media_json === null, 404);
        $media = (array) json_decode((string) $message->media_json, true);
        if (! isset($media['path']) && $message->direction === 'INBOUND' && isset($media['provider_media_id'])) {
            $media = app(WhatsAppMediaFetcher::class)->fetch((int) $row->tenant_id, (int) $row->id, (int) $row->channel_account_id, (int) $message->id, $media)
                ?? abort(404);
        }

        return $attachments->stream((int) $row->tenant_id, (int) $row->id, $media);
    }

    /** Internal note for the team: never sent to the customer nor shown to the assistant. */
    public function note(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $data = $request->validate(['text' => 'required|string|max:4096', 'idempotency_key' => 'required|string|min:16|max:120']);
        $result = $this->control->addNote((int) $row->tenant_id, (int) $row->id, $user, $data['text'], $data['idempotency_key']);

        return response()->json(['data' => $result], $result['replayed'] ? 200 : 201);
    }

    public function close(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $this->assertControls($user, $row);
        $this->control->close((int) $row->tenant_id, (int) $row->id, $user);

        return response()->json(['data' => ['state' => 'CLOSED']]);
    }

    /** Manual, audited UNKNOWN_FINAL: frees a pending takeover without resending. */
    public function resolveUnknown(Request $request, string $conversation): JsonResponse
    {
        $user = $this->writer($request);
        $row = $this->find($user, $conversation);
        $this->assertControls($user, $row);
        $jobs = DB::table('outbound_jobs')->where('tenant_id', $row->tenant_id)->where('conversation_id', $row->id)
            ->where('status', 'UNKNOWN')->pluck('id');
        foreach ($jobs as $jobId) {
            app(OutboundDispatcher::class)->resolveUnknown((int) $row->tenant_id, (int) $jobId, (int) $user->id);
        }

        return response()->json(['data' => ['resolved' => $jobs->count(), 'warning' => 'Un mensaje anterior podría llegar tarde al cliente.']]);
    }

    private function viewer(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->isActive() && (int) $user->tenant_id === $this->tenantId()
            && in_array($user->role(), self::VIEW_ROLES, true), 403);

        return $user;
    }

    /** Advisors may only resume/close/resolve conversations they control; managers any. */
    private function assertControls(User $user, object $row): void
    {
        abort_if($user->role() === RoleCode::SALES_ADVISOR && (int) $row->controlled_by_user_id !== (int) $user->id, 403);
    }

    private function writer(Request $request): User
    {
        $user = $this->viewer($request);
        abort_if($user->role() === RoleCode::READ_ONLY, 403);

        return $user;
    }

    private function visible(User $user): Builder
    {
        return DB::table('conversations as c')->where('c.tenant_id', $this->tenantId())
            ->when($user->role() === RoleCode::SALES_ADVISOR, fn ($q) => $q->where(fn ($w) => $w
                ->where('c.assigned_user_id', $user->id)
                ->orWhere(fn ($p) => $p->whereNull('c.assigned_user_id')->where('c.control_state', 'WAITING_HUMAN'))));
    }

    private function find(User $user, string $publicId): object
    {
        $row = $this->visible($user)->where('c.public_id', $publicId)
            ->first(['c.id', 'c.tenant_id', 'c.public_id', 'c.control_state', 'c.control_epoch', 'c.assigned_user_id', 'c.controlled_by_user_id', 'c.channel_account_id']);
        abort_unless($row !== null, 404);

        return $row;
    }
}

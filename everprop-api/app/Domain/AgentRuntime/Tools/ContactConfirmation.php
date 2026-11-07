<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\Conversations\Services\ConversationControl;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/** Server-owned snapshots: neither tool arguments nor provider metadata can grant consent. */
final class ContactConfirmation
{
    private const KEY = 'contact_confirmation';

    public const PHRASE = 'Confirmo mis datos';

    /** @param array<string, mixed> $proposal */
    public static function matches(array $proposal, ?object $summary, ?object $firstInbound, int $epoch, int $inputSequence): bool
    {
        return isset($proposal['message_id'], $proposal['sequence']) && $summary !== null && $firstInbound !== null
            && $proposal['epoch'] === $epoch && (int) $summary->control_epoch === $epoch
            && (int) $summary->id === $proposal['message_id'] && (int) $summary->sequence === $proposal['sequence']
            && $summary->direction === 'OUTBOUND' && $summary->sender_type === 'BOT'
            && in_array($summary->delivery_status, ['SENT', 'DELIVERED', 'READ'], true)
            && (int) $firstInbound->sequence === $inputSequence && $inputSequence > $proposal['sequence']
            && $firstInbound->direction === 'INBOUND' && $firstInbound->sender_type === 'CONTACT'
            && $firstInbound->message_type === 'TEXT'
            && mb_strtolower(trim((string) $firstInbound->text_body)) === mb_strtolower(self::PHRASE);
    }

    /**
     * Runs before any lead procedure. The first attempt prepares a summary, never a lead.
     *
     * @param  array<string, mixed>  $arguments
     */
    public function requireConfirmed(ToolContext $context, string $tool, array $arguments): void
    {
        ksort($arguments);
        $allowed = $this->locked($context, function (object $session, array &$state) use ($context, $tool, $arguments): bool {
            $pending = $state[self::KEY] ?? null;
            if (($pending['confirmed_sequence'] ?? null) === $context->inputSequence
                && $pending['epoch'] === $context->epoch && $pending['tool'] === $tool
                && $this->sameArguments($pending['arguments'], $arguments)) {
                return true;
            }
            // One immutable proposal per turn; a second model call cannot replace what will be shown.
            if (($pending['run_id'] ?? null) !== $context->runId) {
                $contact = DB::table('contacts')->where('tenant_id', $context->tenantId)->where('id', $context->contactId)->first();
                $profile = json_decode((string) $contact?->profile_json, true) ?: [];
                $visible = [
                    'Nombre' => $arguments['contact_name'] ?? $contact->display_name ?? 'No indicado',
                    'Teléfono' => $arguments['contact_phone'] ?? $contact->phone_e164 ?? $profile['declared_phone'] ?? 'No indicado',
                    'Email' => $arguments['contact_email'] ?? $contact->email ?? 'No indicado',
                ];
                if (isset($arguments['property_id'])) {
                    $property = DB::table('properties')->where('tenant_id', $context->tenantId)->where('public_id', $arguments['property_id'])->first(['code', 'title']);
                    $visible['Propiedad'] = ($property->title ?? '').' ('.($property->code ?? $arguments['property_id']).')';
                    $visible['Interés'] = $arguments['interest_level'];
                }
                $visible['Motivo'] = $arguments['notes'] ?? 'Consulta por asistente';
                $summary = "Antes de registrar la consulta, revisa estos datos:\n";
                foreach ($visible as $label => $value) {
                    // Quote untrusted fields so embedded newlines cannot impersonate another label.
                    $summary .= $label.': '.json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
                }
                $summary .= 'Si son correctos, responde exactamente «'.self::PHRASE.'». Si hay un error, envía la corrección.';
                $state[self::KEY] = ['run_id' => $context->runId, 'epoch' => $context->epoch, 'tool' => $tool,
                    'arguments' => $arguments, 'summary' => $summary];
            }

            return false;
        });
        if (! $allowed) {
            throw new ToolError('VALIDATION_ERROR', 'Los datos aún no tienen confirmación del cliente. Se mostrará el resumen para confirmar.');
        }
    }

    /** @param array<string, mixed> $stored
     * @param  array<string, mixed>  $arguments
     */
    private function sameArguments(array $stored, array $arguments): bool
    {
        ksort($stored);

        return $stored === $arguments;
    }

    /** Returns only a newly prepared summary for this run, never an older or confirmed one. */
    public function summary(ToolContext $context): ?string
    {
        $session = $this->session($context)->first(['state_json']);
        $pending = (json_decode((string) $session?->state_json, true) ?: [])[self::KEY] ?? null;

        return ($pending['run_id'] ?? null) === $context->runId && ! isset($pending['message_id']) ? $pending['summary'] : null;
    }

    /** @param array<string, mixed> $reply */
    public function bind(ToolContext $context, string $text, array $reply): void
    {
        $this->locked($context, function (object $session, array &$state) use ($context, $text, $reply): void {
            $pending = $state[self::KEY] ?? null;
            if (($pending['run_id'] ?? null) === $context->runId && $pending['summary'] === $text && ! isset($pending['message_id'])) {
                $state[self::KEY] += ['message_id' => (int) $reply['message_id'], 'sequence' => (int) $reply['sequence']];
            }
        });
    }

    /**
     * Accepts only the next real customer message; corrections/nontext invalidate the old snapshot.
     *
     * @return array{tool: string, arguments: array<string, mixed>}|null
     */
    public function receive(ToolContext $context): ?array
    {
        return $this->locked($context, function (object $session, array &$state) use ($context): ?array {
            $pending = $state[self::KEY] ?? null;
            if ($pending === null) {
                return null;
            }
            $messages = fn () => DB::table('messages')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId);
            $summary = isset($pending['message_id']) ? $messages()->where('id', $pending['message_id'])->first() : null;
            $first = isset($pending['sequence']) ? $messages()->where('sequence', '>', $pending['sequence'])
                ->where('direction', 'INBOUND')->orderBy('sequence')->first() : null;
            if (! self::matches($pending, $summary, $first, $context->epoch, $context->inputSequence)) {
                unset($state[self::KEY]);

                return null;
            }
            $state[self::KEY]['confirmed_sequence'] = $context->inputSequence;

            return ['tool' => $pending['tool'], 'arguments' => $pending['arguments']];
        });
    }

    private function session(ToolContext $context): Builder
    {
        return DB::table('chatbot_sessions')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
            ->where('id', DB::table('chatbot_runs')->where('tenant_id', $context->tenantId)->where('id', $context->runId)->value('session_id'))
            ->where('status', 'ACTIVE');
    }

    /** Conversation-first lock order matches ToolExecutions and ConversationControl. */
    private function locked(ToolContext $context, callable $callback): mixed
    {
        return DB::transaction(function () use ($context, $callback): mixed {
            $conversation = app(ConversationControl::class)->lock($context->tenantId, $context->conversationId);
            if ((int) $conversation->control_epoch !== $context->epoch || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)) {
                throw new ToolError('STALE_CONTROL', 'La conversación ya no está a cargo del asistente.');
            }
            $session = $this->session($context)->lockForUpdate()->first(['id', 'state_json']);
            if ($session === null) {
                throw new ToolError('STALE_CONTROL', 'La sesión del asistente ya no está activa.');
            }
            $state = json_decode((string) $session->state_json, true) ?: [];
            $result = $callback($session, $state);
            DB::table('chatbot_sessions')->where('tenant_id', $context->tenantId)->where('id', $session->id)
                ->update(['state_json' => json_encode($state, JSON_THROW_ON_ERROR)]);

            return $result;
        }, 3);
    }
}

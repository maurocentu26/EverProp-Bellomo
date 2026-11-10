<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\Conversations\Services\ConversationControl;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Server-owned snapshots: neither tool arguments nor provider metadata can grant consent. */
final class ContactConfirmation
{
    private const KEY = 'contact_confirmation';

    public const PHRASE = 'Confirmo mis datos';

    /** At least one of these must appear: the word that actually says "yes". */
    private const AFFIRMATIVE = ['si', 'sip', 'dale', 'ok', 'okey', 'okay', 'oka', 'correcto', 'correctos', 'correcta',
        'correctas', 'exacto', 'exactos', 'exacta', 'perfecto', 'perfecta', 'confirmo', 'confirmado', 'confirmados',
        'afirmativo', 'claro', 'listo', 'joya', 'bien', 'de_acuerdo', 'por_supuesto', 'asi_es', 'obvio', 'genial', 'buenisimo', 'yes'];

    /** Allowed only next to an affirmative word. Any other word ("no", "pero", "va", "cambia", a name) means it is not a plain yes. */
    private const FILLER = ['esos', 'esas', 'eso', 'esto', 'estos', 'son', 'es', 'esta', 'estan', 'todo', 'todos', 'todas',
        'los', 'las', 'mis', 'datos', 'gracias', 'muchas', 'mil', 'muy', 'te_lo'];

    /** Function words only count inside these fixed phrases, so "qué va", "y si" or "si, de" stay out. */
    private const PHRASES = ['/\bde acuerdo\b/' => 'de_acuerdo', '/\bpor supuesto\b/' => 'por_supuesto', '/\basi es\b/' => 'asi_es',
        '/\bclaro que\b/' => 'claro', '/\bte lo\b/' => 'te_lo'];

    /**
     * EVP-103: a short, natural "yes" confirms the summary ("sí", "Sí, esos son", "dale", "ok 👍", "Confirmo mis datos").
     * Decided here, never by the model. Closed by default: digits, @, a question, any symbol or emoji other than
     * 👍 ✅ 👌, a negation, a correction or any word outside the lists means it is not a yes.
     */
    public static function isAffirmation(string $text): bool
    {
        // Full-width forms ("３８８", "＠", "？") become ASCII first, so they are rejected below like the plain ones.
        $text = (string) \Normalizer::normalize($text, \Normalizer::FORM_KC);
        $text = (string) preg_replace('/(👍|✅|👌)[\x{1F3FB}-\x{1F3FF}\x{FE0F}]*/u', ' ok ', $text);
        if (preg_match('/[^\p{L}\s.,!¡]/u', $text) === 1) {
            return false;
        }
        $text = trim((string) preg_replace('/[^a-z]+/', ' ', strtolower(Str::ascii($text))));
        // "siii", "sisi", "okkk": stretched or doubled, it is still the same yes.
        $text = (string) preg_replace(['/\bs+i+(s+i+)*\b/', '/\bo+k+\b/'], ['si', 'ok'], $text);
        $words = explode(' ', (string) preg_replace(array_keys(self::PHRASES), array_values(self::PHRASES), $text));
        $repeated = array_diff_key($words, array_unique($words));

        return $text !== '' && count($words) <= 8
            && array_diff($repeated, ['si', 'ok']) === []
            && array_intersect($words, self::AFFIRMATIVE) !== []
            && array_diff($words, self::AFFIRMATIVE, self::FILLER) === [];
    }

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
            && self::isAffirmation((string) $firstInbound->text_body);
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
                    'Nombre' => $arguments['contact_name'] ?? $contact->display_name ?? null,
                    'Teléfono' => $arguments['contact_phone'] ?? $contact->phone_e164 ?? $profile['declared_phone'] ?? null,
                    'Correo' => $arguments['contact_email'] ?? $contact->email ?? null,
                ];
                $visible = array_filter($visible, fn (?string $value): bool => trim($value ?? '') !== '');
                $summary = match (true) {
                    isset($visible['Teléfono'], $visible['Correo']) => '¿Están bien este teléfono y este correo para que podamos contactarte?',
                    isset($visible['Teléfono']) => '¿Está bien este teléfono para que podamos contactarte?',
                    isset($visible['Correo']) => '¿Está bien este correo para que podamos contactarte?',
                    default => '¿Podés revisar estos datos antes de que guarde tu consulta?',
                };
                $summary .= "\n\n";
                if (isset($arguments['property_id'])) {
                    $property = DB::table('properties')->where('tenant_id', $context->tenantId)->where('public_id', $arguments['property_id'])->first(['code', 'title']);
                    $visible['Propiedad'] = ($property->title ?? '').' ('.($property->code ?? $arguments['property_id']).')';
                    $visible['Interés'] = $arguments['interest_level'];
                }
                if (trim($arguments['notes'] ?? '') !== '') {
                    $visible['Consulta'] = $arguments['notes'];
                }
                foreach ($visible as $label => $value) {
                    // Quote untrusted fields so embedded newlines cannot impersonate another label.
                    $summary .= $label.': '.json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
                }
                $summary .= "\n".'Si está todo bien, respondé «sí» o «'.self::PHRASE.'» para que guarde tu consulta. Si hay algo para corregir, decime qué dato cambio.';
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
            // A burst ("ok" then "pero cambiá el mail") is not a plain yes: anything the customer sent after it voids it.
            $followUp = $messages()->where('sequence', '>', $context->inputSequence)->where('direction', 'INBOUND')
                ->where('sender_type', 'CONTACT')->exists();
            if ($followUp || ! self::matches($pending, $summary, $first, $context->epoch, $context->inputSequence)) {
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

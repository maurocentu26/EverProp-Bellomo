<?php

namespace App\Domain\AgentRuntime\Tools;

/**
 * Server-side context injected by the gateway. None of these values come from the model: the
 * tenant, conversation and contact are the ones of the run, the epoch is the one the run started
 * with, and the actor is always the anonymous visitor in G2 (no advisor tools yet).
 */
final class ToolContext
{
    /**
     * Set by derivar_a_asesor; executed by the coordinator after the final text (ordering).
     *
     * @var array{reason: string, summary: string}|null
     */
    public ?array $handoff = null;

    public function __construct(
        public readonly int $tenantId,
        public readonly int $conversationId,
        public readonly int $contactId,
        public readonly int $channelAccountId,
        public readonly string $channelType,
        public readonly int $runId,
        public readonly int $epoch,
        public readonly int $inputSequence,
        public readonly string $traceId,
        public readonly string $actor = 'VISITOR',
    ) {}
}

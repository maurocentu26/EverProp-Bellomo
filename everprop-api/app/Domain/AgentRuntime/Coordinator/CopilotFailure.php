<?php

namespace App\Domain\AgentRuntime\Coordinator;

use RuntimeException;

/** Why the copilot gave no draft. The advisor keeps writing by hand; nothing was sent or changed. */
final class CopilotFailure extends RuntimeException
{
    /** @param  string|null  $action  ACTION_NEEDED: the tool the model wanted (the advisor does it by hand) */
    public function __construct(public readonly string $errorCode, public readonly ?string $action = null)
    {
        parent::__construct($errorCode);
    }
}

<?php

namespace App\Domain\Conversations\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

final class ConversationConflict extends RuntimeException
{
    public function __construct(public readonly string $code_, string $message, public readonly int $status = 409)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['ok' => false, 'error' => ['code' => $this->code_, 'message' => $this->getMessage(), 'retryable' => false]], $this->status);
    }
}

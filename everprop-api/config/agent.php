<?php

return [
    // disabled | anthropic. Real calls need an approved provider/region (X03) and a key.
    'llm_provider' => env('AGENT_LLM_PROVIDER', 'disabled'),
    // No default model on purpose: pick it explicitly (economics D13 anchors cost on Haiku-class).
    'llm_model' => env('AGENT_LLM_MODEL'),
    'prompt_version' => 'coordinator-2026-09-29.1',
    // Per-turn limits (ADR D13/D14).
    'max_llm_calls' => 2,
    'max_retries' => 1,
    'max_tool_calls' => 3,
    'max_input_tokens' => (int) env('AGENT_MAX_INPUT_TOKENS', 8000),
    'max_output_tokens' => (int) env('AGENT_MAX_OUTPUT_TOKENS', 600),
    'timeout_seconds' => (int) env('AGENT_TIMEOUT_SECONDS', 20),
    'history_messages' => 20,
    'knowledge_top_k' => 4,
    'reply_max_chars' => 1200,
    // Micro-USD per token for the reservation (USD 1 / 5 per million = Haiku 4.5 published rate, economics.md).
    'input_micros_per_token' => (float) env('AGENT_INPUT_MICROS_PER_TOKEN', 1.0),
    'output_micros_per_token' => (float) env('AGENT_OUTPUT_MICROS_PER_TOKEN', 5.0),
    // Per-conversation turn lock. The queue retry_after must be larger (REDIS_QUEUE_RETRY_AFTER).
    'turn_lock_seconds' => 180, // > 3 calls x (timeout + connect) + tools
];

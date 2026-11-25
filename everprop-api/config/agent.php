<?php

return [
    // disabled | anthropic | openai (local copilot only). Real calls need an approved provider/region (X03) and a key.
    'llm_provider' => env('AGENT_LLM_PROVIDER', 'disabled'),
    // No default model on purpose: pick it explicitly (economics D13 anchors cost on Haiku-class).
    'llm_model' => env('AGENT_LLM_MODEL'),
    'prompt_version' => 'coordinator-2026-11-25.195',
    // Per-turn limits (ADR D13/D14).
    'max_llm_calls' => 2,
    'max_retries' => 1,
    // EVP-115: wait before that retry (429/529, timeout, 5xx). Retry-After wins over the base; never longer than the max.
    'retry_base_wait_ms' => (int) env('AGENT_RETRY_BASE_WAIT_MS', 1000),
    'retry_jitter_ms' => (int) env('AGENT_RETRY_JITTER_MS', 1000),
    'retry_max_wait_seconds' => (int) env('AGENT_RETRY_MAX_WAIT_SECONDS', 10),
    // A retry is skipped if it could end after this: below RunAgentJob::$timeout (150) and turn_lock_seconds.
    'turn_deadline_seconds' => 120,
    // EVP-115: a turn starts this long after the visitor's last message, so a burst gets one answer.
    'burst_window_seconds' => (int) env('AGENT_BURST_WINDOW_SECONDS', 3),
    // ...but a message already waiting this long is answered even if newer ones keep coming.
    'burst_max_wait_seconds' => 20,
    // The copilot runs inside the advisor's request: php-fpm cuts it at 35 s (docker/php/fpm-pool.conf).
    'copilot_deadline_seconds' => 30,
    // A turn that finds the conversation's lock taken retries this soon.
    'lock_retry_seconds' => 2,
    'max_tool_calls' => 3,
    'max_input_tokens' => (int) env('AGENT_MAX_INPUT_TOKENS', 8000),
    'max_output_tokens' => (int) env('AGENT_MAX_OUTPUT_TOKENS', 600),
    'timeout_seconds' => (int) env('AGENT_TIMEOUT_SECONDS', 20),
    'history_messages' => 20,
    'knowledge_top_k' => 4,
    // Approved knowledge chunks per tenant: approval quota and hard read cap of the search (EVP-114, linear-time ranking).
    'knowledge_max_chunks' => (int) env('AGENT_KNOWLEDGE_MAX_CHUNKS', 2500),
    'reply_max_chars' => 1200,
    // Micro-USD per token for the reservation (USD 1 / 5 per million = Haiku 4.5 published rate, economics.md).
    'input_micros_per_token' => (float) env('AGENT_INPUT_MICROS_PER_TOKEN', 1.0),
    'output_micros_per_token' => (float) env('AGENT_OUTPUT_MICROS_PER_TOKEN', 5.0),
    // Per-conversation turn lock. The queue retry_after must be larger (REDIS_QUEUE_RETRY_AFTER).
    'turn_lock_seconds' => 180, // > 3 calls x (timeout + connect) + tools
];

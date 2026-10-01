<?php

return [
    // Off until the AI coordinator exists (G2): new conversations wait for an advisor instead.
    'ai_enabled' => (bool) env('CONVERSATIONS_AI_ENABLED', false),
    // With the assistant off, the reconciler hands to humans bot conversations with an unanswered visitor
    // message within this window (older rows are left untouched).
    'ai_off_sweep_hours' => (int) env('CONVERSATIONS_AI_OFF_SWEEP_HOURS', 72),
    // Outbound dispatch lease; an expired PROCESSING job becomes UNKNOWN (never resent blindly).
    'dispatch_lease_seconds' => (int) env('CONVERSATIONS_DISPATCH_LEASE_SECONDS', 60),
    // Anonymous web chat sessions.
    'web_session_ttl_hours' => (int) env('CONVERSATIONS_WEB_SESSION_TTL_HOURS', 24),
    'web_message_max_chars' => (int) env('CONVERSATIONS_WEB_MESSAGE_MAX_CHARS', 2000),
    'web_rate_limit_per_minute' => (int) env('CONVERSATIONS_WEB_RATE_LIMIT_PER_MINUTE', 20),
    'web_read_rate_limit_per_minute' => (int) env('CONVERSATIONS_WEB_READ_RATE_LIMIT_PER_MINUTE', 120),
    'meta_webhook_rate_limit_per_minute' => (int) env('CONVERSATIONS_META_WEBHOOK_RATE_LIMIT_PER_MINUTE', 2000),
];

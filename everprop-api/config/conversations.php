<?php

return [
    // Off until the AI coordinator exists (G2): new conversations wait for an advisor instead.
    'ai_enabled' => (bool) env('CONVERSATIONS_AI_ENABLED', false),
    // Copilot: the advisor in control asks for a draft; nothing reaches the client unless the advisor sends it.
    // Independent of ai_enabled, so it can run (and be measured) before the assistant answers on its own.
    'copilot_enabled' => (bool) env('CONVERSATIONS_COPILOT_ENABLED', false),
    // Abuse bounds for drafts (D14): per advisor, per customer message and an own monthly ceiling inside the global cap.
    'copilot_per_minute' => (int) env('CONVERSATIONS_COPILOT_PER_MINUTE', 10),
    'copilot_per_day' => (int) env('CONVERSATIONS_COPILOT_PER_DAY', 100),
    'copilot_drafts_per_message' => (int) env('CONVERSATIONS_COPILOT_DRAFTS_PER_MESSAGE', 3),
    'copilot_monthly_usd' => (float) env('CONVERSATIONS_COPILOT_MONTHLY_USD', 10),
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

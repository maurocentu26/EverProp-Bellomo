<?php

$webhookSecretReference = env('WEBHOOK_SECRET_REF');
$webhookSecret = env('WEBHOOK_SECRET');
$webhookSecrets = is_string($webhookSecretReference) && $webhookSecretReference !== ''
    && is_string($webhookSecret) && $webhookSecret !== ''
        ? [$webhookSecretReference => $webhookSecret]
        : [];

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // EverSys Meta app (Tech Provider). One app-level webhook for every tenant: the tenant is
    // derived from the verified phone_number_id -> channel_accounts mapping, never from the body.
    // Anthropic Messages API for the assistant (AGENT_LLM_PROVIDER=anthropic). Key only via env/secret store.
    'openai' => [
        'key' => env('OPENAI_API_KEY'),
        'input_rate' => env('OPENAI_INPUT_MICROS_PER_TOKEN'),
        'output_rate' => env('OPENAI_OUTPUT_MICROS_PER_TOKEN'),
        'local_budget_usd' => env('OPENAI_LOCAL_BUDGET_USD'),
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'staging_enabled' => (bool) env('GEMINI_STAGING_ENABLED', false),
        'railway_environment' => env('RAILWAY_ENVIRONMENT_NAME'),
        'input_rate' => env('GEMINI_INPUT_MICROS_PER_TOKEN', 0),
        'output_rate' => env('GEMINI_OUTPUT_MICROS_PER_TOKEN', 0),
        'local_budget_usd' => env('GEMINI_BUDGET_USD', env('GEMINI_LOCAL_BUDGET_USD', 10)),
    ],

    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
        'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
        'version' => env('ANTHROPIC_VERSION', '2023-06-01'),
    ],

    'meta' => [
        'app_secret' => env('META_APP_SECRET'),
        'instagram_app_secret' => env('META_INSTAGRAM_APP_SECRET'),
        'instagram_app_id' => env('META_INSTAGRAM_APP_ID'),
        'instagram_redirect_uri' => env('META_INSTAGRAM_REDIRECT_URI'),
        'instagram_redirect_uris' => json_decode((string) env('META_INSTAGRAM_REDIRECT_URIS_JSON', '{}'), true),
        'instagram_onboarding_enabled' => (bool) env('META_INSTAGRAM_ONBOARDING_ENABLED', false),
        'instagram_webhook_verify_token' => env('META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN'),
        'webhook_verify_token' => env('META_WEBHOOK_VERIFY_TOKEN'),
        'graph_version' => env('META_GRAPH_VERSION', 'v24.0'), // v24 (2025-10-08): status webhooks drop `conversation` (unused here)
        'send_enabled' => (bool) env('META_SEND_ENABLED', false),
        'whatsapp_sandbox_phone_number_id' => env('META_WHATSAPP_SANDBOX_PHONE_NUMBER_ID'),
        'whatsapp_sandbox_recipients' => array_filter(array_map('trim', explode(',', env('META_WHATSAPP_SANDBOX_RECIPIENTS', '')))),
        'whatsapp_sandbox_recipient_from' => env('META_WHATSAPP_SANDBOX_RECIPIENT_FROM'),
        'whatsapp_sandbox_recipient_to' => env('META_WHATSAPP_SANDBOX_RECIPIENT_TO'),
        'send_fake' => (bool) env('META_SEND_FAKE', false),
        'send_timeout_seconds' => (int) env('META_SEND_TIMEOUT_SECONDS', 10),
        // Embedded Signup (Tech Provider): connecting real business accounts is gated like sending (X04).
        'app_id' => env('META_APP_ID'),
        'embedded_signup_config_id' => env('META_EMBEDDED_SIGNUP_CONFIG_ID'),
        'onboarding_enabled' => (bool) env('META_ONBOARDING_ENABLED', false),
    ],

    'webhooks' => [
        'secrets' => $webhookSecrets,
        'tolerance_seconds' => (int) env('WEBHOOK_TOLERANCE_SECONDS', 300),
        'max_payload_bytes' => (int) env('WEBHOOK_MAX_PAYLOAD_BYTES', 1048576),
        'retention_days' => (int) env('WEBHOOK_RETENTION_DAYS', 30),
        'queue' => env('WEBHOOK_QUEUE', 'default'),
    ],

];

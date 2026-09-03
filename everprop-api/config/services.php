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

    'webhooks' => [
        'secrets' => $webhookSecrets,
        'tolerance_seconds' => (int) env('WEBHOOK_TOLERANCE_SECONDS', 300),
        'max_payload_bytes' => (int) env('WEBHOOK_MAX_PAYLOAD_BYTES', 1048576),
        'retention_days' => (int) env('WEBHOOK_RETENTION_DAYS', 30),
        'queue' => env('WEBHOOK_QUEUE', 'default'),
    ],

];

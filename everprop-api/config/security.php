<?php

return [
    'login_rate_limit_per_minute' => (int) env('LOGIN_RATE_LIMIT_PER_MINUTE', 5),
    'public_lead_rate_limit_per_minute' => (int) env('PUBLIC_LEAD_RATE_LIMIT_PER_MINUTE', 20),
    'webhook_tolerance_seconds' => (int) env('WEBHOOK_TOLERANCE_SECONDS', 300),
];

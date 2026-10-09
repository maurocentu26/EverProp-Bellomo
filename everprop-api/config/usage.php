<?php

return [
    // Operating ceiling approved for the pilot is USD 150/month for the whole platform; only the
    // variable AI envelope (USD 30) is metered here (docs/eversys-conversations/economics.md).
    'global_cap_micros' => (int) env('USAGE_GLOBAL_CAP_MICROS', 30_000_000),
    'default_tenant_cap_micros' => (int) env('USAGE_DEFAULT_TENANT_CAP_MICROS', 30_000_000),
];

<?php

return [
    'baseline_path' => database_path('schema/bellomo_crm_omnichannel_mysql8.baseline.sql'),
    'baseline_sha256' => '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D',
    // Live contract: immutable baseline plus forward migrations.
    'tables' => 58,
    'tenant_tables' => 54,
    'foreign_keys' => 131,
    'procedures' => 2,
    'views' => 3,
    // usage_budget_locks: one row per billing period to serialize the platform-wide cap (2026-09-29.002).
    'global_tables' => ['notifications', 'schema_versions', 'tenants', 'usage_budget_locks'],
];

<?php

return [
    'baseline_path' => database_path('schema/bellomo_crm_omnichannel_mysql8.baseline.sql'),
    'baseline_sha256' => '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D',
    // All checked-in forwards, including conversations and email audit.
    'tables' => 61,
    'tenant_tables' => 55,
    'foreign_keys' => 132,
    // The inventory forward creates these only after source data has been imported.
    'inventory_foreign_keys' => ['fk_properties_legacy_type', 'fk_properties_legacy_status'],
    'procedures' => 2,
    'views' => 3,
    // usage_budget_locks: one row per billing period to serialize the platform-wide cap (2026-09-29.002).
    // jobs/failed_jobs: database queue infrastructure (2026-09-30.001).
    'global_tables' => ['failed_jobs', 'jobs', 'notifications', 'schema_versions', 'tenants', 'usage_budget_locks'],
];

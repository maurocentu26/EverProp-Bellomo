<?php

return [
    'baseline_path' => database_path('schema/bellomo_crm_omnichannel_mysql8.baseline.sql'),
    'baseline_sha256' => '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D',
    // Live contract: immutable baseline plus forward migrations.
    'tables' => 55,
    'tenant_tables' => 50,
    'foreign_keys' => 118,
    // The inventory forward creates these only after source data has been imported.
    'inventory_foreign_keys' => ['fk_properties_legacy_type', 'fk_properties_legacy_status'],
    'procedures' => 2,
    'views' => 3,
    // jobs/failed_jobs: database queue infrastructure (2026-09-30.001, EVP-173).
    'global_tables' => ['failed_jobs', 'jobs', 'notifications', 'schema_versions', 'tenants'],
    // EVP-183: Laravel tables required only when that driver is `database` (awake-dedication), not created by forwards.
    'runtime_tables' => ['cache' => 'cache.default', 'cache_locks' => 'cache.default', 'sessions' => 'session.driver'],
];

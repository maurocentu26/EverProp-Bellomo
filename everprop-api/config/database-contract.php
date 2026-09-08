<?php

return [
    'baseline_path' => database_path('schema/bellomo_crm_omnichannel_mysql8.baseline.sql'),
    'baseline_sha256' => '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D',
    // Baseline plus the versioned forward-only schema changes.
    'tables' => 42,
    'tenant_tables' => 39,
    'foreign_keys' => 98,
    'procedures' => 2,
    'views' => 3,
    'global_tables' => ['notifications', 'schema_versions', 'tenants'],
];

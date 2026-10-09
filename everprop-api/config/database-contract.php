<?php

return [
    'baseline_path' => database_path('schema/bellomo_crm_omnichannel_mysql8.baseline.sql'),
    'baseline_sha256' => '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D',
    // All checked-in forwards, including push, inventory catalogs and email audit.
    'tables' => 51,
    'tenant_tables' => 48,
    'foreign_keys' => 113,
    // The inventory forward creates these only after source data has been imported.
    'inventory_foreign_keys' => ['fk_properties_legacy_type', 'fk_properties_legacy_status'],
    'procedures' => 2,
    'views' => 3,
    'global_tables' => ['notifications', 'schema_versions', 'tenants'],
];

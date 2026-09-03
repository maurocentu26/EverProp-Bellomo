<?php

$decodedHostMap = json_decode((string) env('TENANT_HOST_MAP_JSON', '{}'), true);

return [
    'hosts' => is_array($decodedHostMap) ? $decodedHostMap : [],
    'allow_local_resolver' => (bool) env('TENANT_ALLOW_LOCAL_RESOLVER', false),
    'trusted_hosts' => array_values(array_filter(array_map(
        static fn (string $host): string => trim($host),
        explode(',', (string) env('TRUSTED_HOSTS', '')),
    ))),
    'local_header' => 'X-Everprop-Tenant',
];

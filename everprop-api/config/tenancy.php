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
    // Signed channel from the panel (S02): the panel proxy asserts the host the user typed, signed with this
    // shared secret, so one API serves many tenant domains. Empty = signed hosts are rejected.
    'panel_signing_key' => (string) env('TENANT_PANEL_SIGNING_KEY', ''),
    'panel_signature_ttl' => (int) env('TENANT_PANEL_SIGNATURE_TTL', 60),
];

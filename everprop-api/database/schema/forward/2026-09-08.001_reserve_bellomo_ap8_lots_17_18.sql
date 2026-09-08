-- Forward-only data correction matching the reviewed Bellomo inventory source.
-- Safe to re-run: it targets two immutable public IDs inside the Bellomo tenant.

UPDATE properties AS property
INNER JOIN tenants AS tenant ON tenant.id = property.tenant_id
SET property.status = 'RESERVED',
    property.updated_at = CURRENT_TIMESTAMP(3)
WHERE tenant.slug = 'bellomo'
  AND property.public_id IN (
      '26732dea-70a2-453a-a356-bc7f13a6d560',
      'ea981881-ab3c-408f-b8d9-93b74a909fd3'
  );

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-09-08.001', 'Reserve Bellomo San Guillermo II AP8 lots 17 and 18');

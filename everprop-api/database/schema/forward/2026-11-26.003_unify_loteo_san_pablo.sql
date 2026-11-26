-- EVP-214: data-only fix, no DDL on persistent tables.
-- Unifies Loteo San Pablo 1 (legacy_id 70) and Loteo San Pablo 2 (legacy_id 73)
-- into a single canonical project "Loteo San Pablo" (slug "loteo-san-pablo" when
-- project_landing exists) for Bellomo tenants ('bellomo', 'bellomito-staging') only.
-- Tables introduced in later develop forwards (project_landing, project_landing_assets,
-- knowledge_documents, lead_interests) are guarded via information_schema.tables so
-- this script applies cleanly on both staging and production.
-- Every change is audited first. Re-runnable: subsequent runs match no duplicate
-- rows and leave already-unified rows untouched.
SET SESSION innodb_lock_wait_timeout = 5;
SET SESSION lock_wait_timeout = 10;
SET @evp214_now = UTC_TIMESTAMP(3);

SET @evp214_has_landing = (
    SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'project_landing'
);
SET @evp214_has_landing_assets = (
    SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'project_landing_assets'
);
SET @evp214_has_knowledge = (
    SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'knowledge_documents'
);
SET @evp214_has_lead_interests = (
    SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'lead_interests'
);

DROP TEMPORARY TABLE IF EXISTS tmp_evp214_san_pablo;
CREATE TEMPORARY TABLE tmp_evp214_san_pablo (
    tenant_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    keep_id   BIGINT UNSIGNED NOT NULL,
    drop_id   BIGINT UNSIGNED NULL
) ENGINE=InnoDB;

INSERT INTO tmp_evp214_san_pablo (tenant_id, keep_id, drop_id)
SELECT
    t.id AS tenant_id,
    COALESCE(sp1.id, sp2.id) AS keep_id,
    CASE
        WHEN sp1.id IS NOT NULL AND sp2.id IS NOT NULL AND sp2.id <> sp1.id THEN sp2.id
        ELSE NULL
    END AS drop_id
  FROM tenants t
  LEFT JOIN (
      SELECT p.tenant_id, p.id
        FROM projects p
       WHERE p.deleted_at IS NULL
         AND (
             p.legacy_id = 70
             OR UPPER(TRIM(p.name)) IN ('LOTEO SAN PABLO', 'LOTEO SAN PABLO 1', 'SAN PABLO 1')
         )
         AND p.id = (
             SELECT p2.id
               FROM projects p2
              WHERE p2.tenant_id = p.tenant_id
                AND p2.deleted_at IS NULL
                AND (
                    p2.legacy_id = 70
                    OR UPPER(TRIM(p2.name)) IN ('LOTEO SAN PABLO', 'LOTEO SAN PABLO 1', 'SAN PABLO 1')
                )
              ORDER BY (p2.legacy_id = 70) DESC, p2.id ASC
              LIMIT 1
         )
  ) sp1 ON sp1.tenant_id = t.id
  LEFT JOIN (
      SELECT p.tenant_id, p.id
        FROM projects p
       WHERE p.deleted_at IS NULL
         AND (
             p.legacy_id = 73
             OR UPPER(TRIM(p.name)) IN ('LOTEO SAN PABLO 2', 'SAN PABLO 2')
         )
         AND p.id = (
             SELECT p2.id
               FROM projects p2
              WHERE p2.tenant_id = p.tenant_id
                AND p2.deleted_at IS NULL
                AND (
                    p2.legacy_id = 73
                    OR UPPER(TRIM(p2.name)) IN ('LOTEO SAN PABLO 2', 'SAN PABLO 2')
                )
              ORDER BY (p2.legacy_id = 73) DESC, p2.id ASC
              LIMIT 1
         )
  ) sp2 ON sp2.tenant_id = t.id
 WHERE t.slug IN ('bellomo', 'bellomito-staging')
   AND COALESCE(sp1.id, sp2.id) IS NOT NULL;

START TRANSACTION;

-- Audit surviving project only when something actually changes (name or merged duplicate).
INSERT INTO audit_logs (tenant_id, actor_type, action_code, entity_type, entity_id, before_json, after_json, metadata_json)
SELECT m.tenant_id, 'SYSTEM', 'PROJECT_UNIFIED', 'PROJECT', k.id,
       JSON_OBJECT('name', k.name, 'total_units', k.total_units),
       JSON_OBJECT('name', 'Loteo San Pablo'),
       JSON_OBJECT('forward', '2026-11-26.003', 'ticket', 'EVP-214', 'merged_project_id', m.drop_id)
  FROM tmp_evp214_san_pablo m
  JOIN projects k
    ON k.tenant_id = m.tenant_id
   AND k.id = m.keep_id
 WHERE m.drop_id IS NOT NULL
    OR k.name <> 'Loteo San Pablo';

-- Audit duplicate project being merged and soft-deleted.
INSERT INTO audit_logs (tenant_id, actor_type, action_code, entity_type, entity_id, before_json, after_json, metadata_json)
SELECT m.tenant_id, 'SYSTEM', 'PROJECT_MERGED_INTO_CANONICAL', 'PROJECT', d.id,
       JSON_OBJECT('name', d.name, 'legacy_id', d.legacy_id, 'deleted_at', d.deleted_at),
       JSON_OBJECT('deleted_at', @evp214_now),
       JSON_OBJECT('forward', '2026-11-26.003', 'ticket', 'EVP-214', 'canonical_project_id', m.keep_id)
  FROM tmp_evp214_san_pablo m
  JOIN projects d
    ON d.tenant_id = m.tenant_id
   AND d.id = m.drop_id
 WHERE m.drop_id IS NOT NULL;

-- 1. Reassign properties from San Pablo 2 to canonical Loteo San Pablo.
UPDATE properties pr
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = pr.tenant_id
   AND m.drop_id = pr.project_id
   SET pr.project_id = m.keep_id,
       pr.updated_at = @evp214_now
 WHERE m.drop_id IS NOT NULL;

-- 2. Reassign landing assets (optional table; deduplicate identical URLs already on canonical project).
SET @evp214_sql = IF(
    @evp214_has_landing_assets > 0,
    'DELETE a FROM project_landing_assets a JOIN tmp_evp214_san_pablo m ON m.tenant_id = a.tenant_id AND m.drop_id = a.project_id JOIN project_landing_assets k ON k.tenant_id = m.tenant_id AND k.project_id = m.keep_id AND k.url = a.url WHERE m.drop_id IS NOT NULL',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

SET @evp214_sql = IF(
    @evp214_has_landing_assets > 0,
    'UPDATE project_landing_assets a JOIN tmp_evp214_san_pablo m ON m.tenant_id = a.tenant_id AND m.drop_id = a.project_id SET a.project_id = m.keep_id WHERE m.drop_id IS NOT NULL',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

-- 3. Reassign knowledge documents (optional table).
SET @evp214_sql = IF(
    @evp214_has_knowledge > 0,
    'UPDATE knowledge_documents kd JOIN tmp_evp214_san_pablo m ON m.tenant_id = kd.tenant_id AND m.drop_id = kd.project_id SET kd.project_id = m.keep_id, kd.updated_at = @evp214_now WHERE m.drop_id IS NOT NULL',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

-- 4. Reassign lead interests (optional table).
SET @evp214_sql = IF(
    @evp214_has_lead_interests > 0,
    'UPDATE lead_interests li JOIN tmp_evp214_san_pablo m ON m.tenant_id = li.tenant_id AND m.drop_id = li.project_id SET li.project_id = m.keep_id, li.updated_at = @evp214_now WHERE m.drop_id IS NOT NULL',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

-- 5. Merge and reassign user inventory scopes without violating uq_user_inventory_scopes_scope.
UPDATE user_inventory_scopes k
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = k.tenant_id
   AND m.keep_id = k.project_id
  JOIN user_inventory_scopes d
    ON d.tenant_id = m.tenant_id
   AND d.user_id = k.user_id
   AND d.scope_type = 'PROJECT'
   AND d.project_id = m.drop_id
   SET k.can_view = GREATEST(k.can_view, d.can_view),
       k.can_edit = GREATEST(k.can_edit, d.can_edit),
       k.can_manage_prices = GREATEST(k.can_manage_prices, d.can_manage_prices),
       k.updated_at = @evp214_now
 WHERE m.drop_id IS NOT NULL
   AND k.scope_type = 'PROJECT';

DELETE d
  FROM user_inventory_scopes d
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = d.tenant_id
   AND m.drop_id = d.project_id
  JOIN user_inventory_scopes k
    ON k.tenant_id = m.tenant_id
   AND k.user_id = d.user_id
   AND k.scope_type = 'PROJECT'
   AND k.project_id = m.keep_id
 WHERE m.drop_id IS NOT NULL
   AND d.scope_type = 'PROJECT';

UPDATE user_inventory_scopes uis
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = uis.tenant_id
   AND m.drop_id = uis.project_id
   SET uis.project_id = m.keep_id,
       uis.updated_at = @evp214_now
 WHERE m.drop_id IS NOT NULL
   AND uis.scope_type = 'PROJECT';

-- 6. Reassign project intakes (respecting uq_project_intakes_project) and intake units.
DELETE d
  FROM project_intakes d
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = d.tenant_id
   AND m.drop_id = d.project_id
  JOIN project_intakes k
    ON k.tenant_id = m.tenant_id
   AND k.project_id = m.keep_id
 WHERE m.drop_id IS NOT NULL;

UPDATE project_intakes pi
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = pi.tenant_id
   AND m.drop_id = pi.project_id
   SET pi.project_id = m.keep_id
 WHERE m.drop_id IS NOT NULL;

UPDATE project_intake_units piu
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = piu.tenant_id
   AND m.drop_id = piu.project_id
   SET piu.project_id = m.keep_id
 WHERE m.drop_id IS NOT NULL;

-- 7. Remove duplicate project_landing row (or move it if canonical had none) and normalize slug/name (optional table).
SET @evp214_sql = IF(
    @evp214_has_landing > 0,
    'DELETE d FROM project_landing d JOIN tmp_evp214_san_pablo m ON m.tenant_id = d.tenant_id AND m.drop_id = d.project_id JOIN project_landing k ON k.tenant_id = m.tenant_id AND k.project_id = m.keep_id WHERE m.drop_id IS NOT NULL',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

SET @evp214_sql = IF(
    @evp214_has_landing > 0,
    'UPDATE project_landing pl JOIN tmp_evp214_san_pablo m ON m.tenant_id = pl.tenant_id AND m.drop_id = pl.project_id SET pl.project_id = m.keep_id, pl.updated_at = @evp214_now WHERE m.drop_id IS NOT NULL',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

SET @evp214_sql = IF(
    @evp214_has_landing > 0,
    'UPDATE project_landing pl JOIN tmp_evp214_san_pablo m ON m.tenant_id = pl.tenant_id AND m.keep_id = pl.project_id SET pl.slug = ''loteo-san-pablo'', pl.content = CASE WHEN JSON_TYPE(pl.content) = ''OBJECT'' AND UPPER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pl.content, ''$.name'')), ''''))) IN (''SAN PABLO 1'', ''SAN PABLO 2'', ''LOTEO SAN PABLO 1'', ''LOTEO SAN PABLO 2'') THEN JSON_SET(pl.content, ''$.name'', ''Loteo San Pablo'') ELSE pl.content END, pl.updated_at = @evp214_now WHERE (pl.slug <> ''loteo-san-pablo'' OR (JSON_TYPE(pl.content) = ''OBJECT'' AND UPPER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pl.content, ''$.name'')), ''''))) IN (''SAN PABLO 1'', ''SAN PABLO 2'', ''LOTEO SAN PABLO 1'', ''LOTEO SAN PABLO 2''))) AND NOT EXISTS (SELECT 1 FROM (SELECT id, tenant_id, project_id FROM project_landing WHERE slug = ''loteo-san-pablo'') AS conflict WHERE conflict.tenant_id = pl.tenant_id AND conflict.project_id <> pl.project_id)',
    'SELECT 1'
);
PREPARE evp214_stmt FROM @evp214_sql;
EXECUTE evp214_stmt;
DEALLOCATE PREPARE evp214_stmt;

-- 8. Rename canonical project, refresh total_units and soft-delete duplicate project.
UPDATE projects k
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = k.tenant_id
   AND m.keep_id = k.id
   SET k.name = 'Loteo San Pablo',
       k.total_units = GREATEST(
           k.total_units,
           (
               SELECT COUNT(*)
                 FROM properties pr
                WHERE pr.tenant_id = k.tenant_id
                  AND pr.project_id = k.id
                  AND pr.deleted_at IS NULL
           )
       ),
       k.updated_at = @evp214_now
 WHERE k.name <> 'Loteo San Pablo'
    OR m.drop_id IS NOT NULL;

UPDATE projects d
  JOIN tmp_evp214_san_pablo m
    ON m.tenant_id = d.tenant_id
   AND m.drop_id = d.id
   SET d.deleted_at = @evp214_now,
       d.updated_at = @evp214_now
 WHERE m.drop_id IS NOT NULL
   AND d.deleted_at IS NULL;

COMMIT;

DROP TEMPORARY TABLE IF EXISTS tmp_evp214_san_pablo;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-11-26.003', 'Unify Loteo San Pablo 1 and Loteo San Pablo 2 into canonical Loteo San Pablo');

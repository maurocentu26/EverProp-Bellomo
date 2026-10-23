-- EVP-55: presentation belongs to existing inventory; no project is published by this migration.
SET SESSION lock_wait_timeout = 10;
CREATE TABLE IF NOT EXISTS project_landing (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 project_id BIGINT UNSIGNED NOT NULL,
 slug VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NULL,
 is_visible BOOLEAN NOT NULL DEFAULT FALSE,
 sort_order INT UNSIGNED NOT NULL DEFAULT 0,
 content JSON NOT NULL,
 first_published_at DATETIME(3) NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_project_landing_id (tenant_id, id),
 UNIQUE KEY uq_project_landing_project (tenant_id, project_id),
 UNIQUE KEY uq_project_landing_slug (tenant_id, slug),
 KEY ix_project_landing_public (tenant_id, is_visible, sort_order, project_id),
 CONSTRAINT fk_project_landing_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_project_landing_project FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
 CONSTRAINT ck_project_landing_visible CHECK (is_visible IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS project_landing_assets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 project_id BIGINT UNSIGNED NOT NULL,
 url VARCHAR(2048) NOT NULL,
 mime_type VARCHAR(80) NOT NULL,
 title VARCHAR(160) NOT NULL,
 UNIQUE KEY uq_project_landing_assets_id (tenant_id, id),
 KEY ix_project_landing_assets_project (tenant_id, project_id),
 CONSTRAINT fk_project_landing_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_project_landing_assets_project FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id)
) ENGINE=InnoDB;
INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-22.001', 'Project landing presentation and approved public assets');

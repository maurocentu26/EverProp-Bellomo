-- EVP-61: a durable creation key makes a retried guided intake return the same project.
SET SESSION lock_wait_timeout = 10;
CREATE TABLE IF NOT EXISTS project_intakes (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 project_id BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_project_intakes_id (tenant_id, id),
 UNIQUE KEY uq_project_intakes_request (tenant_id, request_key),
 UNIQUE KEY uq_project_intakes_project (tenant_id, project_id),
 CONSTRAINT fk_project_intakes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_project_intakes_project FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id)
) ENGINE=InnoDB;
INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-23.001', 'Guided project intake creation keys');

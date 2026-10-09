-- Eversys Conversations G2 (S09-S13): approved knowledge with FULLTEXT, tool executions with
-- idempotency, visit requests (REQUESTED != visits.SCHEDULED), run epoch. Expand-only, idempotent.

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    public_id       CHAR(36)        NOT NULL,
    title           VARCHAR(200)    NOT NULL,
    audience        VARCHAR(16)     NOT NULL DEFAULT 'PUBLIC',
    status          VARCHAR(16)     NOT NULL DEFAULT 'DRAFT',
    project_id      BIGINT UNSIGNED NULL,
    version         INT UNSIGNED    NOT NULL DEFAULT 1,
    body            MEDIUMTEXT      NOT NULL,
    valid_until     DATETIME(3)     NULL,
    created_by_user_id  BIGINT UNSIGNED NULL,
    approved_by_user_id BIGINT UNSIGNED NULL,
    approved_at     DATETIME(3)     NULL,
    revoked_at      DATETIME(3)     NULL,
    created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_knowledge_documents_public_id (public_id),
    UNIQUE KEY uq_knowledge_documents_tenant_id (tenant_id, id),
    KEY ix_knowledge_documents_status (tenant_id, status, audience),
    CONSTRAINT fk_knowledge_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_knowledge_documents_project FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id),
    CONSTRAINT fk_knowledge_documents_creator FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_knowledge_documents_approver FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES users (tenant_id, id),
    CONSTRAINT ck_knowledge_documents_audience CHECK (audience IN ('PUBLIC', 'INTERNAL')),
    CONSTRAINT ck_knowledge_documents_status CHECK (status IN ('DRAFT', 'APPROVED', 'REVOKED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    document_id     BIGINT UNSIGNED NOT NULL,
    document_version INT UNSIGNED   NOT NULL,
    ordinal         INT UNSIGNED    NOT NULL,
    heading         VARCHAR(255)    NULL,
    body            TEXT            NOT NULL,
    created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_knowledge_chunks_position (tenant_id, document_id, document_version, ordinal),
    UNIQUE KEY uq_knowledge_chunks_tenant_id (tenant_id, id),
    FULLTEXT KEY ft_knowledge_chunks_text (heading, body),
    CONSTRAINT fk_knowledge_chunks_document FOREIGN KEY (tenant_id, document_id) REFERENCES knowledge_documents (tenant_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tool_executions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    conversation_id BIGINT UNSIGNED NOT NULL,
    run_id          BIGINT UNSIGNED NULL,
    tool_name       VARCHAR(64)     NOT NULL,
    idempotency_key VARCHAR(191)    NOT NULL,
    arguments_sha256 BINARY(32)     NOT NULL,
    status          VARCHAR(16)     NOT NULL,
    result_json     JSON            NULL,
    created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_tool_executions_key (tenant_id, tool_name, idempotency_key),
    KEY ix_tool_executions_run (tenant_id, run_id),
    CONSTRAINT fk_tool_executions_conversation FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id),
    CONSTRAINT fk_tool_executions_run FOREIGN KEY (tenant_id, run_id) REFERENCES chatbot_runs (tenant_id, id),
    CONSTRAINT ck_tool_executions_status CHECK (status IN ('SUCCEEDED', 'FAILED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visit_requests (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    public_id       CHAR(36)        NOT NULL,
    conversation_id BIGINT UNSIGNED NOT NULL,
    contact_id      BIGINT UNSIGNED NOT NULL,
    property_id     BIGINT UNSIGNED NOT NULL,
    preferred_slots_json JSON       NOT NULL,
    note            VARCHAR(1000)   NULL,
    status          VARCHAR(16)     NOT NULL DEFAULT 'REQUESTED',
    visit_id        BIGINT UNSIGNED NULL,
    created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_visit_requests_public_id (public_id),
    UNIQUE KEY uq_visit_requests_tenant_id (tenant_id, id),
    KEY ix_visit_requests_status (tenant_id, status, created_at),
    CONSTRAINT fk_visit_requests_conversation FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id),
    CONSTRAINT fk_visit_requests_contact FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts (tenant_id, id),
    CONSTRAINT fk_visit_requests_property FOREIGN KEY (tenant_id, property_id) REFERENCES properties (tenant_id, id),
    CONSTRAINT fk_visit_requests_visit FOREIGN KEY (tenant_id, visit_id) REFERENCES visits (tenant_id, id),
    CONSTRAINT ck_visit_requests_status CHECK (status IN ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED'))
) ENGINE=InnoDB;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='chatbot_runs' AND COLUMN_NAME='control_epoch'),
 'ALTER TABLE chatbot_runs
    ADD COLUMN conversation_id BIGINT UNSIGNED NULL AFTER session_id,
    ADD COLUMN control_epoch INT UNSIGNED NULL AFTER conversation_id,
    ADD COLUMN input_sequence BIGINT UNSIGNED NULL AFTER control_epoch,
    ADD KEY ix_chatbot_runs_conversation (tenant_id, conversation_id, created_at),
    ADD CONSTRAINT fk_chatbot_runs_conversation FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id)',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Guarded (re-runnable) indexes: stuck-run sweep, tenant-scoped referencing of tool executions,
-- per-conversation visit request limits.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='chatbot_runs' AND INDEX_NAME='ix_chatbot_runs_status_started'),
 'ALTER TABLE chatbot_runs ADD KEY ix_chatbot_runs_status_started (status, started_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tool_executions' AND INDEX_NAME='uq_tool_executions_tenant_id'),
 'ALTER TABLE tool_executions ADD UNIQUE KEY uq_tool_executions_tenant_id (tenant_id, id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='visit_requests' AND INDEX_NAME='ix_visit_requests_conversation'),
 'ALTER TABLE visit_requests ADD KEY ix_visit_requests_conversation (tenant_id, conversation_id, status, created_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-09-29.003', 'Agent runtime: knowledge (FULLTEXT), tool executions, visit requests, run epoch');

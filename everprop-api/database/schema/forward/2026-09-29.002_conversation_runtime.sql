-- Eversys Conversations G1 (S03/S05/S07/S08). Expand-only: no existing code reads these
-- tables (see docs/adr/0004). Idempotent: every change is guarded by information_schema.

-- conversations: operational control state + fencing epoch + per-conversation sequence
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='conversations' AND COLUMN_NAME='control_state'),
 'ALTER TABLE conversations
    ADD COLUMN control_state VARCHAR(24) NOT NULL DEFAULT ''AI_ACTIVE'' AFTER bot_mode,
    ADD COLUMN control_epoch INT UNSIGNED NOT NULL DEFAULT 1 AFTER control_state,
    ADD COLUMN state_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER control_epoch,
    ADD COLUMN next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER state_version,
    ADD COLUMN controlled_by_user_id BIGINT UNSIGNED NULL AFTER next_sequence,
    ADD CONSTRAINT ck_conversations_control_state CHECK (control_state IN (''AI_ACTIVE'',''WAITING_TOOL'',''WAITING_HUMAN'',''TRANSITION_PENDING'',''HUMAN_ACTIVE'',''CLOSED'')),
    ADD CONSTRAINT fk_conversations_controller FOREIGN KEY (tenant_id, controlled_by_user_id) REFERENCES users (tenant_id, id)',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- messages: channel-level dedupe, local order and epoch of bot output
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='sequence'),
 'ALTER TABLE messages
    ADD COLUMN channel_account_id BIGINT UNSIGNED NULL AFTER conversation_id,
    ADD COLUMN sequence BIGINT UNSIGNED NULL AFTER channel_account_id,
    ADD COLUMN control_epoch INT UNSIGNED NULL AFTER sequence,
    ADD UNIQUE KEY uq_messages_channel_provider (tenant_id, channel_account_id, provider_message_id),
    ADD UNIQUE KEY uq_messages_sequence (tenant_id, conversation_id, sequence),
    ADD CONSTRAINT fk_messages_channel FOREIGN KEY (tenant_id, channel_account_id) REFERENCES channel_accounts (tenant_id, id)',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_messages_delivery' AND CHECK_CLAUSE LIKE '%UNKNOWN%'),
 'ALTER TABLE messages DROP CHECK ck_messages_delivery, ADD CONSTRAINT ck_messages_delivery CHECK (delivery_status IN (''RECEIVED'',''QUEUED'',''SENT'',''DELIVERED'',''READ'',''FAILED'',''DELETED'',''CANCELLED'',''UNKNOWN''))',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- outbound_jobs: link to the outbound message, fencing epoch, dispatch lease, ambiguous outcomes
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='outbound_jobs' AND COLUMN_NAME='control_epoch'),
 'ALTER TABLE outbound_jobs
    ADD COLUMN message_id BIGINT UNSIGNED NULL AFTER conversation_id,
    ADD COLUMN control_epoch INT UNSIGNED NULL AFTER message_id,
    ADD COLUMN dispatch_nonce CHAR(36) NULL AFTER locked_by,
    ADD COLUMN lease_expires_at DATETIME(3) NULL AFTER dispatch_nonce,
    ADD UNIQUE KEY uq_outbound_jobs_message (tenant_id, message_id),
    ADD KEY ix_outbound_jobs_conversation (tenant_id, conversation_id, status),
    ADD CONSTRAINT fk_outbound_jobs_message FOREIGN KEY (tenant_id, message_id) REFERENCES messages (tenant_id, id)',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_outbound_jobs_status' AND CHECK_CLAUSE LIKE '%UNKNOWN_FINAL%'),
 'ALTER TABLE outbound_jobs DROP CHECK ck_outbound_jobs_status, ADD CONSTRAINT ck_outbound_jobs_status CHECK (status IN (''PENDING'',''PROCESSING'',''SENT'',''RETRY'',''FAILED'',''CANCELLED'',''DEAD_LETTER'',''UNKNOWN'',''UNKNOWN_FINAL''))',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- A WhatsApp phone_number_id belongs to exactly one tenant platform-wide (the webhook derives the
-- tenant from it). Generated column so other channel types keep per-tenant uniqueness.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='channel_accounts' AND COLUMN_NAME='whatsapp_phone_number_id'),
 'ALTER TABLE channel_accounts
    ADD COLUMN whatsapp_phone_number_id VARCHAR(191) AS (CASE WHEN channel_type = ''WHATSAPP'' THEN provider_account_id END) STORED,
    ADD UNIQUE KEY uq_channel_accounts_whatsapp_phone (whatsapp_phone_number_id)',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Consumer-side dedupe for domain_outbox events
CREATE TABLE IF NOT EXISTS outbox_consumptions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    outbox_id       BIGINT UNSIGNED NOT NULL,
    consumer        VARCHAR(80)     NOT NULL,
    consumed_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_outbox_consumptions (tenant_id, outbox_id, consumer),
    CONSTRAINT fk_outbox_consumptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB;

-- Anonymous web chat sessions: opaque token (only its SHA-256 is stored) bound to tenant + widget channel
CREATE TABLE IF NOT EXISTS public_chat_sessions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    public_id           CHAR(36)        NOT NULL,
    channel_account_id  BIGINT UNSIGNED NOT NULL,
    conversation_id     BIGINT UNSIGNED NOT NULL,
    token_sha256        BINARY(32)      NOT NULL,
    origin              VARCHAR(255)    NULL,
    expires_at          DATETIME(3)     NOT NULL,
    revoked_at          DATETIME(3)     NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_public_chat_sessions_public_id (public_id),
    UNIQUE KEY uq_public_chat_sessions_token (token_sha256),
    UNIQUE KEY uq_public_chat_sessions_tenant_id (tenant_id, id),
    CONSTRAINT fk_public_chat_sessions_channel FOREIGN KEY (tenant_id, channel_account_id) REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT fk_public_chat_sessions_conversation FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id)
) ENGINE=InnoDB;

-- Budget ledger: reserve before any billable call, commit/release after (ADR D14)
CREATE TABLE IF NOT EXISTS usage_ledger (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    operation_key       VARCHAR(191)    NOT NULL,
    category            VARCHAR(24)     NOT NULL,
    period              CHAR(7)         NOT NULL,
    reserved_micros     BIGINT UNSIGNED NOT NULL,
    actual_micros       BIGINT UNSIGNED NULL,
    status              VARCHAR(16)     NOT NULL,
    metadata_json       JSON            NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_usage_ledger_operation (tenant_id, operation_key),
    KEY ix_usage_ledger_period (period, tenant_id, status),
    CONSTRAINT fk_usage_ledger_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_usage_ledger_category CHECK (category IN ('LLM','CHANNEL','EMBEDDING','RERANK','OTHER')),
    CONSTRAINT ck_usage_ledger_status CHECK (status IN ('RESERVED','COMMITTED','RELEASED','UNKNOWN'))
) ENGINE=InnoDB;

-- Global serialization row per period so concurrent tenants cannot overspend the platform cap
CREATE TABLE IF NOT EXISTS usage_budget_locks (
    period      CHAR(7)     NOT NULL,
    PRIMARY KEY (period)
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-09-29.002', 'Conversation runtime: control epoch, sequences, dispatch lease, web sessions, usage ledger');

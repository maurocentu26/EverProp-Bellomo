-- EVP-207: admin test sessions and per-message feedback for staging assistant QA; additive and idempotent.
SET SESSION lock_wait_timeout = 10;

CREATE TABLE IF NOT EXISTS assistant_test_sessions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    public_id           CHAR(36)        NOT NULL,
    conversation_id     BIGINT UNSIGNED NOT NULL,
    created_by_user_id  BIGINT UNSIGNED NULL,
    title               VARCHAR(160)    NULL,
    status              VARCHAR(24)     NOT NULL DEFAULT 'OPEN',
    closing_note        TEXT            NULL,
    finished_at         DATETIME(3)     NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assistant_test_sessions_public_id (public_id),
    UNIQUE KEY uq_assistant_test_sessions_tenant_id (tenant_id, id),
    UNIQUE KEY uq_assistant_test_sessions_conversation (tenant_id, conversation_id),
    KEY ix_assistant_test_sessions_list (tenant_id, status, created_at),
    CONSTRAINT ck_assistant_test_sessions_status CHECK (status IN ('OPEN', 'FINISHED')),
    CONSTRAINT fk_assistant_test_sessions_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_assistant_test_sessions_conversation
        FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id),
    CONSTRAINT fk_assistant_test_sessions_creator
        FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_test_message_reviews (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    session_id          BIGINT UNSIGNED NOT NULL,
    message_sequence    BIGINT UNSIGNED NOT NULL,
    rating              VARCHAR(16)     NULL,
    note                TEXT            NULL,
    reviewed_by_user_id BIGINT UNSIGNED NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assistant_test_reviews_msg (tenant_id, session_id, message_sequence),
    CONSTRAINT ck_assistant_test_reviews_rating CHECK (rating IS NULL OR rating IN ('GOOD', 'BAD')),
    CONSTRAINT fk_assistant_test_reviews_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_assistant_test_reviews_session
        FOREIGN KEY (tenant_id, session_id) REFERENCES assistant_test_sessions(tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_assistant_test_reviews_user
        FOREIGN KEY (tenant_id, reviewed_by_user_id) REFERENCES users(tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-11-26.001', 'Assistant test sessions and message reviews (EVP-207)');

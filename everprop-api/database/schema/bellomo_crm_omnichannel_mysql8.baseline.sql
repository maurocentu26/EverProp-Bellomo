-- Bellomo / EverProp - CRM omnicanal, webhooks, chatbot y asignacion comercial
-- Motor: MySQL 8.0.32+ / MySQL 8.4 LTS
-- Zona horaria de persistencia: UTC. La UI convierte a America/Argentina/Salta.
--
-- PRINCIPIOS
-- 1. Todo evento entrante se conserva primero en webhook_receipts (raw + hash).
-- 2. Un payload puede producir varios webhook_events normalizados.
-- 3. La idempotencia se controla por integracion y clave de evento.
-- 4. Un contacto puede tener identidades WhatsApp, Instagram, Facebook, web y email.
-- 5. Solo existe un lead abierto por contacto y tenant.
-- 6. Los leads nuevos se asignan mediante round-robin transaccional.
-- 7. Los secretos reales NO se guardan aqui: solo referencias a un secret manager.

SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET time_zone = '+00:00';
SET @OLD_SQL_MODE = @@SESSION.sql_mode;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS bellomo_crm
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE bellomo_crm;

CREATE TABLE IF NOT EXISTS schema_versions (
    version             VARCHAR(64)     NOT NULL,
    description         VARCHAR(255)    NOT NULL,
    applied_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenants (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id           CHAR(36)        NOT NULL,
    name                VARCHAR(160)    NOT NULL,
    slug                VARCHAR(80)     NOT NULL,
    timezone            VARCHAR(64)     NOT NULL DEFAULT 'America/Argentina/Salta',
    status              VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    settings_json       JSON            NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_tenants_public_id (public_id),
    UNIQUE KEY uq_tenants_slug (slug),
    UNIQUE KEY uq_tenants_scope (id, status),
    CONSTRAINT ck_tenants_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    public_id           CHAR(36)        NOT NULL,
    auth_subject        VARCHAR(191)    NULL,
    display_name        VARCHAR(160)    NOT NULL,
    email               VARCHAR(320)    NULL,
    phone_e164          VARCHAR(32)     NULL,
    role_code           VARCHAR(40)     NOT NULL DEFAULT 'SALES_ADVISOR',
    status              VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    max_open_leads      INT UNSIGNED    NULL,
    last_login_at       DATETIME(3)     NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                        ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at          DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_public_id (public_id),
    UNIQUE KEY uq_users_tenant_id (tenant_id, id),
    UNIQUE KEY uq_users_tenant_auth (tenant_id, auth_subject),
    UNIQUE KEY uq_users_tenant_email (tenant_id, email),
    KEY ix_users_assignment (tenant_id, role_code, status, deleted_at),
    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_users_role CHECK (
        role_code IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR', 'BOT_OPERATOR', 'READ_ONLY')
    ),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED')),
    CONSTRAINT ck_users_max_open_leads CHECK (max_open_leads IS NULL OR max_open_leads > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integration_connections (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    public_id                   CHAR(36)        NOT NULL,
    provider                    VARCHAR(32)     NOT NULL,
    name                        VARCHAR(120)    NOT NULL,
    status                      VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
    provider_app_id             VARCHAR(191)    NULL,
    provider_business_id        VARCHAR(191)    NULL,
    api_version                 VARCHAR(32)     NULL,
    webhook_secret_ref          VARCHAR(500)    NULL,
    access_token_secret_ref     VARCHAR(500)    NULL,
    verify_token_digest         BINARY(32)      NULL,
    token_expires_at            DATETIME(3)     NULL,
    settings_json               JSON            NULL,
    last_healthcheck_at         DATETIME(3)     NULL,
    created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_integrations_public_id (public_id),
    UNIQUE KEY uq_integrations_tenant_id (tenant_id, id),
    UNIQUE KEY uq_integrations_name (tenant_id, provider, name),
    CONSTRAINT fk_integrations_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_integrations_provider CHECK (provider IN ('META', 'WEB', 'CUSTOM')),
    CONSTRAINT ck_integrations_status CHECK (status IN ('PENDING', 'ACTIVE', 'DEGRADED', 'REVOKED', 'DISABLED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS channel_accounts (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    integration_id          BIGINT UNSIGNED NOT NULL,
    public_id               CHAR(36)        NOT NULL,
    channel_type            VARCHAR(40)     NOT NULL,
    provider_account_id     VARCHAR(191)    NOT NULL,
    display_name            VARCHAR(160)    NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    metadata_json           JSON            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_channel_accounts_public_id (public_id),
    UNIQUE KEY uq_channel_accounts_tenant_id (tenant_id, id),
    UNIQUE KEY uq_channel_accounts_provider (tenant_id, channel_type, provider_account_id),
    KEY ix_channel_accounts_integration (tenant_id, integration_id, status),
    CONSTRAINT fk_channel_accounts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_channel_accounts_integration
        FOREIGN KEY (tenant_id, integration_id)
        REFERENCES integration_connections (tenant_id, id),
    CONSTRAINT ck_channel_accounts_type CHECK (
        channel_type IN (
            'WHATSAPP', 'INSTAGRAM_DM', 'INSTAGRAM_COMMENT',
            'FACEBOOK_MESSENGER', 'FACEBOOK_COMMENT',
            'META_LEAD_AD', 'WEB_CHAT', 'WEB_FORM', 'WEB_TRACKING'
        )
    ),
    CONSTRAINT ck_channel_accounts_status CHECK (status IN ('ACTIVE', 'PAUSED', 'DISCONNECTED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    integration_id              BIGINT UNSIGNED NOT NULL,
    channel_account_id          BIGINT UNSIGNED NULL,
    channel_scope_id            BIGINT UNSIGNED
        GENERATED ALWAYS AS (COALESCE(channel_account_id, 0)) STORED,
    provider_object             VARCHAR(80)     NOT NULL,
    subscribed_field            VARCHAR(120)    NOT NULL,
    provider_subscription_id    VARCHAR(191)    NULL,
    status                      VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
    last_verified_at            DATETIME(3)     NULL,
    expires_at                  DATETIME(3)     NULL,
    metadata_json               JSON            NULL,
    created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhook_subscriptions_field (
        tenant_id, integration_id, provider_object, subscribed_field, channel_scope_id
    ),
    KEY ix_webhook_subscriptions_status (tenant_id, status, expires_at),
    CONSTRAINT fk_webhook_subscriptions_integration
        FOREIGN KEY (tenant_id, integration_id)
        REFERENCES integration_connections (tenant_id, id),
    CONSTRAINT fk_webhook_subscriptions_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT ck_webhook_subscriptions_status CHECK (
        status IN ('PENDING', 'ACTIVE', 'DEGRADED', 'EXPIRED', 'REVOKED', 'DISABLED')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webhook_receipts (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    integration_id          BIGINT UNSIGNED NOT NULL,
    request_id              VARCHAR(191)    NULL,
    idempotency_key         VARCHAR(191)    NOT NULL,
    provider                VARCHAR(32)     NOT NULL,
    provider_object         VARCHAR(80)     NULL,
    provider_object_id      VARCHAR(191)    NULL,
    signature_algorithm     VARCHAR(32)     NULL,
    signature_valid         TINYINT(1)      NOT NULL DEFAULT 0,
    payload_sha256          BINARY(32)      NOT NULL,
    remote_ip               VARBINARY(16)   NULL,
    headers_json            JSON            NULL,
    raw_payload             JSON            NOT NULL,
    processing_status       VARCHAR(24)     NOT NULL DEFAULT 'RECEIVED',
    attempt_count           INT UNSIGNED    NOT NULL DEFAULT 0,
    next_attempt_at         DATETIME(3)     NULL,
    last_error_code         VARCHAR(80)     NULL,
    last_error_message      TEXT            NULL,
    received_at             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    processed_at            DATETIME(3)     NULL,
    expires_at              DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhook_receipts_delivery (integration_id, idempotency_key),
    UNIQUE KEY uq_webhook_receipts_tenant_id (tenant_id, id),
    KEY ix_webhook_receipts_queue (processing_status, next_attempt_at, received_at),
    KEY ix_webhook_receipts_object (tenant_id, provider_object, provider_object_id, received_at),
    CONSTRAINT fk_webhook_receipts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_webhook_receipts_integration
        FOREIGN KEY (tenant_id, integration_id)
        REFERENCES integration_connections (tenant_id, id),
    CONSTRAINT ck_webhook_receipts_provider CHECK (provider IN ('META', 'WEB', 'CUSTOM')),
    CONSTRAINT ck_webhook_receipts_status CHECK (
        processing_status IN ('RECEIVED', 'VERIFIED', 'PROCESSING', 'PROCESSED', 'RETRY', 'REJECTED', 'DEAD_LETTER')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webhook_events (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    integration_id          BIGINT UNSIGNED NOT NULL,
    receipt_id              BIGINT UNSIGNED NOT NULL,
    channel_account_id      BIGINT UNSIGNED NULL,
    provider_event_key      VARCHAR(191)    NOT NULL,
    provider_event_id       VARCHAR(191)    NULL,
    event_type              VARCHAR(80)     NOT NULL,
    actor_provider_id       VARCHAR(191)    NULL,
    object_provider_id      VARCHAR(191)    NULL,
    occurred_at             DATETIME(3)     NOT NULL,
    normalized_payload      JSON            NOT NULL,
    processing_status       VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
    attempt_count           INT UNSIGNED    NOT NULL DEFAULT 0,
    next_attempt_at         DATETIME(3)     NULL,
    locked_at               DATETIME(3)     NULL,
    locked_by               VARCHAR(120)    NULL,
    last_error_code         VARCHAR(80)     NULL,
    last_error_message      TEXT            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    processed_at            DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhook_events_provider_key (integration_id, provider_event_key),
    UNIQUE KEY uq_webhook_events_tenant_id (tenant_id, id),
    KEY ix_webhook_events_queue (processing_status, next_attempt_at, occurred_at),
    KEY ix_webhook_events_type (tenant_id, event_type, occurred_at),
    CONSTRAINT fk_webhook_events_receipt
        FOREIGN KEY (tenant_id, receipt_id)
        REFERENCES webhook_receipts (tenant_id, id),
    CONSTRAINT fk_webhook_events_integration
        FOREIGN KEY (tenant_id, integration_id)
        REFERENCES integration_connections (tenant_id, id),
    CONSTRAINT fk_webhook_events_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT ck_webhook_events_status CHECK (
        processing_status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'IGNORED', 'RETRY', 'DEAD_LETTER')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contacts (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    public_id               CHAR(36)        NOT NULL,
    display_name            VARCHAR(200)    NULL,
    first_name              VARCHAR(120)    NULL,
    last_name               VARCHAR(120)    NULL,
    email                   VARCHAR(320)    NULL,
    phone_e164              VARCHAR(32)     NULL,
    locale                  VARCHAR(20)     NULL,
    lifecycle_status        VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    merged_into_contact_id  BIGINT UNSIGNED NULL,
    profile_json            JSON            NULL,
    first_seen_at           DATETIME(3)     NOT NULL,
    last_seen_at            DATETIME(3)     NOT NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at              DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_contacts_public_id (public_id),
    UNIQUE KEY uq_contacts_tenant_id (tenant_id, id),
    KEY ix_contacts_email (tenant_id, email),
    KEY ix_contacts_phone (tenant_id, phone_e164),
    KEY ix_contacts_last_seen (tenant_id, lifecycle_status, last_seen_at),
    CONSTRAINT fk_contacts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_contacts_merged_into
        FOREIGN KEY (tenant_id, merged_into_contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT ck_contacts_status CHECK (lifecycle_status IN ('ACTIVE', 'MERGED', 'BLOCKED', 'ANONYMIZED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_identities (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    contact_id              BIGINT UNSIGNED NOT NULL,
    channel_type            VARCHAR(40)     NOT NULL,
    provider_scope_id       VARCHAR(191)    NOT NULL DEFAULT '',
    provider_user_id        VARCHAR(191)    NOT NULL,
    username                VARCHAR(191)    NULL,
    display_name            VARCHAR(200)    NULL,
    identity_hash           BINARY(32)      NULL,
    is_primary              TINYINT(1)      NOT NULL DEFAULT 0,
    is_verified             TINYINT(1)      NOT NULL DEFAULT 0,
    profile_json            JSON            NULL,
    first_seen_at           DATETIME(3)     NOT NULL,
    last_seen_at            DATETIME(3)     NOT NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_contact_identities_provider (
        tenant_id, channel_type, provider_scope_id, provider_user_id
    ),
    UNIQUE KEY uq_contact_identities_tenant_id (tenant_id, id),
    KEY ix_contact_identities_contact (tenant_id, contact_id, last_seen_at),
    CONSTRAINT fk_contact_identities_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT ck_contact_identities_type CHECK (
        channel_type IN (
            'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'PHONE',
            'WEB_VISITOR', 'WEB_CHAT', 'WEB_FORM', 'META_LEAD_AD'
        )
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_consents (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    contact_id              BIGINT UNSIGNED NOT NULL,
    channel_account_id      BIGINT UNSIGNED NULL,
    purpose_code            VARCHAR(64)     NOT NULL,
    status                  VARCHAR(24)     NOT NULL,
    capture_source          VARCHAR(80)     NOT NULL,
    proof_webhook_event_id  BIGINT UNSIGNED NULL,
    legal_text_version      VARCHAR(64)     NULL,
    captured_at             DATETIME(3)     NOT NULL,
    withdrawn_at            DATETIME(3)     NULL,
    expires_at              DATETIME(3)     NULL,
    metadata_json           JSON            NULL,
    PRIMARY KEY (id),
    KEY ix_contact_consents_current (tenant_id, contact_id, purpose_code, captured_at),
    CONSTRAINT fk_contact_consents_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT fk_contact_consents_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT fk_contact_consents_event
        FOREIGN KEY (tenant_id, proof_webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT ck_contact_consents_status CHECK (status IN ('GRANTED', 'DENIED', 'WITHDRAWN', 'EXPIRED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    public_id               CHAR(36)        NOT NULL,
    contact_id              BIGINT UNSIGNED NOT NULL,
    channel_account_id      BIGINT UNSIGNED NOT NULL,
    provider_thread_id      VARCHAR(191)    NULL,
    assigned_user_id        BIGINT UNSIGNED NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'OPEN',
    priority                VARCHAR(16)     NOT NULL DEFAULT 'NORMAL',
    bot_mode                VARCHAR(24)     NOT NULL DEFAULT 'BOT_FIRST',
    subject                 VARCHAR(255)    NULL,
    unread_count            INT UNSIGNED    NOT NULL DEFAULT 0,
    first_inbound_at        DATETIME(3)     NULL,
    last_inbound_at         DATETIME(3)     NULL,
    last_outbound_at        DATETIME(3)     NULL,
    last_activity_at        DATETIME(3)     NOT NULL,
    closed_at               DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_conversations_public_id (public_id),
    UNIQUE KEY uq_conversations_tenant_id (tenant_id, id),
    UNIQUE KEY uq_conversations_provider_thread (tenant_id, channel_account_id, provider_thread_id),
    KEY ix_conversations_inbox (tenant_id, assigned_user_id, status, last_activity_at),
    KEY ix_conversations_contact (tenant_id, contact_id, last_activity_at),
    CONSTRAINT fk_conversations_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT fk_conversations_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT fk_conversations_assignee
        FOREIGN KEY (tenant_id, assigned_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_conversations_status CHECK (status IN ('OPEN', 'PENDING', 'SNOOZED', 'RESOLVED', 'SPAM')),
    CONSTRAINT ck_conversations_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT ck_conversations_bot_mode CHECK (bot_mode IN ('BOT_FIRST', 'HUMAN_FIRST', 'BOT_ONLY', 'HUMAN_ONLY', 'PAUSED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    conversation_id         BIGINT UNSIGNED NOT NULL,
    contact_identity_id     BIGINT UNSIGNED NULL,
    webhook_event_id        BIGINT UNSIGNED NULL,
    provider_message_id     VARCHAR(191)    NULL,
    provider_reply_to_id    VARCHAR(191)    NULL,
    direction               VARCHAR(16)     NOT NULL,
    sender_type             VARCHAR(16)     NOT NULL,
    message_type            VARCHAR(32)     NOT NULL,
    text_body               LONGTEXT        NULL,
    media_json              JSON            NULL,
    interactive_json        JSON            NULL,
    metadata_json           JSON            NULL,
    delivery_status         VARCHAR(24)     NOT NULL DEFAULT 'RECEIVED',
    provider_error_code     VARCHAR(80)     NULL,
    provider_error_message  TEXT            NULL,
    occurred_at             DATETIME(3)     NOT NULL,
    sent_at                 DATETIME(3)     NULL,
    delivered_at            DATETIME(3)     NULL,
    read_at                 DATETIME(3)     NULL,
    failed_at               DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_messages_provider (tenant_id, conversation_id, provider_message_id),
    UNIQUE KEY uq_messages_event (tenant_id, webhook_event_id),
    UNIQUE KEY uq_messages_tenant_id (tenant_id, id),
    KEY ix_messages_timeline (tenant_id, conversation_id, occurred_at, id),
    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations (tenant_id, id),
    CONSTRAINT fk_messages_identity
        FOREIGN KEY (tenant_id, contact_identity_id)
        REFERENCES contact_identities (tenant_id, id),
    CONSTRAINT fk_messages_event
        FOREIGN KEY (tenant_id, webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT ck_messages_direction CHECK (direction IN ('INBOUND', 'OUTBOUND', 'INTERNAL')),
    CONSTRAINT ck_messages_sender_type CHECK (sender_type IN ('CONTACT', 'USER', 'BOT', 'SYSTEM')),
    CONSTRAINT ck_messages_type CHECK (
        message_type IN (
            'TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION',
            'CONTACT', 'STICKER', 'REACTION', 'INTERACTIVE', 'TEMPLATE', 'SYSTEM'
        )
    ),
    CONSTRAINT ck_messages_delivery CHECK (
        delivery_status IN ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DELETED')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_objects (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    channel_account_id          BIGINT UNSIGNED NOT NULL,
    object_type                 VARCHAR(32)     NOT NULL,
    provider_object_id          VARCHAR(191)    NOT NULL,
    parent_provider_object_id   VARCHAR(191)    NULL,
    title                       VARCHAR(500)    NULL,
    body_text                   LONGTEXT        NULL,
    permalink_url               VARCHAR(2048)   NULL,
    metadata_json               JSON            NULL,
    published_at                DATETIME(3)     NULL,
    created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_social_objects_provider (tenant_id, channel_account_id, provider_object_id),
    UNIQUE KEY uq_social_objects_tenant_id (tenant_id, id),
    KEY ix_social_objects_type (tenant_id, object_type, published_at),
    CONSTRAINT fk_social_objects_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT ck_social_objects_type CHECK (
        object_type IN ('PAGE', 'PROFILE', 'POST', 'REEL', 'STORY', 'AD', 'LEAD_FORM', 'CREATIVE', 'OTHER')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_interactions (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    channel_account_id          BIGINT UNSIGNED NOT NULL,
    social_object_id            BIGINT UNSIGNED NULL,
    parent_interaction_id       BIGINT UNSIGNED NULL,
    contact_id                  BIGINT UNSIGNED NOT NULL,
    contact_identity_id         BIGINT UNSIGNED NULL,
    webhook_event_id            BIGINT UNSIGNED NULL,
    interaction_type            VARCHAR(32)     NOT NULL,
    provider_interaction_id     VARCHAR(191)    NOT NULL,
    text_body                   LONGTEXT        NULL,
    permalink_url               VARCHAR(2048)   NULL,
    status                      VARCHAR(24)     NOT NULL DEFAULT 'VISIBLE',
    metadata_json               JSON            NULL,
    occurred_at                 DATETIME(3)     NOT NULL,
    created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_social_interactions_provider (
        tenant_id, channel_account_id, provider_interaction_id
    ),
    UNIQUE KEY uq_social_interactions_event (tenant_id, webhook_event_id),
    UNIQUE KEY uq_social_interactions_tenant_id (tenant_id, id),
    KEY ix_social_interactions_contact (tenant_id, contact_id, occurred_at),
    CONSTRAINT fk_social_interactions_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT fk_social_interactions_object
        FOREIGN KEY (tenant_id, social_object_id)
        REFERENCES social_objects (tenant_id, id),
    CONSTRAINT fk_social_interactions_parent
        FOREIGN KEY (tenant_id, parent_interaction_id)
        REFERENCES social_interactions (tenant_id, id),
    CONSTRAINT fk_social_interactions_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT fk_social_interactions_identity
        FOREIGN KEY (tenant_id, contact_identity_id)
        REFERENCES contact_identities (tenant_id, id),
    CONSTRAINT fk_social_interactions_event
        FOREIGN KEY (tenant_id, webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT ck_social_interactions_type CHECK (
        interaction_type IN ('COMMENT', 'REPLY', 'MENTION', 'REACTION', 'CLICK_TO_MESSAGE', 'LEAD_FORM', 'WEB_FORM', 'OTHER')
    ),
    CONSTRAINT ck_social_interactions_status CHECK (status IN ('VISIBLE', 'HIDDEN', 'DELETED', 'SPAM'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marketing_objects (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    integration_id              BIGINT UNSIGNED NOT NULL,
    object_type                 VARCHAR(24)     NOT NULL,
    provider_object_id          VARCHAR(191)    NOT NULL,
    parent_provider_object_id   VARCHAR(191)    NULL,
    name                        VARCHAR(500)    NULL,
    status                      VARCHAR(32)     NULL,
    metadata_json               JSON            NULL,
    first_seen_at               DATETIME(3)     NOT NULL,
    last_seen_at                DATETIME(3)     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marketing_objects_provider (tenant_id, integration_id, object_type, provider_object_id),
    UNIQUE KEY uq_marketing_objects_tenant_id (tenant_id, id),
    CONSTRAINT fk_marketing_objects_integration
        FOREIGN KEY (tenant_id, integration_id)
        REFERENCES integration_connections (tenant_id, id),
    CONSTRAINT ck_marketing_objects_type CHECK (
        object_type IN ('CAMPAIGN', 'AD_SET', 'AD', 'CREATIVE', 'LEAD_FORM', 'LANDING_PAGE')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    code                    VARCHAR(64)     NOT NULL,
    name                    VARCHAR(120)    NOT NULL,
    category                VARCHAR(16)     NOT NULL DEFAULT 'OPEN',
    position                INT UNSIGNED    NOT NULL,
    sla_minutes             INT UNSIGNED    NULL,
    is_active               TINYINT(1)      NOT NULL DEFAULT 1,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_pipeline_stages_code (tenant_id, code),
    UNIQUE KEY uq_pipeline_stages_position (tenant_id, position),
    UNIQUE KEY uq_pipeline_stages_tenant_id (tenant_id, id),
    CONSTRAINT fk_pipeline_stages_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_pipeline_stages_category CHECK (category IN ('OPEN', 'WON', 'LOST'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_pools (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    name                    VARCHAR(120)    NOT NULL,
    purpose_code            VARCHAR(64)     NOT NULL DEFAULT 'NEW_LEADS',
    strategy                VARCHAR(32)     NOT NULL DEFAULT 'ROUND_ROBIN',
    is_default              TINYINT(1)      NOT NULL DEFAULT 0,
    default_slot            VARCHAR(64)
        GENERATED ALWAYS AS (
            CASE WHEN is_default = 1 THEN purpose_code ELSE NULL END
        ) STORED,
    cursor_position         INT UNSIGNED    NOT NULL DEFAULT 0,
    allocation_counter      BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    last_assigned_at        DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assignment_pools_name (tenant_id, purpose_code, name),
    UNIQUE KEY uq_assignment_pools_default (tenant_id, default_slot),
    UNIQUE KEY uq_assignment_pools_tenant_id (tenant_id, id),
    CONSTRAINT fk_assignment_pools_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_assignment_pools_strategy CHECK (strategy IN ('ROUND_ROBIN')),
    CONSTRAINT ck_assignment_pools_status CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_pool_members (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    pool_id                 BIGINT UNSIGNED NOT NULL,
    user_id                 BIGINT UNSIGNED NOT NULL,
    position                INT UNSIGNED    NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    daily_capacity          INT UNSIGNED    NULL,
    assigned_today          INT UNSIGNED    NOT NULL DEFAULT 0,
    assigned_date           DATE            NULL,
    total_assigned          BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_assigned_at        DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assignment_members_user (tenant_id, pool_id, user_id),
    UNIQUE KEY uq_assignment_members_position (tenant_id, pool_id, position),
    KEY ix_assignment_members_next (tenant_id, pool_id, status, position),
    CONSTRAINT fk_assignment_members_pool
        FOREIGN KEY (tenant_id, pool_id)
        REFERENCES assignment_pools (tenant_id, id),
    CONSTRAINT fk_assignment_members_user
        FOREIGN KEY (tenant_id, user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_assignment_members_status CHECK (status IN ('ACTIVE', 'PAUSED', 'REMOVED')),
    CONSTRAINT ck_assignment_members_capacity CHECK (daily_capacity IS NULL OR daily_capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leads (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    public_id                   CHAR(36)        NOT NULL,
    contact_id                  BIGINT UNSIGNED NOT NULL,
    stage_id                    BIGINT UNSIGNED NOT NULL,
    source_channel_account_id   BIGINT UNSIGNED NULL,
    source_webhook_event_id     BIGINT UNSIGNED NULL,
    assignment_pool_id          BIGINT UNSIGNED NULL,
    assigned_user_id            BIGINT UNSIGNED NULL,
    assignment_method           VARCHAR(32)     NOT NULL DEFAULT 'UNASSIGNED',
    source_channel              VARCHAR(40)     NOT NULL,
    source_kind                 VARCHAR(64)     NOT NULL,
    title                       VARCHAR(255)    NOT NULL,
    priority                    VARCHAR(16)     NOT NULL DEFAULT 'NORMAL',
    qualification              VARCHAR(24)     NOT NULL DEFAULT 'UNQUALIFIED',
    interest_type               VARCHAR(64)     NULL,
    budget_min                  DECIMAL(18,2)   NULL,
    budget_max                  DECIMAL(18,2)   NULL,
    currency_code               CHAR(3)         NULL,
    is_open                     TINYINT(1)      NOT NULL DEFAULT 1,
    open_slot                   TINYINT
        GENERATED ALWAYS AS (CASE WHEN is_open = 1 THEN 1 ELSE NULL END) STORED,
    first_touch_at              DATETIME(3)     NOT NULL,
    last_touch_at               DATETIME(3)     NOT NULL,
    first_assigned_at           DATETIME(3)     NULL,
    last_assigned_at            DATETIME(3)     NULL,
    next_action_at              DATETIME(3)     NULL,
    won_at                      DATETIME(3)     NULL,
    lost_at                     DATETIME(3)     NULL,
    lost_reason                 VARCHAR(500)    NULL,
    notes                       LONGTEXT        NULL,
    version                     INT UNSIGNED    NOT NULL DEFAULT 1,
    created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at                  DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_leads_public_id (public_id),
    UNIQUE KEY uq_leads_single_open_contact (tenant_id, contact_id, open_slot),
    UNIQUE KEY uq_leads_tenant_id (tenant_id, id),
    KEY ix_leads_assignee_inbox (tenant_id, assigned_user_id, is_open, priority, last_touch_at),
    KEY ix_leads_stage (tenant_id, stage_id, is_open, updated_at),
    KEY ix_leads_source (tenant_id, source_channel, source_kind, created_at),
    CONSTRAINT fk_leads_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT fk_leads_stage
        FOREIGN KEY (tenant_id, stage_id)
        REFERENCES pipeline_stages (tenant_id, id),
    CONSTRAINT fk_leads_source_channel
        FOREIGN KEY (tenant_id, source_channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT fk_leads_source_event
        FOREIGN KEY (tenant_id, source_webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT fk_leads_assignment_pool
        FOREIGN KEY (tenant_id, assignment_pool_id)
        REFERENCES assignment_pools (tenant_id, id),
    CONSTRAINT fk_leads_assigned_user
        FOREIGN KEY (tenant_id, assigned_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_leads_assignment_method CHECK (
        assignment_method IN ('UNASSIGNED', 'ROUND_ROBIN', 'MANUAL', 'REASSIGNMENT', 'IMPORT')
    ),
    CONSTRAINT ck_leads_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT ck_leads_qualification CHECK (
        qualification IN ('UNQUALIFIED', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED')
    ),
    CONSTRAINT ck_leads_budget CHECK (
        budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_assignments (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    lead_id                 BIGINT UNSIGNED NOT NULL,
    pool_id                 BIGINT UNSIGNED NULL,
    from_user_id            BIGINT UNSIGNED NULL,
    to_user_id              BIGINT UNSIGNED NULL,
    actor_user_id           BIGINT UNSIGNED NULL,
    source_webhook_event_id BIGINT UNSIGNED NULL,
    reason_code             VARCHAR(40)     NOT NULL,
    metadata_json           JSON            NULL,
    assigned_at             DATETIME(3)     NOT NULL,
    ended_at                DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_lead_assignments_history (tenant_id, lead_id, assigned_at),
    CONSTRAINT fk_lead_assignments_lead
        FOREIGN KEY (tenant_id, lead_id)
        REFERENCES leads (tenant_id, id),
    CONSTRAINT fk_lead_assignments_pool
        FOREIGN KEY (tenant_id, pool_id)
        REFERENCES assignment_pools (tenant_id, id),
    CONSTRAINT fk_lead_assignments_from_user
        FOREIGN KEY (tenant_id, from_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT fk_lead_assignments_to_user
        FOREIGN KEY (tenant_id, to_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT fk_lead_assignments_actor
        FOREIGN KEY (tenant_id, actor_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT fk_lead_assignments_event
        FOREIGN KEY (tenant_id, source_webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT ck_lead_assignments_reason CHECK (
        reason_code IN ('INITIAL_ROUND_ROBIN', 'MANUAL', 'REASSIGNMENT', 'ADVISOR_DISABLED', 'CAPACITY', 'IMPORT', 'UNASSIGNED')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_touchpoints (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    lead_id                 BIGINT UNSIGNED NOT NULL,
    contact_id              BIGINT UNSIGNED NOT NULL,
    webhook_event_id        BIGINT UNSIGNED NULL,
    conversation_id         BIGINT UNSIGNED NULL,
    message_id              BIGINT UNSIGNED NULL,
    social_interaction_id   BIGINT UNSIGNED NULL,
    dedupe_key              VARCHAR(191)    NOT NULL,
    touchpoint_type         VARCHAR(40)     NOT NULL,
    direction               VARCHAR(16)     NOT NULL DEFAULT 'INBOUND',
    summary                 VARCHAR(500)    NULL,
    metadata_json           JSON            NULL,
    occurred_at             DATETIME(3)     NOT NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_lead_touchpoints_dedupe (tenant_id, dedupe_key),
    UNIQUE KEY uq_lead_touchpoints_tenant_id (tenant_id, id),
    KEY ix_lead_touchpoints_timeline (tenant_id, lead_id, occurred_at, id),
    CONSTRAINT fk_lead_touchpoints_lead
        FOREIGN KEY (tenant_id, lead_id)
        REFERENCES leads (tenant_id, id),
    CONSTRAINT fk_lead_touchpoints_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT fk_lead_touchpoints_event
        FOREIGN KEY (tenant_id, webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT fk_lead_touchpoints_conversation
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations (tenant_id, id),
    CONSTRAINT fk_lead_touchpoints_message
        FOREIGN KEY (tenant_id, message_id)
        REFERENCES messages (tenant_id, id),
    CONSTRAINT fk_lead_touchpoints_interaction
        FOREIGN KEY (tenant_id, social_interaction_id)
        REFERENCES social_interactions (tenant_id, id),
    CONSTRAINT ck_lead_touchpoints_type CHECK (
        touchpoint_type IN (
            'DM', 'COMMENT', 'MENTION', 'REACTION', 'WHATSAPP_MESSAGE',
            'META_LEAD_AD', 'WEB_CHAT', 'WEB_FORM', 'WEB_VISIT',
            'PHONE_CALL', 'EMAIL', 'MANUAL_NOTE', 'STATUS_CHANGE'
        )
    ),
    CONSTRAINT ck_lead_touchpoints_direction CHECK (direction IN ('INBOUND', 'OUTBOUND', 'INTERNAL'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attribution_records (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    lead_id                 BIGINT UNSIGNED NOT NULL,
    touchpoint_id           BIGINT UNSIGNED NOT NULL,
    attribution_role        VARCHAR(24)     NOT NULL,
    provider                VARCHAR(32)     NULL,
    campaign_provider_id    VARCHAR(191)    NULL,
    ad_set_provider_id      VARCHAR(191)    NULL,
    ad_provider_id          VARCHAR(191)    NULL,
    creative_provider_id    VARCHAR(191)    NULL,
    lead_form_provider_id   VARCHAR(191)    NULL,
    utm_source              VARCHAR(255)    NULL,
    utm_medium              VARCHAR(255)    NULL,
    utm_campaign            VARCHAR(255)    NULL,
    utm_content             VARCHAR(255)    NULL,
    utm_term                VARCHAR(255)    NULL,
    click_id                VARCHAR(500)    NULL,
    referrer_url            VARCHAR(2048)   NULL,
    landing_url             VARCHAR(2048)   NULL,
    metadata_json           JSON            NULL,
    occurred_at             DATETIME(3)     NOT NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_attribution_lead (tenant_id, lead_id, attribution_role, occurred_at),
    KEY ix_attribution_campaign (tenant_id, provider, campaign_provider_id, occurred_at),
    CONSTRAINT fk_attribution_lead
        FOREIGN KEY (tenant_id, lead_id)
        REFERENCES leads (tenant_id, id),
    CONSTRAINT fk_attribution_touchpoint
        FOREIGN KEY (tenant_id, touchpoint_id)
        REFERENCES lead_touchpoints (tenant_id, id),
    CONSTRAINT ck_attribution_role CHECK (attribution_role IN ('FIRST_TOUCH', 'LAST_TOUCH', 'ASSISTED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chatbot_agents (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    public_id               CHAR(36)        NOT NULL,
    name                    VARCHAR(160)    NOT NULL,
    mode                    VARCHAR(24)     NOT NULL DEFAULT 'HYBRID',
    status                  VARCHAR(24)     NOT NULL DEFAULT 'DRAFT',
    model_provider          VARCHAR(64)     NULL,
    model_name              VARCHAR(120)    NULL,
    prompt_version          VARCHAR(64)     NULL,
    prompt_secret_ref       VARCHAR(500)    NULL,
    confidence_threshold    DECIMAL(5,4)    NULL,
    handoff_threshold       DECIMAL(5,4)    NULL,
    configuration_json      JSON            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_chatbot_agents_public_id (public_id),
    UNIQUE KEY uq_chatbot_agents_tenant_name (tenant_id, name),
    UNIQUE KEY uq_chatbot_agents_tenant_id (tenant_id, id),
    CONSTRAINT fk_chatbot_agents_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_chatbot_agents_mode CHECK (mode IN ('RULES', 'AI', 'HYBRID')),
    CONSTRAINT ck_chatbot_agents_status CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
    CONSTRAINT ck_chatbot_agents_thresholds CHECK (
        (confidence_threshold IS NULL OR confidence_threshold BETWEEN 0 AND 1)
        AND (handoff_threshold IS NULL OR handoff_threshold BETWEEN 0 AND 1)
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS automation_rules (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    chatbot_agent_id        BIGINT UNSIGNED NULL,
    name                    VARCHAR(160)    NOT NULL,
    trigger_type            VARCHAR(64)     NOT NULL,
    priority                INT             NOT NULL DEFAULT 100,
    version                 INT UNSIGNED    NOT NULL DEFAULT 1,
    is_active               TINYINT(1)      NOT NULL DEFAULT 1,
    channel_filter_json     JSON            NULL,
    conditions_json         JSON            NOT NULL,
    actions_json            JSON            NOT NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_automation_rules_name_version (tenant_id, name, version),
    UNIQUE KEY uq_automation_rules_tenant_id (tenant_id, id),
    KEY ix_automation_rules_trigger (tenant_id, is_active, trigger_type, priority),
    CONSTRAINT fk_automation_rules_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_automation_rules_agent
        FOREIGN KEY (tenant_id, chatbot_agent_id)
        REFERENCES chatbot_agents (tenant_id, id),
    CONSTRAINT ck_automation_rules_trigger CHECK (
        trigger_type IN (
            'ANY_INBOUND_CONTACT', 'INBOUND_MESSAGE', 'SOCIAL_COMMENT',
            'SOCIAL_MENTION', 'META_LEAD_AD', 'WEB_FORM', 'WEB_CHAT',
            'KEYWORD', 'INACTIVITY', 'MANUAL'
        )
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chatbot_sessions (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    chatbot_agent_id        BIGINT UNSIGNED NOT NULL,
    conversation_id         BIGINT UNSIGNED NOT NULL,
    lead_id                 BIGINT UNSIGNED NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    active_slot             TINYINT
        GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN 1 ELSE NULL END) STORED,
    state_json              JSON            NULL,
    handoff_user_id         BIGINT UNSIGNED NULL,
    handoff_reason          VARCHAR(500)    NULL,
    started_at              DATETIME(3)     NOT NULL,
    last_activity_at        DATETIME(3)     NOT NULL,
    ended_at                DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_chatbot_sessions_active (
        tenant_id, chatbot_agent_id, conversation_id, active_slot
    ),
    UNIQUE KEY uq_chatbot_sessions_tenant_id (tenant_id, id),
    CONSTRAINT fk_chatbot_sessions_agent
        FOREIGN KEY (tenant_id, chatbot_agent_id)
        REFERENCES chatbot_agents (tenant_id, id),
    CONSTRAINT fk_chatbot_sessions_conversation
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations (tenant_id, id),
    CONSTRAINT fk_chatbot_sessions_lead
        FOREIGN KEY (tenant_id, lead_id)
        REFERENCES leads (tenant_id, id),
    CONSTRAINT fk_chatbot_sessions_handoff_user
        FOREIGN KEY (tenant_id, handoff_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_chatbot_sessions_status CHECK (status IN ('ACTIVE', 'HANDED_OFF', 'COMPLETED', 'EXPIRED', 'FAILED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chatbot_runs (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    session_id              BIGINT UNSIGNED NOT NULL,
    webhook_event_id        BIGINT UNSIGNED NULL,
    input_message_id        BIGINT UNSIGNED NULL,
    output_message_id       BIGINT UNSIGNED NULL,
    provider_run_id         VARCHAR(191)    NULL,
    model_provider          VARCHAR(64)     NULL,
    model_name              VARCHAR(120)    NULL,
    prompt_version          VARCHAR(64)     NULL,
    detected_intent         VARCHAR(120)    NULL,
    confidence              DECIMAL(5,4)    NULL,
    decision                VARCHAR(24)     NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'STARTED',
    input_tokens            INT UNSIGNED    NULL,
    output_tokens           INT UNSIGNED    NULL,
    estimated_cost          DECIMAL(18,8)   NULL,
    currency_code           CHAR(3)         NULL,
    latency_ms              INT UNSIGNED    NULL,
    trace_json              JSON            NULL,
    error_code              VARCHAR(80)     NULL,
    error_message           TEXT            NULL,
    started_at              DATETIME(3)     NOT NULL,
    completed_at            DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_chatbot_runs_provider (tenant_id, provider_run_id),
    UNIQUE KEY uq_chatbot_runs_tenant_id (tenant_id, id),
    KEY ix_chatbot_runs_session (tenant_id, session_id, started_at),
    CONSTRAINT fk_chatbot_runs_session
        FOREIGN KEY (tenant_id, session_id)
        REFERENCES chatbot_sessions (tenant_id, id),
    CONSTRAINT fk_chatbot_runs_event
        FOREIGN KEY (tenant_id, webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT fk_chatbot_runs_input_message
        FOREIGN KEY (tenant_id, input_message_id)
        REFERENCES messages (tenant_id, id),
    CONSTRAINT fk_chatbot_runs_output_message
        FOREIGN KEY (tenant_id, output_message_id)
        REFERENCES messages (tenant_id, id),
    CONSTRAINT ck_chatbot_runs_decision CHECK (decision IN ('REPLY', 'HANDOFF', 'IGNORE', 'BLOCK', 'ASK_CLARIFICATION')),
    CONSTRAINT ck_chatbot_runs_status CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    CONSTRAINT ck_chatbot_runs_confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS automation_executions (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    rule_id                 BIGINT UNSIGNED NOT NULL,
    webhook_event_id        BIGINT UNSIGNED NULL,
    touchpoint_id           BIGINT UNSIGNED NULL,
    idempotency_key         VARCHAR(191)    NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
    attempt_count           INT UNSIGNED    NOT NULL DEFAULT 0,
    result_json             JSON            NULL,
    last_error_message      TEXT            NULL,
    started_at              DATETIME(3)     NULL,
    completed_at            DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_automation_executions_dedupe (tenant_id, idempotency_key),
    KEY ix_automation_executions_queue (status, created_at),
    CONSTRAINT fk_automation_executions_rule
        FOREIGN KEY (tenant_id, rule_id)
        REFERENCES automation_rules (tenant_id, id),
    CONSTRAINT fk_automation_executions_event
        FOREIGN KEY (tenant_id, webhook_event_id)
        REFERENCES webhook_events (tenant_id, id),
    CONSTRAINT fk_automation_executions_touchpoint
        FOREIGN KEY (tenant_id, touchpoint_id)
        REFERENCES lead_touchpoints (tenant_id, id),
    CONSTRAINT ck_automation_executions_status CHECK (
        status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RETRY', 'DEAD_LETTER')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS outbound_jobs (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    channel_account_id      BIGINT UNSIGNED NOT NULL,
    conversation_id         BIGINT UNSIGNED NULL,
    in_reply_to_message_id  BIGINT UNSIGNED NULL,
    requested_by_user_id    BIGINT UNSIGNED NULL,
    requested_by_bot_run_id BIGINT UNSIGNED NULL,
    idempotency_key         VARCHAR(191)    NOT NULL,
    job_type                VARCHAR(32)     NOT NULL DEFAULT 'SEND_MESSAGE',
    payload_json            JSON            NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
    priority                INT             NOT NULL DEFAULT 100,
    attempt_count           INT UNSIGNED    NOT NULL DEFAULT 0,
    max_attempts            INT UNSIGNED    NOT NULL DEFAULT 8,
    scheduled_at            DATETIME(3)     NOT NULL,
    locked_at               DATETIME(3)     NULL,
    locked_by               VARCHAR(120)    NULL,
    provider_message_id     VARCHAR(191)    NULL,
    last_error_code         VARCHAR(80)     NULL,
    last_error_message      TEXT            NULL,
    sent_at                 DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_outbound_jobs_dedupe (tenant_id, idempotency_key),
    KEY ix_outbound_jobs_queue (status, scheduled_at, priority),
    CONSTRAINT fk_outbound_jobs_channel
        FOREIGN KEY (tenant_id, channel_account_id)
        REFERENCES channel_accounts (tenant_id, id),
    CONSTRAINT fk_outbound_jobs_conversation
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES conversations (tenant_id, id),
    CONSTRAINT fk_outbound_jobs_reply
        FOREIGN KEY (tenant_id, in_reply_to_message_id)
        REFERENCES messages (tenant_id, id),
    CONSTRAINT fk_outbound_jobs_user
        FOREIGN KEY (tenant_id, requested_by_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT fk_outbound_jobs_bot_run
        FOREIGN KEY (tenant_id, requested_by_bot_run_id)
        REFERENCES chatbot_runs (tenant_id, id),
    CONSTRAINT ck_outbound_jobs_type CHECK (job_type IN ('SEND_MESSAGE', 'SEND_REACTION', 'HIDE_COMMENT', 'REPLY_COMMENT')),
    CONSTRAINT ck_outbound_jobs_status CHECK (
        status IN ('PENDING', 'PROCESSING', 'SENT', 'RETRY', 'FAILED', 'CANCELLED', 'DEAD_LETTER')
    ),
    CONSTRAINT ck_outbound_jobs_attempts CHECK (max_attempts > 0 AND attempt_count <= max_attempts)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS domain_outbox (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    aggregate_type          VARCHAR(80)     NOT NULL,
    aggregate_id            BIGINT UNSIGNED NOT NULL,
    event_type              VARCHAR(120)    NOT NULL,
    idempotency_key         VARCHAR(191)    NOT NULL,
    payload_json            JSON            NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
    attempt_count           INT UNSIGNED    NOT NULL DEFAULT 0,
    available_at            DATETIME(3)     NOT NULL,
    locked_at               DATETIME(3)     NULL,
    locked_by               VARCHAR(120)    NULL,
    published_at            DATETIME(3)     NULL,
    last_error_message      TEXT            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_domain_outbox_dedupe (tenant_id, idempotency_key),
    KEY ix_domain_outbox_queue (status, available_at, id),
    CONSTRAINT fk_domain_outbox_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_domain_outbox_status CHECK (
        status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'RETRY', 'DEAD_LETTER')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    actor_type              VARCHAR(24)     NOT NULL,
    actor_user_id           BIGINT UNSIGNED NULL,
    action_code             VARCHAR(120)    NOT NULL,
    entity_type             VARCHAR(80)     NOT NULL,
    entity_id               BIGINT UNSIGNED NULL,
    request_id              VARCHAR(191)    NULL,
    ip_address              VARBINARY(16)   NULL,
    user_agent              VARCHAR(1000)   NULL,
    before_json             JSON            NULL,
    after_json              JSON            NULL,
    metadata_json           JSON            NULL,
    occurred_at             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_audit_logs_entity (tenant_id, entity_type, entity_id, occurred_at),
    KEY ix_audit_logs_actor (tenant_id, actor_user_id, occurred_at),
    CONSTRAINT fk_audit_logs_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (tenant_id, actor_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_audit_logs_actor CHECK (actor_type IN ('USER', 'BOT', 'SYSTEM', 'INTEGRATION'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_subject_requests (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    contact_id              BIGINT UNSIGNED NULL,
    request_type            VARCHAR(24)     NOT NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'RECEIVED',
    provider_request_id     VARCHAR(191)    NULL,
    verification_json       JSON            NULL,
    requested_at            DATETIME(3)     NOT NULL,
    due_at                  DATETIME(3)     NULL,
    completed_at            DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_data_subject_provider_request (tenant_id, provider_request_id),
    KEY ix_data_subject_status (tenant_id, status, due_at),
    CONSTRAINT fk_data_subject_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_data_subject_contact
        FOREIGN KEY (tenant_id, contact_id)
        REFERENCES contacts (tenant_id, id),
    CONSTRAINT ck_data_subject_type CHECK (request_type IN ('ACCESS', 'DELETE', 'RECTIFY', 'OPT_OUT', 'META_DEAUTHORIZATION')),
    CONSTRAINT ck_data_subject_status CHECK (status IN ('RECEIVED', 'VERIFIED', 'PROCESSING', 'COMPLETED', 'REJECTED'))
) ENGINE=InnoDB;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_add_assignment_pool_member$$
CREATE PROCEDURE sp_add_assignment_pool_member(
    IN p_tenant_id BIGINT UNSIGNED,
    IN p_pool_id BIGINT UNSIGNED,
    IN p_user_id BIGINT UNSIGNED,
    IN p_daily_capacity INT UNSIGNED
)
SQL SECURITY INVOKER
BEGIN
    DECLARE v_position INT UNSIGNED DEFAULT 0;
    DECLARE v_pool_lock BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_user_lock BIGINT UNSIGNED DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT id
      INTO v_pool_lock
      FROM assignment_pools
     WHERE tenant_id = p_tenant_id
       AND id = p_pool_id
       AND status = 'ACTIVE'
     FOR UPDATE;

    IF v_pool_lock IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El pool no existe, no esta activo o pertenece a otro tenant';
    END IF;

    SELECT id
      INTO v_user_lock
      FROM users
     WHERE tenant_id = p_tenant_id
       AND id = p_user_id
       AND role_code IN ('SALES_ADVISOR', 'SALES_MANAGER')
       AND status = 'ACTIVE'
       AND deleted_at IS NULL
     FOR UPDATE;

    IF v_user_lock IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El asesor no existe, no esta activo o pertenece a otro tenant';
    END IF;

    SELECT COALESCE(MAX(position), 0) + 10
      INTO v_position
      FROM assignment_pool_members
     WHERE tenant_id = p_tenant_id
       AND pool_id = p_pool_id;

    INSERT INTO assignment_pool_members (
        tenant_id, pool_id, user_id, position, status, daily_capacity
    ) VALUES (
        p_tenant_id, p_pool_id, p_user_id, v_position, 'ACTIVE', p_daily_capacity
    );

    COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_create_or_get_open_lead$$
CREATE PROCEDURE sp_create_or_get_open_lead(
    IN  p_tenant_id                 BIGINT UNSIGNED,
    IN  p_contact_id                BIGINT UNSIGNED,
    IN  p_source_channel_account_id BIGINT UNSIGNED,
    IN  p_source_webhook_event_id   BIGINT UNSIGNED,
    IN  p_source_channel            VARCHAR(40),
    IN  p_source_kind               VARCHAR(64),
    IN  p_title                     VARCHAR(255),
    IN  p_priority                  VARCHAR(16),
    IN  p_occurred_at               DATETIME(3),
    OUT o_lead_id                   BIGINT UNSIGNED,
    OUT o_assigned_user_id          BIGINT UNSIGNED,
    OUT o_created                   TINYINT
)
SQL SECURITY INVOKER
BEGIN
    DECLARE v_contact_lock       BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_stage_id           BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_pool_id            BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_cursor_position    INT UNSIGNED DEFAULT 0;
    DECLARE v_next_position      INT UNSIGNED DEFAULT NULL;
    DECLARE v_user_id            BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_public_id          CHAR(36);
    DECLARE v_event_time         DATETIME(3);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET o_lead_id = NULL;
    SET o_assigned_user_id = NULL;
    SET o_created = 0;
    SET v_event_time = COALESCE(p_occurred_at, CURRENT_TIMESTAMP(3));

    START TRANSACTION;

    -- Serializa la creacion por contacto y evita dos leads abiertos concurrentes.
    SELECT id
      INTO v_contact_lock
      FROM contacts
     WHERE tenant_id = p_tenant_id
       AND id = p_contact_id
       AND deleted_at IS NULL
       AND lifecycle_status = 'ACTIVE'
     FOR UPDATE;

    IF v_contact_lock IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El contacto no existe, no esta activo o pertenece a otro tenant';
    END IF;

    SELECT MAX(id)
      INTO o_lead_id
      FROM leads
     WHERE tenant_id = p_tenant_id
       AND contact_id = p_contact_id
       AND is_open = 1
       AND deleted_at IS NULL;

    IF o_lead_id IS NOT NULL THEN
        UPDATE leads
           SET last_touch_at = GREATEST(last_touch_at, v_event_time),
               priority = CASE
                   WHEN priority = 'URGENT' THEN priority
                   WHEN p_priority = 'URGENT' THEN 'URGENT'
                   WHEN priority = 'HIGH' THEN priority
                   WHEN p_priority = 'HIGH' THEN 'HIGH'
                   ELSE priority
               END,
               version = version + 1
         WHERE tenant_id = p_tenant_id
           AND id = o_lead_id;

        SELECT assigned_user_id
          INTO o_assigned_user_id
          FROM leads
         WHERE tenant_id = p_tenant_id
           AND id = o_lead_id;
    ELSE
        SELECT MIN(id)
          INTO v_stage_id
          FROM pipeline_stages
         WHERE tenant_id = p_tenant_id
           AND category = 'OPEN'
           AND is_active = 1
           AND code = 'NEW';

        IF v_stage_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'No existe la etapa NEW activa para el tenant';
        END IF;

        SELECT MIN(id)
          INTO v_pool_id
          FROM assignment_pools
         WHERE tenant_id = p_tenant_id
           AND purpose_code = 'NEW_LEADS'
           AND is_default = 1
           AND status = 'ACTIVE';

        IF v_pool_id IS NOT NULL THEN
            SELECT cursor_position
              INTO v_cursor_position
              FROM assignment_pools
             WHERE tenant_id = p_tenant_id
               AND id = v_pool_id
             FOR UPDATE;

            -- Primero busca despues del cursor; si llego al final, vuelve al inicio.
            SELECT MIN(m.position)
              INTO v_next_position
              FROM assignment_pool_members m
              JOIN users u
                ON u.tenant_id = m.tenant_id
               AND u.id = m.user_id
             WHERE m.tenant_id = p_tenant_id
               AND m.pool_id = v_pool_id
               AND m.status = 'ACTIVE'
               AND u.status = 'ACTIVE'
               AND u.deleted_at IS NULL
               AND m.position > v_cursor_position
               AND (
                    m.daily_capacity IS NULL
                    OR m.assigned_date IS NULL
                    OR m.assigned_date < UTC_DATE()
                    OR m.assigned_today < m.daily_capacity
               )
               AND (
                    u.max_open_leads IS NULL
                    OR (
                        SELECT COUNT(*)
                          FROM leads l
                         WHERE l.tenant_id = p_tenant_id
                           AND l.assigned_user_id = u.id
                           AND l.is_open = 1
                           AND l.deleted_at IS NULL
                    ) < u.max_open_leads
               );

            IF v_next_position IS NULL THEN
                SELECT MIN(m.position)
                  INTO v_next_position
                  FROM assignment_pool_members m
                  JOIN users u
                    ON u.tenant_id = m.tenant_id
                   AND u.id = m.user_id
                 WHERE m.tenant_id = p_tenant_id
                   AND m.pool_id = v_pool_id
                   AND m.status = 'ACTIVE'
                   AND u.status = 'ACTIVE'
                   AND u.deleted_at IS NULL
                   AND (
                        m.daily_capacity IS NULL
                        OR m.assigned_date IS NULL
                        OR m.assigned_date < UTC_DATE()
                        OR m.assigned_today < m.daily_capacity
                   )
                   AND (
                        u.max_open_leads IS NULL
                        OR (
                            SELECT COUNT(*)
                              FROM leads l
                             WHERE l.tenant_id = p_tenant_id
                               AND l.assigned_user_id = u.id
                               AND l.is_open = 1
                               AND l.deleted_at IS NULL
                        ) < u.max_open_leads
                   );
            END IF;

            IF v_next_position IS NOT NULL THEN
                SELECT MAX(user_id)
                  INTO v_user_id
                  FROM assignment_pool_members
                 WHERE tenant_id = p_tenant_id
                   AND pool_id = v_pool_id
                   AND position = v_next_position
                   AND status = 'ACTIVE';
            END IF;
        END IF;

        SET v_public_id = UUID();

        INSERT INTO leads (
            tenant_id,
            public_id,
            contact_id,
            stage_id,
            source_channel_account_id,
            source_webhook_event_id,
            assignment_pool_id,
            assigned_user_id,
            assignment_method,
            source_channel,
            source_kind,
            title,
            priority,
            first_touch_at,
            last_touch_at,
            first_assigned_at,
            last_assigned_at
        ) VALUES (
            p_tenant_id,
            v_public_id,
            p_contact_id,
            v_stage_id,
            p_source_channel_account_id,
            p_source_webhook_event_id,
            v_pool_id,
            v_user_id,
            CASE WHEN v_user_id IS NULL THEN 'UNASSIGNED' ELSE 'ROUND_ROBIN' END,
            p_source_channel,
            p_source_kind,
            COALESCE(NULLIF(TRIM(p_title), ''), 'Nuevo contacto comercial'),
            COALESCE(p_priority, 'NORMAL'),
            v_event_time,
            v_event_time,
            CASE WHEN v_user_id IS NULL THEN NULL ELSE v_event_time END,
            CASE WHEN v_user_id IS NULL THEN NULL ELSE v_event_time END
        );

        SET o_lead_id = LAST_INSERT_ID();
        SET o_assigned_user_id = v_user_id;
        SET o_created = 1;

        IF v_user_id IS NOT NULL THEN
            UPDATE assignment_pools
               SET cursor_position = v_next_position,
                   allocation_counter = allocation_counter + 1,
                   last_assigned_at = v_event_time
             WHERE tenant_id = p_tenant_id
               AND id = v_pool_id;

            UPDATE assignment_pool_members
               SET assigned_today = CASE
                       WHEN assigned_date = UTC_DATE() THEN assigned_today + 1
                       ELSE 1
                   END,
                   assigned_date = UTC_DATE(),
                   total_assigned = total_assigned + 1,
                   last_assigned_at = v_event_time
             WHERE tenant_id = p_tenant_id
               AND pool_id = v_pool_id
               AND user_id = v_user_id;

            INSERT INTO lead_assignments (
                tenant_id, lead_id, pool_id, to_user_id,
                source_webhook_event_id, reason_code, assigned_at
            ) VALUES (
                p_tenant_id, o_lead_id, v_pool_id, v_user_id,
                p_source_webhook_event_id, 'INITIAL_ROUND_ROBIN', v_event_time
            );
        ELSE
            INSERT INTO lead_assignments (
                tenant_id, lead_id, pool_id, source_webhook_event_id,
                reason_code, assigned_at, metadata_json
            ) VALUES (
                p_tenant_id, o_lead_id, v_pool_id, p_source_webhook_event_id,
                'UNASSIGNED', v_event_time,
                JSON_OBJECT('reason', 'NO_ELIGIBLE_ACTIVE_ADVISOR')
            );
        END IF;

        INSERT INTO domain_outbox (
            tenant_id,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            available_at
        ) VALUES (
            p_tenant_id,
            'LEAD',
            o_lead_id,
            CASE WHEN v_user_id IS NULL THEN 'LEAD_CREATED_UNASSIGNED' ELSE 'LEAD_CREATED_ASSIGNED' END,
            CONCAT('lead-created:', o_lead_id),
            JSON_OBJECT(
                'lead_id', o_lead_id,
                'contact_id', p_contact_id,
                'assigned_user_id', v_user_id,
                'source_channel', p_source_channel,
                'source_kind', p_source_kind
            ),
            CURRENT_TIMESTAMP(3)
        );
    END IF;

    COMMIT;
END$$

DELIMITER ;

CREATE OR REPLACE VIEW v_advisor_distribution AS
SELECT
    m.tenant_id,
    m.pool_id,
    p.name AS pool_name,
    m.user_id,
    u.display_name,
    m.position,
    m.status AS membership_status,
    u.status AS user_status,
    m.daily_capacity,
    CASE WHEN m.assigned_date = UTC_DATE() THEN m.assigned_today ELSE 0 END AS assigned_today,
    m.total_assigned,
    m.last_assigned_at,
    SUM(CASE WHEN l.is_open = 1 AND l.deleted_at IS NULL THEN 1 ELSE 0 END) AS open_leads
FROM assignment_pool_members m
JOIN assignment_pools p
  ON p.tenant_id = m.tenant_id
 AND p.id = m.pool_id
JOIN users u
  ON u.tenant_id = m.tenant_id
 AND u.id = m.user_id
LEFT JOIN leads l
  ON l.tenant_id = m.tenant_id
 AND l.assigned_user_id = m.user_id
GROUP BY
    m.tenant_id, m.pool_id, p.name, m.user_id, u.display_name,
    m.position, m.status, u.status, m.daily_capacity,
    m.assigned_date, m.assigned_today, m.total_assigned, m.last_assigned_at;

CREATE OR REPLACE VIEW v_lead_inbox AS
SELECT
    l.tenant_id,
    l.id AS lead_id,
    l.public_id AS lead_public_id,
    l.title,
    l.priority,
    l.qualification,
    l.source_channel,
    l.source_kind,
    l.is_open,
    l.first_touch_at,
    l.last_touch_at,
    l.next_action_at,
    c.id AS contact_id,
    c.public_id AS contact_public_id,
    COALESCE(
        c.display_name,
        NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''),
        c.phone_e164,
        c.email
    ) AS contact_name,
    c.phone_e164,
    c.email,
    s.code AS stage_code,
    s.name AS stage_name,
    u.id AS assigned_user_id,
    u.display_name AS assigned_user_name
FROM leads l
JOIN contacts c
  ON c.tenant_id = l.tenant_id
 AND c.id = l.contact_id
JOIN pipeline_stages s
  ON s.tenant_id = l.tenant_id
 AND s.id = l.stage_id
LEFT JOIN users u
  ON u.tenant_id = l.tenant_id
 AND u.id = l.assigned_user_id
WHERE l.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_webhook_health AS
SELECT
    tenant_id,
    integration_id,
    provider,
    processing_status,
    COUNT(*) AS receipt_count,
    MIN(received_at) AS oldest_received_at,
    MAX(received_at) AS newest_received_at,
    SUM(CASE WHEN signature_valid = 1 THEN 1 ELSE 0 END) AS valid_signatures,
    SUM(CASE WHEN processing_status IN ('RETRY', 'DEAD_LETTER', 'REJECTED') THEN 1 ELSE 0 END) AS failed_receipts
FROM webhook_receipts
GROUP BY tenant_id, integration_id, provider, processing_status;

-- -----------------------------------------------------------------------------
-- 002 - DOMINIO INMOBILIARIO EVERPROP ENTERPRISE
-- Agrega proyectos, activos, medios, atributos, intereses, visitas y alcances
-- de inventario. Todas las relaciones de negocio incluyen tenant_id para
-- impedir referencias cruzadas entre empresas.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    public_id               CHAR(36)        NOT NULL,
    code                    VARCHAR(80)     NULL,
    name                    VARCHAR(200)    NOT NULL,
    project_type            VARCHAR(32)     NOT NULL,
    status                  VARCHAR(32)     NOT NULL DEFAULT 'PLANNING',
    progress                TINYINT UNSIGNED NOT NULL DEFAULT 0,
    total_units             INT UNSIGNED    NOT NULL DEFAULT 0,
    city                    VARCHAR(160)    NOT NULL,
    province                VARCHAR(160)    NOT NULL,
    address                 VARCHAR(500)    NULL,
    description             LONGTEXT        NULL,
    masterplan_image_url    VARCHAR(2048)   NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at              DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_projects_public_id (public_id),
    UNIQUE KEY uq_projects_tenant_id (tenant_id, id),
    UNIQUE KEY uq_projects_tenant_code (tenant_id, code),
    KEY ix_projects_catalog (tenant_id, status, project_type, city, deleted_at),
    CONSTRAINT fk_projects_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT ck_projects_type CHECK (
        project_type IN ('LAND_DEVELOPMENT', 'BUILDING', 'COMMERCIAL')
    ),
    CONSTRAINT ck_projects_status CHECK (
        status IN ('PLANNING', 'PRE_SALE', 'UNDER_CONSTRUCTION', 'COMPLETED')
    ),
    CONSTRAINT ck_projects_progress CHECK (progress <= 100)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS properties (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    project_id                  BIGINT UNSIGNED NULL,
    public_id                   CHAR(36)        NOT NULL,
    code                        VARCHAR(80)     NULL,
    title                       VARCHAR(255)    NOT NULL,
    operation                   VARCHAR(24)     NOT NULL,
    category                    VARCHAR(24)     NOT NULL,
    status                      VARCHAR(24)     NOT NULL DEFAULT 'AVAILABLE',
    price                       DECIMAL(18,2)   NULL,
    currency_code               CHAR(3)         NULL,
    city                        VARCHAR(160)    NOT NULL,
    province                    VARCHAR(160)    NOT NULL,
    neighborhood                VARCHAR(160)    NULL,
    address                     VARCHAR(500)    NULL,
    bedrooms                    SMALLINT UNSIGNED NULL,
    bathrooms                   SMALLINT UNSIGNED NULL,
    area_m2                     DECIMAL(12,2)   NULL,
    sector_name                 VARCHAR(160)    NULL,
    unit_number                 VARCHAR(80)     NULL,
    description                 LONGTEXT        NULL,
    main_image_url              VARCHAR(2048)   NULL,
    services_json               JSON            NULL,
    commercial_features_json    JSON            NULL,
    version                     INT UNSIGNED    NOT NULL DEFAULT 1,
    created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at                  DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_properties_public_id (public_id),
    UNIQUE KEY uq_properties_tenant_id (tenant_id, id),
    UNIQUE KEY uq_properties_tenant_code (tenant_id, code),
    KEY ix_properties_asset_picker (
        tenant_id, status, category, project_id, sector_name, unit_number
    ),
    KEY ix_properties_title_search (tenant_id, title),
    KEY ix_properties_sector_search (tenant_id, sector_name),
    KEY ix_properties_unit_search (tenant_id, unit_number),
    KEY ix_properties_project_status (tenant_id, project_id, status, category),
    KEY ix_properties_location (tenant_id, city, neighborhood, status),
    FULLTEXT KEY ft_properties_asset_picker (title, sector_name, unit_number),
    CONSTRAINT fk_properties_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_properties_project
        FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id),
    CONSTRAINT ck_properties_operation CHECK (
        operation IN ('SALE', 'RENT', 'TEMPORARY')
    ),
    CONSTRAINT ck_properties_category CHECK (
        category IN ('LOT', 'GARAGE', 'LOCAL', 'TRADITIONAL', 'APARTMENT', 'HOUSE')
    ),
    CONSTRAINT ck_properties_status CHECK (
        status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'RENTED')
    ),
    CONSTRAINT ck_properties_price CHECK (price IS NULL OR price >= 0),
    CONSTRAINT ck_properties_price_currency CHECK (
        (price IS NULL AND currency_code IS NULL)
        OR (price IS NOT NULL AND currency_code IN ('USD', 'ARS'))
    ),
    CONSTRAINT ck_properties_area CHECK (area_m2 IS NULL OR area_m2 > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS property_media (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    property_id             BIGINT UNSIGNED NOT NULL,
    media_type              VARCHAR(24)     NOT NULL DEFAULT 'IMAGE',
    url                     VARCHAR(2048)   NOT NULL,
    thumbnail_url           VARCHAR(2048)   NULL,
    alt_text                VARCHAR(500)    NULL,
    caption                 VARCHAR(1000)   NULL,
    sort_order              INT UNSIGNED    NOT NULL DEFAULT 0,
    is_primary              TINYINT(1)      NOT NULL DEFAULT 0,
    primary_slot            TINYINT
        GENERATED ALWAYS AS (CASE WHEN is_primary = 1 THEN 1 ELSE NULL END) STORED,
    metadata_json           JSON            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_property_media_tenant_id (tenant_id, id),
    UNIQUE KEY uq_property_media_primary (tenant_id, property_id, primary_slot),
    KEY ix_property_media_gallery (tenant_id, property_id, sort_order, id),
    CONSTRAINT fk_property_media_property
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES properties (tenant_id, id),
    CONSTRAINT ck_property_media_type CHECK (
        media_type IN ('IMAGE', 'VIDEO', 'FLOORPLAN', 'DOCUMENT', 'VIRTUAL_TOUR')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS property_features (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    property_id             BIGINT UNSIGNED NOT NULL,
    feature_group           VARCHAR(40)     NOT NULL,
    feature_code            VARCHAR(80)     NOT NULL,
    label                   VARCHAR(160)    NOT NULL,
    feature_value           JSON            NOT NULL,
    unit_code               VARCHAR(24)     NULL,
    is_filterable           TINYINT(1)      NOT NULL DEFAULT 1,
    sort_order              INT UNSIGNED    NOT NULL DEFAULT 0,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_property_features_code (tenant_id, property_id, feature_code),
    UNIQUE KEY uq_property_features_tenant_id (tenant_id, id),
    KEY ix_property_features_filter (tenant_id, feature_code, is_filterable),
    CONSTRAINT fk_property_features_property
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES properties (tenant_id, id),
    CONSTRAINT ck_property_features_group CHECK (
        feature_group IN ('SERVICE', 'AMENITY', 'COMMERCIAL', 'STRUCTURAL', 'OTHER')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_inventory_settings (
    tenant_id               BIGINT UNSIGNED NOT NULL,
    user_id                 BIGINT UNSIGNED NOT NULL,
    workspace_mode          VARCHAR(24)     NOT NULL DEFAULT 'BROKERAGE',
    visibility_mode         VARCHAR(16)     NOT NULL DEFAULT 'SCOPED',
    can_view_prices         TINYINT(1)      NOT NULL DEFAULT 1,
    can_manage_inventory    TINYINT(1)      NOT NULL DEFAULT 0,
    can_manage_prices       TINYINT(1)      NOT NULL DEFAULT 0,
    settings_json           JSON            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (tenant_id, user_id),
    KEY ix_user_inventory_settings_mode (tenant_id, workspace_mode, visibility_mode),
    CONSTRAINT fk_user_inventory_settings_user
        FOREIGN KEY (tenant_id, user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_user_inventory_workspace CHECK (
        workspace_mode IN ('DEVELOPER', 'BROKERAGE', 'BOTH')
    ),
    CONSTRAINT ck_user_inventory_visibility CHECK (
        visibility_mode IN ('ALL', 'SCOPED', 'NONE')
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_inventory_scopes (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    user_id                 BIGINT UNSIGNED NOT NULL,
    scope_type              VARCHAR(24)     NOT NULL,
    project_id              BIGINT UNSIGNED NULL,
    property_id             BIGINT UNSIGNED NULL,
    category_code           VARCHAR(24)     NULL,
    scope_key               VARCHAR(64)
        GENERATED ALWAYS AS (
            CASE scope_type
                WHEN 'PROJECT' THEN CONCAT('PROJECT:', project_id)
                WHEN 'PROPERTY' THEN CONCAT('PROPERTY:', property_id)
                WHEN 'CATEGORY' THEN CONCAT('CATEGORY:', category_code)
                ELSE NULL
            END
        ) STORED,
    can_view                TINYINT(1)      NOT NULL DEFAULT 1,
    can_edit                TINYINT(1)      NOT NULL DEFAULT 0,
    can_manage_prices       TINYINT(1)      NOT NULL DEFAULT 0,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_inventory_scopes_scope (tenant_id, user_id, scope_key),
    UNIQUE KEY uq_user_inventory_scopes_tenant_id (tenant_id, id),
    KEY ix_user_inventory_scopes_project (tenant_id, user_id, project_id),
    KEY ix_user_inventory_scopes_property (tenant_id, user_id, property_id),
    KEY ix_user_inventory_scopes_category (tenant_id, user_id, category_code),
    CONSTRAINT fk_user_inventory_scopes_user
        FOREIGN KEY (tenant_id, user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT fk_user_inventory_scopes_project
        FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id),
    CONSTRAINT fk_user_inventory_scopes_property
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES properties (tenant_id, id),
    CONSTRAINT ck_user_inventory_scopes_type CHECK (
        (scope_type = 'PROJECT' AND project_id IS NOT NULL
            AND property_id IS NULL AND category_code IS NULL)
        OR (scope_type = 'PROPERTY' AND property_id IS NOT NULL
            AND project_id IS NULL AND category_code IS NULL)
        OR (scope_type = 'CATEGORY' AND category_code IS NOT NULL
            AND project_id IS NULL AND property_id IS NULL)
    ),
    CONSTRAINT ck_user_inventory_scopes_category CHECK (
        category_code IS NULL
        OR category_code IN ('LOT', 'GARAGE', 'LOCAL', 'TRADITIONAL', 'APARTMENT', 'HOUSE')
    ),
    CONSTRAINT ck_user_inventory_scopes_permissions CHECK (
        can_view = 1 OR (can_edit = 0 AND can_manage_prices = 0)
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_properties (
    tenant_id               BIGINT UNSIGNED NOT NULL,
    lead_id                 BIGINT UNSIGNED NOT NULL,
    property_id             BIGINT UNSIGNED NOT NULL,
    linked_by_user_id       BIGINT UNSIGNED NULL,
    interest_level          VARCHAR(16)     NOT NULL DEFAULT 'MEDIUM',
    status                  VARCHAR(24)     NOT NULL DEFAULT 'ACTIVE',
    quoted_price            DECIMAL(18,2)   NULL,
    quoted_currency_code    CHAR(3)         NULL,
    linked_at               DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_activity_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    notes                   LONGTEXT        NULL,
    metadata_json           JSON            NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (tenant_id, lead_id, property_id),
    KEY ix_lead_properties_property (tenant_id, property_id, status, interest_level),
    KEY ix_lead_properties_lead (tenant_id, lead_id, status, last_activity_at),
    CONSTRAINT fk_lead_properties_lead
        FOREIGN KEY (tenant_id, lead_id)
        REFERENCES leads (tenant_id, id),
    CONSTRAINT fk_lead_properties_property
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES properties (tenant_id, id),
    CONSTRAINT fk_lead_properties_user
        FOREIGN KEY (tenant_id, linked_by_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_lead_properties_interest CHECK (
        interest_level IN ('LOW', 'MEDIUM', 'HIGH', 'HOT')
    ),
    CONSTRAINT ck_lead_properties_status CHECK (
        status IN ('ACTIVE', 'VISIT_SCHEDULED', 'NEGOTIATING', 'DISCARDED', 'CONVERTED')
    ),
    CONSTRAINT ck_lead_properties_quote CHECK (
        (quoted_price IS NULL AND quoted_currency_code IS NULL)
        OR (quoted_price >= 0 AND quoted_currency_code IN ('USD', 'ARS'))
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visits (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    public_id               CHAR(36)        NOT NULL,
    lead_id                 BIGINT UNSIGNED NULL,
    property_id             BIGINT UNSIGNED NULL,
    assigned_user_id        BIGINT UNSIGNED NULL,
    created_by_user_id      BIGINT UNSIGNED NULL,
    visit_type              VARCHAR(16)     NOT NULL DEFAULT 'PHYSICAL',
    scheduled_at            DATETIME(3)     NOT NULL,
    scheduled_end_at        DATETIME(3)     NULL,
    status                  VARCHAR(24)     NOT NULL DEFAULT 'SCHEDULED',
    notes                   LONGTEXT        NULL,
    outcome                 LONGTEXT        NULL,
    completed_at            DATETIME(3)     NULL,
    cancelled_at            DATETIME(3)     NULL,
    created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_visits_public_id (public_id),
    UNIQUE KEY uq_visits_tenant_id (tenant_id, id),
    KEY ix_visits_agenda (tenant_id, assigned_user_id, status, scheduled_at),
    KEY ix_visits_lead_timeline (tenant_id, lead_id, scheduled_at),
    KEY ix_visits_property_timeline (tenant_id, property_id, scheduled_at),
    CONSTRAINT fk_visits_lead
        FOREIGN KEY (tenant_id, lead_id)
        REFERENCES leads (tenant_id, id),
    CONSTRAINT fk_visits_property
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES properties (tenant_id, id),
    CONSTRAINT fk_visits_assigned_user
        FOREIGN KEY (tenant_id, assigned_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT fk_visits_created_by_user
        FOREIGN KEY (tenant_id, created_by_user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT ck_visits_type CHECK (visit_type IN ('PHYSICAL', 'VIRTUAL')),
    CONSTRAINT ck_visits_status CHECK (
        status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')
    ),
    CONSTRAINT ck_visits_schedule CHECK (
        scheduled_end_at IS NULL OR scheduled_end_at > scheduled_at
    )
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- SEED BELLOMO
-- Los dos asesores son placeholders seguros. Reemplazar display_name/email y
-- conectar auth_subject antes de produccion. El algoritmo admite N asesores.
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO tenants (
    public_id, name, slug, timezone, status, settings_json
) VALUES (
    'b1100000-0000-4000-8000-000000000001',
    'Bellomo',
    'bellomo',
    'America/Argentina/Salta',
    'ACTIVE',
    JSON_OBJECT('product', 'EverProp', 'country', 'AR')
);

SET @bellomo_tenant_id := (
    SELECT id FROM tenants WHERE slug = 'bellomo' LIMIT 1
);

INSERT IGNORE INTO users (
    tenant_id, public_id, display_name, email, role_code, status
) VALUES
(
    @bellomo_tenant_id,
    'b1100000-0000-4000-8000-000000000101',
    'Asesor Comercial 1',
    'asesor1@bellomo.invalid',
    'SALES_ADVISOR',
    'ACTIVE'
),
(
    @bellomo_tenant_id,
    'b1100000-0000-4000-8000-000000000102',
    'Asesor Comercial 2',
    'asesor2@bellomo.invalid',
    'SALES_ADVISOR',
    'ACTIVE'
);

INSERT IGNORE INTO pipeline_stages (
    tenant_id, code, name, category, position, sla_minutes, is_active
) VALUES
(@bellomo_tenant_id, 'NEW',             'Nuevo',                 'OPEN', 10,  15, 1),
(@bellomo_tenant_id, 'CONTACTED',       'Contactado',            'OPEN', 20, 120, 1),
(@bellomo_tenant_id, 'QUALIFIED',       'Calificado',            'OPEN', 30, NULL, 1),
(@bellomo_tenant_id, 'VISIT_SCHEDULED', 'Visita agendada',       'OPEN', 40, NULL, 1),
(@bellomo_tenant_id, 'NEGOTIATION',     'Negociacion',           'OPEN', 50, NULL, 1),
(@bellomo_tenant_id, 'WON',             'Ganado',                 'WON',  60, NULL, 1),
(@bellomo_tenant_id, 'LOST',            'Perdido',                'LOST', 70, NULL, 1);

INSERT IGNORE INTO assignment_pools (
    tenant_id, name, purpose_code, strategy, is_default, status
) VALUES (
    @bellomo_tenant_id,
    'Equipo comercial Bellomo',
    'NEW_LEADS',
    'ROUND_ROBIN',
    1,
    'ACTIVE'
);

SET @bellomo_pool_id := (
    SELECT id
      FROM assignment_pools
     WHERE tenant_id = @bellomo_tenant_id
       AND purpose_code = 'NEW_LEADS'
       AND is_default = 1
     LIMIT 1
);

SET @bellomo_advisor_1 := (
    SELECT id
      FROM users
     WHERE tenant_id = @bellomo_tenant_id
       AND public_id = 'b1100000-0000-4000-8000-000000000101'
     LIMIT 1
);

SET @bellomo_advisor_2 := (
    SELECT id
      FROM users
     WHERE tenant_id = @bellomo_tenant_id
       AND public_id = 'b1100000-0000-4000-8000-000000000102'
     LIMIT 1
);

INSERT IGNORE INTO user_inventory_settings (
    tenant_id,
    user_id,
    workspace_mode,
    visibility_mode,
    can_view_prices,
    can_manage_inventory,
    can_manage_prices
) VALUES
(
    @bellomo_tenant_id,
    @bellomo_advisor_1,
    'BROKERAGE',
    'ALL',
    1,
    0,
    0
),
(
    @bellomo_tenant_id,
    @bellomo_advisor_2,
    'BROKERAGE',
    'ALL',
    1,
    0,
    0
);

INSERT IGNORE INTO assignment_pool_members (
    tenant_id, pool_id, user_id, position, status
) VALUES
(@bellomo_tenant_id, @bellomo_pool_id, @bellomo_advisor_1, 10, 'ACTIVE'),
(@bellomo_tenant_id, @bellomo_pool_id, @bellomo_advisor_2, 20, 'ACTIVE');

INSERT IGNORE INTO integration_connections (
    tenant_id, public_id, provider, name, status, settings_json
) VALUES
(
    @bellomo_tenant_id,
    'b1100000-0000-4000-8000-000000000201',
    'META',
    'Meta Bellomo',
    'PENDING',
    JSON_OBJECT(
        'expected_channels', JSON_ARRAY(
            'WHATSAPP', 'INSTAGRAM_DM', 'INSTAGRAM_COMMENT',
            'FACEBOOK_MESSENGER', 'FACEBOOK_COMMENT', 'META_LEAD_AD'
        ),
        'signature_header', 'X-Hub-Signature-256'
    )
),
(
    @bellomo_tenant_id,
    'b1100000-0000-4000-8000-000000000202',
    'WEB',
    'Web Bellomo',
    'PENDING',
    JSON_OBJECT(
        'expected_channels', JSON_ARRAY('WEB_CHAT', 'WEB_FORM', 'WEB_TRACKING')
    )
);

INSERT IGNORE INTO chatbot_agents (
    tenant_id,
    public_id,
    name,
    mode,
    status,
    confidence_threshold,
    handoff_threshold,
    configuration_json
) VALUES (
    @bellomo_tenant_id,
    'b1100000-0000-4000-8000-000000000301',
    'Asistente Bellomo',
    'HYBRID',
    'DRAFT',
    0.7500,
    0.4500,
    JSON_OBJECT(
        'language', 'es-AR',
        'timezone', 'America/Argentina/Salta',
        'human_handoff_on', JSON_ARRAY(
            'request_human', 'low_confidence', 'legal_question',
            'payment_issue', 'complaint', 'high_purchase_intent'
        )
    )
);

SET @bellomo_bot_id := (
    SELECT id
      FROM chatbot_agents
     WHERE tenant_id = @bellomo_tenant_id
       AND name = 'Asistente Bellomo'
     LIMIT 1
);

INSERT IGNORE INTO automation_rules (
    tenant_id,
    chatbot_agent_id,
    name,
    trigger_type,
    priority,
    version,
    is_active,
    channel_filter_json,
    conditions_json,
    actions_json
) VALUES (
    @bellomo_tenant_id,
    @bellomo_bot_id,
    'Capturar cualquier contacto entrante',
    'ANY_INBOUND_CONTACT',
    10,
    1,
    1,
    JSON_ARRAY(
        'WHATSAPP', 'INSTAGRAM_DM', 'INSTAGRAM_COMMENT',
        'FACEBOOK_MESSENGER', 'FACEBOOK_COMMENT', 'META_LEAD_AD',
        'WEB_CHAT', 'WEB_FORM', 'WEB_TRACKING'
    ),
    JSON_OBJECT('minimum_contact', true, 'ignore_own_events', true),
    JSON_ARRAY(
        JSON_OBJECT('type', 'UPSERT_CONTACT'),
        JSON_OBJECT('type', 'CREATE_OR_GET_OPEN_LEAD'),
        JSON_OBJECT('type', 'ASSIGN_ROUND_ROBIN'),
        JSON_OBJECT('type', 'CREATE_TOUCHPOINT'),
        JSON_OBJECT('type', 'EVALUATE_CHATBOT')
    )
);

INSERT IGNORE INTO schema_versions (version, description)
VALUES (
    '2026-08-06.001',
    'Bellomo omnichannel CRM, Meta/web webhooks, chatbot and transactional round-robin'
);

INSERT IGNORE INTO schema_versions (version, description)
VALUES (
    '2026-08-06.002',
    'EverProp real-estate projects, properties, visits and tenant-safe inventory scopes'
);

-- -----------------------------------------------------------------------------
-- PRUEBA MANUAL DEL ROUND-ROBIN (ejecutar solo en una base QA descartable)
-- -----------------------------------------------------------------------------
-- INSERT INTO contacts (
--     tenant_id, public_id, display_name, lifecycle_status, first_seen_at, last_seen_at
-- ) VALUES (
--     @bellomo_tenant_id, UUID(), 'Contacto QA 1', 'ACTIVE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
-- );
-- SET @qa_contact_1 := LAST_INSERT_ID();
-- CALL sp_create_or_get_open_lead(
--     @bellomo_tenant_id, @qa_contact_1, NULL, NULL,
--     'WEB_FORM', 'WEB_FORM', 'Consulta QA 1', 'NORMAL', UTC_TIMESTAMP(3),
--     @lead_1, @advisor_1, @created_1
-- );
-- SELECT @lead_1, @advisor_1, @created_1;
-- SELECT * FROM v_advisor_distribution WHERE tenant_id = @bellomo_tenant_id;
-- Nota: sp_create_or_get_open_lead controla y confirma su propia transaccion.
-- No anidar esta prueba dentro de START TRANSACTION esperando poder hacer ROLLBACK.

SET SESSION sql_mode = @OLD_SQL_MODE;

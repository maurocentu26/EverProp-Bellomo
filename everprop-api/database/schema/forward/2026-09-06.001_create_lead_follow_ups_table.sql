-- Forward schema migration: Create lead_follow_ups table
-- Engine: MySQL 8.0+

CREATE TABLE IF NOT EXISTS `lead_follow_ups` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `public_id` CHAR(36) NOT NULL,
    `lead_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `result` TEXT NOT NULL,
    `next_action` VARCHAR(500) NULL,
    `next_contact_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_lead_follow_ups_public_id` (`public_id`),
    KEY `ix_lead_follow_ups_lead` (`tenant_id`, `lead_id`, `occurred_at`),
    KEY `ix_lead_follow_ups_user` (`tenant_id`, `user_id`, `occurred_at`),
    CONSTRAINT `fk_lead_follow_ups_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_lead_follow_ups_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_lead_follow_ups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

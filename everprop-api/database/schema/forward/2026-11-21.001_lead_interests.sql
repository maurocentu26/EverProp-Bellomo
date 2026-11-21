-- EVP-178: a lead can hold 1..N interest sheets (operation, project, prototype, payment plan, co-holders)
-- without a physical unit. lead_properties stays as the unit link read by visits, statistics and collections;
-- the API keeps it in sync for interests that name a property_id.
SET SESSION lock_wait_timeout = 10;
CREATE TABLE IF NOT EXISTS lead_interests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(36) NOT NULL,
 tenant_id BIGINT UNSIGNED NOT NULL,
 lead_id BIGINT UNSIGNED NOT NULL,
 project_id BIGINT UNSIGNED NULL,
 property_id BIGINT UNSIGNED NULL,
 operation VARCHAR(24) NOT NULL,
 category VARCHAR(24) NULL,
 prototype_label VARCHAR(160) NULL,
 how_heard VARCHAR(120) NULL,
 first_contact_at DATETIME(3) NULL,
 first_contact_channel VARCHAR(64) NULL,
 payment_method VARCHAR(120) NULL,
 installments_count SMALLINT UNSIGNED NULL,
 interest_level VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
 status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
 quoted_price DECIMAL(18,2) NULL,
 quoted_currency_code CHAR(3) NULL,
 preferences TEXT NULL,
 notes LONGTEXT NULL,
 participants_json JSON NULL,
 metadata_json JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 deleted_at DATETIME(3) NULL,
 UNIQUE KEY uq_lead_interests_public_id (public_id),
 UNIQUE KEY uq_lead_interests_tenant_id (tenant_id, id),
 KEY ix_lead_interests_lead (tenant_id, lead_id, deleted_at),
 KEY ix_lead_interests_project (tenant_id, project_id),
 KEY ix_lead_interests_property (tenant_id, property_id),
 CONSTRAINT fk_lead_interests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_lead_interests_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id),
 CONSTRAINT fk_lead_interests_project FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
 CONSTRAINT fk_lead_interests_property FOREIGN KEY (tenant_id, property_id) REFERENCES properties(tenant_id, id),
 CONSTRAINT ck_lead_interests_operation CHECK (operation IN ('SALE', 'RENT', 'TEMPORARY', 'LEASING', 'UNKNOWN')),
 CONSTRAINT ck_lead_interests_category CHECK (
  category IS NULL OR category IN ('LOT', 'GARAGE', 'LOCAL', 'TRADITIONAL', 'APARTMENT', 'HOUSE', 'UNKNOWN')
 ),
 CONSTRAINT ck_lead_interests_interest CHECK (interest_level IN ('LOW', 'MEDIUM', 'HIGH', 'HOT')),
 CONSTRAINT ck_lead_interests_status CHECK (
  status IN ('ACTIVE', 'VISIT_SCHEDULED', 'NEGOTIATING', 'DISCARDED', 'CONVERTED')
 ),
 CONSTRAINT ck_lead_interests_quote CHECK (
  (quoted_price IS NULL AND quoted_currency_code IS NULL)
  OR (quoted_price >= 0 AND quoted_currency_code IN ('USD', 'ARS'))
 ),
 CONSTRAINT ck_lead_interests_participants CHECK (participants_json IS NULL OR JSON_TYPE(participants_json) = 'ARRAY')
) ENGINE=InnoDB;
-- Backfill: one interest per existing unit link. NOT EXISTS (soft-deleted rows included) makes a rerun a no-op
-- and never resurrects an interest a user already removed.
INSERT INTO lead_interests (
 public_id, tenant_id, lead_id, project_id, property_id, operation, category, interest_level, status,
 quoted_price, quoted_currency_code, notes, metadata_json, created_at, updated_at
)
SELECT UUID(), lp.tenant_id, lp.lead_id, p.project_id, lp.property_id, p.operation, p.category, lp.interest_level, lp.status,
 lp.quoted_price, lp.quoted_currency_code, lp.notes, JSON_OBJECT('backfilled_from', 'lead_properties'), lp.linked_at, lp.updated_at
FROM lead_properties lp
JOIN properties p ON p.tenant_id = lp.tenant_id AND p.id = lp.property_id
WHERE NOT EXISTS (
 SELECT 1 FROM lead_interests li
 WHERE li.tenant_id = lp.tenant_id AND li.lead_id = lp.lead_id AND li.property_id = lp.property_id
);
INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-11-21.001', 'Lead interests 1..N with optional unit and co-holders');

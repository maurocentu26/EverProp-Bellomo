-- Email delivery audit only; financial ledger and baseline remain unchanged.
CREATE TABLE IF NOT EXISTS collection_email_attempts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 installment_id BIGINT UNSIGNED NOT NULL,
 business_date DATE NOT NULL,
 status VARCHAR(16) NOT NULL,
 recipient VARCHAR(320) NOT NULL,
 sender VARCHAR(320) NOT NULL,
 remaining_amount DECIMAL(18,2) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 sent_at DATETIME(3) NULL,
 UNIQUE KEY uq_collection_email_day (tenant_id,installment_id,business_date),
 FOREIGN KEY (tenant_id,installment_id) REFERENCES installments(tenant_id,id),
 CHECK (status IN ('SENDING','SENT','UNKNOWN')),
 CHECK (remaining_amount > 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_versions(version,description)
VALUES ('2026-10-07.001','Audited, operator-triggered collection emails');

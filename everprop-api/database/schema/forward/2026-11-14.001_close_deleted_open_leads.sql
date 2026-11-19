-- EVP-124: data-only fix, no DDL. Before the fix, deleting a lead only set deleted_at and left is_open = 1,
-- so its open_slot kept holding uq_leads_single_open_contact and sp_create_or_get_open_lead failed with 1062
-- when the same contact came back. Closes those leads and cancels the upcoming visits that the agenda hides
-- for deleted leads (past ones are left as they are). Every change is audited first. Re-runnable: each
-- statement only touches rows that are still in the broken state. Scans leads without an index on deleted_at:
-- run it in a low-traffic window.
-- Fail fast instead of queueing behind long transactions or metadata locks.
SET SESSION innodb_lock_wait_timeout = 5;
SET SESSION lock_wait_timeout = 10;
-- One cut-off for the audit and the update; visits are stored in UTC.
SET @evp124_now = UTC_TIMESTAMP(3);

START TRANSACTION;

INSERT INTO audit_logs (tenant_id, actor_type, action_code, entity_type, entity_id, before_json, after_json, metadata_json)
SELECT l.tenant_id, 'SYSTEM', 'LEAD_CLOSED_AFTER_DELETE', 'LEAD', l.id,
       JSON_OBJECT('is_open', TRUE), JSON_OBJECT('is_open', FALSE),
       JSON_OBJECT('forward', '2026-11-14.001', 'ticket', 'EVP-124')
  FROM leads l
 WHERE l.deleted_at IS NOT NULL
   AND l.is_open = 1;

INSERT INTO audit_logs (tenant_id, actor_type, action_code, entity_type, entity_id, before_json, after_json, metadata_json)
SELECT v.tenant_id, 'SYSTEM', 'VISIT_CANCELLED_AFTER_LEAD_DELETE', 'VISIT', v.id,
       JSON_OBJECT('status', v.status, 'outcome', v.outcome), JSON_OBJECT('status', 'CANCELLED'),
       JSON_OBJECT('forward', '2026-11-14.001', 'ticket', 'EVP-124', 'lead_id', v.lead_id)
  FROM visits v
  JOIN leads l ON l.tenant_id = v.tenant_id AND l.id = v.lead_id
 WHERE l.deleted_at IS NOT NULL
   AND v.status = 'SCHEDULED'
   AND v.scheduled_at >= @evp124_now;

UPDATE visits v
  JOIN leads l ON l.tenant_id = v.tenant_id AND l.id = v.lead_id
   SET v.status = 'CANCELLED',
       v.cancelled_at = @evp124_now,
       v.outcome = COALESCE(v.outcome, 'Cancelada: se eliminó el lead.')
 WHERE l.deleted_at IS NOT NULL
   AND v.status = 'SCHEDULED'
   AND v.scheduled_at >= @evp124_now;

UPDATE leads
   SET is_open = 0
 WHERE deleted_at IS NOT NULL
   AND is_open = 1;

COMMIT;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-11-14.001', 'Close deleted leads that still held the open slot and cancel their upcoming visits');

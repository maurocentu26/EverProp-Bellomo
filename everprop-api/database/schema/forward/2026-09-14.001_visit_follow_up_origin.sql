-- Additive extension; preserves the immutable baseline and appointment history.
ALTER TABLE visits
    ADD COLUMN follow_up_id BIGINT UNSIGNED NULL,
    ADD COLUMN guest_name VARCHAR(160) NULL,
    ADD COLUMN guest_phone VARCHAR(40) NULL,
    ADD COLUMN guest_email VARCHAR(160) NULL,
    ADD UNIQUE KEY uq_visits_follow_up (follow_up_id),
    ADD CONSTRAINT fk_visits_follow_up FOREIGN KEY (follow_up_id) REFERENCES lead_follow_ups(id);

-- Only attach legacy auto-created appointments with one exact matching origin.
UPDATE visits v
JOIN (
    SELECT v2.id AS visit_id, MIN(f.id) AS follow_up_id
    FROM visits v2 JOIN lead_follow_ups f
      ON f.tenant_id = v2.tenant_id AND f.lead_id = v2.lead_id
      AND f.user_id = v2.assigned_user_id AND f.next_contact_at = v2.scheduled_at
      AND f.created_at = v2.created_at AND f.type <> 'note'
    GROUP BY v2.id HAVING COUNT(*) = 1
) origin ON origin.visit_id = v.id
SET v.follow_up_id = origin.follow_up_id;

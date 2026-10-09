DROP PROCEDURE IF EXISTS sp_create_or_get_open_lead;
DELIMITER $$
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
    DECLARE v_historical_user_id BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_assignment_method  VARCHAR(32) DEFAULT 'UNASSIGNED';
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

        SELECT l.assigned_user_id
          INTO v_historical_user_id
          FROM leads l
          JOIN users u ON u.id = l.assigned_user_id
         WHERE l.tenant_id = p_tenant_id
           AND l.contact_id = p_contact_id
           AND l.assigned_user_id IS NOT NULL
           AND l.deleted_at IS NULL
           AND u.status = 'ACTIVE'
           AND u.deleted_at IS NULL
         ORDER BY l.created_at DESC
         LIMIT 1;

        IF v_historical_user_id IS NOT NULL THEN
            SET v_user_id = v_historical_user_id;
            SET v_assignment_method = 'MANUAL';
        ELSE
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

            IF v_user_id IS NOT NULL THEN
                SET v_assignment_method = 'ROUND_ROBIN';
            ELSE
                SET v_assignment_method = 'UNASSIGNED';
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
            v_assignment_method,
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
            IF v_assignment_method = 'ROUND_ROBIN' THEN
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
            END IF;

            INSERT INTO lead_assignments (
                tenant_id, lead_id, pool_id, to_user_id,
                source_webhook_event_id, reason_code, assigned_at
            ) VALUES (
                p_tenant_id, o_lead_id, v_pool_id, v_user_id,
                p_source_webhook_event_id, CASE WHEN v_assignment_method = 'ROUND_ROBIN' THEN 'INITIAL_ROUND_ROBIN' ELSE 'MANUAL' END, v_event_time
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







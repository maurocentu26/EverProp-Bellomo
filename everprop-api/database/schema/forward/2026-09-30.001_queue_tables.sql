-- Laravel database queue (QUEUE_CONNECTION=database) for the assistant turns and outbound sends,
-- so production can run a worker without Redis. Global infrastructure tables (no tenant data:
-- payloads carry only tenant/conversation ids). Expand-only and re-runnable.

CREATE TABLE IF NOT EXISTS jobs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    queue         VARCHAR(191)    NOT NULL,
    payload       LONGTEXT        NOT NULL,
    attempts      TINYINT UNSIGNED NOT NULL,
    reserved_at   INT UNSIGNED    NULL,
    available_at  INT UNSIGNED    NOT NULL,
    created_at    INT UNSIGNED    NOT NULL,
    PRIMARY KEY (id),
    KEY jobs_queue_index (queue)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS failed_jobs (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid        VARCHAR(191)    NOT NULL,
    connection  TEXT            NOT NULL,
    queue       TEXT            NOT NULL,
    payload     LONGTEXT        NOT NULL,
    exception   LONGTEXT        NOT NULL,
    failed_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY failed_jobs_uuid_unique (uuid)
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-09-30.001', 'Database queue tables (jobs, failed_jobs)');

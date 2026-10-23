ALTER TABLE service_requests ADD COLUMN request_count integer NOT NULL DEFAULT 1;
ALTER TABLE service_requests ADD COLUMN pending_count integer NOT NULL DEFAULT 1;
UPDATE service_requests SET pending_count = 0 WHERE status = 'done';
CREATE TABLE service_request_events (
 store_id text NOT NULL DEFAULT 'main',
 request_id text NOT NULL,
 attempt_id text NOT NULL,
 session_id text NOT NULL,
 kind text NOT NULL,
 note text NOT NULL,
 created_at integer NOT NULL,
 PRIMARY KEY (store_id, request_id)
);
CREATE INDEX service_request_events_visit ON service_request_events(store_id,session_id,kind,created_at);

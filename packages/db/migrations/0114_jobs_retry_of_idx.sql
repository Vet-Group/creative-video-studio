-- The job tray polls GET /api/jobs?mine, which asks for each of its rows whether a job retries it (and POST /api/jobs asks the same under the caps lock
-- on a retry). Without an index on retry_of each poll read every job; few jobs are retries, so the index holds only those rows. A plain CREATE INDEX
-- blocks writes to jobs while it builds (the migrator runs in a transaction, so not CONCURRENTLY); SET LOCAL bounds the wait for the table's lock, as in 0106.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE INDEX "jobs_retry_of_idx" ON "jobs" USING btree ("retry_of") WHERE "jobs"."retry_of" is not null;
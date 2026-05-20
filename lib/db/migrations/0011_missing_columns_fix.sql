-- Migration 0011: Add missing columns that existed in ORM schema but were absent from DB
-- Fixes: portal user registration (rpm_limit), analytics/usage endpoint, logs viewer columns

-- api_keys: rpm_limit (per-key rate limit override)
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rpm_limit" integer;

-- usage_logs: request/response body logging + endpoint + status_code (Logs Viewer feature)
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "request_body" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "response_body" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "endpoint" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "status_code" integer;

CREATE TABLE "plans" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "monthly_credits" double precision DEFAULT 0 NOT NULL,
        "rpm" integer DEFAULT 60 NOT NULL,
        "rpd" integer DEFAULT 0 NOT NULL,
        "max_api_keys" integer DEFAULT 3 NOT NULL,
        "models_allowed" text[] DEFAULT ARRAY[]::text[] NOT NULL,
        "price_usd" double precision DEFAULT 0 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "email" text NOT NULL,
        "password_hash" text,
        "google_id" text,
        "github_id" text,
        "name" text NOT NULL,
        "role" text DEFAULT 'developer' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "credit_balance" double precision DEFAULT 0 NOT NULL,
        "topup_credit_balance" double precision DEFAULT 0 NOT NULL,
        "email_verified" boolean DEFAULT false NOT NULL,
        "email_verification_token" text,
        "email_verification_token_expires_at" timestamp with time zone,
        "password_reset_token" text,
        "password_reset_token_expires_at" timestamp with time zone,
        "credit_warning_email_sent_at" timestamp with time zone,
        "current_plan_id" integer,
        "guardrail_violations" integer DEFAULT 0 NOT NULL,
        "guardrail_suspended" boolean DEFAULT false NOT NULL,
        "totp_secret" text,
        "totp_enabled" boolean DEFAULT false NOT NULL,
        "daily_spend_limit_usd" double precision,
        "monthly_spend_limit_usd" double precision,
        "spend_alert_threshold" double precision DEFAULT 0.8 NOT NULL,
        "spend_alert_email_sent_at" timestamp with time zone,
        "referral_code" varchar(16),
        "referred_by" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email"),
        CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
        CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
        CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "plan_id" integer,
        "organization_id" integer,
        "key_prefix" text NOT NULL,
        "key_hash" text NOT NULL,
        "key_encrypted" text,
        "name" text,
        "credit_balance" double precision DEFAULT 0 NOT NULL,
        "monthly_spend_limit_usd" double precision,
        "is_active" boolean DEFAULT true NOT NULL,
        "last_used_at" timestamp with time zone,
        "revoked_at" timestamp with time zone,
        "expires_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "usage_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "api_key_id" integer,
        "organization_id" integer,
        "model" text NOT NULL,
        "input_tokens" integer DEFAULT 0 NOT NULL,
        "output_tokens" integer DEFAULT 0 NOT NULL,
        "total_tokens" integer DEFAULT 0 NOT NULL,
        "cost_usd" double precision DEFAULT 0 NOT NULL,
        "request_id" text NOT NULL,
        "job_operation_id" text,
        "status" text DEFAULT 'success' NOT NULL,
        "error_message" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "project_id" text NOT NULL,
        "location" text DEFAULT 'us-central1' NOT NULL,
        "credentials_encrypted" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "priority" integer DEFAULT 100 NOT NULL,
        "circuit_open_until" timestamp with time zone,
        "consecutive_failures" integer DEFAULT 0 NOT NULL,
        "last_error" text,
        "last_failure_at" timestamp with time zone,
        "last_success_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "providers_priority_idx" ON "providers" USING btree ("priority");--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
        "user_id" integer PRIMARY KEY NOT NULL,
        "tokens" double precision NOT NULL,
        "last_refill_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_costs" (
        "model" text PRIMARY KEY NOT NULL,
        "input_per_1m" double precision DEFAULT 0 NOT NULL,
        "output_per_1m" double precision DEFAULT 0 NOT NULL,
        "per_image" double precision,
        "per_second" double precision,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_rate_limits" (
        "key" text PRIMARY KEY NOT NULL,
        "count" integer DEFAULT 1 NOT NULL,
        "reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "action" text NOT NULL,
        "actor_id" integer,
        "actor_email" text,
        "target_id" integer,
        "target_email" text,
        "details" text,
        "ip" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_code_uses" (
        "id" serial PRIMARY KEY NOT NULL,
        "promo_code_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "promo_code_uses_unique" UNIQUE("promo_code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
        "id" serial PRIMARY KEY NOT NULL,
        "code" text NOT NULL,
        "credits_amount" double precision NOT NULL,
        "max_uses" integer DEFAULT 1 NOT NULL,
        "used_count" integer DEFAULT 0 NOT NULL,
        "expires_at" timestamp with time zone,
        "is_active" boolean DEFAULT true NOT NULL,
        "note" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "violation_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "api_key_id" integer,
        "request_id" text NOT NULL,
        "model" text NOT NULL,
        "violation_category" text NOT NULL,
        "violation_number" integer NOT NULL,
        "message_content" text NOT NULL,
        "ip_address" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "name" text NOT NULL,
        "url" text NOT NULL,
        "secret" text NOT NULL,
        "events" text[] DEFAULT '{}' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "last_triggered_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_current_plan_id_plans_id_fk" FOREIGN KEY ("current_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_logs" ADD CONSTRAINT "violation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_logs" ADD CONSTRAINT "violation_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_is_active_idx" ON "plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "plans_name_idx" ON "plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_email_verification_token_idx" ON "users" USING btree ("email_verification_token");--> statement-breakpoint
CREATE INDEX "users_password_reset_token_idx" ON "users" USING btree ("password_reset_token");--> statement-breakpoint
CREATE INDEX "users_referred_by_idx" ON "users" USING btree ("referred_by");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_is_active_idx" ON "api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "api_keys_plan_id_idx" ON "api_keys" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "api_keys_org_id_idx" ON "api_keys" ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_logs_api_key_id_idx" ON "usage_logs" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "usage_logs_created_at_idx" ON "usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_logs_api_key_created_idx" ON "usage_logs" USING btree ("api_key_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_logs_status_idx" ON "usage_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_logs_model_idx" ON "usage_logs" USING btree ("model");--> statement-breakpoint
CREATE INDEX "usage_logs_org_id_idx" ON "usage_logs" ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_logs_org_created_idx" ON "usage_logs" ("organization_id", "created_at");--> statement-breakpoint
CREATE INDEX "usage_logs_request_id_idx" ON "usage_logs" ("request_id");--> statement-breakpoint
CREATE INDEX "providers_is_active_idx" ON "providers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "promo_code_uses_user_idx" ON "promo_code_uses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "promo_codes_code_idx" ON "promo_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_codes_is_active_idx" ON "promo_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "violation_logs_user_id_idx" ON "violation_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "violation_logs_created_at_idx" ON "violation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "violation_logs_category_idx" ON "violation_logs" USING btree ("violation_category");--> statement-breakpoint
CREATE INDEX "webhooks_user_id_idx" ON "webhooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webhooks_is_active_idx" ON "webhooks" USING btree ("is_active");--> statement-breakpoint
CREATE TABLE "system_settings" (
        "key" text PRIMARY KEY NOT NULL,
        "value" text,
        "encrypted" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_type" text NOT NULL,
        "page" text NOT NULL,
        "element" text,
        "value" smallint,
        "ip_hash" text,
        "device" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "page_events_created_at_idx" ON "page_events" ("created_at");--> statement-breakpoint
CREATE INDEX "page_events_event_type_idx" ON "page_events" ("event_type");--> statement-breakpoint
CREATE INDEX "page_events_element_idx" ON "page_events" ("element");--> statement-breakpoint
CREATE TABLE "page_visits" (
        "id" serial PRIMARY KEY NOT NULL,
        "page" text NOT NULL,
        "referrer" text,
        "ip_hash" text,
        "ip" text,
        "device" text,
        "language" text,
        "screen_width" smallint,
        "visited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "page_visits_visited_at_idx" ON "page_visits" ("visited_at");--> statement-breakpoint
CREATE INDEX "page_visits_page_idx" ON "page_visits" ("page");--> statement-breakpoint
CREATE INDEX "page_visits_ip_hash_idx" ON "page_visits" ("ip_hash");--> statement-breakpoint
CREATE INDEX "page_visits_device_idx" ON "page_visits" ("device");--> statement-breakpoint
CREATE TABLE "rate_limit_buckets_v2" (
        "user_id" integer NOT NULL,
        "endpoint_group" varchar(32) DEFAULT 'all' NOT NULL,
        "tokens" double precision NOT NULL,
        "last_refill_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "rate_limit_buckets_v2_pkey" PRIMARY KEY ("user_id", "endpoint_group")
);
--> statement-breakpoint
CREATE TABLE "spaceremit_payment_intents" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "spaceremit_payment_id" text,
        "amount_usd" numeric(18, 8) NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "mode" text DEFAULT 'test' NOT NULL,
        "status_tag" text,
        "metadata" text,
        "verified_at" timestamp with time zone,
        "credited_at" timestamp with time zone,
        "failure_reason" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spaceremit_payment_intents" ADD CONSTRAINT "spaceremit_payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spaceremit_payment_intents_user_id_idx" ON "spaceremit_payment_intents" ("user_id");--> statement-breakpoint
CREATE INDEX "spaceremit_payment_intents_status_idx" ON "spaceremit_payment_intents" ("status");--> statement-breakpoint
CREATE INDEX "spaceremit_payment_intents_created_at_idx" ON "spaceremit_payment_intents" ("created_at");--> statement-breakpoint
CREATE INDEX "spaceremit_payment_intents_payment_id_idx" ON "spaceremit_payment_intents" ("spaceremit_payment_id");--> statement-breakpoint
CREATE TABLE "spaceremit_callback_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "payment_id" text NOT NULL,
        "status_tag" text,
        "payload" text NOT NULL,
        "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "spaceremit_callback_events_payment_id_uidx" ON "spaceremit_callback_events" ("payment_id");--> statement-breakpoint
CREATE INDEX "spaceremit_callback_events_processed_at_idx" ON "spaceremit_callback_events" ("processed_at");

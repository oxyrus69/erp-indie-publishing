CREATE TYPE "public"."binding_type" AS ENUM('PERFECT_BINDING', 'SPIRAL', 'HARDCOVER', 'STAPLE');--> statement-breakpoint
CREATE TYPE "public"."book_size" AS ENUM('A5', 'B5', 'UNESCO', 'A4', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."cover_stage" AS ENUM('BRIEF_SUBMITTED', 'DRAFTING_COVER', 'AUTHOR_REVIEW', 'COVER_APPROVED');--> statement-breakpoint
CREATE TYPE "public"."editorial_stage" AS ENUM('MANUSCRIPT_SUBMITTED', 'EDITING', 'PROOFREADING', 'LAYOUTING', 'AUTHOR_REVIEW', 'LAYOUT_APPROVED');--> statement-breakpoint
CREATE TYPE "public"."fee_structure" AS ENUM('FLAT_FEE', 'PER_PAGE_RATE');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('MANUSCRIPT', 'COVER_DRAFT', 'COVER_FINAL', 'COVER_PREVIEW', 'LAYOUT_PDF', 'LAYOUT_PREVIEW', 'ISBN_BARCODE', 'LEGAL_DOC', 'CATALOG_THUMB');--> statement-breakpoint
CREATE TYPE "public"."freelancer_specialty" AS ENUM('EDITOR', 'PROOFREADER', 'LAYOUTER', 'COVER_DESIGNER');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('DOWN_PAYMENT', 'FINAL_SETTLEMENT', 'EXTRA_REVISION', 'ADDON_SERVICE', 'PRINT_ADDON');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'UNPAID', 'PAID', 'VOID', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."lamination_type" AS ENUM('NONE', 'DOFF', 'GLOSSY');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('TASK_COMMISSION', 'REVISION_BONUS', 'ROYALTY', 'WITHDRAWAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('PENDING', 'AVAILABLE', 'WITHDRAWN', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."legal_stage" AS ENUM('PENDING_FILES', 'SUBMITTED_TO_PERPUSNAS', 'ISBN_ISSUED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'AWAITING_DOWN_PAYMENT', 'IN_PRODUCTION', 'AWAITING_FINAL_SETTLEMENT', 'READY_FOR_RELEASE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."paper_type" AS ENUM('BOOKPAPER', 'HVS', 'ART_PAPER');--> statement-breakpoint
CREATE TYPE "public"."print_stage" AS ENUM('PRINT_QUEUE', 'PRINTING', 'QUALITY_CONTROL', 'SHIPPED_TO_AUTHOR', 'ADDED_TO_WAREHOUSE');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('INITIATED', 'IN_PRODUCTION', 'AWAITING_AUTHOR', 'READY_FOR_PRINT', 'IN_PRINTING', 'PUBLISHED', 'COMPLETED', 'ON_HOLD', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."sales_channel" AS ENUM('DIRECT_WEB', 'MARKETPLACE', 'RESELLER', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."storage_provider" AS ENUM('SUPABASE', 'CLOUDINARY');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'IN_PROGRESS', 'WAITING_AUTHOR_REVIEW', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."track_type" AS ENUM('EDITORIAL', 'LAYOUT', 'COVER', 'LEGAL', 'PRINT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'PROJECT_MANAGER', 'FREELANCER', 'FINANCE', 'AUTHOR');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('FREELANCER', 'ROYALTY');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TABLE "book_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"title" varchar(240) NOT NULL,
	"subtitle" varchar(240),
	"author_name" varchar(160) NOT NULL,
	"author_bio" text,
	"language" varchar(16) DEFAULT 'id' NOT NULL,
	"synopsis" text,
	"genre" varchar(80),
	"status" "project_status" DEFAULT 'INITIATED' NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"paper_type" "paper_type" DEFAULT 'BOOKPAPER' NOT NULL,
	"book_size" "book_size" DEFAULT 'A5' NOT NULL,
	"binding" "binding_type" DEFAULT 'PERFECT_BINDING' NOT NULL,
	"lamination" "lamination_type" DEFAULT 'DOFF' NOT NULL,
	"is_full_color" boolean DEFAULT false NOT NULL,
	"editorial_stage" "editorial_stage" DEFAULT 'MANUSCRIPT_SUBMITTED' NOT NULL,
	"cover_stage" "cover_stage" DEFAULT 'BRIEF_SUBMITTED' NOT NULL,
	"legal_stage" "legal_stage" DEFAULT 'PENDING_FILES' NOT NULL,
	"isbn" varchar(32),
	"kdt_number" varchar(64),
	"catalog_data" jsonb,
	"isbn_issued_at" timestamp with time zone,
	"print_stage" "print_stage",
	"layout_approved_at" timestamp with time zone,
	"cover_approved_at" timestamp with time zone,
	"high_res_unlocked" boolean DEFAULT false NOT NULL,
	"manager_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_projects_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "book_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_number" varchar(32) NOT NULL,
	"project_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"channel" "sales_channel" NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"gross_amount" numeric(14, 2) NOT NULL,
	"unit_production_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"royalty_pct" numeric(5, 2) DEFAULT '10' NOT NULL,
	"net_royalty" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reference" varchar(120),
	"recorded_by" uuid,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_sales_sale_number_unique" UNIQUE("sale_number")
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"key" varchar(48) PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" "file_kind" NOT NULL,
	"storage_provider" "storage_provider" NOT NULL,
	"bucket" varchar(64),
	"storage_path" text,
	"cloudinary_public_id" text,
	"cloudinary_resource_type" varchar(16) DEFAULT 'image',
	"cloudinary_format" varchar(16),
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(128),
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"requires_full_payment" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freelancer_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"task_id" uuid,
	"entry_type" "ledger_entry_type" DEFAULT 'TASK_COMMISSION' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "ledger_status" DEFAULT 'AVAILABLE' NOT NULL,
	"description" text,
	"idempotency_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freelancer_ledgers_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sold_total" integer DEFAULT 0 NOT NULL,
	"avg_production_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"retail_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"warehouse_location" varchar(120),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" varchar(48) DEFAULT 'TRANSFER' NOT NULL,
	"reference" varchar(120),
	"verified_by" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"status" "invoice_status" DEFAULT 'UNPAID' NOT NULL,
	"milestone_pct" numeric(5, 2),
	"amount" numeric(14, 2) NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"production_task_id" uuid,
	"description" text,
	"due_date" date,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"service_id" uuid,
	"label" varchar(200) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"author_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"book_title" varchar(240),
	"book_subtitle" varchar(240),
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"down_payment_pct" numeric(5, 2) DEFAULT '50' NOT NULL,
	"author_royalty_pct" numeric(5, 2) DEFAULT '10' NOT NULL,
	"max_cover_revisions" integer DEFAULT 2 NOT NULL,
	"max_layout_revisions" integer DEFAULT 2 NOT NULL,
	"is_fully_paid" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "package_services" (
	"package_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "package_services_package_id_service_id_pk" PRIMARY KEY("package_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"name" varchar(160) NOT NULL,
	"tagline" text,
	"description" text,
	"base_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"free_author_copies" integer DEFAULT 0 NOT NULL,
	"max_cover_revisions" integer DEFAULT 2 NOT NULL,
	"max_layout_revisions" integer DEFAULT 2 NOT NULL,
	"author_royalty_pct" numeric(5, 2) DEFAULT '10' NOT NULL,
	"down_payment_pct" numeric(5, 2) DEFAULT '50' NOT NULL,
	"includes_isbn" boolean DEFAULT true NOT NULL,
	"includes_layout" boolean DEFAULT true NOT NULL,
	"includes_cover" boolean DEFAULT true NOT NULL,
	"includes_editing" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "print_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"cost_per_unit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"paper_type" "paper_type" NOT NULL,
	"book_size" "book_size" NOT NULL,
	"binding" "binding_type" NOT NULL,
	"lamination" "lamination_type" NOT NULL,
	"stage" "print_stage" DEFAULT 'PRINT_QUEUE' NOT NULL,
	"author_copies" integer DEFAULT 0 NOT NULL,
	"warehouse_copies" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track" "track_type" NOT NULL,
	"stage" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'PENDING' NOT NULL,
	"assignee_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone,
	"fee_structure" "fee_structure" DEFAULT 'FLAT_FEE' NOT NULL,
	"flat_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"per_page_rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"payout_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_commission_credited" boolean DEFAULT false NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"max_revisions" integer DEFAULT 2 NOT NULL,
	"extra_revision_fee" numeric(14, 2) DEFAULT '150000' NOT NULL,
	"is_unlocked" boolean DEFAULT true NOT NULL,
	"deadline" date,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"role" "user_role" DEFAULT 'AUTHOR' NOT NULL,
	"specialty" "freelancer_specialty",
	"phone" varchar(32),
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"requested_by" uuid NOT NULL,
	"notes" text NOT NULL,
	"is_chargeable" boolean DEFAULT false NOT NULL,
	"fee_invoice_id" uuid,
	"status" varchar(24) DEFAULT 'REQUESTED' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "royalty_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"project_id" uuid,
	"sale_id" uuid,
	"entry_type" "ledger_entry_type" DEFAULT 'ROYALTY' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "ledger_status" DEFAULT 'AVAILABLE' NOT NULL,
	"description" text,
	"idempotency_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "royalty_ledgers_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unit" varchar(32) DEFAULT 'paket' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet" "wallet_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "withdrawal_status" DEFAULT 'REQUESTED' NOT NULL,
	"bank_name" varchar(80),
	"bank_account_name" varchar(120),
	"bank_account_number" varchar(40),
	"processed_by" uuid,
	"processed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_projects" ADD CONSTRAINT "book_projects_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_projects" ADD CONSTRAINT "book_projects_manager_id_profiles_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freelancer_ledgers" ADD CONSTRAINT "freelancer_ledgers_freelancer_id_profiles_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freelancer_ledgers" ADD CONSTRAINT "freelancer_ledgers_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_runs" ADD CONSTRAINT "print_runs_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_fee_invoice_id_invoices_id_fk" FOREIGN KEY ("fee_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledgers" ADD CONSTRAINT "royalty_ledgers_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledgers" ADD CONSTRAINT "royalty_ledgers_project_id_book_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."book_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledgers" ADD CONSTRAINT "royalty_ledgers_sale_id_book_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."book_sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_processed_by_profiles_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "book_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_manager_idx" ON "book_projects" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "sales_project_idx" ON "book_sales" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sales_channel_idx" ON "book_sales" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "files_project_idx" ON "file_assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "files_kind_idx" ON "file_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "freelancer_ledger_freelancer_idx" ON "freelancer_ledgers" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "inventory_project_idx" ON "inventory" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_author_idx" ON "orders" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "production_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "production_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "production_tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_uq" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "revisions_task_idx" ON "revisions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "royalty_ledger_author_idx" ON "royalty_ledgers" USING btree ("author_id");
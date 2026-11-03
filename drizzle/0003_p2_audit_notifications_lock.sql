-- 0003_p2_audit_notifications_lock.sql
-- P2: jejak aktivitas, komentar task, pusat notifikasi, dan penjaga konkurensi.
-- Idempoten: aman dijalankan berulang kali.

/* -------------------------------------------------------------------------- */
/*                            JEJAK AKTIVITAS                                 */
/* -------------------------------------------------------------------------- */

create table if not exists public.audit_logs (
	id uuid primary key default gen_random_uuid(),
	actor_id uuid references public.profiles (id) on delete set null,
	actor_name varchar(160) not null,
	actor_role varchar(32) not null,
	action varchar(64) not null,
	entity_type varchar(32) not null,
	entity_id uuid,
	summary text not null,
	changes jsonb,
	context jsonb,
	request_id varchar(64),
	created_at timestamptz not null default now()
);

create index if not exists audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_created_idx on public.audit_logs (created_at);
create index if not exists audit_actor_idx on public.audit_logs (actor_id);

/* -------------------------------------------------------------------------- */
/*                             KOMENTAR TASK                                  */
/* -------------------------------------------------------------------------- */

create table if not exists public.task_comments (
	id uuid primary key default gen_random_uuid(),
	task_id uuid not null references public.production_tasks (id) on delete cascade,
	project_id uuid not null references public.book_projects (id) on delete cascade,
	author_id uuid references public.profiles (id) on delete set null,
	author_name varchar(160) not null,
	author_role varchar(32) not null,
	body text not null,
	is_internal boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists comments_task_idx on public.task_comments (task_id, created_at);

/* -------------------------------------------------------------------------- */
/*                            PUSAT NOTIFIKASI                                */
/* -------------------------------------------------------------------------- */

create table if not exists public.notifications (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles (id) on delete cascade,
	dedupe_key varchar(200) not null,
	category varchar(32) not null,
	severity varchar(16) not null default 'info',
	title varchar(200) not null,
	body text,
	href text,
	entity_type varchar(32),
	entity_id uuid,
	read_at timestamptz,
	created_at timestamptz not null default now()
);

create unique index if not exists notifications_user_dedupe_uq
	on public.notifications (user_id, dedupe_key);
create index if not exists notifications_user_read_idx
	on public.notifications (user_id, read_at);

/* -------------------------------------------------------------------------- */
/*                      PENJAGA KONKURENSI (OPTIMISTIC LOCK)                  */
/* -------------------------------------------------------------------------- */

-- Baris yang sudah ada diberi versi 1 supaya form lama tetap valid.
alter table public.book_projects
	add column if not exists version integer not null default 1;

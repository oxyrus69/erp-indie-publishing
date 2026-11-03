-- 0005_crm_foundation.sql
-- P4/CRM-1: prospek, pipeline, tugas, aktivitas, tag, template, log outreach.
-- Idempoten: aman dijalankan berulang kali.

create extension if not exists "pgcrypto";

do $$
begin
	if not exists (select 1 from pg_type where typname = 'lead_stage') then
		create type public.lead_stage as enum ('PROSPEK','KONTAK','PROPOSAL','NEGOSIASI','MENANG','KALAH');
	end if;
	if not exists (select 1 from pg_type where typname = 'lead_source') then
		create type public.lead_source as enum ('REFERRAL','SOCIAL_MEDIA','EVENT','WEBSITE','PUBLISHER','OTHER');
	end if;
	if not exists (select 1 from pg_type where typname = 'lead_activity_kind') then
		create type public.lead_activity_kind as enum ('CALL','WHATSAPP','EMAIL','MEETING','NOTE');
	end if;
	if not exists (select 1 from pg_type where typname = 'outreach_channel') then
		create type public.outreach_channel as enum ('WHATSAPP','EMAIL');
	end if;
end $$;

create table if not exists public.leads (
	id uuid primary key default gen_random_uuid(),
	full_name varchar(160) not null,
	email varchar(320),
	phone varchar(32),
	book_title varchar(240),
	genre varchar(80),
	estimated_value numeric(14,2) not null default '0',
	stage public.lead_stage not null default 'PROSPEK',
	source public.lead_source not null default 'OTHER',
	owner_id uuid references public.profiles (id) on delete set null,
	notes text,
	/* Terisi saat lead dikonversi menjadi akun penulis; rantai identitas tetap satu baris. */
	author_id uuid references public.profiles (id) on delete set null,
	order_id uuid references public.orders (id) on delete set null,
	converted_at timestamptz,
	lost_reason text,
	last_contact_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists leads_source_idx on public.leads (source);

create table if not exists public.lead_tasks (
	id uuid primary key default gen_random_uuid(),
	lead_id uuid not null references public.leads (id) on delete cascade,
	title varchar(200) not null,
	due_date date,
	done boolean not null default false,
	done_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists lead_tasks_lead_idx on public.lead_tasks (lead_id);

create table if not exists public.lead_activities (
	id uuid primary key default gen_random_uuid(),
	lead_id uuid not null references public.leads (id) on delete cascade,
	kind public.lead_activity_kind not null,
	actor_id uuid references public.profiles (id) on delete set null,
	note text,
	created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id);

create table if not exists public.lead_tags (
	id uuid primary key default gen_random_uuid(),
	lead_id uuid not null references public.leads (id) on delete cascade,
	name varchar(40) not null,
	unique (lead_id, name)
);

create index if not exists lead_tags_name_idx on public.lead_tags (name);

-- Template tidak FK ke leadd tertentu: dipakai lintas prospek.
create table if not exists public.message_templates (
	id uuid primary key default gen_random_uuid(),
	name varchar(120) not null,
	channel public.outreach_channel not null,
	body text not null,
	created_at timestamptz not null default now()
);

create table if not exists public.outreach_logs (
	id uuid primary key default gen_random_uuid(),
	lead_id uuid not null references public.leads (id) on delete cascade,
	channel public.outreach_channel not null,
	template_id uuid references public.message_templates (id) on delete set null,
	actor_id uuid references public.profiles (id) on delete set null,
	message text not null,
	replied boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists outreach_logs_lead_idx on public.outreach_logs (lead_id);

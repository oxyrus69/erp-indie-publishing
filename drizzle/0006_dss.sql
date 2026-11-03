-- 0006_dss.sql
-- DSS-1: ambang keputusan, jejak keputusan, skenario tersimpan.
-- Idempoten: aman dijalankan berulang kali.

do $$
begin
	if not exists (select 1 from pg_type where typname = 'decision_verdict') then
		create type public.decision_verdict as enum ('ACCEPTED','DISMISSED');
	end if;
end $$;

create table if not exists public.decision_rules (
	key varchar(64) primary key,
	value jsonb not null,
	updated_by uuid references public.profiles (id) on delete set null,
	updated_at timestamptz not null default now()
);

create table if not exists public.decision_log (
	id uuid primary key default gen_random_uuid(),
	rule_key varchar(120) not null,
	domain varchar(32) not null,
	entity_type varchar(32),
	entity_id uuid,
	verdict public.decision_verdict not null,
	title varchar(240) not null,
	summary text not null,
	impact_value numeric(14,2) not null default '0',
	note text,
	facts jsonb,
	actor_id uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists decision_log_key_idx on public.decision_log (rule_key);
create index if not exists decision_log_domain_idx on public.decision_log (domain);
create index if not exists decision_log_created_idx on public.decision_log (created_at);

create table if not exists public.scenario_snapshots (
	id uuid primary key default gen_random_uuid(),
	name varchar(160) not null,
	kind varchar(32) not null default 'price',
	input jsonb not null,
	result jsonb not null,
	created_by uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists scenario_created_idx on public.scenario_snapshots (created_at);

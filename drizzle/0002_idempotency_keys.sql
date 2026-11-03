-- 0002_idempotency_keys.sql
-- Kunci idempoten untuk aksi form finansial (verifikasi lunas, penarikan, approval).
-- Idempoten: aman dijalankan berulang kali.

create table if not exists public.idempotency_keys (
	key varchar(200) primary key,
	scope varchar(64) not null,
	actor_id uuid,
	result jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idempotency_created_idx on public.idempotency_keys (created_at);

-- Bersihkan otomatis kunci yang lebih tua dari 48 jam supaya tabel tetap kecil.
create or replace function public.prune_idempotency_keys()
returns void
language sql
as $$
	delete from public.idempotency_keys
	where created_at < now() - interval '48 hours';
$$;

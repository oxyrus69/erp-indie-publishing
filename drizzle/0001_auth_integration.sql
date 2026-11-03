-- 0001_auth_integration.sql
-- Integrasi Supabase Auth <-> tabel public.profiles.
-- Idempoten: aman dijalankan berulang kali.

-- 1) Profil wajib terhubung ke auth.users; hapus user auth = hapus profil.
do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'profiles_id_auth_users_fk'
	) then
		alter table public.profiles
			add constraint profiles_id_auth_users_fk
			foreign key (id) references auth.users (id) on delete cascade;
	end if;
end $$;

-- 2) Sinkronisasi otomatis: setiap user baru mendapat profil AUTHOR.
--    Role lain diberikan oleh admin (tidak pernah dari klien).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (id, email, full_name, role)
	values (
		new.id,
		coalesce(new.email, ''),
		coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
		'AUTHOR'
	)
	on conflict (id) do update
		set email = excluded.email,
			updated_at = now();
	return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_auth_user();

-- 3) Jaga `updated_at` tetap akurat pada tabel yang sering dimutasi.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

do $$
declare
	t text;
begin
	foreach t in array array[
		'profiles', 'orders', 'book_projects', 'production_tasks',
		'print_runs', 'inventory'
	]
	loop
		execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
		execute format(
			'create trigger touch_%1$s before update on public.%1$I
			 for each row execute function public.touch_updated_at()', t);
	end loop;
end $$;

-- 4) Index bantu untuk portal penulis & antrean produksi.
create index if not exists tasks_track_stage_idx on public.production_tasks (track, stage);
create index if not exists invoices_kind_status_idx on public.invoices (kind, status);
create index if not exists files_project_kind_idx on public.file_assets (project_id, kind);

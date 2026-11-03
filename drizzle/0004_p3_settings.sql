-- 0004_p3_settings.sql
-- P3: pengaturan aplikasi (tarif HPP, PPN, prefix dokumen, minimum penarikan).
-- Idempoten: aman dijalankan berulang kali.

create table if not exists public.app_settings (
	key varchar(64) primary key,
	value jsonb not null,
	updated_by uuid references public.profiles (id) on delete set null,
	updated_at timestamptz not null default now()
);

-- Nilai awal: sama dengan konstanta yang sebelumnya di-hardcode, sehingga
-- perilaku aplikasi tidak berubah sampai pengguna menyimpan pengaturan baru.
insert into public.app_settings (key, value) values
	('print', '{
		"paperRatePerPage": { "BOOKPAPER": 180, "HVS": 220, "ART_PAPER": 420 },
		"sizeMultiplier": { "A5": 1, "B5": 1.25, "UNESCO": 1.1, "A4": 1.7, "CUSTOM": 1 },
		"bindingCost": { "PERFECT_BINDING": 4500, "SPIRAL": 6000, "HARDCOVER": 18000, "STAPLE": 2500 },
		"laminationCost": { "NONE": 0, "DOFF": 1500, "GLOSSY": 1500 },
		"fullColorMultiplier": 2.4,
		"minPages": 48,
		"vatPct": 0
	}'::jsonb),
	('document', '{
		"invoicePrefix": "INV",
		"orderPrefix": "ORD",
		"withdrawalPrefix": "WDR",
		"salesPrefix": "SLS"
	}'::jsonb),
	('withdrawal', '{
		"minimumAmount": 50000
	}'::jsonb)
on conflict (key) do nothing;

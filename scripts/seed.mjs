/**
 * Seed demo Penerbit ERP.
 *
 * Idempoten: aman dijalankan berulang. Semua akun demo memakai kata sandi
 * yang sama sehingga bisa dipakai untuk menguji kelima peran.
 *
 *   node scripts/seed.mjs
 */

import postgres from 'postgres';
import 'dotenv/config';

const c = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require' });

const PASSWORD = 'penerbit123';

/** UUID tetap agar re-run tidak menggandakan baris. */
const U = {
	superAdmin: '11111111-1111-4111-8111-000000000001',
	pm: '11111111-1111-4111-8111-000000000002',
	finance: '11111111-1111-4111-8111-000000000003',
	editor: '11111111-1111-4111-8111-000000000004',
	designer: '11111111-1111-4111-8111-000000000005',
	layouter: '11111111-1111-4111-8111-000000000006',
	proofreader: '11111111-1111-4111-8111-000000000007',
	authorA: '11111111-1111-4111-8111-000000000008',
	authorB: '11111111-1111-4111-8111-000000000009'
};

const PPL = [
	{ id: U.superAdmin, email: 'nadia@penerbit.co.id', name: 'Nadia Prameswari', role: 'SUPER_ADMIN' },
	{ id: U.pm, email: 'raka@penerbit.co.id', name: 'Raka Adhitama', role: 'PROJECT_MANAGER' },
	{ id: U.finance, email: 'sari@penerbit.co.id', name: 'Sari Wulandari', role: 'FINANCE' },
	{ id: U.editor, email: 'edwin@freelance.id', name: 'Edwin Kusuma', role: 'FREELANCER', specialty: 'EDITOR' },
	{ id: U.designer, email: 'maya@freelance.id', name: 'Maya Larasati', role: 'FREELANCER', specialty: 'COVER_DESIGNER' },
	{ id: U.layouter, email: 'bayu@freelance.id', name: 'Bayu Nugraha', role: 'FREELANCER', specialty: 'LAYOUTER' },
	{ id: U.proofreader, email: 'tika@freelance.id', name: 'Tika Ramadhani', role: 'FREELANCER', specialty: 'PROOFREADER' },
	{ id: U.authorA, email: 'penulis@demo.id', name: 'Ayu Sekarwangi', role: 'AUTHOR' },
	{ id: U.authorB, email: 'dimas@demo.id', name: 'Dimas Prasetyo', role: 'AUTHOR' }
];

async function upsertAuthUser(p) {
	await c`
		insert into auth.users (
			instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
			created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user
		) values (
			'00000000-0000-0000-0000-000000000000', ${p.id}, 'authenticated', 'authenticated',
			${p.email}, extensions.crypt(${PASSWORD}, extensions.gen_salt('bf')), now(),
			now(), now(),
			'{"provider":"email","providers":["email"]}'::jsonb,
			${JSON.stringify({ full_name: p.name })}::jsonb, false
		)
		on conflict (id) do update
			set email = excluded.email,
				encrypted_password = excluded.encrypted_password,
				email_confirmed_at = now(),
				updated_at = now()
	`;
	/* Trigger hanya mengisi role AUTHOR — peran staf diberikan di sini. */
	await c`
		insert into public.profiles (id, email, full_name, role, specialty)
		values (${p.id}, ${p.email}, ${p.name}, ${p.role}, ${p.specialty ?? null})
		on conflict (id) do update
			set email = excluded.email,
				full_name = excluded.full_name,
				role = excluded.role,
				specialty = excluded.specialty,
				updated_at = now()
	`;
}

async function main() {
	for (const p of PPL) await upsertAuthUser(p);
	console.log(`✔ ${PPL.length} akun demo siap (kata sandi: ${PASSWORD})`);

	/* ------------------------------- Katalog ------------------------------- */
	const packages = [
		{
			code: 'PAKET-DASAR',
			name: 'Paket Dasar',
			tagline: 'Untuk penulis yang ingin terbit dengan biaya ringkas.',
			basePrice: 2500000,
			freeCopies: 5,
			royalty: 10,
			dp: 50,
			isbn: true,
			layout: true,
			cover: true,
			editing: false,
			sort: 1
		},
		{
			code: 'PAKET-PROFESIONAL',
			name: 'Paket Profesional',
			tagline: 'Editing menyeluruh, cover kustom, dan distribusi toko buku.',
			basePrice: 6500000,
			freeCopies: 20,
			royalty: 15,
			dp: 50,
			isbn: true,
			layout: true,
			cover: true,
			editing: true,
			sort: 2
		},
		{
			code: 'PAKET-PREMIUM',
			name: 'Paket Premium',
			tagline: 'Hardcover, kertas art paper, dan pendampingan marketing.',
			basePrice: 12000000,
			freeCopies: 50,
			royalty: 20,
			dp: 40,
			isbn: true,
			layout: true,
			cover: true,
			editing: true,
			sort: 3
		}
	];

	const pkgId = {};
	for (const p of packages) {
		const [row] = await c`
			insert into public.packages (
				code, name, tagline, description, base_price, free_author_copies,
				max_cover_revisions, max_layout_revisions, author_royalty_pct, down_payment_pct,
				includes_isbn, includes_layout, includes_cover, includes_editing, is_active, sort_order
			) values (
				${p.code}, ${p.name}, ${p.tagline},
				${p.tagline + ' Termasuk pendampingan tim penerbitan dari naskah hingga terbit.'},
				${p.basePrice}, ${p.freeCopies}, 2, 3, ${p.royalty}, ${p.dp},
				${p.isbn}, ${p.layout}, ${p.cover}, ${p.editing}, true, ${p.sort}
			)
			on conflict (code) do update
				set name = excluded.name,
					tagline = excluded.tagline,
					base_price = excluded.base_price,
					free_author_copies = excluded.free_author_copies,
					author_royalty_pct = excluded.author_royalty_pct,
					down_payment_pct = excluded.down_payment_pct,
					includes_editing = excluded.includes_editing,
					sort_order = excluded.sort_order
			returning id
		`;
		pkgId[p.code] = row.id;
	}
	console.log(`✔ ${packages.length} paket katalog`);

	const services = [
		{ code: 'JASA-EDITING', name: 'Jasa Penyuntingan Naskah', price: 1200000, unit: 'naskah' },
		{ code: 'JASA-LAYOUT', name: 'Jasa Tata Letak', price: 900000, unit: 'naskah' },
		{ code: 'JASA-COVER', name: 'Jasa Desain Cover', price: 750000, unit: 'desain' },
		{ code: 'ISBN-HKI', name: 'Pengurusan ISBN & HKI', price: 650000, unit: 'berkas' },
		{ code: 'REVISI-EKSTRA', name: 'Revisi Ekstra (di luar kuota)', price: 150000, unit: 'revisi' }
	];
	for (const s of services) {
		await c`
			insert into public.services (code, name, description, unit_price, unit, is_active)
			values (${s.code}, ${s.name}, ${s.name + ' oleh tim produksi penerbitan.'}, ${s.price}, ${s.unit}, true)
			on conflict (code) do update
				set name = excluded.name, unit_price = excluded.unit_price
		`;
	}
	console.log(`✔ ${services.length} layanan a-la-carte`);

	/* ------------------------------- Proyek -------------------------------- */
	/**
	 * Tiga proyek dengan tahap berbeda supaya setiap peran punya pekerjaan
	 * yang realistis: satu sedang review penulis, satu produksi berjalan,
	 * satu baru masuk antrean cetak.
	 */
	const projects = [
		{
			key: 'A',
			orderNumber: 'ORD-202609-0001',
			author: U.authorA,
			pkg: 'PAKET-PROFESIONAL',
			title: 'Laut yang Menyimpan Namamu',
			subtitle: 'Kumpulan cerpen tentang pulang',
			genre: 'Fiksi Sastra',
			synopsis:
				'Sebelas cerpen tentang orang-orang yang pulang ke kota pesisir dan mendapati kampung halaman mereka sudah berubah. Ditulis dengan bahasa yang tenang dan jernih.',
			status: 'AWAITING_AUTHOR',
			editorial: 'AUTHOR_REVIEW',
			cover: 'AUTHOR_REVIEW',
			legal: 'PENDING_FILES',
			printStage: null,
			pages: 208,
			isbn: null,
			orderStatus: 'AWAITING_FINAL_SETTLEMENT',
			paid: 3250000,
			total: 6500000,
			fullyPaid: false,
			layoutApproved: null,
			coverApproved: null,
			created: '2026-09-02'
		},
		{
			key: 'B',
			orderNumber: 'ORD-202609-0002',
			author: U.authorB,
			pkg: 'PAKET-PREMIUM',
			title: 'Rekayasa Perangkat Lunak Nusantara',
			subtitle: 'Praktik nyata dari tim produk Indonesia',
			genre: 'Teknologi',
			synopsis:
				'Panduan praktis membangun perangkat lunak yang tahan lama: arsitektur, pengujian, dan budaya kerja dari belasan tim produk di Indonesia.',
			status: 'IN_PRODUCTION',
			editorial: 'LAYOUTING',
			cover: 'COVER_APPROVED',
			legal: 'SUBMITTED_TO_PERPUSNAS',
			printStage: null,
			pages: 324,
			isbn: null,
			orderStatus: 'IN_PRODUCTION',
			paid: 4800000,
			total: 12000000,
			fullyPaid: false,
			layoutApproved: null,
			coverApproved: '2026-10-12',
			created: '2026-09-18'
		},
		{
			key: 'C',
			orderNumber: 'ORD-202608-0003',
			author: U.authorA,
			pkg: 'PAKET-DASAR',
			title: 'Menanam Modal, Menuai Tenang',
			subtitle: 'Catatan sederhana tentang keuangan keluarga',
			genre: 'Non-fiksi',
			synopsis:
				'Buku pengantar literasi keuangan untuk keluarga muda: menyusun anggaran, dana darurat, dan investasi jangka panjang tanpa jargon.',
			status: 'PUBLISHED',
			editorial: 'LAYOUT_APPROVED',
			cover: 'COVER_APPROVED',
			legal: 'ISBN_ISSUED',
			printStage: 'ADDED_TO_WAREHOUSE',
			pages: 176,
			isbn: '978-623-1234-56-7',
			orderStatus: 'COMPLETED',
			paid: 2500000,
			total: 2500000,
			fullyPaid: true,
			layoutApproved: '2026-08-20',
			coverApproved: '2026-08-14',
			created: '2026-08-04'
		}
	];

	const projectId = {};
	for (const p of projects) {
		const [pkg] = await c`select * from public.packages where code = ${p.pkg}`;
		const [order] = await c`
			insert into public.orders (
				order_number, author_id, package_id, status, book_title, book_subtitle,
				total_amount, paid_amount, down_payment_pct, author_royalty_pct,
				max_cover_revisions, max_layout_revisions, is_fully_paid, created_by, created_at, updated_at
			) values (
				${p.orderNumber}, ${p.author}, ${pkg.id}, ${p.orderStatus}, ${p.title}, ${p.subtitle},
				${p.total}, ${p.paid}, ${pkg.down_payment_pct}, ${pkg.author_royalty_pct},
				${pkg.max_cover_revisions}, ${pkg.max_layout_revisions}, ${p.fullyPaid},
				${U.pm}, ${p.created}, ${p.created}
			)
			on conflict (order_number) do update
				set status = excluded.status,
					paid_amount = excluded.paid_amount,
					is_fully_paid = excluded.is_fully_paid,
					updated_at = now()
			returning id
		`;

		const [proj] = await c`
			insert into public.book_projects (
				order_id, title, subtitle, author_name, genre, synopsis, status,
				page_count, paper_type, book_size, binding, lamination, is_full_color,
				editorial_stage, cover_stage, legal_stage, print_stage,
				isbn, isbn_issued_at, layout_approved_at, cover_approved_at,
				high_res_unlocked, manager_id, created_at, updated_at
			) values (
				${order.id}, ${p.title}, ${p.subtitle},
				${PPL.find((x) => x.id === p.author).name}, ${p.genre}, ${p.synopsis}, ${p.status},
				${p.pages}, 'BOOKPAPER', ${p.pkg === 'PAKET-PREMIUM' ? 'B5' : 'A5'},
				${p.pkg === 'PAKET-PREMIUM' ? 'HARDCOVER' : 'PERFECT_BINDING'}, 'DOFF', false,
				${p.editorial}, ${p.cover}, ${p.legal}, ${p.printStage},
				${p.isbn}, ${p.isbn ? '2026-08-10' : null}, ${p.layoutApproved}, ${p.coverApproved},
				${p.fullyPaid && p.printStage === 'ADDED_TO_WAREHOUSE'},
				${U.pm}, ${p.created}, ${p.created}
			)
			on conflict (order_id) do update
				set status = excluded.status,
					editorial_stage = excluded.editorial_stage,
					cover_stage = excluded.cover_stage,
					legal_stage = excluded.legal_stage,
					print_stage = excluded.print_stage,
					isbn = excluded.isbn,
					page_count = excluded.page_count,
					high_res_unlocked = excluded.high_res_unlocked
			returning id
		`;
		projectId[p.key] = proj.id;
	}
	console.log(`✔ ${projects.length} proyek buku`);

	/* -------------------------------- Task --------------------------------- */
	const tasks = [
		/* Proyek A — menunggu review penulis untuk editing & cover. */
		{ project: 'A', track: 'EDITORIAL', stage: 'EDITING', title: 'Penyuntingan Naskah', status: 'WAITING_AUTHOR_REVIEW', assignee: U.editor, fee: 1200000, structure: 'FLAT_FEE', rev: 1, max: 2, unlocked: true, submitted: '2026-10-24' },
		{ project: 'A', track: 'LAYOUT', stage: 'LAYOUTING', title: 'Tata Letak & Proofreading Akhir', status: 'IN_PROGRESS', assignee: U.layouter, fee: 900000, structure: 'FLAT_FEE', rev: 0, max: 3, unlocked: true, submitted: null },
		{ project: 'A', track: 'COVER', stage: 'DRAFTING_COVER', title: 'Desain Cover', status: 'WAITING_AUTHOR_REVIEW', assignee: U.designer, fee: 750000, structure: 'FLAT_FEE', rev: 0, max: 2, unlocked: true, submitted: '2026-10-26' },
		{ project: 'A', track: 'LEGAL', stage: 'SUBMITTED_TO_PERPUSNAS', title: 'Pengurusan ISBN & KDT', status: 'PENDING', assignee: null, fee: 650000, structure: 'FLAT_FEE', rev: 0, max: 1, unlocked: false, submitted: null },
		{ project: 'A', track: 'PRINT', stage: 'PRINT_QUEUE', title: 'Produksi Cetak', status: 'PENDING', assignee: null, fee: 0, structure: 'FLAT_FEE', rev: 0, max: 1, unlocked: false, submitted: null },

		/* Proyek B — cover disetujui, layout berjalan, editing selesai. */
		{ project: 'B', track: 'EDITORIAL', stage: 'LAYOUTING', title: 'Penyuntingan Naskah', status: 'COMPLETED', assignee: U.editor, fee: 1800000, structure: 'FLAT_FEE', rev: 2, max: 2, unlocked: true, submitted: '2026-10-06', approved: '2026-10-09' },
		{ project: 'B', track: 'LAYOUT', stage: 'LAYOUTING', title: 'Tata Letak & Proofreading Akhir', status: 'IN_PROGRESS', assignee: U.layouter, fee: 2400, structure: 'PER_PAGE_RATE', rev: 1, max: 3, unlocked: true, submitted: null },
		{ project: 'B', track: 'COVER', stage: 'COVER_APPROVED', title: 'Desain Cover', status: 'COMPLETED', assignee: U.designer, fee: 1500000, structure: 'FLAT_FEE', rev: 2, max: 2, unlocked: true, submitted: '2026-10-10', approved: '2026-10-12' },
		{ project: 'B', track: 'LEGAL', stage: 'SUBMITTED_TO_PERPUSNAS', title: 'Pengurusan ISBN & KDT', status: 'IN_PROGRESS', assignee: null, fee: 650000, structure: 'FLAT_FEE', rev: 0, max: 1, unlocked: true, submitted: null },
		{ project: 'B', track: 'PRINT', stage: 'PRINT_QUEUE', title: 'Produksi Cetak', status: 'PENDING', assignee: null, fee: 0, structure: 'FLAT_FEE', rev: 0, max: 1, unlocked: false, submitted: null },

		/* Proyek C — selesai, buku sudah di gudang. */
		{ project: 'C', track: 'EDITORIAL', stage: 'LAYOUT_APPROVED', title: 'Penyuntingan Naskah', status: 'COMPLETED', assignee: U.proofreader, fee: 850000, structure: 'FLAT_FEE', rev: 1, max: 2, unlocked: true, submitted: '2026-08-12', approved: '2026-08-18' },
		{ project: 'C', track: 'LAYOUT', stage: 'LAYOUT_APPROVED', title: 'Tata Letak & Proofreading Akhir', status: 'COMPLETED', assignee: U.layouter, fee: 700000, structure: 'FLAT_FEE', rev: 1, max: 3, unlocked: true, submitted: '2026-08-15', approved: '2026-08-20' },
		{ project: 'C', track: 'COVER', stage: 'COVER_APPROVED', title: 'Desain Cover', status: 'COMPLETED', assignee: U.designer, fee: 600000, structure: 'FLAT_FEE', rev: 0, max: 2, unlocked: true, submitted: '2026-08-11', approved: '2026-08-14' },
		{ project: 'C', track: 'LEGAL', stage: 'ISBN_ISSUED', title: 'Pengurusan ISBN & KDT', status: 'COMPLETED', assignee: null, fee: 650000, structure: 'FLAT_FEE', rev: 0, max: 1, unlocked: true, submitted: '2026-08-08', approved: '2026-08-10' },
		{ project: 'C', track: 'PRINT', stage: 'ADDED_TO_WAREHOUSE', title: 'Produksi Cetak', status: 'COMPLETED', assignee: null, fee: 0, structure: 'FLAT_FEE', rev: 0, max: 1, unlocked: true, submitted: '2026-09-01', approved: '2026-09-05' }
	];

	const taskId = {};
	for (const t of tasks) {
		const pid = projectId[t.project];
		const payout =
			t.structure === 'PER_PAGE_RATE'
				? String(t.fee * 324)
				: String(t.fee);

		/*
		 * Satu task per (proyek, track). Tanpa penjaga ini, menjalankan seed
		 * dua kali menggandakan task — UI lalu menampilkan task kembar dan
		 * hitungan beban kerja menjadi salah.
		 */
		const [existingTask] = await c`
			select id from public.production_tasks
			where project_id = ${pid} and track = ${t.track}
			limit 1
		`;
		if (existingTask) {
			taskId[`${t.project}:${t.track}`] = existingTask.id;
			continue;
		}

		const [row] = await c`
			insert into public.production_tasks (
				project_id, track, stage, title, description, status,
				assignee_id, assigned_by, assigned_at, fee_structure, flat_fee, per_page_rate,
				page_count, payout_amount, is_commission_credited, revision_count, max_revisions,
				extra_revision_fee, is_unlocked, deadline, submitted_at, approved_at, approved_by,
				created_at, updated_at
			) values (
				${pid}, ${t.track}, ${t.stage}, ${t.title},
				${t.title + ' untuk proyek ini.'}, ${t.status},
				${t.assignee ?? null}, ${t.assignee ? U.pm : null}, ${t.assignee ? '2026-09-20' : null},
				${t.structure}, ${t.structure === 'FLAT_FEE' ? t.fee : 0},
				${t.structure === 'PER_PAGE_RATE' ? t.fee : 0},
				${t.project === 'B' && t.structure === 'PER_PAGE_RATE' ? 324 : 0},
				${t.status === 'COMPLETED' ? payout : 0},
				${t.status === 'COMPLETED' && Boolean(t.assignee)},
				${t.rev}, ${t.max}, 150000, ${t.unlocked},
				${t.status === 'IN_PROGRESS' ? '2026-11-15' : null},
				${t.submitted ?? null}, ${t.approved ?? null}, ${t.approved ? U.authorA : null},
				'2026-08-05', '2026-08-05'
			)
			returning id
		`;
		taskId[`${t.project}:${t.track}`] = row.id;
	}
	console.log(`✔ ${tasks.length} task produksi`);

	/* ------------------------------- Invoice ------------------------------- */
	const invoiceDefs = [
		{ order: 'ORD-202609-0001', number: 'INV-202609-0001', kind: 'DOWN_PAYMENT', pct: 50, amount: 3250000, status: 'PAID', paid: 3250000, paidAt: '2026-09-03' },
		{ order: 'ORD-202609-0001', number: 'INV-202610-0002', kind: 'FINAL_SETTLEMENT', pct: 50, amount: 3250000, status: 'UNPAID', paid: 0, paidAt: null },
		{ order: 'ORD-202609-0002', number: 'INV-202609-0003', kind: 'DOWN_PAYMENT', pct: 40, amount: 4800000, status: 'PAID', paid: 4800000, paidAt: '2026-09-19' },
		{ order: 'ORD-202609-0002', number: 'INV-202610-0004', kind: 'FINAL_SETTLEMENT', pct: 60, amount: 7200000, status: 'UNPAID', paid: 0, paidAt: null },
		{ order: 'ORD-202608-0003', number: 'INV-202608-0005', kind: 'DOWN_PAYMENT', pct: 50, amount: 1250000, status: 'PAID', paid: 1250000, paidAt: '2026-08-05' },
		{ order: 'ORD-202608-0003', number: 'INV-202609-0006', kind: 'FINAL_SETTLEMENT', pct: 50, amount: 1250000, status: 'PAID', paid: 1250000, paidAt: '2026-08-28' },
		{ order: 'ORD-202608-0003', number: 'INV-202610-0007', kind: 'EXTRA_REVISION', pct: null, amount: 150000, status: 'OVERDUE', paid: 0, paidAt: null }
	];

	const invoiceId = {};
	for (const inv of invoiceDefs) {
		const [order] = await c`select id from public.orders where order_number = ${inv.order}`;
		const [row] = await c`
			insert into public.invoices (
				invoice_number, order_id, kind, status, milestone_pct, amount, paid_amount,
				description, due_date, paid_at, created_at
			) values (
				${inv.number}, ${order.id}, ${inv.kind}, ${inv.status}, ${inv.pct}, ${inv.amount},
				${inv.paid}, ${inv.kind === 'DOWN_PAYMENT' ? 'Uang muka pembukaan produksi'
					: inv.kind === 'FINAL_SETTLEMENT' ? 'Pelunasan sebelum rilis file master'
					: 'Revisi di luar kuota gratis'},				${inv.paidAt ? '2026-10-31' : inv.status === 'OVERDUE' ? '2026-10-15' : '2026-11-15'},
				${inv.paidAt}, '2026-09-01'
			)
			on conflict (invoice_number) do update
				set status = excluded.status, paid_amount = excluded.paid_amount, paid_at = excluded.paid_at,
					due_date = excluded.due_date
			returning id
		`;
		invoiceId[inv.number] = row.id;

		/*
		 * Satu baris pembayaran per invoice. Re-run seed sebelumnya menambah
		 * pembayaran kembar sehingga total kas yang dibaca laporan membengkak.
		 */
		if (inv.paidAt) {
			const [existingPayment] = await c`
				select id from public.invoice_payments where invoice_id = ${row.id} limit 1
			`;
			if (!existingPayment) {
				await c`
					insert into public.invoice_payments (invoice_id, amount, method, reference, verified_by, paid_at)
					values (${row.id}, ${inv.paid}, 'TRANSFER', ${'TRF/' + inv.number}, ${U.finance}, ${inv.paidAt})
				`;
			}
		}
	}
	console.log(`✔ ${invoiceDefs.length} invoice`);

	/* ---------------------------- Inventori & cetak ------------------------ */
	const runs = [
		{ project: 'C', qty: 300, cost: 41500, authorCopies: 5, warehouse: 295, stage: 'ADDED_TO_WAREHOUSE' },
		{ project: 'B', qty: 500, cost: 63800, authorCopies: 50, warehouse: 450, stage: 'PRINT_QUEUE' }
	];
	for (const r of runs) {
		const pid = projectId[r.project];
		const [existing] = await c`select id from public.print_runs where project_id = ${pid} limit 1`;
		if (!existing) {
			await c`
				insert into public.print_runs (
					project_id, quantity, cost_per_unit, total_cost, page_count, paper_type,
					book_size, binding, lamination, stage, author_copies, warehouse_copies
				) values (
					${pid}, ${r.qty}, ${r.cost}, ${r.qty * r.cost},
					${r.project === 'C' ? 176 : 324}, 'BOOKPAPER',
					${r.project === 'B' ? 'B5' : 'A5'},
					${r.project === 'B' ? 'HARDCOVER' : 'PERFECT_BINDING'}, 'DOFF',
					${r.stage}, ${r.authorCopies}, ${r.warehouse}
				)
			`;
		}
	}

	/* Proyek C sudah di gudang → stok & penjualan historis. */
	await c`
		insert into public.inventory (
			project_id, on_hand, reserved, sold_total, avg_production_cost,
			retail_price, warehouse_location
		) values (
			${projectId.C}, 251, 2, 49, 41500, 89000, 'Gudang A — Rak 12'
		)
		on conflict (project_id) do update
			set on_hand = excluded.on_hand,
				sold_total = excluded.sold_total,
				avg_production_cost = excluded.avg_production_cost,
				retail_price = excluded.retail_price,
				warehouse_location = excluded.warehouse_location
	`;
	await c`
		insert into public.inventory (project_id, on_hand, reserved, sold_total, avg_production_cost, retail_price)
		values (${projectId.B}, 0, 0, 0, 0, 0)
		on conflict (project_id) do nothing
	`;
	await c`
		insert into public.inventory (project_id, on_hand, reserved, sold_total, avg_production_cost, retail_price)
		values (${projectId.A}, 0, 0, 0, 0, 0)
		on conflict (project_id) do nothing
	`;

	const sales = [
		{ project: 'C', number: 'SALE-202608-0001', qty: 12, channel: 'DIRECT_WEB', price: 89000, date: '2026-08-30' },
		{ project: 'C', number: 'SALE-202609-0002', qty: 24, channel: 'MARKETPLACE', price: 85000, date: '2026-09-14' },
		{ project: 'C', number: 'SALE-202609-0003', qty: 8, channel: 'EVENT', price: 95000, date: '2026-09-27' },
		{ project: 'C', number: 'SALE-202610-0004', qty: 5, channel: 'RESELLER', price: 72000, date: '2026-10-08' }
	];
	for (const s of sales) {
		const pid = projectId[s.project];
		const gross = s.qty * s.price;
		/* Royalti 10% dari (harga - HPP) sesuai aturan mesin ERP. */
		const net = Math.max(0, Math.round((s.price - 41500) * s.qty * 0.1));
		const [existing] = await c`select id from public.book_sales where sale_number = ${s.number} limit 1`;
		if (existing) continue;
		const [sale] = await c`
			insert into public.book_sales (
				sale_number, project_id, quantity, channel, unit_price, gross_amount,
				unit_production_cost, royalty_pct, net_royalty, reference, recorded_by, sold_at
			) values (
				${s.number}, ${pid}, ${s.qty}, ${s.channel}, ${s.price}, ${gross},
				41500, 10, ${net}, ${'Shift kasir ' + s.channel.slice(0, 4)}, ${U.finance}, ${s.date}
			)
			returning id
		`;
		await c`
			insert into public.royalty_ledgers (
				author_id, project_id, sale_id, entry_type, amount, status, description, idempotency_key, created_at
			) values (
				${U.authorA}, ${pid}, ${sale.id}, 'ROYALTY', ${net}, 'AVAILABLE',
				${`Royalti ${s.qty} eksemplar — ${s.number}`}, ${'sale:' + sale.id + ':royalty'}, ${s.date}
			)
			on conflict (idempotency_key) do nothing
		`;
	}

	/*
	 * Komisi freelancer untuk task yang sudah disetujui penulis.
	 * Task di proyek A belum disetujui, jadi belum ada komisi — persis
	 * seperti perilaku approveProductionTask di mesin ERP.
	 */
	const commissions = [
		{ freelancer: U.editor, project: 'B', track: 'EDITORIAL', amount: 1800000 },
		{ freelancer: U.designer, project: 'B', track: 'COVER', amount: 1500000 },
		{ freelancer: U.designer, project: 'C', track: 'COVER', amount: 600000 },
		{ freelancer: U.proofreader, project: 'C', track: 'EDITORIAL', amount: 850000 },
		{ freelancer: U.layouter, project: 'C', track: 'LAYOUT', amount: 700000 }
	];
	for (const cm of commissions) {
		const tid = taskId[`${cm.project}:${cm.track}`];
		await c`
			insert into public.freelancer_ledgers (
				freelancer_id, task_id, entry_type, amount, status, description, idempotency_key, created_at
			) values (
				${cm.freelancer}, ${tid}, 'TASK_COMMISSION', ${cm.amount}, 'AVAILABLE',
				${'Komisi task ' + cm.track}, ${'task:' + tid + ':commission'}, '2026-09-30'
			)
			on conflict (idempotency_key) do nothing
		`;
	}

	/*
	 * Penarikan: dua sudah dibayar finance, satu masih menunggu diproses.
	 * Entri ledger negatifnya ikut dibuat supaya saldo dompet konsisten.
	 */
	const withdrawals = [
		{ user: U.editor, amount: 1800000, status: 'PAID', bank: 'BCA', note: 'Ditransfer 25 Sep', ledger: 'WITHDRAWN', at: '2026-09-25' },
		{ user: U.designer, amount: 1200000, status: 'PAID', bank: 'Mandiri', note: 'Ditransfer 21 Okt', ledger: 'WITHDRAWN', at: '2026-10-21' },
		{ user: U.layouter, amount: 350000, status: 'REQUESTED', bank: 'BCA', note: null, ledger: 'PENDING', at: '2026-10-20' }
	];
	for (const w of withdrawals) {
		const [existing] = await c`
			select id from public.withdrawal_requests
			where user_id = ${w.user} and amount = ${w.amount} and wallet = 'FREELANCER'
			limit 1
		`;
		if (!existing) {
			await c`
				insert into public.withdrawal_requests (
					user_id, wallet, amount, status, bank_name, bank_account_name, bank_account_number,
					processed_by, processed_at, note, created_at
				) values (
					${w.user}, 'FREELANCER', ${w.amount}, ${w.status}, ${w.bank},
					${PPL.find((x) => x.id === w.user).name}, '1234567890',
					${w.status !== 'REQUESTED' ? U.finance : null},
					${w.status !== 'REQUESTED' ? w.at : null}, ${w.note}, '2026-10-20'
				)
			`;
		}
		await c`
			insert into public.freelancer_ledgers (
				freelancer_id, entry_type, amount, status, description, idempotency_key, created_at
			) values (
				${w.user}, 'WITHDRAWAL', ${-w.amount}, ${w.ledger},
				${'Penarikan saldo ke ' + w.bank}, ${'wd-demo-' + w.user.slice(-2) + '-' + w.amount}, ${w.at}
			)
			on conflict (idempotency_key) do nothing
		`;
	}

	/* Riwayat revisi pada proyek A. */
	const [existingRev] = await c`select id from public.revisions limit 1`;
	if (!existingRev) {
		await c`
			insert into public.revisions (task_id, project_id, revision_no, requested_by, notes, is_chargeable, status, created_at)
			values (
				${taskId['A:EDITORIAL']}, ${projectId.A}, 1, ${U.authorA},
				'Mohon bagian bab 4 dipadatkan; beberapa dialog terasa berulang dan bisa digabung.',
				false, 'RESOLVED', '2026-10-20'
			)
		`;
		await c`
			insert into public.revisions (task_id, project_id, revision_no, requested_by, notes, is_chargeable, status, created_at)
			values (
				${taskId['B:LAYOUT']}, ${projectId.B}, 1, ${U.authorB},
				'Running header di halaman genap masih tertukar dengan judul bab.',
				false, 'REQUESTED', '2026-10-25'
			)
		`;
	}

	/* Aset file contoh supaya panel unduhan punya isi. */
	const [existingFile] = await c`select id from public.file_assets limit 1`;
	if (!existingFile) {
		await c`
			insert into public.file_assets (
				project_id, task_id, kind, storage_provider, bucket, storage_path,
				file_name, mime_type, size_bytes, version, is_preview, requires_full_payment, uploaded_by
			) values
			(
				${projectId.A}, ${taskId['A:EDITORIAL']}, 'MANUSCRIPT', 'SUPABASE', 'manuscripts',
				${'projects/' + projectId.A + '/manuscript-v2.docx'},
				'laut-yang-menyimpan-namamu-v2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				2411724, 2, true, false, ${U.editor}
			),
			(
				${projectId.A}, ${taskId['A:COVER']}, 'COVER_DRAFT', 'SUPABASE', 'layout-pdfs',
				${'projects/' + projectId.A + '/cover-draft.pdf'},
				'cover-draft-01.pdf', 'application/pdf', 5242880, 1, true, false, ${U.designer}
			),
			(
				${projectId.C}, null, 'LAYOUT_PDF', 'SUPABASE', 'layout-pdfs',
				${'projects/' + projectId.C + '/final-layout.pdf'},
				'menanam-modal-final.pdf', 'application/pdf', 12582912, 3, false, true, ${U.layouter}
			)
		`;
	}

	console.log('✔ inventori, penjualan, royalti, komisi, penarikan, revisi, aset');
	console.log('\nAkun demo:');
	for (const p of PPL) console.log(`  ${p.role.padEnd(16)} ${p.email.padEnd(24)} ${PASSWORD}`);
}

try {
	await main();
} catch (e) {
	console.error('SEED GAGAL:', e.message);
	process.exitCode = 1;
} finally {
	await c.end({ timeout: 5 });
}

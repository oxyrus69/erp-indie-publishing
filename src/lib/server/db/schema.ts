import { relations } from 'drizzle-orm';
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/*                                   ENUMS                                    */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum('user_role', [
	'SUPER_ADMIN',
	'PROJECT_MANAGER',
	'FREELANCER',
	'FINANCE',
	'AUTHOR'
]);

export const freelancerSpecialtyEnum = pgEnum('freelancer_specialty', [
	'EDITOR',
	'PROOFREADER',
	'LAYOUTER',
	'COVER_DESIGNER'
]);

export const orderStatusEnum = pgEnum('order_status', [
	'DRAFT',
	'AWAITING_DOWN_PAYMENT',
	'IN_PRODUCTION',
	'AWAITING_FINAL_SETTLEMENT',
	'READY_FOR_RELEASE',
	'COMPLETED',
	'CANCELLED'
]);

export const invoiceKindEnum = pgEnum('invoice_kind', [
	'DOWN_PAYMENT',
	'FINAL_SETTLEMENT',
	'EXTRA_REVISION',
	'ADDON_SERVICE',
	'PRINT_ADDON'
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
	'DRAFT',
	'UNPAID',
	'PAID',
	'VOID',
	'OVERDUE'
]);

export const projectStatusEnum = pgEnum('project_status', [
	'INITIATED',
	'IN_PRODUCTION',
	'AWAITING_AUTHOR',
	'READY_FOR_PRINT',
	'IN_PRINTING',
	'PUBLISHED',
	'COMPLETED',
	'ON_HOLD',
	'CANCELLED'
]);

/** The four parallel production tracks driven by the state machine. */
export const trackTypeEnum = pgEnum('track_type', ['EDITORIAL', 'LAYOUT', 'COVER', 'LEGAL', 'PRINT']);

export const taskStatusEnum = pgEnum('task_status', [
	'PENDING',
	'IN_PROGRESS',
	'WAITING_AUTHOR_REVIEW',
	'COMPLETED',
	'CANCELLED'
]);

export const editorialStageEnum = pgEnum('editorial_stage', [
	'MANUSCRIPT_SUBMITTED',
	'EDITING',
	'PROOFREADING',
	'LAYOUTING',
	'AUTHOR_REVIEW',
	'LAYOUT_APPROVED'
]);

export const coverStageEnum = pgEnum('cover_stage', [
	'BRIEF_SUBMITTED',
	'DRAFTING_COVER',
	'AUTHOR_REVIEW',
	'COVER_APPROVED'
]);

export const legalStageEnum = pgEnum('legal_stage', [
	'PENDING_FILES',
	'SUBMITTED_TO_PERPUSNAS',
	'ISBN_ISSUED'
]);

export const printStageEnum = pgEnum('print_stage', [
	'PRINT_QUEUE',
	'PRINTING',
	'QUALITY_CONTROL',
	'SHIPPED_TO_AUTHOR',
	'ADDED_TO_WAREHOUSE'
]);

export const feeStructureEnum = pgEnum('fee_structure', ['FLAT_FEE', 'PER_PAGE_RATE']);

export const storageProviderEnum = pgEnum('storage_provider', ['SUPABASE', 'CLOUDINARY']);

export const fileKindEnum = pgEnum('file_kind', [
	'MANUSCRIPT',
	'COVER_DRAFT',
	'COVER_FINAL',
	'COVER_PREVIEW',
	'LAYOUT_PDF',
	'LAYOUT_PREVIEW',
	'ISBN_BARCODE',
	'LEGAL_DOC',
	'CATALOG_THUMB'
]);

export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', [
	'TASK_COMMISSION',
	'REVISION_BONUS',
	'ROYALTY',
	'WITHDRAWAL',
	'ADJUSTMENT'
]);

export const ledgerStatusEnum = pgEnum('ledger_status', [
	'PENDING',
	'AVAILABLE',
	'WITHDRAWN',
	'CANCELLED'
]);

export const walletTypeEnum = pgEnum('wallet_type', ['FREELANCER', 'ROYALTY']);

export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
	'REQUESTED',
	'APPROVED',
	'PAID',
	'REJECTED'
]);

export const salesChannelEnum = pgEnum('sales_channel', [
	'DIRECT_WEB',
	'MARKETPLACE',
	'RESELLER',
	'EVENT'
]);

export const paperTypeEnum = pgEnum('paper_type', ['BOOKPAPER', 'HVS', 'ART_PAPER']);
export const bookSizeEnum = pgEnum('book_size', ['A5', 'B5', 'UNESCO', 'A4', 'CUSTOM']);
export const bindingTypeEnum = pgEnum('binding_type', [
	'PERFECT_BINDING',
	'SPIRAL',
	'HARDCOVER',
	'STAPLE'
]);
export const laminationTypeEnum = pgEnum('lamination_type', ['NONE', 'DOFF', 'GLOSSY']);

/* -------------------------------------------------------------------------- */
/*                              IDENTITY / RBAC                               */
/* -------------------------------------------------------------------------- */

/**
 * Mirror of `auth.users`. The primary key is the Supabase Auth user id.
 * The FK to `auth.users` is added in `drizzle/0001_auth_fk.sql` because
 * drizzle-kit does not manage the `auth` schema.
 */
export const profiles = pgTable(
	'profiles',
	{
		id: uuid('id').primaryKey(),
		email: varchar('email', { length: 320 }).notNull(),
		fullName: varchar('full_name', { length: 160 }).notNull(),
		role: userRoleEnum('role').notNull().default('AUTHOR'),
		specialty: freelancerSpecialtyEnum('specialty'),
		phone: varchar('phone', { length: 32 }),
		avatarUrl: text('avatar_url'),
		/** Freelancers with `is_active = false` cannot be assigned new tasks. */
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('profiles_email_uq').on(t.email), index('profiles_role_idx').on(t.role)]
);

/* -------------------------------------------------------------------------- */
/*                            MODULE 1 — CATALOG                              */
/* -------------------------------------------------------------------------- */

export const packages = pgTable('packages', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 48 }).notNull().unique(),
	name: varchar('name', { length: 160 }).notNull(),
	tagline: text('tagline'),
	description: text('description'),
	/** Harga dasar paket (IDR). */
	basePrice: numeric('base_price', { precision: 14, scale: 2 }).notNull().default('0'),
	/** Kuota buku cetak gratis untuk penulis. */
	freeAuthorCopies: integer('free_author_copies').notNull().default(0),
	/** Batas maksimum revisi gratis (cover & layout). */
	maxCoverRevisions: integer('max_cover_revisions').notNull().default(2),
	maxLayoutRevisions: integer('max_layout_revisions').notNull().default(2),
	/** Persentase royalti penulis untuk penjualan buku. */
	authorRoyaltyPct: numeric('author_royalty_pct', { precision: 5, scale: 2 }).notNull().default('10'),
	/** Porsi pembayaran di muka untuk membuka produksi. */
	downPaymentPct: numeric('down_payment_pct', { precision: 5, scale: 2 }).notNull().default('50'),
	includesIsbn: boolean('includes_isbn').notNull().default(true),
	includesLayout: boolean('includes_layout').notNull().default(true),
	includesCover: boolean('includes_cover').notNull().default(true),
	includesEditing: boolean('includes_editing').notNull().default(false),
	isActive: boolean('is_active').notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** A-la-carte services (Jasa Desain Cover, Jasa Layout, ISBN/HKI, dsb). */
export const services = pgTable('services', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 48 }).notNull().unique(),
	name: varchar('name', { length: 160 }).notNull(),
	description: text('description'),
	unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
	unit: varchar('unit', { length: 32 }).notNull().default('paket'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const packageServices = pgTable(
	'package_services',
	{
		packageId: uuid('package_id')
			.notNull()
			.references(() => packages.id, { onDelete: 'cascade' }),
		serviceId: uuid('service_id')
			.notNull()
			.references(() => services.id, { onDelete: 'cascade' }),
		quantity: integer('quantity').notNull().default(1)
	},
	(t) => [primaryKey({ columns: [t.packageId, t.serviceId] })]
);

/* -------------------------------------------------------------------------- */
/*                        MODULE 1 — ORDERS & INVOICING                       */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
	'orders',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		orderNumber: varchar('order_number', { length: 32 }).notNull().unique(),
		authorId: uuid('author_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'restrict' }),
		packageId: uuid('package_id')
			.notNull()
			.references(() => packages.id, { onDelete: 'restrict' }),
		status: orderStatusEnum('status').notNull().default('DRAFT'),
		/** Judul naskah yang dikontrak — dipakai saat membuat BookProject. */
		bookTitle: varchar('book_title', { length: 240 }),
		bookSubtitle: varchar('book_subtitle', { length: 240 }),
		/** Snapshot nilai kontrak saat order dibuat. */
		totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull().default('0'),
		paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0'),
		downPaymentPct: numeric('down_payment_pct', { precision: 5, scale: 2 }).notNull().default('50'),
		authorRoyaltyPct: numeric('author_royalty_pct', { precision: 5, scale: 2 }).notNull().default('10'),
		maxCoverRevisions: integer('max_cover_revisions').notNull().default(2),
		maxLayoutRevisions: integer('max_layout_revisions').notNull().default(2),
		/** Dihitung ulang dari invoice; sumber kebenaran untuk unlock file master. */
		isFullyPaid: boolean('is_fully_paid').notNull().default(false),
		notes: text('notes'),
		createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('orders_author_idx').on(t.authorId), index('orders_status_idx').on(t.status)]
);

export const orderItems = pgTable('order_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	orderId: uuid('order_id')
		.notNull()
		.references(() => orders.id, { onDelete: 'cascade' }),
	serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
	label: varchar('label', { length: 200 }).notNull(),
	quantity: integer('quantity').notNull().default(1),
	unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
	subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const invoices = pgTable(
	'invoices',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		invoiceNumber: varchar('invoice_number', { length: 32 }).notNull().unique(),
		orderId: uuid('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		kind: invoiceKindEnum('kind').notNull(),
		status: invoiceStatusEnum('status').notNull().default('UNPAID'),
		/** Persentase dari total order untuk DP / pelunasan. NULL untuk add-on. */
		milestonePct: numeric('milestone_pct', { precision: 5, scale: 2 }),
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0'),
		/** Tautan ke task/track yang dibuka ketika invoice ini lunas. */
		productionTaskId: uuid('production_task_id'),
		description: text('description'),
		dueDate: date('due_date'),
		paidAt: timestamp('paid_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('invoices_order_idx').on(t.orderId), index('invoices_status_idx').on(t.status)]
);

export const invoicePayments = pgTable('invoice_payments', {
	id: uuid('id').primaryKey().defaultRandom(),
	invoiceId: uuid('invoice_id')
		.notNull()
		.references(() => invoices.id, { onDelete: 'cascade' }),
	amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
	method: varchar('method', { length: 48 }).notNull().default('TRANSFER'),
	reference: varchar('reference', { length: 120 }),
	verifiedBy: uuid('verified_by').references(() => profiles.id, { onDelete: 'set null' }),
	paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow()
});

/* -------------------------------------------------------------------------- */
/*                    MODULE 2 — BOOK PROJECT & PIPELINE                      */
/* -------------------------------------------------------------------------- */

export const bookProjects = pgTable(
	'book_projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		orderId: uuid('order_id')
			.notNull()
			.unique()
			.references(() => orders.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 240 }).notNull(),
		subtitle: varchar('subtitle', { length: 240 }),
		authorName: varchar('author_name', { length: 160 }).notNull(),
		authorBio: text('author_bio'),
		language: varchar('language', { length: 16 }).notNull().default('id'),
		synopsis: text('synopsis'),
		genre: varchar('genre', { length: 80 }),
		status: projectStatusEnum('status').notNull().default('INITIATED'),

		/* ---- Spesifikasi cetak ---- */
		pageCount: integer('page_count').notNull().default(0),
		paperType: paperTypeEnum('paper_type').notNull().default('BOOKPAPER'),
		bookSize: bookSizeEnum('book_size').notNull().default('A5'),
		binding: bindingTypeEnum('binding').notNull().default('PERFECT_BINDING'),
		lamination: laminationTypeEnum('lamination').notNull().default('DOFF'),
		isFullColor: boolean('is_full_color').notNull().default(false),

		/* ---- Track 1: Editorial & Layout ---- */
		editorialStage: editorialStageEnum('editorial_stage').notNull().default('MANUSCRIPT_SUBMITTED'),

		/* ---- Track 2: Cover Studio ---- */
		coverStage: coverStageEnum('cover_stage').notNull().default('BRIEF_SUBMITTED'),

		/* ---- Track 3: Legal & ISBN ---- */
		legalStage: legalStageEnum('legal_stage').notNull().default('PENDING_FILES'),
		isbn: varchar('isbn', { length: 32 }),
		kdtNumber: varchar('kdt_number', { length: 64 }),
		catalogData: jsonb('catalog_data').$type<Record<string, unknown> | null>(),
		isbnIssuedAt: timestamp('isbn_issued_at', { withTimezone: true }),

		/* ---- Track 4: Print ---- */
		printStage: printStageEnum('print_stage'),

		/* ---- Approval gates ---- */
		layoutApprovedAt: timestamp('layout_approved_at', { withTimezone: true }),
		coverApprovedAt: timestamp('cover_approved_at', { withTimezone: true }),
		/** File resolusi tinggi hanya boleh diunduh ketika ini true. */
		highResUnlocked: boolean('high_res_unlocked').notNull().default(false),

		managerId: uuid('manager_id').references(() => profiles.id, { onDelete: 'set null' }),
		/**
		 * Penjaga konkurensi optimistik.
		 *
		 * Dinaikkan setiap kali baris proyek berubah. Form membawa nilai yang
		 * dibacanya; UPDATE hanya jalan bila nilainya masih sama. Dua PM yang
		 * membuka halaman bersamaan tidak bisa saling menimpa tanpa peringatan —
		 * yang kalah mendapat 409 beserta data terbaru.
		 */
		version: integer('version').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('projects_status_idx').on(t.status), index('projects_manager_idx').on(t.managerId)]
);

export const productionTasks = pgTable(
	'production_tasks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => bookProjects.id, { onDelete: 'cascade' }),
		track: trackTypeEnum('track').notNull(),
		/** Stage string disimpan sebagai teks agar tetap generik lintas track. */
		stage: varchar('stage', { length: 40 }).notNull(),
		title: varchar('title', { length: 200 }).notNull(),
		description: text('description'),
		status: taskStatusEnum('status').notNull().default('PENDING'),
		assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
		assignedBy: uuid('assigned_by').references(() => profiles.id, { onDelete: 'set null' }),
		assignedAt: timestamp('assigned_at', { withTimezone: true }),

		/* ---- Struktur fee ---- */
		feeStructure: feeStructureEnum('fee_structure').notNull().default('FLAT_FEE'),
		flatFee: numeric('flat_fee', { precision: 14, scale: 2 }).notNull().default('0'),
		perPageRate: numeric('per_page_rate', { precision: 14, scale: 2 }).notNull().default('0'),
		pageCount: integer('page_count').notNull().default(0),
		/** Fee final yang dibayarkan (snapshot saat task selesai). */
		payoutAmount: numeric('payout_amount', { precision: 14, scale: 2 }).notNull().default('0'),
		isCommissionCredited: boolean('is_commission_credited').notNull().default(false),

		/* ---- Revision guardrail ---- */
		revisionCount: integer('revision_count').notNull().default(0),
		maxRevisions: integer('max_revisions').notNull().default(2),
		extraRevisionFee: numeric('extra_revision_fee', { precision: 14, scale: 2 })
			.notNull()
			.default('150000'),

		/* ---- Kontrol unlock (invoice milestone) ---- */
		isUnlocked: boolean('is_unlocked').notNull().default(true),
		deadline: date('deadline'),
		submittedAt: timestamp('submitted_at', { withTimezone: true }),
		approvedAt: timestamp('approved_at', { withTimezone: true }),
		approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('tasks_project_idx').on(t.projectId),
		index('tasks_assignee_idx').on(t.assigneeId),
		index('tasks_status_idx').on(t.status)
	]
);

export const revisions = pgTable(
	'revisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		taskId: uuid('task_id')
			.notNull()
			.references(() => productionTasks.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => bookProjects.id, { onDelete: 'cascade' }),
		/** Nomor urut revisi pada task ini (1-based). */
		revisionNo: integer('revision_no').notNull(),
		requestedBy: uuid('requested_by')
			.notNull()
			.references(() => profiles.id, { onDelete: 'restrict' }),
		notes: text('notes').notNull(),
		/** true = melewati kuota gratis, ditagihkan lewat invoice add-on. */
		isChargeable: boolean('is_chargeable').notNull().default(false),
		feeInvoiceId: uuid('fee_invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
		status: varchar('status', { length: 24 }).notNull().default('REQUESTED'),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('revisions_task_idx').on(t.taskId)]
);

/* -------------------------------------------------------------------------- */
/*                            HYBRID FILE ASSETS                              */
/* -------------------------------------------------------------------------- */

export const fileAssets = pgTable(
	'file_assets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => bookProjects.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id').references(() => productionTasks.id, { onDelete: 'set null' }),
		kind: fileKindEnum('kind').notNull(),
		storageProvider: storageProviderEnum('storage_provider').notNull(),

		/* ---- Supabase Storage ---- */
		bucket: varchar('bucket', { length: 64 }),
		storagePath: text('storage_path'),

		/* ---- Cloudinary ---- */
		cloudinaryPublicId: text('cloudinary_public_id'),
		cloudinaryResourceType: varchar('cloudinary_resource_type', { length: 16 }).default('image'),
		cloudinaryFormat: varchar('cloudinary_format', { length: 16 }),

		fileName: varchar('file_name', { length: 255 }).notNull(),
		mimeType: varchar('mime_type', { length: 128 }),
		sizeBytes: integer('size_bytes').notNull().default(0),
		version: integer('version').notNull().default(1),
		/** Preview yang aman dibagikan ke penulis (berwatermark / low-res). */
		isPreview: boolean('is_preview').notNull().default(false),
		/** Wajib lunas sebelum bisa diunduh penulis. */
		requiresFullPayment: boolean('requires_full_payment').notNull().default(false),
		uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('files_project_idx').on(t.projectId), index('files_kind_idx').on(t.kind)]
);

/* -------------------------------------------------------------------------- */
/*                        MODULE 3 — COMMISSION LEDGER                        */
/* -------------------------------------------------------------------------- */

export const freelancerLedgers = pgTable(
	'freelancer_ledgers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		freelancerId: uuid('freelancer_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'restrict' }),
		taskId: uuid('task_id').references(() => productionTasks.id, { onDelete: 'set null' }),
		entryType: ledgerEntryTypeEnum('entry_type').notNull().default('TASK_COMMISSION'),
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		status: ledgerStatusEnum('status').notNull().default('AVAILABLE'),
		description: text('description'),
		/** Kunci idempoten: mencegah komisi dobel untuk task yang sama. */
		idempotencyKey: varchar('idempotency_key', { length: 120 }).unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('freelancer_ledger_freelancer_idx').on(t.freelancerId)]
);

/* -------------------------------------------------------------------------- */
/*                    MODULE 4 — PRINT RUN & INVENTORY                        */
/* -------------------------------------------------------------------------- */

export const printRuns = pgTable('print_runs', {
	id: uuid('id').primaryKey().defaultRandom(),
	projectId: uuid('project_id')
		.notNull()
		.references(() => bookProjects.id, { onDelete: 'cascade' }),
	quantity: integer('quantity').notNull(),
	/** HPP cetak per eksemplar (snapshot spesifikasi saat order cetak). */
	costPerUnit: numeric('cost_per_unit', { precision: 14, scale: 2 }).notNull().default('0'),
	totalCost: numeric('total_cost', { precision: 14, scale: 2 }).notNull().default('0'),
	pageCount: integer('page_count').notNull().default(0),
	paperType: paperTypeEnum('paper_type').notNull(),
	bookSize: bookSizeEnum('book_size').notNull(),
	binding: bindingTypeEnum('binding').notNull(),
	lamination: laminationTypeEnum('lamination').notNull(),
	stage: printStageEnum('stage').notNull().default('PRINT_QUEUE'),
	/** Jumlah eksemplar yang dialokasikan sebagai hak penulis gratis. */
	authorCopies: integer('author_copies').notNull().default(0),
	warehouseCopies: integer('warehouse_copies').notNull().default(0),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const inventory = pgTable(
	'inventory',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.unique()
			.references(() => bookProjects.id, { onDelete: 'cascade' }),
		onHand: integer('on_hand').notNull().default(0),
		reserved: integer('reserved').notNull().default(0),
		/** Stok yang tersedia untuk dijual = onHand - reserved. */
		soldTotal: integer('sold_total').notNull().default(0),
		/** HPP rata-rata per eksemplar untuk kalkulasi royalti. */
		avgProductionCost: numeric('avg_production_cost', { precision: 14, scale: 2 })
			.notNull()
			.default('0'),
		/** Harga jual retail yang disarankan. */
		retailPrice: numeric('retail_price', { precision: 14, scale: 2 }).notNull().default('0'),
		warehouseLocation: varchar('warehouse_location', { length: 120 }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('inventory_project_idx').on(t.projectId)]
);

/* -------------------------------------------------------------------------- */
/*                      MODULE 5 — SALES & ROYALTY WALLET                     */
/* -------------------------------------------------------------------------- */

export const bookSales = pgTable(
	'book_sales',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		saleNumber: varchar('sale_number', { length: 32 }).notNull().unique(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => bookProjects.id, { onDelete: 'restrict' }),
		quantity: integer('quantity').notNull(),
		channel: salesChannelEnum('channel').notNull(),
		unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
		grossAmount: numeric('gross_amount', { precision: 14, scale: 2 }).notNull(),
		unitProductionCost: numeric('unit_production_cost', { precision: 14, scale: 2 })
			.notNull()
			.default('0'),
		royaltyPct: numeric('royalty_pct', { precision: 5, scale: 2 }).notNull().default('10'),
		/** (harga jual - biaya produksi) * qty * royalty% */
		netRoyalty: numeric('net_royalty', { precision: 14, scale: 2 }).notNull().default('0'),
		reference: varchar('reference', { length: 120 }),
		recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
		soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('sales_project_idx').on(t.projectId), index('sales_channel_idx').on(t.channel)]
);

export const royaltyLedgers = pgTable(
	'royalty_ledgers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		authorId: uuid('author_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'restrict' }),
		projectId: uuid('project_id').references(() => bookProjects.id, { onDelete: 'set null' }),
		saleId: uuid('sale_id').references(() => bookSales.id, { onDelete: 'set null' }),
		entryType: ledgerEntryTypeEnum('entry_type').notNull().default('ROYALTY'),
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		status: ledgerStatusEnum('status').notNull().default('AVAILABLE'),
		description: text('description'),
		idempotencyKey: varchar('idempotency_key', { length: 120 }).unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('royalty_ledger_author_idx').on(t.authorId)]
);

export const withdrawalRequests = pgTable('withdrawal_requests', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'restrict' }),
	wallet: walletTypeEnum('wallet').notNull(),
	amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
	status: withdrawalStatusEnum('status').notNull().default('REQUESTED'),
	bankName: varchar('bank_name', { length: 80 }),
	bankAccountName: varchar('bank_account_name', { length: 120 }),
	bankAccountNumber: varchar('bank_account_number', { length: 40 }),
	processedBy: uuid('processed_by').references(() => profiles.id, { onDelete: 'set null' }),
	processedAt: timestamp('processed_at', { withTimezone: true }),
	note: text('note'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});/* -------------------------------------------------------------------------- */
/*                              DOCUMENT NUMBERING                            */
/* -------------------------------------------------------------------------- */

/**
 * Penghitung nomor dokumen (invoice, order, sale) yang atomik per periode.
 * Diinkremen di dalam transaksi yang sama dengan dokumennya sehingga tidak
 * ada nomor ganda meski ada request paralel.
 */
export const documentSequences = pgTable('document_sequences', {
	key: varchar('key', { length: 48 }).primaryKey(),
	lastValue: integer('last_value').notNull().default(0)
});

/* -------------------------------------------------------------------------- */
/*                          FORM ACTION IDEMPOTENCY                           */
/* -------------------------------------------------------------------------- */

/**
 * Kunci idempoten untuk aksi form yang mengubah uang/status permanen.
 *
 * Klien mengirim `requestId` yang dibuat baru setiap kali tombol benar-benar
 * ditekan. Baris pertama yang berhasil `insert` berhak menjalankan aksi; request
 * berikutnya dengan kunci sama menerima hasil yang tersimpan, bukan menjalankan
 * ulang. Ini lapisan kedua setelah kunci sinkron di browser, sehingga POST ganda
 * (dua tap cepat, retry jaringan, tombol back) tidak menggandakan efek.
 */
export const idempotencyKeys = pgTable(
	'idempotency_keys',
	{
		/** `<scope>:<actorId>:<requestId>` — dipisah agar tidak bentrok antar aksi. */
		key: varchar('key', { length: 200 }).primaryKey(),
		scope: varchar('scope', { length: 64 }).notNull(),
		actorId: uuid('actor_id'),
		/** Hasil aksi pertama; `null` selama aksi masih berjalan. */
		result: jsonb('result').$type<Record<string, unknown> | null>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idempotency_created_idx').on(t.createdAt)]
);

/* -------------------------------------------------------------------------- */
/*                    AUDIT TRAIL, COMMENTS & NOTIFICATIONS                   */
/* -------------------------------------------------------------------------- */

/**
 * Jejak aktivitas (audit log).
 *
 * Menjawab pertanyaan yang tidak bisa dijawab kolom `updated_at` saja:
 * "siapa mengubah spesifikasi cetak ini, kapan, dari nilai apa ke nilai apa".
 *
 * Yang dicatat sengaja dibatasi pada aksi yang mengubah uang atau status —
 * bukan setiap klik. Nama pelaku disimpan sebagai snapshot teks karena baris
 * audit harus tetap terbaca meski profil kemudian dihapus atau berganti nama.
 */
export const auditLogs = pgTable(
	'audit_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
		/** Snapshot nama pelaku saat aksi terjadi. */
		actorName: varchar('actor_name', { length: 160 }).notNull(),
		actorRole: varchar('actor_role', { length: 32 }).notNull(),
		/** Kata kerja domain, mis. `invoice.paid`, `spec.updated`, `withdrawal.rejected`. */
		action: varchar('action', { length: 64 }).notNull(),
		entityType: varchar('entity_type', { length: 32 }).notNull(),
		entityId: uuid('entity_id'),
		/** Ringkasan satu baris yang siap ditampilkan di UI. */
		summary: text('summary').notNull(),
		/** Nilai sebelum/sesudah untuk aksi yang mengubah field. */
		changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }> | null>(),
		/** Konteks tambahan: nomor invoice, judul buku, nominal, dsb. */
		context: jsonb('context').$type<Record<string, unknown> | null>(),
		/** Menautkan audit ke aksi form yang sama (idempotensi). */
		requestId: varchar('request_id', { length: 64 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('audit_entity_idx').on(t.entityType, t.entityId),
		index('audit_created_idx').on(t.createdAt),
		index('audit_actor_idx').on(t.actorId)
	]
);

/**
 * Komentar pada task — benang diskusi revisi.
 *
 * Sebelum ini, revisi penulis hanya berupa catatan satu arah tanpa tempat
 * membalas. Komentar menempel pada task (bukan project) karena diskusi nyata
 * selalu tentang satu pekerjaan: "cover halaman 1 kurang kontras".
 *
 * `isInternal` menyembunyikan komentar dari penulis dan freelancer; dipakai
 * untuk catatan antar staf, mis. "vendor cetak minta revisi warna".
 */
export const taskComments = pgTable(
	'task_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		taskId: uuid('task_id')
			.notNull()
			.references(() => productionTasks.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => bookProjects.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
		/** Snapshot nama & peran, seperti audit log. */
		authorName: varchar('author_name', { length: 160 }).notNull(),
		authorRole: varchar('author_role', { length: 32 }).notNull(),
		body: text('body').notNull(),
		/** Catatan staf; tidak terlihat oleh penulis & freelancer. */
		isInternal: boolean('is_internal').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('comments_task_idx').on(t.taskId, t.createdAt)]
);

/**
 * Pusat notifikasi.
 *
 * Notifikasi tidak "dihitung ulang" setiap muat halaman lalu hilang; ia
 * dipersistenkan dengan `dedupeKey` unik sehingga:
 *  - peringatan yang sama tidak menumpuk (satu baris per kejadian),
 *  - status "sudah dibaca" bertahan setelah halaman dimuat ulang,
 *  - lencana jumlah belum-dibaca bisa dihitung dengan satu query.
 *
 * `syncNotifications()` membuat baris dari kondisi nyata (invoice jatuh tempo,
 * task lewat tenggat, penarikan menunggu) memakai upsert-on-conflict-do-nothing.
 */
export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		/** Kunci unik per penerima supaya satu kejadian tidak menumpuk. */
		dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
		category: varchar('category', { length: 32 }).notNull(),
		severity: varchar('severity', { length: 16 }).notNull().default('info'),
		title: varchar('title', { length: 200 }).notNull(),
		body: text('body'),
		href: text('href'),
		entityType: varchar('entity_type', { length: 32 }),
		entityId: uuid('entity_id'),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('notifications_user_dedupe_uq').on(t.userId, t.dedupeKey),
		index('notifications_user_read_idx').on(t.userId, t.readAt)
	]
);

/* -------------------------------------------------------------------------- */
/*                              PENGATURAN APLIKASI                           */
/* -------------------------------------------------------------------------- */

/**
 * Pengaturan aplikasi — satu baris per domain, nilainya JSONB.
 *
 * Kenapa satu tabel generik, bukan tabel bertipe per kebutuhan: pengaturan
 * berubah mengikuti kesepakatan bisnis (tarif vendor naik, prefix nomor
 * berganti), bukan mengikuti skema data. Tabel generik membuat penambahan
 * pengaturan baru tidak perlu migrasi baru.
 *
 * `key` adalah domain yang stabil (`print`, `invoice`, `withdrawal`), dan
 * bentuk nilainya divalidasi di service — bukan di database, supaya pesan
 * galatnya bisa menjelaskan field mana yang salah.
 */
export const appSettings = pgTable('app_settings', {
	key: varchar('key', { length: 64 }).primaryKey(),
	value: jsonb('value').$type<Record<string, unknown>>().notNull(),
	/** Siapa terakhir mengubah dan kapan — ditampilkan di halaman pengaturan. */
	updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/* -------------------------------------------------------------------------- */
/*                                       CRM                                    */
/* -------------------------------------------------------------------------- */
/*
 * CRM penerbitan. Yang dijual di sini bukan langganan: satu prospek adalah
 * satu naskah + satu paket penerbitan. Karena itu lead membawa judul buku dan
 * genre, dan tahap akhir "MENANG" mengubah lead menjadi akun penulis (lihat
 * kolom authorId), bukan "deal value" abstrak.
 */

export const leadStageEnum = pgEnum('lead_stage', [
	'PROSPEK',
	'KONTAK',
	'PROPOSAL',
	'NEGOSIASI',
	'MENANG',
	'KALAH'
]);

export const leadSourceEnum = pgEnum('lead_source', [
	'REFERRAL',
	'SOCIAL_MEDIA',
	'EVENT',
	'WEBSITE',
	'PUBLISHER',
	'OTHER'
]);

export const leadActivityKindEnum = pgEnum('lead_activity_kind', [
	'CALL',
	'WHATSAPP',
	'EMAIL',
	'MEETING',
	'NOTE'
]);

export const outreachChannelEnum = pgEnum('outreach_channel', ['WHATSAPP', 'EMAIL']);

/**
 * Prospek penerbitan.
 *
 * `estimatedValue` adalah estimasi nilai kontrak (paket + layanan) agar nilai
 * pipeline terhitung sebelum order ada. `authorId` terisi bila lead sudah
 * dikonversi: orangnya menjadi akun penulis dan riwayat CRM tetap menempel
 * di baris ini — satu orang, satu baris identitas.
 */
export const leads = pgTable(
	'leads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		fullName: varchar('full_name', { length: 160 }).notNull(),
		email: varchar('email', { length: 320 }),
		phone: varchar('phone', { length: 32 }),
		/** Naskah adalah muatan utuh sebuah lead; tidak ada lead tanpa cerita. */
		bookTitle: varchar('book_title', { length: 240 }),
		genre: varchar('genre', { length: 80 }),
		/** Estimasi nilai kontrak dalam IDR; nol berarti belum dihitung. */
		estimatedValue: numeric('estimated_value', { precision: 14, scale: 2 }).notNull().default('0'),
		stage: leadStageEnum('stage').notNull().default('PROSPEK'),
		source: leadSourceEnum('source').notNull().default('OTHER'),
		/** Staf yang menanggung follow-up (bukan "penemu"). */
		ownerId: uuid('owner_id').references(() => profiles.id, { onDelete: 'set null' }),
		notes: text('notes'),
		/** Terisi saat lead dikonversi menjadi penulis. */
		authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
		orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
		convertedAt: timestamp('converted_at', { withTimezone: true }),
		lostReason: text('lost_reason'),
		/** Diperbarui otomatis oleh aktivitas (bukan form) — sumber "menjadi dingin". */
		lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('leads_stage_idx').on(t.stage),
		index('leads_owner_idx').on(t.ownerId),
		index('leads_source_idx').on(t.source)
	]
);

/** Tugas follow-up: kapan harus menyapa ulang, dan sudah dikerjakan atau belum. */
export const leadTasks = pgTable(
	'lead_tasks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => leads.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 200 }).notNull(),
		dueDate: date('due_date'),
		/** true = sudah dikerjakan; timestamp-nya disimpan di doneAt. */
		done: boolean('done').notNull().default(false),
		doneAt: timestamp('done_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('lead_tasks_lead_idx').on(t.leadId)]
);

/**
 * Riwayat percakapan dengan prospek.
 *
 * Dipisah dari kolom `notes` (catatan bebas yang berubah) karena laporan
 * "aktivitas per staf" dan umpan `/crm/aktivitas` butuh urutan waktu yang
 * tidak boleh hilang saat catatan diperbarui.
 */
export const leadActivities = pgTable(
	'lead_activities',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => leads.id, { onDelete: 'cascade' }),
		kind: leadActivityKindEnum('kind').notNull(),
		/** Siapa yang melakukannya; NULL berarti catatan manual tanpa staf. */
		actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
		note: text('note'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('lead_activities_lead_idx').on(t.leadId)]
);

/** Tag bebas untuk segmentasi ringan (genre, potensi-lanjut, perlu-perhatian). */
export const leadTags = pgTable(
	'lead_tags',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => leads.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 40 }).notNull()
	},
	(t) => [uniqueIndex('lead_tags_uq').on(t.leadId, t.name), index('lead_tags_name_idx').on(t.name)]
);

/**
 * Template pesan per kanal (WhatsApp/Email).
 *
 * Enam tempat khusus yang disisipkan saat menyalin: {nama}, {judul}, {paket},
 * {nilai}, {jatuh_tempo}. Sisanya teks bebas — template bukan mesin template.
 */
export const messageTemplates = pgTable('message_templates', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 120 }).notNull(),
	channel: outreachChannelEnum('channel').notNull(),
	body: text('body').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** Saran obrolan yang dikirim ke prospek, dengan hasil (dibalas/tidak). */
export const outreachLogs = pgTable(
	'outreach_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => leads.id, { onDelete: 'cascade' }),
		channel: outreachChannelEnum('channel').notNull(),
		/** Id template bila dikirim dari template; NULL bila diketik langsung. */
		templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
		actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
		/** Isi akhir setelah penggantian tempat khusus — disimpan apa adanya. */
		message: text('message').notNull(),
		/** false = belum/tidak dibalas; true = ada balasan. */
		replied: boolean('replied').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('outreach_logs_lead_idx').on(t.leadId)]
);

/* -------------------------------------------------------------------------- */
/*                                  RELATIONS                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                    DSS                                     */
/* -------------------------------------------------------------------------- */
/*
 * DSS bukan tabel angka: semua penilaian dihitung saat halaman dibuka dari
 * baris nyata. Yang disimpan hanya dua hal yang memang tidak bisa dihitung
 * ulang — ambang keputusan yang disepakati tim, dan jejak keputusan yang
 * pernah diambil beserta keadaan saat itu.
 */

/** Ambang keputusan per domain. `key` stabil: `title`, `cash`, `production`. */
export const decisionRules = pgTable('decision_rules', {
	key: varchar('key', { length: 64 }).primaryKey(),
	value: jsonb('value').$type<Record<string, unknown>>().notNull(),
	updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const decisionVerdictEnum = pgEnum('decision_verdict', ['ACCEPTED', 'DISMISSED']);

/**
 * Satu baris = satu keputusan atas satu rekomendasi.
 *
 * `facts` menyimpan angka yang dipakai saat memutuskan. Tanpa itu, enam bulan
 * kemudian orang hanya bisa menebak apakah keputusannya masuk akal dengan data
 * hari itu — dan penilaian ulang jadi tidak mungkin.
 */
export const decisionLog = pgTable(
	'decision_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Kunci rekomendasi, mis. `title:reorder:<projectId>` — bukan id baris. */
		ruleKey: varchar('rule_key', { length: 120 }).notNull(),
		domain: varchar('domain', { length: 32 }).notNull(),
		entityType: varchar('entity_type', { length: 32 }),
		entityId: uuid('entity_id'),
		verdict: decisionVerdictEnum('verdict').notNull(),
		title: varchar('title', { length: 240 }).notNull(),
		summary: text('summary').notNull(),
		impactValue: numeric('impact_value', { precision: 14, scale: 2 }).notNull().default('0'),
		note: text('note'),
		facts: jsonb('facts').$type<Record<string, unknown>>(),
		actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('decision_log_key_idx').on(t.ruleKey),
		index('decision_log_domain_idx').on(t.domain),
		index('decision_log_created_idx').on(t.createdAt)
	]
);

/**
 * Skenario what-if yang disimpan.
 *
 * `input` dan `result` adalah jsonb apa adanya: bentuknya mengikuti domain yang
 * membuatnya (saat ini `price`), dan tidak ada gunanya memaksa satu skema
 * kolom untuk semua simulasi yang akan datang.
 */
export const scenarioSnapshots = pgTable(
	'scenario_snapshots',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', { length: 160 }).notNull(),
		kind: varchar('kind', { length: 32 }).notNull().default('price'),
		input: jsonb('input').$type<Record<string, unknown>>().notNull(),
		result: jsonb('result').$type<Record<string, unknown>>().notNull(),
		createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('scenario_created_idx').on(t.createdAt)]
);

export const profilesRelations = relations(profiles, ({ many }) => ({
	orders: many(orders),
	managedProjects: many(bookProjects),
	assignedTasks: many(productionTasks),
	freelancerLedger: many(freelancerLedgers),
	royaltyLedger: many(royaltyLedgers),
	withdrawals: many(withdrawalRequests),
	ownedLeads: many(leads),
	convertedLeads: many(leads)
}));

export const packagesRelations = relations(packages, ({ many }) => ({
	orders: many(orders),
	packageServices: many(packageServices)
}));

export const servicesRelations = relations(services, ({ many }) => ({
	packageServices: many(packageServices),
	orderItems: many(orderItems)
}));

export const packageServicesRelations = relations(packageServices, ({ one }) => ({
	package: one(packages, { fields: [packageServices.packageId], references: [packages.id] }),
	service: one(services, { fields: [packageServices.serviceId], references: [services.id] })
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	author: one(profiles, { fields: [orders.authorId], references: [profiles.id] }),
	package: one(packages, { fields: [orders.packageId], references: [packages.id] }),
	items: many(orderItems),
	invoices: many(invoices),
	project: one(bookProjects, { fields: [orders.id], references: [bookProjects.orderId] }),
	lead: one(leads, { fields: [orders.id], references: [leads.orderId] })
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
	owner: one(profiles, { fields: [leads.ownerId], references: [profiles.id] }),
	author: one(profiles, { fields: [leads.authorId], references: [profiles.id] }),
	order: one(orders, { fields: [leads.orderId], references: [orders.id] }),
	tasks: many(leadTasks),
	activities: many(leadActivities),
	tags: many(leadTags),
	outreach: many(outreachLogs)
}));

export const leadTasksRelations = relations(leadTasks, ({ one }) => ({
	lead: one(leads, { fields: [leadTasks.leadId], references: [leads.id] })
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
	lead: one(leads, { fields: [leadActivities.leadId], references: [leads.id] }),
	actor: one(profiles, { fields: [leadActivities.actorId], references: [profiles.id] })
}));

export const leadTagsRelations = relations(leadTags, ({ one }) => ({
	lead: one(leads, { fields: [leadTags.leadId], references: [leads.id] })
}));

export const messageTemplatesRelations = relations(messageTemplates, ({ many }) => ({
	outreach: many(outreachLogs)
}));

export const outreachLogsRelations = relations(outreachLogs, ({ one }) => ({
	lead: one(leads, { fields: [outreachLogs.leadId], references: [leads.id] }),
	template: one(messageTemplates, { fields: [outreachLogs.templateId], references: [messageTemplates.id] }),
	actor: one(profiles, { fields: [outreachLogs.actorId], references: [profiles.id] })
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
	order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
	service: one(services, { fields: [orderItems.serviceId], references: [services.id] })
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
	order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
	payments: many(invoicePayments)
}));

export const invoicePaymentsRelations = relations(invoicePayments, ({ one }) => ({
	invoice: one(invoices, { fields: [invoicePayments.invoiceId], references: [invoices.id] })
}));

export const bookProjectsRelations = relations(bookProjects, ({ one, many }) => ({
	order: one(orders, { fields: [bookProjects.orderId], references: [orders.id] }),
	manager: one(profiles, { fields: [bookProjects.managerId], references: [profiles.id] }),
	tasks: many(productionTasks),
	files: many(fileAssets),
	revisions: many(revisions),
	printRuns: many(printRuns),
	inventory: one(inventory, { fields: [bookProjects.id], references: [inventory.projectId] }),
	sales: many(bookSales)
}));

export const productionTasksRelations = relations(productionTasks, ({ one, many }) => ({
	project: one(bookProjects, { fields: [productionTasks.projectId], references: [bookProjects.id] }),
	assignee: one(profiles, { fields: [productionTasks.assigneeId], references: [profiles.id] }),
	revisions: many(revisions),
	files: many(fileAssets),
	ledgerEntries: many(freelancerLedgers),
	comments: many(taskComments)
}));

export const revisionsRelations = relations(revisions, ({ one }) => ({
	task: one(productionTasks, { fields: [revisions.taskId], references: [productionTasks.id] }),
	project: one(bookProjects, { fields: [revisions.projectId], references: [bookProjects.id] }),
	feeInvoice: one(invoices, { fields: [revisions.feeInvoiceId], references: [invoices.id] })
}));

export const fileAssetsRelations = relations(fileAssets, ({ one }) => ({
	project: one(bookProjects, { fields: [fileAssets.projectId], references: [bookProjects.id] }),
	task: one(productionTasks, { fields: [fileAssets.taskId], references: [productionTasks.id] })
}));

export const freelancerLedgersRelations = relations(freelancerLedgers, ({ one }) => ({
	freelancer: one(profiles, { fields: [freelancerLedgers.freelancerId], references: [profiles.id] }),
	task: one(productionTasks, { fields: [freelancerLedgers.taskId], references: [productionTasks.id] })
}));

export const printRunsRelations = relations(printRuns, ({ one }) => ({
	project: one(bookProjects, { fields: [printRuns.projectId], references: [bookProjects.id] })
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
	project: one(bookProjects, { fields: [inventory.projectId], references: [bookProjects.id] })
}));

export const bookSalesRelations = relations(bookSales, ({ one, many }) => ({
	project: one(bookProjects, { fields: [bookSales.projectId], references: [bookProjects.id] }),
	royaltyEntries: many(royaltyLedgers)
}));

export const royaltyLedgersRelations = relations(royaltyLedgers, ({ one }) => ({
	author: one(profiles, { fields: [royaltyLedgers.authorId], references: [profiles.id] }),
	project: one(bookProjects, { fields: [royaltyLedgers.projectId], references: [bookProjects.id] }),
	sale: one(bookSales, { fields: [royaltyLedgers.saleId], references: [bookSales.id] })
}));

export const withdrawalRequestsRelations = relations(withdrawalRequests, ({ one }) => ({
	user: one(profiles, { fields: [withdrawalRequests.userId], references: [profiles.id] })
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
	actor: one(profiles, { fields: [auditLogs.actorId], references: [profiles.id] })
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
	task: one(productionTasks, { fields: [taskComments.taskId], references: [productionTasks.id] }),
	project: one(bookProjects, { fields: [taskComments.projectId], references: [bookProjects.id] }),
	author: one(profiles, { fields: [taskComments.authorId], references: [profiles.id] })
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
	user: one(profiles, { fields: [notifications.userId], references: [profiles.id] })
}));

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type BookProject = typeof bookProjects.$inferSelect;
export type ProductionTask = typeof productionTasks.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type FileAsset = typeof fileAssets.$inferSelect;
export type FreelancerLedgerEntry = typeof freelancerLedgers.$inferSelect;
export type PrintRun = typeof printRuns.$inferSelect;
export type Inventory = typeof inventory.$inferSelect;
export type BookSale = typeof bookSales.$inferSelect;
export type RoyaltyLedgerEntry = typeof royaltyLedgers.$inferSelect;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadTask = typeof leadTasks.$inferSelect;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type LeadTag = typeof leadTags.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type OutreachLog = typeof outreachLogs.$inferSelect;
export type DecisionRule = typeof decisionRules.$inferSelect;
export type DecisionLog = typeof decisionLog.$inferSelect;
export type ScenarioSnapshot = typeof scenarioSnapshots.$inferSelect;
export type DecisionVerdict = (typeof decisionVerdictEnum.enumValues)[number];

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type StorageProvider = (typeof storageProviderEnum.enumValues)[number];
export type SalesChannel = (typeof salesChannelEnum.enumValues)[number];
export type EditorialStage = (typeof editorialStageEnum.enumValues)[number];
export type CoverStage = (typeof coverStageEnum.enumValues)[number];
export type LegalStage = (typeof legalStageEnum.enumValues)[number];
export type PrintStage = (typeof printStageEnum.enumValues)[number];
export type FeeStructure = (typeof feeStructureEnum.enumValues)[number];
export type LedgerStatus = (typeof ledgerStatusEnum.enumValues)[number];
export type InvoiceKind = (typeof invoiceKindEnum.enumValues)[number];

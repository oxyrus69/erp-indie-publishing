# ERP Penerbitan — Apa Saja yang Sudah Dibangun

Dokumen ini adalah inventaris lengkap sistem: modul, halaman, alur, aturan bisnis, keputusan teknis, dan batasannya. Ditulis untuk orang yang baru masuk ke proyek ini — bukan changelog, tapi peta.

**Stack:** SvelteKit 5 (runes) + TypeScript, PostgreSQL via Drizzle ORM, Tailwind + komponen sendiri, bits-ui untuk dialog, TanStack Table untuk seleksi baris, layerchart untuk grafik, Supabase Auth (atau sesi dev lokal).

**Skala kode saat ini:** 28 halaman, 21 file service server, 18 komponen UI, 5 file grafik, 7 migrasi, 9 akun demo.

---

## Daftar isi

1. [Peta modul](#peta-modul)
2. [Fondasi teknis](#fondasi-teknis)
3. [Modul inti: order → invoice → proyek → cetak → penjualan](#modul-inti)
4. [Keuangan: piutang, penarikan, laporan](#keuangan)
5. [Katalog, pengaturan, jejak audit](#katalog-pengaturan-jejak-audit)
6. [Portal penulis & ruang freelancer](#portal-freelancer)
7. [CRM](#crm)
8. [DSS](#dss)
9. [RBAC & peran](#rbac)
10. [Skema database](#skema)
11. [Keputusan teknis yang mengikat](#keputusan)
12. [Alur data end-to-end](#alur-end-to-end)
13. [Cara menjalankan](#menjalankan)
14. [Yang sengaja belum dibuat](#belum)

---

<a id="peta-modul"></a>
## 1. Peta modul

| Modul | Halaman | Service inti | Status |
|---|---|---|---|
| Dasbor operasional | `/admin` | `analytics.ts` | Selesai |
| Order & invoice | `/orders` | `orders.ts`, `erpEngine.ts` | Selesai |
| Proyek buku (4 track paralel) | `/projects`, `/projects/[id]` | `erpEngine.ts` | Selesai |
| Keuangan | `/admin/finance` | `erpEngine.ts` | Selesai |
| Katalog | `/admin/katalog` | — (CRUD langsung) | Selesai |
| Direktori penulis | `/admin/penulis`, `/admin/penulis/[id]` | `accounts.ts`, `authors.ts` | Selesai |
| Direktori freelancer | `/admin/freelancer` | `accounts.ts` | Selesai |
| Jejak aktivitas | `/admin/audit` | `audit.ts` | Selesai |
| Pengaturan | `/admin/pengaturan` | `settings.ts`, `dss.ts` | Selesai |
| Portal penulis | `/portal` | `erpEngine.ts` | Selesai |
| Ruang freelancer | `/freelancer` | `erpEngine.ts` | Selesai |
| Notifikasi | `/notifications` | `notifications.ts` | Selesai |
| **CRM** | `/crm`, `/crm/[id]`, `/crm/aktivitas`, `/crm/laporan`, `/crm/export` | `leads.ts`, `crm.ts` | Selesai |
| **DSS** | `/dss`, `/dss/judul`, `/dss/kas`, `/dss/produksi`, `/dss/simulasi`, `/dss/riwayat` | `dss.ts` | Selesai |
| Dokumen cetak | `(print)/invoice/[id]`, `(print)/admin/finance/cetak`, `(print)/admin/finance/laporan` | — | Selesai |

---

<a id="fondasi-teknis"></a>
## 2. Fondasi teknis

### Keamanan aksi form
- **Kunci idempoten** (`idempotency.ts`): setiap submit membawa `requestId`; `runIdempotent()` memakai `insert … on conflict do nothing` sehingga dua tap cepat hanya menjalankan satu aksi. Aksi finansial (buat order, konversi lead, buat lead) memakainya.
- **Kunci sinkron di klien** (`forms.svelte.ts`): `Set` biasa diisi sebelum `fetch`, bukan state reaktif — tap kedua dibatalkan sebelum request dikirim.
- **Konfirmasi** (`confirm.svelte.ts` + `ConfirmHost`): aksi tak-bisa-dibatalkan wajib melewati dialog yang menyebut **akibatnya**, bukan sekadar "Yakin?".
- **Toast** (`toast.svelte.ts`): hasil aksi muncul sebagai notifikasi `aria-live`, error mendapat `role="alert"`.

### RBAC (`rbac.ts`)
Peta prefix rute → peran. Prefix terpanjang menang. `ROLE_HOME` menentukan halaman pendaratan setelah login.

| Rute | Peran |
|---|---|
| `/admin` | SUPER_ADMIN, PROJECT_MANAGER, FINANCE |
| `/projects`, `/orders` | SUPER_ADMIN, PROJECT_MANAGER, FINANCE |
| `/crm` | SUPER_ADMIN, PROJECT_MANAGER |
| `/dss` | SUPER_ADMIN, PROJECT_MANAGER, FINANCE |
| `/files`, `/notifications` | semua yang login |
| `/freelancer` | FREELANCER |
| `/portal` | AUTHOR |
| `/login`, `/auth`, `/api/public` | publik |

### Tabel & query yang dipakai bersama
- **`DataTable.svelte`** — satu array `DataColumn[]` merender `<table>` di desktop dan kartu di ponsel; tidak ada markup data ganda.
- **`table/query.ts`** — bahasa URL `?sort=&dir=&page=&size=&q=&filter`; nilai tak dikenal jatuh ke default aman, tidak pernah diteruskan mentah ke SQL.
- **`table/period.ts`** — filter periode `?month=` (menang atas `?from=&to=`).
- **`CurrencyInput.svelte`** — nilai mentah saat fokus, `1.500.000` saat blur; yang dikirim selalu digit mentah.
- **`printMath.ts`** — rumus HPP cetak murni, dipakai server *dan* klien (simulasi DSS). Satu rumus, bukan dua.

### Migrasi database
`0000_init_erp.sql` → `0001_auth_integration.sql` (FK `profiles.id` → `auth.users`) → `0002_idempotency_keys.sql` → `0003_p2_audit_notifications_lock.sql` → `0004_p3_settings.sql` → `0005_crm_foundation.sql` → `0006_dss.sql`. Semuanya idempoten (`if not exists`), dijalankan `node scripts/db-migrate.mjs`.

---

<a id="modul-inti"></a>
## 3. Modul inti: order → invoice → proyek → cetak → penjualan

### Order (`/orders`)
Membuat order berarti membuat **kontrak + dua invoice sekaligus** dalam satu transaksi (`orders.ts` → `createOrder`):
1. Hitung paket + layanan tambahan → `totalAmount`.
2. Buat order berstatus `AWAITING_DOWN_PAYMENT`.
3. Buat invoice DP (`milestonePct` dari paket, default 50%).
4. Buat invoice pelunasan bila sisa > 0.
5. Catat audit `order.created` + potongan `invoices`, `packageId`.

Pembatalan (`cancelOrder`) menolak bila **sudah ada pembayaran** — uang yang masuk tidak boleh hilang dari jejak hanya karena order dibatalkan.

### Mesin ERP (`erpEngine.ts`, 11 fungsi publik)

| Fungsi | Yang terjadi |
|---|---|
| `handleInvoicePaid` | Tandai lunas; bila DP → buat `book_projects` + 5 task pipeline + baris `inventory`; bila pelunasan → buka file master (`highResUnlocked`) |
| `assignProductionTask` | Tugaskan task ke freelancer, simpan struktur fee (flat/per-halaman) |
| `submitTaskRevision` | Revisi; bila melewati kuota paket → invoice `EXTRA_REVISION` |
| `approveProductionTask` | Setujui hasil; hitung `payoutAmount`; kredit komisi freelancer (idempoten per task) |
| `submitTaskForReview` | Kirim ke penulis untuk disetujui |
| `createPrintRun` | Hitung HPP dari pengaturan tarif; alokasikan eksemplar penulis + gudang |
| `receivePrintRun` | Terima cetakan; perbarui `on_hand` dan **HPP rata-rata tertimbang** |
| `recordBookSale` | Catat penjualan; potong stok; hitung `netRoyalty` = (harga − HPP) × qty × %royalti; tulis `royalty_ledgers` |
| `getWalletSummary` | Saldo tersedia/tertahan/tertarik per dompet |
| `requestWithdrawal` | Ajukan penarikan; **menolak di bawah minimum** dari pengaturan |
| `processWithdrawal` | Setujui / bayar / tolak; perbarui status ledger |

### Proyek buku (`/projects`, `/projects/[id]`)
Empat track paralel yang statusnya disimpan terpisah, bukan satu status gabungan:

| Track | Tahapan |
|---|---|
| Editorial & Layout | `MANUSCRIPT_SUBMITTED → EDITING → PROOFREADING → LAYOUTING → AUTHOR_REVIEW → LAYOUT_APPROVED` |
| Cover Studio | `BRIEF_SUBMITTED → DRAFTING_COVER → AUTHOR_REVIEW → COVER_APPROVED` |
| Legal & ISBN | `PENDING_FILES → SUBMITTED_TO_PERPUSNAS → ISBN_ISSUED` |
| Cetak | `PRINT_QUEUE → PRINTING → QUALITY_CONTROL → SHIPPED_TO_AUTHOR → ADDED_TO_WAREHOUSE` |

- **Penguncian optimistik** via `book_projects.version`: form membawa versi yang dibaca; UPDATE hanya jalan bila masih sama. Yang kalah mendapat 409 + data terbaru — dua PM tidak bisa saling menimpa diam-diam.
- **Unggah berkas** (`fileUpload.ts`): aturan per jenis (MIME, ukuran, wajib lunas atau tidak). Supabase bila dikonfigurasi, kalau tidak ke disk lokal `.data/uploads` dan disajikan `/files/[id]` dengan RBAC + gerbang pembayaran.
- **Komentar per task** (`comments.ts`) dengan pemisahan catatan internal vs publik.

---

<a id="keuangan"></a>
## 4. Keuangan (`/admin/finance`)

| Aksi | Perilaku |
|---|---|
| `pay-invoice` | Verifikasi satu transfer: jumlah, metode, referensi, tanggal; memicu `handleInvoicePaid` |
| `pay-invoices-bulk` | Verifikasi banyak invoice sekaligus |
| `mark-overdue-bulk` | Tandai jatuh tempo sebagai penanda tindak lanjut (tidak mengubah uang) |
| `process-withdrawal` | Setujui / bayar / tolak penarikan (komisi freelancer & royalti penulis) |

- Tab **piutang** dengan bucket umur (`0–30`, `31–60`, `61–90`, `>90`), dihitung dari **tanggal jatuh tempo**, bukan tanggal invoice.
- **Ekspor CSV** (`/admin/finance/export`): mengikuti filter aktif, BOM UTF-8 + pemisah `;` (Excel lokal Indonesia membaca koma sebagai desimal).

### Dokumen cetak (`(print)`)
Grup rute terpisah dengan layout sendiri — tanpa navigasi, margin A4 14mm, tabel `break-inside: avoid`, tema dipaksa terang agar tidak mencetak latar hitam:
- `/invoice/[id]` — invoice resmi
- `/admin/finance/cetak` — rekap HPP & order cetak
- `/admin/finance/laporan` — laporan keuangan periode

---

<a id="katalog-pengaturan-jejak-audit"></a>
## 5. Katalog, pengaturan, jejak audit

### Katalog (`/admin/katalog`)
CRUD paket & layanan. Paket membawa `basePrice`, `downPaymentPct`, `authorRoyaltyPct`, kuota revisi, `freeAuthorCopies`, dan flag cakupan (ISBN/layout/cover/editing). Duplikat kode → **409** (deteksi `23505` lewat `cause.code`, bukan `e.code` — Drizzle membungkus error driver).

### Pengaturan (`/admin/pengaturan`)
Tersimpan di `app_settings` (key + jsonb), dengan default di `settings.ts` supaya kode tetap benar sebelum ada yang menyimpan. Cache TTL 10 detik, di-invalidate setelah simpan.

| Domain | Isi |
|---|---|
| `print` | Tarif kertas per halaman (bookpaper/HVS/art paper), pengali ukuran, biaya jilid, laminasi, pengali full color, minimum halaman, PPN |
| `document` | Prefix nomor invoice/order/penarikan/penjualan (2–6 huruf kapital) |
| `withdrawal` | Minimum penarikan |
| **Ambang keputusan** (DSS) | 10 ambang: margin minimum, hari tutup stok, batas lambat laku, modal tertahan, toleransi lewat tenggat, konsentrasi piutang, ambang tahan produksi, batas task terbuka, hari task macet, peringatan tenggat |

Pratinjau HPP hidup: contoh 176 halaman A5 bookpaper, 300 eksemplar, berubah saat tarif diubah.

### Jejak audit (`/admin/audit`)
Setiap aksi yang mengubah **uang, status, atau isi karya** dicatat: aktor, peran, aksi, entitas, ringkasan, diff `changes`, `context`, `requestId`. Pembacaan halaman tidak dicatat — audit yang terlalu berisik tidak dibaca siapa pun.

Label aksi Indonesia ada di `audit.ts` (`AUDIT_ACTION_LABEL`, `AUDIT_ENTITY_LABEL`) sehingga timeline bisa difilter dan terbaca.

---

<a id="portal-freelancer"></a>
## 6. Portal penulis & ruang freelancer

### Portal penulis (`/portal`)
- Daftar buku + progres tiap track.
- Review hasil kerja: setujui atau minta revisi (memicu invoice revisi ekstra bila kuota habis).
- Unduh file: pratinjau selalu boleh, file resolusi tinggi **hanya setelah pelunasan**.
- Komentar publik ke task.
- **Dompet royalti**: saldo tersedia, riwayat entri, dan pengajuan penarikan (minimum dari pengaturan, ditegakkan di server).

### Ruang freelancer (`/freelancer`)
- Tugas yang ditugaskan, fee, tenggat.
- Kirim hasil untuk review.
- Komentar (dengan pemisahan internal).
- Saldo komisi & riwayat.

---

<a id="crm"></a>
## 7. CRM

Dirancang dari pertanyaan: *"bagian CRM mana yang benar-benar dibutuhkan penerbit buku?"* — satu prospek = satu naskah + satu paket, bukan "deal" abstrak. Roadmap lengkap: `docs/CRM-ROADMAP.md`.

### Skema
`leads`, `lead_activities`, `lead_tasks`, `lead_tags`, `message_templates`, `outreach_logs`.
Enum: `lead_stage` (PROSPEK → KONTAK → PROPOSAL → NEGOSIASI → MENANG/KALAH), `lead_source` (6 nilai), `lead_activity_kind` (5), `outreach_channel` (2).

### Halaman

**`/crm` — papan pipeline**
- Papan 4 kolom di desktop (bertumpuk di ponsel), plus daftar lewat `DataTable`.
- KPI: pipeline aktif + nilainya, nilai terbobot (bobot per tahap: 10/25/50/75%), menang bulan ini, berisiko dingin.
- Filter sumber/pemilik/pencarian lewat URL; tampilan papan/daftar bisa dibagikan.
- Tahap bergerak **satu langkah per klik**, bukan drag-drop — di layar sempit drag selalu kalah akurat.

**`/crm/[id]` — detail prospek**
- Ubah data, gerakkan tahap, catat aktivitas, tugas follow-up, tag.
- **Konversi menang**: membuat akun penulis lewat `auth.users` + profil (atau menyambung ke akun yang sudah ada), mencatat aktivitas konversi, lalu mengarahkan ke `/orders?authorId=…&bookTitle=…` dengan form **sudah terbuka dan terisi**.
- Menolak konversi tanpa email; menolak ubah tahap setelah dikonversi (identitas sudah dipakai order).

**`/crm/aktivitas` — umpan kerja**
- Feed aktivitas lintas prospek + tugas yang jatuh tempo/lewat (lewat tenggat, hari ini).

**`/crm/laporan`**
- Funnel per tahap + nilai terbobot, win rate (**hanya prospek selesai** — pipeline penuh tidak boleh membuat win rate tampak buruk), sumber terbaik, tren prospek masuk 12 bulan, aktivitas per staf 30 hari, statistik outreach per kanal.

**`/crm/export`** — CSV mengikuti filter aktif, BOM UTF-8, pemisah `;`.

### Aturan bisnis
- **`lastContactAt` adalah turunan**, bukan isian manual: aktivitas non-`NOTE` memperbaruinya; menghapus aktivitas menghitung ulang dari sisa.
- Komentar internal (`NOTE`) tidak dihitung sebagai kontak — kontak berarti ada percakapan.
- **Kesehatan**: >30 hari tanpa kontak dan bukan MENANG/KALAH → "berisiko dingin" (atau "perlu perhatian" bila punya order berjalan). Prospek baru memakai `createdAt` sebagai titik nol, jadi tidak langsung dianggap dingin.
- NEGOSIASI wajib punya estimasi nilai; KALAH wajib alasan; MENANG hanya lewat konversi.
- Notifikasi `crm_followup_due` dan `crm_lead_cold` menumpang tabel `notifications` dengan `dedupeKey` (dingin: dedupe bergulir 7 hari agar tidak membanjiri lonceng).

### Intel penulis (`/admin/penulis/[id]`)
Profil 360: nilai kontrak, royalti tersedia/tertarik, jumlah buku & terbit, sentuhan CRM terakhir, tag. Dasbor menampilkan panel **"Penulis Perlu Disapa"** (tanpa kontak >30 hari, tanpa order berjalan).

---

<a id="dss"></a>
## 8. DSS (Sistem Pendukung Keputusan)

Dasbor menjawab *"apa yang terjadi"*, laporan menjawab *"berapa totalnya"*, DSS menjawab **"jadi saya harus apa"**. Roadmap lengkap: `docs/DSS-ROADMAP.md`.

### Kontrak setiap rekomendasi
Fakta pemicu → ambang yang berlaku → alasan satu kalimat → dampak rupiah → tautan tindakan → jejak keputusan. Tidak ada skor simpanan: semua dihitung saat halaman dibuka.

### Skema
- `decision_rules` — ambang per domain (`title`, `cash`, `production`), jsonb.
- `decision_log` — satu baris per keputusan: `rule_key`, domain, entitas, verdict (`ACCEPTED`/`DISMISSED`), ringkasan, **`facts`** (angka saat memutuskan), dampak, catatan, aktor, waktu.
- `scenario_snapshots` — simulasi what-if tersimpan.

### `/dss` — pusat keputusan
Menggabungkan rekomendasi tiga domain, diurut **urgensi (3/2/1) lalu dampak rupiah**. Rekomendasi yang sudah diputuskan dalam 14 hari disembunyikan; riwayatnya tetap ada. Setiap kartu punya **Kerjakan** dan **Tidak sekarang** (alasan ≥5 karakter wajib).

Contoh yang benar-benar terpicu saat diuji:
- *"Margin 'Menanam Modal' di bawah ambang — 25% (Rp 13.500/eksemplar), ambang 50%."*
- *"Tagih INV-202610-0007 — lewat 18 hari, sisa Rp 150.000."*
- *"'Tata Letak & Proofreading Akhir' tidak bergerak — Rekayasa Perangkat Lunak Nusantara (90 hari)."*

### `/dss/judul` — harga, cetak ulang, hentikan
Tabel per judul: HPP nyata, harga, margin (Rp dan %), stok, laju jual 30 hari, hari stok tersisa, keputusan, dan ubah harga retail langsung dari baris.

| Keputusan | Aturan |
|---|---|
| **Cetak ulang** | stok tersisa ≤ `reorderCoverDays` × laju harian, dan laku ≥ ambang lambat |
| **Modal tertahan** | laku < `slowMoverPerMonth` dan nilai stok ≥ `deadStockValue` |
| **Margin tipis** | margin < `minMarginPct`; sekaligus menampilkan harga minimum agar mencapai ambang |
| **Belum dinilai** | belum punya HPP nyata (belum pernah dicetak) — ditampilkan, bukan disembunyikan |

### `/dss/kas` — tagih siapa dulu
- Antrean penagihan diurut umur lalu nilai, dengan riwayat keterlambatan penulisnya.
- **Proyeksi kas 8 minggu berbobot riwayat koleksi**: tiap tagihan ditimbang rasio lunas historis pada bucket umurnya (`0–30`, `31–60`, `61–90`, `>90`). Bukan asumsi "semua dibayar" — proyeksi optimis membuat keputusan menahan produksi tidak pernah diambil.
- Konsentrasi piutang per penulis (>`concentrationPct` = risiko terkumpul).
- Saran **menahan produksi baru** bila eksposur melewati ambang.

### `/dss/produksi` — bottleneck & risiko telat
- Beban per track: task terbuka, review, **umur task tertua** (bukan rata-rata — satu task nyangkut menahan seluruh track).
- Beban freelancer: siapa kelebihan (`maxOpenTasks`), siapa menganggur, berapa selesai 30 hari.
- Risiko tenggat: proyek dengan task belum selesai yang tenggatnya ≤ `deadlineWarnDays` atau sudah lewat, diurut sisa hari.
- Task tidak bergerak ≥ `staleTaskDays`.

### `/dss/simulasi` — sebelum dijanjikan
- HPP dihitung di browser dengan **`computePrintCostPure` yang sama** dengan mesin ERP — tidak ada tarif kedua.
- Keluaran: HPP/eksemplar, harga bersih setelah diskon, margin/eksemplar & %, royalti penulis/eksemplar, sisa penerbit, total margin, **BEP**, dan **harga minimum untuk margin target**.
- Perbandingan terhadap harga retail rata-rata yang sudah dipakai.
- Skenario bisa disimpan; saat menyimpan, **HPP dihitung ulang di server** (angka klien tidak dipercaya).
- **Harga jual buku ≠ harga kontrak paket**: `packages.base_price` adalah harga jasa penerbitan. Simulasi hanya mengambil persentase royalti dari paket; harga jual dari retail `inventory` atau input manual. Mencampur keduanya pernah menghasilkan margin 98% palsu — sudah diperbaiki.

### `/dss/riwayat`
Semua keputusan + alasan penolakan + dampak + aktor. Filter semua/dikerjakan/ditolak.

---

<a id="rbac"></a>
## 9. Peran & akun demo

| Peran | Halaman mendarat | Bisa apa |
|---|---|---|
| SUPER_ADMIN | `/admin` | Semua: order, proyek, keuangan, katalog, direktori, CRM, DSS, pengaturan |
| PROJECT_MANAGER | `/admin` | Order, proyek, katalog, penulis, freelancer, CRM, DSS, audit; tanpa menu keuangan |
| FINANCE | `/admin` | Keuangan, piutang, pengaturan, DSS, audit; tanpa CRM |
| FREELANCER | `/freelancer` | Tugas sendiri, kirim hasil, komentar |
| AUTHOR | `/portal` | Buku sendiri, review, unduh, royalti, penarikan |

Akun demo (`scripts/seed.mjs`, kata sandi `penerbit123`):

| Email | Nama | Peran |
|---|---|---|
| `nadia@penerbit.co.id` | Nadia Prameswari | SUPER_ADMIN |
| `raka@penerbit.co.id` | Raka Adhitama | PROJECT_MANAGER |
| `sari@penerbit.co.id` | Sari Wulandari | FINANCE |
| `edwin@freelance.id` | Edwin Kusuma | FREELANCER (editor) |
| `maya@freelance.id` | Maya Larasati | FREELANCER (cover) |
| `bayu@freelance.id` | Bayu Nugraha | FREELANCER (layout) |
| `tika@freelance.id` | Tika Ramadhani | FREELANCER (proofreader) |
| `penulis@demo.id` | Ayu Sekarwangi | AUTHOR |
| `dimas@demo.id` | Dimas Prasetyo | AUTHOR |

Data seed: 3 paket, 5 layanan, 3 order, 7 invoice, 3 proyek (satu terbit, satu menunggu penulis, satu sedang cetak), 2 order cetak, 4 penjualan, 4 entri royalti, 1 penarikan tertunda.

---

<a id="skema"></a>
## 10. Skema database (ringkas)

| Kelompok | Tabel |
|---|---|
| Identitas | `profiles` (FK ke `auth.users`) |
| Katalog | `packages`, `services`, `package_services` |
| Kontrak | `orders`, `order_items`, `invoices`, `invoice_payments` |
| Produksi | `book_projects`, `production_tasks`, `revisions`, `task_comments`, `file_assets` |
| Cetak & stok | `print_runs`, `inventory` |
| Penjualan & dompet | `book_sales`, `royalty_ledgers`, `freelancer_ledgers`, `withdrawal_requests` |
| Operasional | `notifications`, `audit_logs`, `app_settings`, `document_sequences`, `idempotency_keys` |
| CRM | `leads`, `lead_activities`, `lead_tasks`, `lead_tags`, `message_templates`, `outreach_logs` |
| DSS | `decision_rules`, `decision_log`, `scenario_snapshots` |

**Catatan penting:** `profiles.id` punya FK ke `auth.users(id)`. Akun **tidak boleh** di-insert langsung ke `profiles` — selalu lewat `accounts.ts` (insert `auth.users` lalu upsert profil). Insert langsung selalu gagal dengan pelanggaran FK.

---

<a id="keputusan"></a>
## 11. Keputusan teknis yang mengikat

1. **Nominal disimpan sebagai `numeric(14,2)` (string di Postgres).** Semua perhitungan lewat `toNumber()`/`toMoneyString()`; IDR dibulatkan ke rupiah penuh.
2. **Koma desimal diterima.** Input Indonesia menampilkan `1,25`; `parseFloat('1,25')` menghasilkan `1` tanpa error — bug senyap yang pernah ditemukan dan diperbaiki di parser pengaturan.
3. **Nomor dokumen atomik per periode** (`document_sequences` + UPSERT RETURNING), prefix dari pengaturan.
4. **HPP rata-rata tertimbang** saat menerima cetakan: `(HPP lama × stok lama + HPP baru × qty) / total` — bukan rata-rata sederhana.
5. **Royalti dihitung dari laba kotor**: (harga − HPP) × qty × %royalti. Simulasi DSS memakai rumus yang sama, kalau tidak ia akan menjanjikan royalti yang tidak pernah dibayar.
6. **Uang tidak boleh hilang dari jejak.** Order dengan pembayaran tidak bisa dibatalkan; invoice `VOID` tetap ada.
7. **Semua agregat dihitung di SQL**, bukan dengan menarik seluruh baris ke Node.
8. **Deret bulan selalu padat.** Bulan kosong diisi nol — grafik garis berlubang terlihat seperti data hilang.
9. **Grafik selalu punya tabel angka di bawahnya.** SVG tidak terbaca pembaca layar dan tidak berguna saat dicetak hitam-putih.
10. **Konten terlihat tanpa JavaScript.** Tidak ada reveal `opacity:0` yang menunggu scroll.
11. **Server tidak mempercayai angka klien** saat menyimpan skenario DSS: HPP dihitung ulang.
12. **Setiap migrasi idempoten** supaya aman dijalankan ulang di database nyata.

---

<a id="alur-end-to-end"></a>
## 12. Alur data end-to-end

```
Prospek (CRM)
  └─ menang → akun penulis (auth.users + profil)
       └─ Order  ──┬─ Invoice DP ──┐
                   └─ Invoice Pelunasan
                                 │
                   DP lunas ─────┴─→ book_project + 5 task + inventory
                                 │
              task → freelancer → revisi → approve → komisi
                                 │
                   pelunasan ────┴─→ file master terbuka
                                 │
                          print_run (HPP) → receive → stok + HPP rata-rata
                                 │
                          book_sales → royalty_ledger → dompet penulis
                                 │
                    penarikan (minimum dicek) → finance → dibayar
                                 │
                                 ▼
                   DSS membaca semuanya: margin, stok, piutang,
                   beban produksi, dan mengusulkan keputusan
```

---

<a id="menjalankan"></a>
## 13. Cara menjalankan

```bash
npm install
node scripts/db-migrate.mjs     # menerapkan 0000–0006, melewati yang sudah ada
node scripts/seed.mjs           # data demo (idempoten, UUID tetap)
npm run dev                     # http://localhost:5173
```

Pemeriksaan wajib sebelum menandai pekerjaan selesai:

```bash
npx svelte-check --tsconfig ./tsconfig.json   # harus 0 error, 0 warning
npm run build                                  # harus lulus
```

Login: tanpa kunci Supabase, sesi diverifikasi langsung ke database (mode pengembangan) memakai akun demo di atas.

---

<a id="belum"></a>
## 14. Yang sengaja belum dibuat

| Tidak dibuat | Alasan |
|---|---|
| Email blast / SMTP | Penerbitan ini berkomunikasi lewat WhatsApp; infrastruktur email massal menambah risiko deliverability tanpa kebutuhan nyata. Yang ada: template + log. |
| Sinkronisasi WhatsApp API | Butuh vendor + biaya per pesan; template + log menutup kebutuhan pencatatan. |
| Skoring prediktif / ML | Data historis belum cukup; aturan yang bisa dijelaskan lebih jujur dan tidak menyesatkan saat pola berubah. |
| Optimasi jadwal otomatis (LP) | Kendala nyata (kesediaan freelancer, revisi penulis) tidak terukur. Rekomendasi berperingkat + keputusan manusia lebih realistis. |
| Deal terpisah dari order | Order sudah menjadi dokumen kontrak; "deal" kembar akan menduplikasi nilai uang. |
| Multi-pipeline CRM | Satu alur sudah mewakili proses nyata: naskah masuk → kontrak. |
| Rule builder bebas untuk DSS | Ambang boleh diubah, struktur aturan tetap di kode agar bisa diuji dan tidak menghasilkan aturan yang saling bertentangan. |
| Kolom cache skor/kesehatan | Skor tersimpan berbohong setelah satu transaksi; semua dihitung saat render. |
| Lead time per track (DSS-4) | Diganti umur task tertua, yang lebih langsung menjawab "apa yang nyangkut". |

---

## Dokumen terkait

- `docs/CRM-ROADMAP.md` — rencana + status CRM, prinsip, non-goals.
- `docs/DSS-ROADMAP.md` — rencana + status DSS, kontrak rekomendasi, catatan implementasi.
- `src/lib/server/db/schema.ts` — sumber kebenaran skema.
- `scripts/seed.mjs` — data demo dan akun.

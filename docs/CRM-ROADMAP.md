# Roadmap CRM — ERP Penerbitan

Dokumen ini menjawab satu pertanyaan: **bagian CRM mana yang benar-benar dibutuhkan penerbit buku**, dan dalam urutan apa dibangun.

Kondisi awal (sebelum CRM): `profiles` hanya berisi akun yang sudah bisa login. Tidak ada tempat untuk prospek yang belum jadi penulis, tidak ada catatan follow-up, tidak ada cara mengukur dari mana penulis datang atau mengapa satu prospek menang dan yang lain kalah. Order langsung lahir dari penulis yang sudah ada.

---

## Prinsip

1. **CRM penerbitan bukan CRM SaaS.** Yang dijual adalah penerbitan buku: satu prospek = satu naskah + satu paket. Karena itu prospek membawa `bookTitle` dan `genre`, bukan "deal value" abstrak.
2. **Jangan duplikasi penulis.** Lead yang menang **berubah menjadi** akun penulis (`profiles`) lalu order. Satu orang, satu baris identitas, riwayat percakapan tetap menempel.
3. **Setiap angka bisa ditelusuri.** Win rate, nilai pipeline, dan sumber terbaik dihitung dari baris nyata (lead + aktivitas), bukan kolom cache yang bisa melenceng.
4. **Mobile sama pentingnya.** Pipeline tidak boleh jadi papan 6 kolom yang harus digeser ke samping di ponsel.
5. **CRM tidak boleh memblokir alur lama.** Semua halaman lama tetap berjalan; CRM menambah pintu, bukan mengganti.

---

## CRM-1 — Fondasi: prospek, pipeline, konversi

**Tujuan:** prospek punya tempat tinggal, dan perjalanannya sampai jadi order terlihat.

- Skema: `leads`, `lead_activities`, `lead_tasks`, `message_templates`, `outreach_logs`.
- Enum: `lead_stage` (PROSPEK → KONTAK → PROPOSAL → NEGOSIASI → MENANG/KALAH), `lead_source`, `lead_activity_kind`, `outreach_channel`.
- Halaman `/crm`: papan pipeline (kolom per tahap di desktop, tumpukan per tahap di ponsel), KPI (prospek aktif, nilai pipeline, menang bulan ini), filter sumber/PIC/pencarian.
- Halaman `/crm/[id]`: detail prospek + ubah tahap + ubah data.
- **Konversi**: lead MENANG → buat akun penulis (bila belum ada) → arahkan ke `/orders` dengan penulis terpilih. Lead menyimpan `authorId` dan `orderId` hasil konversi.
- RBAC: SUPER_ADMIN + PROJECT_MANAGER. Audit untuk create/stage-change/convert/lost.

**Selesai bila:** prospek baru bisa dibuat dari nol, dipindah tahapnya, dan dikonversi menjadi penulis tanpa menyentuh SQL.

---

## CRM-2 — Aktivitas & follow-up

**Tujuan:** CRM berhenti jadi daftar nama; jadi ingatan tim.

- Timeline aktivitas per prospek (catatan, telepon, WhatsApp, email, meeting).
- Form "catat aktivitas" satu langkah; `lastContactAt` ikut diperbarui.
- Tugas follow-up dengan tenggat, selesai/ belum, dan penanggung jawab.
- Notifikasi otomatis untuk follow-up yang jatuh tempo (menumpang `notifications` yang sudah ada, dengan `dedupeKey`).
- Halaman `/crm/aktivitas`: feed semua aktivitas + daftar tugas (hari ini, lewat, mendatang).

**Selesai bila:** staf bisa melihat prospek mana yang sudah lama tidak disentuh dan apa yang harus dilakukan hari ini.

---

## CRM-3 — Intel penulis & segmentasi

**Tujuan:** tahu siapa penulis yang layak dipertahankan.

- Profil 360 penulis di `/admin/penulis/[id]`: order, nilai kontrak, royalti, buku terbit, aktivitas CRM terakhir.
- Penandaan (tag) prospek/penulis untuk segmentasi ringan (`genre`, `potensi-lanjut`, `perlu-perhatian`).
- Skor kesehatan sederhana: hari sejak kontak terakhir + ada/tidak order berjalan → "sehat / perlu perhatian / berisiko".
- Daftar "perlu perhatian" di `/crm` (tanpa aktivitas > 30 hari dan belum menang/kalah).

**Selesai bila:** pertanyaan "penulis mana yang mulai dingin?" bisa dijawab dalam satu layar.

---

## CRM-4 — Outreach & laporan

**Tujuan:** komunikasi konsisten dan keputusan berbasis angka.

- Template pesan per kanal (WhatsApp/email) yang bisa disalin; log outreach tercatat per prospek/penulis.
- `/crm/laporan`: funnel konversi per tahap, win rate, nilai pipeline terbobot (nilai × probabilitas), sumber terbaik, aktivitas per staf, tren prospek masuk per bulan.
- Ekspor CSV prospek (mengikuti filter aktif), memakai kontrak tabel yang sudah ada (`/crm/export`).

**Selesai bila:** laporan bisa dijawab tanpa membuka SQL, dan ekspor bisa langsung dipakai rapat mingguan.

---

## Yang sengaja TIDAK dibuat

| Tidak dibuat | Alasan |
|---|---|
| Email blast / SMTP | Penerbitan ini berkomunikasi lewat WhatsApp; infrastruktur email massal menambah risiko deliverability tanpa kebutuhan nyata. Yang dibuat: template + log. |
| Skoring prediktif | Data historis belum cukup untuk model; skor aturan (hari sejak kontak) lebih jujur dan bisa dijelaskan. |
| Sinkronisasi WhatsApp API | Butuh vendor + biaya per pesan; template + log sudah menutup kebutuhan pencatatan. |
| Multi-pipeline | Satu alur sudah mewakili proses nyata: naskah masuk → kontrak. Menambah pipeline kedua hanya menambah pilihan yang tidak dipakai. |
| Deal produk terpisah dari order | Order sudah menjadi dokumen kontrak; membuat "deal" kembar akan menduplikasi nilai uang. |

---

## Status

| Fase | Status | Bukti |
|---|---|---|
| CRM-1 | Selesai | `/crm` + `/crm/[id]`, migrasi `0005_crm_foundation.sql`, konversi ke penulis + prefill `/orders` |
| CRM-2 | Selesai | timeline aktivitas, tugas + tenggat, `/crm/aktivitas`, notifikasi `crm_followup_due` & `crm_lead_cold` |
| CRM-3 | Selesai | `/admin/penulis/[id]`, tag, kesehatan prospek, daftar "Penulis Perlu Disapa" di dasbor |
| CRM-4 | Selesai | template pesan + `outreach_logs`, `/crm/laporan`, `/crm/export` (CSV BOM `;`) |

Catatan implementasi yang menyimpang dari rencana awal:

- Skor kesehatan tidak disimpan; dihitung saat render dari `lastContactAt` + order berjalan. Prospek baru yang belum pernah dihubungi memakai `createdAt` sebagai titik nol, jadi tidak langsung dianggap dingin.
- Konversi lead ditempatkan di halaman detail (`?/convert`), bukan di papan: konversi butuh konfirmasi dan judul/paket, dan papan hanya memuat satu baris per kartu.
- Tugas follow-up belum punya kolom penanggung jawab terpisah; penerima notifikasi adalah Project Manager aktif + pemilik prospek. Kolom `ownerId` pada lead sudah menjadi penanggung jawab efektif.

---

## Urutan eksekusi & verifikasi

Setiap tahap: `svelte-check` → `npm run build` → uji desktop + mobile → data uji dibersihkan.

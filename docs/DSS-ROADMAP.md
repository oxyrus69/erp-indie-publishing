# Roadmap DSS — Sistem Pendukung Keputusan ERP Penerbitan

Dokumen ini menjawab satu pertanyaan: **keputusan apa yang sebenarnya diambil orang penerbit setiap minggu, dan data mana yang bisa membuat keputusan itu lebih baik.**

Kondisi awal: ERP sudah mencatat (order, invoice, proyek, task, cetak, penjualan, royalti, CRM) dan sudah punya **dasbor** serta **laporan**. Keduanya menjawab "apa yang terjadi". Tidak ada tempat yang menjawab **"jadi saya harus apa"** — dan tidak ada jejak keputusan yang pernah diambil, sehingga tidak ada yang bisa dinilai ulang.

---

## Beda dasbor, laporan, dan DSS

| | Menjawab | Bentuk |
|---|---|---|
| Dasbor | Apa yang terjadi sekarang? | Angka + grafik |
| Laporan | Berapa totalnya pada rentang itu? | Tabel + ekspor |
| **DSS** | **Apa yang harus saya putuskan, dan mengapa?** | **Rekomendasi + alasan + dampak + tindakan + catatan keputusan** |

Karena itu setiap rekomendasi DSS **wajib** punya lima bagian:

1. **Fakta** — angka yang bisa ditelusuri ke baris nyata (bukan skor simpanan).
2. **Ambang** — aturan yang bisa diubah tanpa deploy (`decision_rules`).
3. **Alasan** — satu kalimat yang menyebut fakta pemicunya.
4. **Dampak** — rupiah atau eksemplar, supaya rekomendasi bisa diurutkan.
5. **Tindakan** — tautan ke aksi nyata (buat order cetak, tagih invoice, ubah harga).
6. **Jejak** — diterima/ditolak, oleh siapa, kapan, dengan catatan (keputusan bisa dievaluasi).

---

## Prinsip

1. **DSS tidak menghitung ulang laporan.** Ia membaca tabel yang sudah ada dan menambahkan *penilaian*, bukan salinan angka.
2. **Tidak ada skor yang disimpan.** Semua penilaian dihitung saat halaman dibuka. Skor tersimpan berbohong begitu satu transaksi masuk.
3. **Ambang bisa diubah, rumus tidak.** Tim boleh menggeser "stok habis dalam 45 hari" lewat pengaturan; rumus margin dan HPP tetap di kode supaya tidak ada dua kebenaran.
4. **Rekomendasi harus bisa ditolak.** DSS yang tidak bisa ditolak adalah perintah. Setiap rekomendasi punya tombol "tidak sekarang" yang tercatat beserta alasannya.
5. **Urutkan berdasarkan uang, bukan berdasarkan abjad.** Rekomendasi teratas adalah yang paling mahal kalau diabaikan.
6. **Satu keputusan = satu baris.** `decision_log` menyimpan konteks saat memutuskan (angka saat itu), supaya enam bulan kemudian bisa dinilai apakah keputusannya benar.

---

## DSS-1 — Fondasi: pusat keputusan & jejak

**Tujuan:** ada satu layar yang menjawab "hari ini saya harus memutuskan apa", dan setiap keputusan yang diambil tercatat.

- Skema:
  - `decision_rules` — ambang per domain (`key` unik, `value` jsonb), default di kode.
  - `decision_log` — satu baris per keputusan: rule key, entitas, verdict (`ACCEPTED`/`DISMISSED`), ringkasan, dampak, catatan, aktor, waktu, plus snapshot fakta (jsonb).
  - `scenario_snapshots` — simulasi what-if yang disimpan (nama, input, hasil, pembuat).
- Service `dss.ts`: tipe `Recommendation`, aturan murni per domain, pemuat data, dan pengurutan berdasarkan dampak.
- Halaman `/dss`: kartu ringkasan (dampak terbuka, keputusan minggu ini, tingkat penerimaan), lalu daftar rekomendasi tergabung dari semua domain.
- Setiap kartu: fakta, alasan, dampak, tautan tindakan, tombol **Kerjakan** dan **Tidak sekarang** (wajib alasan singkat).
- RBAC: SUPER_ADMIN + PROJECT_MANAGER + FINANCE. Audit untuk setiap keputusan.
- Pengaturan `/admin/pengaturan` mendapat domain **Ambang Keputusan** (stok, umur piutang, margin minimum, kapasitas).

**Selesai bila:** satu prospek/judul/tagihan yang bermasalah muncul sebagai rekomendasi berurutan dampak, bisa ditandai dikerjakan atau ditolak, dan jejaknya terlihat di halaman riwayat.

---

## DSS-2 — Keputusan judul: harga, cetak ulang, hentikan

**Tujuan:** tiap judul punya jawaban "lanjut, naikkan harga, cetak ulang, atau sudahi".

- `/dss/judul`: tabel keputusan per judul dengan kolom: HPP aktual/eksemplar, harga jual, margin per eksemplar, eksemplar terjual, laju jual (30 hari), stok, hari stok tersisa, BEP eksemplar, status keputusan.
- Aturan:
  - **Naikkan harga** — margin < ambang (`minMarginPct`) sementara laju jual sehat.
  - **Cetak ulang** — stok tersisa < `reorderCoverDays` × laju jual harian.
  - **Turunkan harga / hentikan** — laju jual < `slowMoverPerMonth` dan stok menumpuk.
  - **Belum bisa dinilai** — belum ada HPP nyata (belum pernah cetak) atau belum ada penjualan; ditampilkan terpisah, bukan disembunyikan.
- Simulasi cepat per judul: geser harga/qty → margin dan BEP berubah di tempat, tanpa menyimpan.
- Tindakan langsung: buat order cetak ulang (tautan ke proyek), ubah harga retail di inventori.

**Selesai bila:** "judul mana yang harus dicetak ulang minggu ini" dan "judul mana yang merugi" terjawab dalam satu tabel.

---

## DSS-3 — Keputusan kas: tagih siapa dulu, tahan produksi atau tidak

**Tujuan:** prioritas penagihan yang bisa dipertanggungjawabkan, dan proyeksi kas yang jujur.

- `/dss/kas`:
  - **Antrean penagihan** — invoice belum lunas diberi skor risiko (umur × nilai × riwayat pelanggan), diurutkan; tiap baris menyebut alasan skornya.
  - **Proyeksi kas 8 minggu** — dari jatuh tempo invoice + tingkat koleksi historis per umur; bukan asumsi "semua akan bayar".
  - **Keputusan menahan produksi** — proyek yang boleh lanjut vs ditahan karena eksposur piutang melewati ambang.
  - **Konsentrasi piutang** — berapa persen piutang ada di satu penulis/order (risiko).
- Rekomendasi masuk ke `/dss` (mis. "Tagih INV-… Rp 7.200.000, umur 45 hari, pelanggan belum pernah telat sebelumnya").
- Ekspor CSV antrean penagihan (mengikuti filter), memakai kontrak tabel yang ada.

**Selesai bila:** pertanyaan "kalau saya hanya bisa menagih tiga invoice hari ini, yang mana" terjawab dengan urutan dan alasan.

---

## DSS-4 — Keputusan produksi: bottleneck & urutan pengerjaan

**Tujuan:** tahu di mana pekerjaan menumpuk dan proyek mana yang berisiko telat.

- `/dss/produksi`:
  - **Beban per track** (editorial, layout, cover, legal, cetak) — jumlah task terbuka, WIP, dan hari kerja tertua.
  - **Lead time nyata** — median hari dari penugasan ke persetujuan, per track dan per freelancer.
  - **Risiko telat** — proyek dengan deadline task terdekat sudah lewat, atau sisa hari < lead time track yang belum selesai.
  - **Urutan yang disarankan** — proyek diurutkan dampak keterlambatan (nilai kontrak × sisa hari).
  - **Beban freelancer** — siapa kelebihan (di atas `maxOpenTasks`) dan siapa menganggur.
- Tindakan: tautan ke task/proyek, dan rekomendasi "tahan order baru" bila beban track cetak melewati ambang.
- Grafik batang beban per track + tabel angka di bawahnya (pola grafik yang sudah ada).

**Selesai bila:** "apa yang akan telat bulan ini, dan siapa yang harus saya tambah" terjawab tanpa membuka tiap proyek.

---

## DSS-5 — Keputusan harga paket & simulasi skenario

**Tujuan:** keputusan komersial (harga paket, diskon, volume cetak) bisa diuji sebelum dijanjikan ke penulis.

- `/dss/simulasi`:
  - Pilih paket + parameter: harga, diskon, qty cetak, halaman, kertas, jilid, laminasi, full color, royalti.
  - Hasil: HPP/eksemplar (dari pengaturan tarif nyata), margin per eksemplar, margin kontrak, royalti penulis, BEP eksemplar, dan perbandingan terhadap **sekarang** (selisih rupiah + persen).
  - **Simpan skenario** ke `scenario_snapshots`, bisa dibuka lagi dan dibandingkan berdampingan.
  - Rekomendasi harga minimum per paket: harga yang menghasilkan margin ≥ ambang, dihitung dari HPP paket saat ini.
- Semua perhitungan memakai `computePrintCost()` dan pengaturan yang sudah ada — tidak ada tarif kedua di DSS.
- Perubahan harga **tidak** langsung mengubah katalog; simulasi menyimpan angka, penerapan tetap lewat `/admin/katalog`.

**Selesai bila:** "kalau saya kasih diskon 15%, margin paket ini masih sehat?" bisa dijawab dengan angka dan skenario tersimpan.

---

## Yang sengaja TIDAK dibuat

| Tidak dibuat | Alasan |
|---|---|
| Prediksi penjualan dengan model statistik/ML | Data historis masih puluhan titik. Rata-rata bergerak + laju 30 hari lebih jujur, bisa dijelaskan, dan tidak menyesatkan saat pola berubah. |
| Optimasi otomatis (linear programming) untuk jadwal produksi | Kendala nyatanya (kesediaan freelancer, revisi penulis) tidak terukur. Rekomendasi berperingkat + keputusan manusia lebih realistis. |
| Skor kelayakan penulis otomatis untuk menolak naskah | Keputusan kuratorial bukan keputusan angka; DSS hanya menyajikan riwayat penjualan dan margin. |
| Notifikasi otomatis tiap rekomendasi | Lonjakan notifikasi membuat semuanya diabaikan. Rekomendasi dibaca saat orang membuka `/dss`; hanya yang lewat tenggat keras masuk lonceng. |
| Kolom cache "skor kesehatan judul" | Skor tersimpan berbohong setelah satu transaksi. Semua dihitung saat render. |
| Mesin aturan yang bisa diedit bebas (rule builder) | Ambang boleh diubah; struktur aturan tetap di kode agar bisa diuji dan tidak menghasilkan aturan yang saling bertentangan. |

---

## Status

| Fase | Status | Bukti |
|---|---|---|
| DSS-1 | Selesai | `decision_rules`, `decision_log`, `scenario_snapshots`; `/dss`, `/dss/riwayat`; ambang di `/admin/pengaturan` |
| DSS-2 | Selesai | `/dss/judul` — margin, stok, laju jual, BEP, ubah harga retail dari tabel |
| DSS-3 | Selesai | `/dss/kas` — antrean penagihan berperingkat, proyeksi 8 minggu berbobot koleksi, konsentrasi piutang |
| DSS-4 | Selesai | `/dss/produksi` — beban per track, beban freelancer, risiko tenggat, task macet |
| DSS-5 | Selesai | `/dss/simulasi` — HPP memakai rumus `computePrintCost` yang sama, BEP, harga minimum, skenario tersimpan |

### Keputusan desain yang mengikat

1. **Rumus HPP dipindah ke `src/lib/printMath.ts`.** Halaman simulasi menghitung di browser
   saat pengguna menggeser angka, dan hasilnya harus identik dengan faktur. `printing.ts`
   sekarang hanya menyambungkan rumus itu ke pengaturan; tidak ada salinan kedua.
2. **Harga jual buku ≠ harga kontrak paket.** `packages.base_price` adalah harga jasa
   penerbitan, bukan harga buku di toko. Simulasi memakai harga retail rata-rata dari
   `inventory` (atau input manual), dan hanya mengambil persentase royalti dari paket.
   Mencampur keduanya menghasilkan margin 98% yang tidak pernah terjadi.
3. **Proyeksi kas berbobot riwayat koleksi.** Tiap tagihan ditimbang dengan rasio lunas
   historis pada bucket umur yang sama (`0–30`, `31–60`, `61–90`, `>90`), bukan asumsi
   "semua dibayar". Proyeksi optimis membuat keputusan menahan produksi tidak pernah diambil.
4. **`lastContactAt`/titik nol kesehatan** memakai `createdAt` bila belum pernah dihubungi,
   supaya prospek dan judul baru tidak langsung dianggap dingin.
5. **Rekomendasi yang sudah diputuskan disembunyikan 14 hari**, dan `decision_log`
   menyimpan `facts` (angka saat memutuskan) agar bisa dinilai ulang.

### Yang belum ada dari rencana awal

- DSS-4 belum punya kolom penanggung jawab task terpisah; beban dihitung dari `assigneeId`
  yang sudah ada.
- Lead time nyata per track (median hari penugasan → persetujuan) belum dibuat; halaman
  produksi memakai umur task tertua, yang lebih langsung menjawab "apa yang nyangkut".

---

## Urutan eksekusi & verifikasi

DSS-1 → DSS-2 → DSS-3 → DSS-4 → DSS-5. Tiap tahap: `svelte-check` → `npm run build` → uji desktop + mobile → data uji dibersihkan.

Aturan tambahan khusus DSS: setiap rekomendasi baru wajib diuji dengan **data yang benar-benar memicunya** (bukan hanya tampil kosong), dan keputusan uji harus dihapus setelah verifikasi supaya `decision_log` tidak berisi keputusan palsu.

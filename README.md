# 🌱 Bank Sampah Digital

> **Platform Manajemen Bank Sampah Digital & Ekonomi Sirkular Berbasis AI**  
> Proyek Akhir Rekayasa Perangkat Lunak (RPL)

---

## 👤 Identitas Mahasiswa

| Atribut | Detail |
|---------|--------|
| **Nama** | Alivia Aprianti Maulani |
| **NIM** | 41257089 |
| **Kelas** | 1A TI 2025 |
| **Tema Proyek** | Bank Sampah Digital |
| **Mata Kuliah** | Rekayasa Perangkat Lunak (RPL) |

---

## 📋 Deskripsi Aplikasi

**Bank Sampah Digital** adalah aplikasi berbasis web yang dirancang untuk membantu pengelolaan bank sampah secara digital, mulai dari pencatatan setoran sampah, pengelolaan saldo nasabah, hingga pelaporan statistik operasional secara real-time.

Aplikasi ini bertujuan untuk:

- Menggantikan pencatatan manual dengan sistem digital yang terstruktur dan akurat.
- Mempermudah nasabah dalam memantau saldo tabungan dan riwayat setoran sampah.
- Memberikan laporan analitik kepada pengelola (Owner) untuk pengambilan keputusan.
- Mengintegrasikan kecerdasan buatan (AI Chatbot) untuk menjawab pertanyaan pengguna secara otomatis.
- Mengirimkan notifikasi melalui WhatsApp kepada nasabah secara otomatis.

### Alur Kerja Sistem

```
Nasabah membawa sampah
        ↓
Petugas melakukan penimbangan & pencatatan setoran
        ↓
Sistem mencatat transaksi + menambah saldo & poin nasabah
        ↓
Notifikasi otomatis dikirim ke WhatsApp nasabah
        ↓
Owner & Admin memantau statistik melalui dashboard
        ↓
Nasabah dapat cek saldo, poin, dan riwayat kapan saja
```

---

## 🛠️ Teknologi yang Digunakan

| Komponen | Teknologi |
|----------|-----------|
| **Runtime Backend** | Node.js |
| **Framework Backend** | Express.js v5 |
| **Database** | SQLite (default) / MySQL (opsional via Laragon) |
| **ORM / Query Builder** | Knex.js v3 |
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla) |
| **Autentikasi** | JSON Web Token (JWT) + bcryptjs |
| **AI Chatbot** | Nous Research Inference API (OpenAI-compatible) |
| **Notifikasi** | WhatsApp via Fonnte / Meta / Twilio |
| **Upload File** | Multer |
| **Logging HTTP** | Morgan |
| **PWA** | Service Worker + Web App Manifest |

---

## ⭐ Fitur Utama Aplikasi

### 👤 A. Admin

| Fitur | Keterangan |
|-------|-----------|
| Dashboard Administrasi | Ringkasan data sistem secara keseluruhan |
| Manajemen Pengguna | Tambah, lihat, dan nonaktifkan akun pengguna |
| Pengelolaan Data Nasabah | Kelola data nasabah warga terdaftar |
| Konfigurasi AI | Ubah API Key dan model AI melalui UI (tanpa edit `.env`) |
| Pemantauan Notifikasi | Lihat riwayat dan status pengiriman notifikasi WhatsApp |
| Audit Log | Lacak seluruh aktivitas penting dalam sistem |
| Manajemen Role & Akses | Kelola hak akses berdasarkan peran pengguna |

### 🏢 B. Owner / Pemilik

| Fitur | Keterangan |
|-------|-----------|
| Dashboard Pemilik | Ringkasan eksekutif operasional bank sampah |
| Statistik & Analitik | Grafik dan laporan performa sistem |
| Laporan Transaksi | Rekap total setoran, pendapatan, dan aktivitas |
| Data Penjualan | Informasi penjualan sampah ke pengepul |
| Manajemen Inventaris | Pantau stok sampah di gudang |
| Data Pembeli (Buyer) | Kelola daftar pengepul/buyer |

### 👷 C. Petugas

| Fitur | Keterangan |
|-------|-----------|
| Pengelolaan Nasabah | Daftarkan dan kelola data nasabah warga |
| Pencatatan Setoran | Input hasil penimbangan sampah per nasabah |
| Transaksi Deposit | Buat transaksi setoran dan hitung nilai rupiah |
| Kelola Inventaris | Catat stok masuk/keluar dari gudang |
| Rekap Harian | Lihat ringkasan transaksi harian |

### 🧑‍💼 D. Nasabah

| Fitur | Keterangan |
|-------|-----------|
| Dashboard Nasabah | Lihat ringkasan saldo, poin, dan aktivitas |
| Informasi Saldo | Pantau saldo tabungan Bank Sampah secara real-time |
| Riwayat Setoran | Lihat riwayat penyetoran sampah beserta nilainya |
| Penarikan Saldo | Ajukan penarikan saldo tabungan |
| Poin Reward (Gamifikasi) | Kumpulkan poin hijau dari setiap setoran sampah |
| Redeem Reward | Tukarkan poin dengan hadiah atau voucher |
| Leaderboard | Lihat peringkat nasabah teraktif |
| Badge | Dapatkan lencana atas pencapaian setoran |

---

## 🤖 Integrasi Kecerdasan Buatan (AI Chatbot)

Bank Sampah Digital mengintegrasikan **Nous Research Inference API** (kompatibel dengan format OpenAI) sebagai mesin AI Chatbot yang mampu:

### Kemampuan AI Chatbot

| Kemampuan | Keterangan |
|-----------|-----------|
| **Identitas Pengguna** | Mengenali nama, role, dan ID pengguna yang sedang login |
| **Harga Sampah** | Menjawab pertanyaan harga per jenis sampah dari database |
| **Kalkulator Sampah** | Menghitung estimasi nilai rupiah dari berat sampah yang diinput |
| **Statistik Sistem** | Memberikan data total pengguna, nasabah, transaksi (khusus Admin) |
| **Saldo & Poin Nasabah** | Menampilkan saldo dan poin milik nasabah yang sedang login |
| **Panduan Daur Ulang** | Memberikan panduan pemilahan dan penyetoran sampah |
| **Pengetahuan Umum** | Menjawab pertanyaan umum seputar bank sampah dan ekonomi sirkular |
| **RBAC Berbasis Role** | Data yang ditampilkan disesuaikan dengan hak akses pengguna |

### Keamanan AI

- Setiap permintaan melalui endpoint divalidasi dengan **JWT Token**.
- Data sensitif (data keuangan agregat, statistik internal) **hanya dapat diakses oleh Admin dan Owner**.
- API Key Nous Research **tidak pernah dikirim ke frontend** — seluruh komunikasi melalui backend.
- Diberlakukan **rate limiting** (maksimal 30-40 request per menit per IP) untuk mencegah penyalahgunaan.

### Endpoint AI yang Tersedia

| Method | Endpoint | Akses | Fungsi |
|--------|----------|-------|--------|
| `POST` | `/api/v1/ai/assistant/query` | Semua role (data disesuaikan RBAC) | Query AI Assistant dengan data database real-time |
| `GET` | `/api/v1/ai/status` | Publik | Status dan informasi provider AI |
| `POST` | `/api/v1/chatbot/message` | Publik + opsional auth | Chatbot percakapan via Nous Research |
| `GET` | `/api/v1/chatbot/suggestions` | Publik | Daftar pertanyaan pemantik |
| `POST` | `/api/v1/ai/analyze-waste` | Admin, Owner, Petugas | Analisis foto sampah dengan AI Vision |
| `GET` | `/api/v1/ai/config` | Pustakawan, Admin | Lihat konfigurasi API Key & model AI |
| `PUT` | `/api/v1/ai/config` | Pustakawan, Admin | Ubah API Key & model AI melalui UI |

---

## 📱 Integrasi Notifikasi WhatsApp

Bank Sampah Digital mendukung pengiriman notifikasi otomatis melalui WhatsApp menggunakan beberapa provider:

| Provider | Keterangan |
|----------|-----------|
| **Fonnte** | Gateway WhatsApp lokal Indonesia (default aktif) |
| **Meta (WhatsApp Business API)** | Platform resmi WhatsApp Business Cloud API |
| **Twilio** | Provider internasional dengan dukungan template |
| **Mock** | Mode pengujian lokal tanpa pengiriman nyata |

### Fungsi Notifikasi

- Notifikasi konfirmasi setoran sampah berhasil dicatat.
- Notifikasi perubahan saldo tabungan nasabah.
- Notifikasi status pencairan/penarikan saldo.
- Riwayat dan status pengiriman tersimpan di database.
- Dukungan antrean pengiriman dan retry otomatis.
- Semua konfigurasi provider diatur melalui variabel `.env` — API key **tidak pernah ditulis dalam kode**.

---

## 🗃️ Database & REST API

### Database

Aplikasi menggunakan **SQLite** sebagai database default (file tunggal, tanpa instalasi server), dengan dukungan **MySQL** untuk kebutuhan produksi.

Struktur database dikelola menggunakan **migrasi Knex.js** yang mencakup tabel-tabel berikut:

| Migrasi | Tabel yang Dibuat |
|---------|------------------|
| `create_branches` | Cabang bank sampah |
| `create_auth_and_users` | Autentikasi & pengguna sistem |
| `create_customers` | Data nasabah warga |
| `create_waste_catalog` | Katalog jenis & harga sampah |
| `create_transactions_and_weighing` | Transaksi & data timbangan |
| `create_finance_and_ledger` | Keuangan & buku besar |
| `create_inventory_and_sales` | Inventaris gudang & penjualan |
| `create_rewards_and_gamification` | Poin, badge, dan reward |
| `create_notifications_and_audit` | Notifikasi & log audit |
| `create_ai_records` | Rekam jejak analisis AI |

### Endpoint REST API Utama

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/api/v1/auth/login` | Login pengguna |
| `POST` | `/api/v1/auth/register-nasabah` | Daftar akun nasabah baru |
| `GET` | `/api/v1/auth/me` | Data profil pengguna aktif |
| `GET` | `/api/v1/customers` | Daftar nasabah |
| `GET` | `/api/v1/transactions` | Daftar transaksi |
| `POST` | `/api/v1/transactions/deposit` | Buat transaksi setoran sampah |
| `GET` | `/api/v1/nasabah/wallet` | Saldo dompet nasabah |
| `GET` | `/api/v1/nasabah/transactions` | Riwayat transaksi nasabah |
| `GET` | `/api/v1/gamification/profile` | Profil poin & badge |
| `POST` | `/api/v1/gamification/redeem` | Tukar poin dengan reward |
| `GET` | `/api/v1/gamification/leaderboard` | Peringkat nasabah teraktif |
| `GET` | `/api/v1/inventory` | Data stok gudang |
| `GET` | `/api/v1/owner/analytics` | Analitik & statistik untuk Owner |
| `GET` | `/api/v1/audit` | Log aktivitas sistem |
| `GET` | `/api/v1/notifications` | Riwayat notifikasi |
| `GET` | `/api/v1/health` | Status kesehatan server & database |

---

## 🎥 Dokumentasi Video

| Dokumentasi | Tautan |
|-------------|--------|
| Video Final Demo | *(akan diisi setelah video tersedia)* |

---

## ⚙️ Petunjuk Instalasi

### Prasyarat

Pastikan perangkat Anda sudah terinstal:

- [Node.js](https://nodejs.org) versi 18 atau lebih baru
- npm (sudah termasuk dalam Node.js)
- Git

### Langkah Instalasi

**1. Clone repository**

```bash
git clone https://github.com/aliviaapriantimaulani/Projek-rpl-Bank-Sampah-Digital.git
cd Projek-rpl-Bank-Sampah-Digital
```

**2. Install dependency**

```bash
npm install
```

**3. Salin file konfigurasi lingkungan**

```bash
cp .env.example .env
```

**4. Konfigurasi file `.env`**

Buka file `.env` dan sesuaikan nilai berikut:

| Variabel | Keterangan |
|----------|-----------|
| `DB_CONNECTION` | Pilih `sqlite` (default) atau `mysql` |
| `DB_SQLITE_FILENAME` | Lokasi file SQLite (default: `./data/banksampah.sqlite`) |
| `JWT_SECRET` | Kunci rahasia JWT — **ganti dengan nilai acak yang kuat** |
| `NOUS_API_KEY` | API Key dari [Nous Research](https://inference-api.nousresearch.com) |
| `NOUS_MODEL` | Model AI yang digunakan (contoh: `meituan/longcat-2.5-preview:free`) |
| `WHATSAPP_PROVIDER` | Pilih `fonnte`, `meta`, `twilio`, atau `none` |
| `WHATSAPP_API_KEY` | API Key provider WhatsApp yang dipilih |

> ⚠️ **Jangan pernah commit file `.env` ke repository** — file ini sudah terdaftar di `.gitignore`.

**5. Jalankan migrasi database**

```bash
npm run db:migrate
```

**6. Jalankan data awal (seed)**

```bash
npm run db:seed
```

**7. Jalankan aplikasi**

```bash
# Mode pengembangan (auto-restart saat file berubah)
npm run dev

# Mode produksi
npm start
```

**8. Buka aplikasi di browser**

```
http://localhost:3000
```

### Perintah Database Tambahan

```bash
# Rollback migrasi terakhir
npm run db:migrate:rollback

# Reset database (rollback semua + migrate ulang + seed)
npm run db:reset

# Jalankan pengujian
npm test
```

---

## 📁 Struktur Folder Project

```
Projek-rpl-Bank-Sampah-Digital/
│
├── client/                     # Frontend (SPA - Single Page Application)
│   ├── css/                    # Stylesheet aplikasi
│   │   ├── base.css            # Gaya dasar & reset
│   │   ├── components.css      # Komponen UI (tombol, kartu, form)
│   │   ├── layout.css          # Tata letak sidebar & konten
│   │   └── variables.css       # Variabel CSS (warna, ukuran, dark mode)
│   ├── js/
│   │   ├── app.js              # Logika utama aplikasi & inisialisasi
│   │   ├── api.js              # Semua fungsi pemanggilan REST API
│   │   ├── router.js           # Router SPA & render halaman per role
│   │   ├── chatbot.js          # Logika UI chatbot AI
│   │   └── state.js            # Manajemen state global
│   └── index.html              # Entry point SPA
│
├── public/                     # Aset PWA (manifest, icon, service worker)
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
│
├── src/                        # Backend Node.js / Express.js
│   ├── app.js                  # Setup Express, middleware, dan route
│   ├── server.js               # Entry point server
│   ├── config/
│   │   ├── database.js         # Konfigurasi koneksi Knex (SQLite/MySQL)
│   │   ├── env.js              # Pembacaan & validasi variabel .env
│   │   ├── logger.js           # Logger aplikasi
│   │   └── ai-config.json      # Konfigurasi AI (dapat diubah via UI)
│   ├── database/
│   │   ├── migrations/         # Skema tabel database (Knex migrations)
│   │   └── seeds/              # Data awal (akun demo, katalog sampah)
│   ├── middlewares/            # Middleware Express
│   │   ├── auth.middleware.js          # Verifikasi JWT
│   │   ├── rbac.middleware.js          # Kontrol hak akses berbasis role
│   │   ├── optional_auth.middleware.js # Auth opsional (untuk publik+login)
│   │   ├── audit.middleware.js         # Pencatatan aktivitas
│   │   ├── upload.middleware.js        # Upload foto (Multer)
│   │   ├── rate_limit.middleware.js    # Pembatasan frekuensi request
│   │   └── security_headers.middleware.js # Header keamanan HTTP
│   ├── modules/                # Modul fitur aplikasi
│   │   ├── auth/               # Login, register, profil
│   │   ├── users/              # Manajemen pengguna (Admin)
│   │   ├── customers/          # Data nasabah
│   │   ├── transactions/       # Transaksi setoran sampah
│   │   ├── nasabah/            # Fitur khusus nasabah (saldo, riwayat)
│   │   ├── finance/            # Keuangan & penarikan saldo
│   │   ├── inventory/          # Inventaris gudang sampah
│   │   ├── sales/              # Penjualan sampah ke pengepul
│   │   ├── waste/              # Katalog & harga jenis sampah
│   │   ├── gamification/       # Poin, badge, reward, leaderboard
│   │   ├── owner/              # Analitik & laporan untuk Owner
│   │   ├── ai/                 # Endpoint AI Assistant & Vision
│   │   ├── chatbot/            # Endpoint Chatbot (Nous Research)
│   │   ├── notifications/      # Riwayat & manajemen notifikasi
│   │   ├── audit/              # Log aktivitas sistem
│   │   └── config/             # Konfigurasi AI via UI (Pustakawan)
│   ├── services/
│   │   ├── ai/                 # Layanan AI (assistant, chatbot, vision)
│   │   ├── gamification/       # Engine poin & badge
│   │   ├── notification/       # Layanan notifikasi WhatsApp
│   │   └── payment/            # Layanan pembayaran/penarikan
│   ├── ai-config/              # Controller konfigurasi AI runtime
│   └── utils/                  # Utilitas umum (token, password, env)
│
├── tests/                      # File pengujian otomatis
├── scripts/                    # Skrip utilitas (backup, reset password)
├── .env.example                # Template konfigurasi environment
├── .gitignore                  # File yang dikecualikan dari Git
├── knexfile.js                 # Konfigurasi Knex (migrasi & seed)
├── package.json                # Dependensi dan skrip npm
└── README.md                   # Dokumentasi proyek ini
```

---

## 🔐 Pengujian & Keamanan

### Sistem Keamanan

| Mekanisme | Implementasi |
|-----------|-------------|
| **Autentikasi** | JSON Web Token (JWT) dengan masa berlaku 7 hari |
| **Enkripsi Password** | bcryptjs dengan 10 salt rounds |
| **Hak Akses (RBAC)** | Middleware `requireRoles` pada setiap endpoint sensitif |
| **Header Keamanan** | Custom security headers middleware |
| **Rate Limiting** | Pembatasan request per IP per menit |
| **Audit Log** | Setiap aksi penting dicatat di tabel audit |
| **Proteksi Upload** | Validasi tipe & ukuran file pada upload foto |
| **Webhook Security** | Verifikasi signature `X-Hub-Signature-256` untuk WhatsApp |

### Role Pengguna & Hak Akses

| Role | Level Akses |
|------|------------|
| `ADMIN` | Akses penuh ke seluruh sistem termasuk data operasional AI |
| `OWNER` | Akses data analitik, keuangan, dan laporan eksekutif |
| `PETUGAS` | Akses pencatatan transaksi, nasabah, dan inventaris |
| `NASABAH` | Akses data pribadi (saldo, poin, riwayat setoran) |
| `PUSTAKAWAN` | Akses konfigurasi AI (API Key & model) |

### Pengujian

Tersedia file pengujian otomatis di folder `tests/` yang mencakup:

| File Uji | Cakupan Pengujian |
|----------|------------------|
| `auth.test.js` | Autentikasi (login, register, JWT) |
| `rbac.test.js` | Hak akses berdasarkan role |
| `deposit.test.js` | Proses setoran dan penimbangan |
| `withdrawal.test.js` | Penarikan saldo nasabah |
| `customer_management.test.js` | Manajemen data nasabah |
| `gamification_notifications.test.js` | Poin, badge, dan notifikasi |
| `inventory_sales.test.js` | Inventaris dan penjualan |
| `nous_chatbot.test.js` | Integrasi Nous Research AI Chatbot |
| `chatbot_database_rbac.test.js` | RBAC pada query database via AI |
| `whatsapp_notifications.test.js` | Pengiriman notifikasi WhatsApp |
| `production_security_audit.test.js` | Audit keamanan sistem produksi |

Jalankan semua pengujian:

```bash
npm test
```

---

## 📌 Catatan

- File `.env` **wajib dikonfigurasi** sebelum menjalankan aplikasi.
- Untuk penggunaan AI Chatbot, daftarkan akun di [Nous Research](https://inference-api.nousresearch.com) dan dapatkan API Key.
- Untuk notifikasi WhatsApp, daftarkan akun di provider pilihan (Fonnte / Meta / Twilio).
- Tautan video dokumentasi akan diperbarui setelah video diunggah ke YouTube.

---

<p align="center">
  Dibuat dengan ❤️ oleh <strong>Alivia Aprianti Maulani</strong> — NIM 41257089 — Kelas 1A TI 2025
</p>

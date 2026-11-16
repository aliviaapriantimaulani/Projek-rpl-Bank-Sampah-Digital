# Bank Sampah Digital 🌱

Aplikasi manajemen bank sampah digital berbasis web dengan fitur:

- **Multi-role RBAC**: Admin, Owner, Petugas, Nasabah, Pustakawan
- **AI Assistant**: Chatbot dengan akses data real-time dari database
- **Konfigurasi AI via UI**: Pustakawan dapat mengubah API Key & model AI tanpa menyentuh `.env`
- **Analitik Owner**: Dashboard laporan & statistik operasional
- **Notifikasi WhatsApp**: Integrasi Fonnte / Meta / Twilio
- **Gamifikasi**: Poin reward & badge untuk nasabah aktif
- **PWA-Ready**: Dapat diinstall di perangkat mobile

## Teknologi

| Layer | Stack |
|-------|-------|
| Backend | Node.js, Express.js |
| Database | MySQL (Knex.js ORM) |
| AI | Nous Research API (OpenAI-compatible) |
| Auth | JWT, bcrypt |
| Frontend | Vanilla JS, Tailwind CSS |

## Cara Menjalankan

```bash
# 1. Clone repo
git clone https://github.com/aliviaapriantimaulani/Projek-rpl-Bank-Sampah-Digital.git
cd Projek-rpl-Bank-Sampah-Digital

# 2. Install dependencies
npm install

# 3. Salin & isi konfigurasi
cp .env.example .env
# Edit .env sesuai environment Anda

# 4. Jalankan migrasi database
npm run db:migrate
npm run db:seed

# 5. Jalankan server
npm run dev
```

Server berjalan di: `http://localhost:3000`

## Konfigurasi .env

Lihat `.env.example` untuk daftar variabel yang diperlukan. **Jangan pernah commit file `.env` asli.**

## Akun Demo

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@banksampah.id | (lihat seed) |
| Owner | owner@banksampah.id | (lihat seed) |
| Petugas | petugas@banksampah.id | (lihat seed) |
| Nasabah | nasabah@banksampah.id | (lihat seed) |
| Pustakawan | pustakawan@banksampah.id | (lihat seed) |

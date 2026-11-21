/**
 * Nous Research AI Chatbot Service for Bank Sampah Digital
 * Connects to Nous Research Inference API (OpenAI-compatible).
 *
 * Credentials are read from dynamic configuration (ai-config.json) with .env fallback.
 * The config can be updated via API by users with pustakawan role.
 * Never hardcode or log API keys.
 */

const fs = require('fs');
const path = require('path');
const env = require('../../config/env');
const db = require('../../config/database');
const databaseSchemaService = require('./database_schema.service');
const databaseToolsService = require('./database_tools.service');

const localConfigPath = path.resolve(__dirname, '../../config/ai-config.local.json');
const baseConfigPath = path.resolve(__dirname, '../../config/ai-config.json');
let cachedAiConfig = null;

function getResolvedAiConfigPath() {
  if (fs.existsSync(localConfigPath)) return localConfigPath;
  return baseConfigPath;
}

/**
 * Load AI config from file, with .env as fallback.
 * This allows dynamic updates without server restart when config is updated via API.
 */
function loadAiConfig() {
  try {
    const aiConfigPath = getResolvedAiConfigPath();
    if (fs.existsSync(aiConfigPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(aiConfigPath, 'utf8'));
      // Merge with .env defaults: file values override .env values
      const merged = {
        NOUS_API_KEY: fileConfig.api_key || env.NOUS_API_KEY,
        NOUS_KEY_ID: fileConfig.key_id || env.NOUS_KEY_ID,
        NOUS_API_BASE_URL: fileConfig.base_url || env.NOUS_API_BASE_URL,
        NOUS_MODEL: fileConfig.model || env.NOUS_MODEL,
        NOUS_TIMEOUT_MS: parseInt(fileConfig.timeout_ms, 10) || Number(env.NOUS_TIMEOUT_MS || 20000),
      };
      // Update env vars so downstream code using env still works
      process.env.NOUS_API_KEY = merged.NOUS_API_KEY;
      process.env.NOUS_KEY_ID = merged.NOUS_KEY_ID;
      process.env.NOUS_API_BASE_URL = merged.NOUS_API_BASE_URL;
      process.env.NOUS_MODEL = merged.NOUS_MODEL;
      process.env.NOUS_TIMEOUT_MS = String(merged.NOUS_TIMEOUT_MS);
      cachedAiConfig = fileConfig;
      return merged;
    }
  } catch (err) {
    console.warn('[NousChatbot] Gagal memuat ai-config.json, gunakan .env fallback:', err.message);
  }
  // Fallback to .env only
  cachedAiConfig = null;
  return {
    NOUS_API_KEY: env.NOUS_API_KEY,
    NOUS_KEY_ID: env.NOUS_KEY_ID,
    NOUS_API_BASE_URL: env.NOUS_API_BASE_URL || 'https://inference-api.nousresearch.com/v1',
    NOUS_MODEL: env.NOUS_MODEL || 'meituan/longcat-2.5-preview:free',
    NOUS_TIMEOUT_MS: Number(env.NOUS_TIMEOUT_MS || 20000),
  };
}

class NousChatbotService {
  constructor() {
    const config = loadAiConfig();
    this.apiKey = config.NOUS_API_KEY;
    this.keyId = config.NOUS_KEY_ID;
    this.baseUrl = config.NOUS_API_BASE_URL;
    this.defaultModel = config.NOUS_MODEL;
    this.timeoutMs = config.NOUS_TIMEOUT_MS;

    // Free/reliable fallback models on Nous Inference API
    this.fallbackModels = [
      'meituan/longcat-2.5-preview:free',
      'poolside/laguna-s-2.1:free',
      'stepfun/step-3.7-flash:free'
    ];
  }

  /**
   * Return safe provider status without exposing secret API key
   */
  getStatus() {
    const config = loadAiConfig();
    const keyId = config.NOUS_KEY_ID || this.keyId || '';
    const apiKey = config.NOUS_API_KEY || this.apiKey || '';
    return {
      provider: 'Nous Research',
      hasApiKey: Boolean(apiKey && apiKey.length > 0),
      hasKeyId: Boolean(keyId && keyId.length > 0),
      keyIdPreview: keyId ? `${keyId.substring(0, 8)}...` : null,
      model: config.NOUS_MODEL || this.defaultModel,
      baseUrl: config.NOUS_API_BASE_URL || this.baseUrl,
      timeoutMs: config.NOUS_TIMEOUT_MS || this.timeoutMs,
    };
  }

  /**
   * Fetch live waste category list and active buying prices from SQLite/MySQL
   */
  async getLiveWastePricesContext() {
    try {
      const categories = await db('waste_categories')
        .leftJoin('waste_prices', function () {
          this.on('waste_categories.id', '=', 'waste_prices.waste_category_id')
            .andOn('waste_prices.is_active', '=', db.raw('?', [1]));
        })
        .where('waste_categories.is_active', 1)
        .select(
          'waste_categories.code',
          'waste_categories.name',
          'waste_categories.parent_category',
          'waste_categories.description',
          'waste_categories.unit',
          'waste_prices.buying_price'
        );

      if (!categories || categories.length === 0) {
        return 'Daftar kategori sampah: Belum ada kategori aktif.';
      }

      const list = categories.map((c) => {
        const priceStr = c.buying_price
          ? `Rp ${Number(c.buying_price).toLocaleString('id-ID')} / ${c.unit}`
          : 'Harga fluktuatif (hubungi petugas)';
        return `- **${c.name}** (${c.parent_category}): ${priceStr} — *${c.description || '-'}*`;
      });

      return `DAFTAR KATEGORI & HARGA BELI SAMPAH RESMI BANK SAMPAH DIGITAL SAAT INI:\n${list.join('\n')}`;
    } catch (err) {
      console.warn('[NousChatbot] Gagal memuat harga sampah dari DB:', err.message);
      return 'Daftar kategori sampah standar: Plastik PET/HDPE (Rp 3.500 - 4.500/kg), Kertas & Kardus (Rp 2.000 - 3.000/kg), Kaleng Logam (Rp 8.000 - 15.000/kg).';
    }
  }

  /**
   * Fetch authenticated user's contextual data (wallet balance, points, total deposits)
   */
  async getUserContext(user) {
    if (!user) {
      return 'STATUS PENGGUNA: Tamu / Pengunjung Umum (Belum masuk akun).';
    }

    let text = `STATUS PENGGUNA: Terautentikasi.\n- Nama Pengguna: ${user.name}\n- Peran: ${user.role} (${user.role_display || user.role})\n- Email: ${user.email || '-'}`;

    try {
      if (user.customer_id) {
        const wallet = await db('customer_wallets').where({ customer_id: user.customer_id }).first();
        const points = await db('points').where({ customer_id: user.customer_id }).first();
        const cust = await db('customers').where({ id: user.customer_id }).first();

        const balance = wallet ? Number(wallet.current_balance || 0).toLocaleString('id-ID') : '0';
        const totalEarned = wallet ? Number(wallet.accumulated_earnings || 0).toLocaleString('id-ID') : '0';
        const pts = points ? Number(points.current_points || 0).toLocaleString('id-ID') : '0';
        const weight = cust ? Number(cust.total_waste_deposited_kg || 0).toLocaleString('id-ID') : '0';

        text += `\n- Saldo Tabungan Aktif: Rp ${balance}\n- Total Akumulasi Tabungan: Rp ${totalEarned}\n- Poin Reward Hijau: ${pts} Poin\n- Total Berat Sampah Disetor: ${weight} kg\n- Nomor Rekening Nasabah: ${cust?.account_number || '-'}`;
      }
    } catch (err) {
      console.warn('[NousChatbot] Gagal memuat info nasabah:', err.message);
    }

    return text;
  }

  /**
   * Compact, role-filtered schema context. Only table names and short
   * descriptions are sent to the model — never credentials or raw rows.
   */
  async getSchemaContext() {
    try {
      const schema = await databaseSchemaService.getSchemaSummaryForAI('GUEST');
      const tables = (schema.tables || [])
        .slice(0, 40)
        .map((t) => `${t.name}: ${t.description || 'tabel sistem'}`)
        .join('\n');
      return `SKEMA DATABASE (${schema.summary?.totalTables || schema.tables?.length || 0} tabel bisnis):\n${tables}`;
    } catch (err) {
      console.warn('[NousChatbot] Gagal memuat skema database:', err.message);
      return 'SKEMA DATABASE: tidak tersedia saat ini.';
    }
  }

  /**
   * Generate comprehensive system prompt with dynamic RBAC & Function Calling instructions
   */
  async buildSystemPrompt(user) {
    const isAdmin = databaseToolsService.isAdmin(user);
    const roleName = user ? (user.role || 'USER') : 'GUEST';

    const [pricesContext, userContext, schemaContext] = await Promise.all([
      this.getLiveWastePricesContext(),
      this.getUserContext(user),
      this.getSchemaContext(),
    ]);

    const userName = user?.name || 'Tamu / Pengunjung';
    const userRole = user?.role ? String(user.role).toUpperCase() : 'GUEST';
    const userId = user?.id || user?.id_user || user?.customer_id || '-';
    const userEmail = user?.email || '-';

    const userSessionSection = `
=== KONTEKS PENGGUNA (SESI AKTIF) ===
Kamu adalah asisten AI Bank Sampah. Pengguna yang sedang berbicara denganmu adalah:
- Nama: ${userName}
- Role: ${userRole}
- ID: ${userId}
- Email: ${userEmail}

Jika pengguna bertanya "siapa saya", gunakan data konteks ini untuk menjawab identitas dan perannya secara langsung, ramah, dan informatif.`;

    let rbacFunctionCallingSection = '';
    if (isAdmin) {
      rbacFunctionCallingSection = `
=== HAK AKSES & FUNCTION CALLING (ADMINISTRATOR) ===
Status Pengguna: ADMINISTRATOR (ADMIN). Hak akses operasional & database penuh aktif.
Kamu memiliki akses ke Function Calling Tools untuk query data database real-time:
1. 'get_users_statistics': Menghitung total pengguna sistem dan perincian per role (Admin, Petugas, Owner, Nasabah).
2. 'get_customers_statistics': Menghitung jumlah nasabah warga terdaftar, nasabah aktif, dan total tonase sampah.
3. 'get_transactions_statistics': Ringkasan transaksi setoran sampah (hari ini, bulan ini, total nominal rupiah dan timbangan kg).
4. 'get_inventory_statistics': Menghitung persediaan sampah yang ada di gudang penyimpanan per kategori.
5. 'get_system_overview': Ringkasan eksekutif menyeluruh database Bank Sampah Digital.
6. 'get_waste_category_status': Cek status aktif/non-aktif kategori sampah (misalnya: "apakah kardus cokelat tebal aktif?").

ATURAN PEMBEDAAN JAWABAN (DATABASE VS PERTANYAAN UMUM):
- Jika Admin menanyakan DATA INTERNAL (seperti 'ada berapa user', 'jumlah nasabah', 'total transaksi', 'stok gudang', 'ringkasan sistem', dll.):
  PANGGIL Function Calling tool yang sesuai agar data yang disajikan akurat dan real-time dari database.
- Jika pertanyaan bersifat UMUM (seperti cara memilah sampah, tips daur ulang, pembuatan kompos, jenis plastik, edukasi lingkungan, atau sapaan santai):
  Jawab langsung menggunakan pengetahuan umum (general knowledge) kamu TANPA memanggil tool database.
- **ATURAN BARU: STATUS KATEGORI SAMPAH**:
  - Jika user bertanya tentang status aktif/tidak aktif, ketersediaan, atau harga suatu barang/sampah (contoh: "apakah kardus box cokelat tebal aktif?", "cek kardus", "status karton", "berapa harga kardus"),
  - AI WAJIB memanggil tool get_waste_category_status dengan argumen nama sampah tersebut.
  - Jangan biarkan AI merespons "tidak ada intent" jika pertanyaannya menyebutkan nama benda/sampah yang ada di katalog database.
  - Tool get_waste_category_status menggunakan pencarian parsial (LIKE %term%) di database, sehingga variasi ketikan user seperti "kardus box cokelat tebal" bisa langsung cocok dengan data di tabel.

${pricesContext}

${userContext}

${schemaContext}

PANDUAN TAMBAHAN:
- Jangan pernah menulis, menebak, atau menyarankan query SQL mentah (SELECT/INSERT/UPDATE/DELETE) kepada pengguna. Jelaskan data dalam bahasa manusia; akses database hanya melalui intent sistem atau Function Calling tools yang sudah dibatasi RBAC.
- Jangan membocorkan data pribadi nasabah lain, kredensial, token, atau isi environment.
- Jika pengguna bertanya saldo mereka dan mereka adalah tamu/belum login, beritahu mereka dengan ramah untuk masuk (login) terlebih dahulu agar Asisten AI dapat melihat buku tabungan mereka.
- PRIORITAS: Jawab dulu pertanyaan yang berkaitan dengan data & operasional Bank Sampah Digital (pakai data riil di atas). Jika di luar konteks, jawab dengan pengetahuan umum yang ramah — tanpa menolak, tanpa pesan error, dan tanpa pesan maaf kaku.`;
    } else {
      rbacFunctionCallingSection = `
=== HAK AKSES & KEBIJAKAN PENGGUNA NON-ADMIN (${roleName}) ===
Status Pengguna: BUKAN ADMIN (${roleName}).
Fitur Function Calling dan query data internal database TIDAK DIAKTIFKAN untuk peran ini.
Kamu TIDAK MEMILIKI akses ke database internal sistem.

ATURAN PEMBEDAAN JAWABAN:
- Jawablah HANYA pertanyaan umum seputar sampah, cara daur ulang, panduan menabung sampah, tips pemilahan, dan edukasi lingkungan tanpa memanggil tool database.
- Jika pengguna adalah Nasabah yang menanyakan saldo atau poin tabungannya sendiri, jawab berdasarkan ringkasan profil pengguna yang tertera di bawah.
- Jika pengguna Non-Admin meminta data statistik internal sistem (seperti 'berapa total user sistem', 'berapa transaksi orang lain', 'berapa stok gudang'), tolak dengan sopan bahwa fitur query internal database hanya tersedia untuk peran Administrator (Admin).`;
    }

    return `Kamu adalah "Asisten AI Cerdas Bank Sampah Digital", sistem AI yang dirancang khusus untuk membantu mengelola dan menyajikan data operasional Bank Sampah Digital, sekaligus menjawab pertanyaan umum pengguna dengan pengetahuan umum kamu.

${userSessionSection}

${rbacFunctionCallingSection}

ATURAN UTAMA:

0. PRINSIP JAWABAN SINGKAT & TEPAT (SANGAT PENTING - WAJIB DIPATUHI):
   - JIKA PENGGUNA BERTANYA "BERAPA" / "BRAPA" / "JUMLAH" / "TOTAL":
     * WAJIB MENJAWAB DENGAN ANGKA / JUMLAH SAJA SECARA SINGKAT DAN PADAT.
     * JANGAN MENYEBUTKAN SIAPA SAJA, DAFTAR RINCIAN, ATAU NAMA-NAMA ANGGOTA KECUALI JIKA PENGGUNA SECARA EKSPLISIT MEMINTA "SEBUTKAN", "APA SAJA", "SIAPA SAJA", ATAU "JELASKAN".
     * Contoh: Jika ditanya "ada brapa role" atau "ada berapa role" -> JAWAB LANGSUNG: "Ada 4 role." (DILARANG menyebutkan nama-nama role Admin, Owner, Petugas, Nasabah!).
     * Contoh: Jika ditanya "berapa user" -> Jawab jumlah angkanya saja.
   - UNTUK SEMUA PERTANYAAN LAINNYA: Jawab tepat sasaran sesuai yang ditanyakan pengguna tanpa basa-basi salam panjang, tanpa ceramah yang tidak diminta, dan tanpa penjelasan bertele-tele.

1. IDENTITAS & PERKENALAN:
   - Jika pengguna menanyakan identitas, nama, atau fungsi KAMU (seperti "siapa kamu", "siapa anda", "nama kamu siapa", "namamu siapa", "perkenalkan dirimu", dll.), jawablah dengan kalimat perkenalan resmi:
     "Saya adalah Asisten AI Cerdas Bank Sampah yang siap membantu kamu mengelola data sampah maupun menjawab pertanyaan seputar daur ulang!"
   - PENTING: JANGAN gunakan kalimat perkenalan asisten di atas jika pengguna menanyakan nama orang atau role sistem (seperti "siapa nama admin", "siapa owner", "siapa nama petugas"). Untuk pertanyaan tersebut, sebutkan nama pejabat sistem yang bertugas (Admin: Alivia Aprianti, Owner: H. Mulyono, Petugas: Dewi Sartika).

2. PENANGANAN INPUT TIDAK DIKENAL (GENERAL KNOWLEDGE):
   - Jika pertanyaan pengguna tidak cocok dengan intent/query internal sistem (misalnya pertanyaan umum, cuaca, matematika, sejarah, resep, koding, atau topik santai lainnya), JANGAN mengeluarkan pesan error seperti "UNKNOWN_GUIDANCE" dan JANGAN membalas dengan pesan maaf kaku yang menolak pertanyaan.
   - Sebagai gantinya, jawablah secara alami menggunakan pengetahuan umum (general knowledge) kamu terkait topik sampah, daur ulang, lingkungan, atau pertanyaan santai tersebut.
   - Contoh: pengguna bertanya "gimana cara bikin kompos?" → jawab dengan panduan kompos yang benar. Pengguna bertanya "resep nasi goreng" → boleh dijawab singkat dan ramah, lalu ajak kembali ke topik bank sampah.

3. HARGA SAMPAH & KALKULATOR NILAI SAMPAH:
   - JIKA PENGGUNA MENANYAKAN HARGA ITEM SPESIFIK (contoh: "berapa harga botol kaca bening utuh", "harga kardus box", "harga kaleng"):
     * LANGSUNG JAWAB HARGA ITEM TERSEBUT SECARA TO THE POINT (contoh: "Harga beli resmi **Botol Kaca Bening Utuh** adalah **Rp 1.200 / KG** (harga jual: Rp 2.000 / KG).").
     * DILARANG KERAS menyebutkan kategori atau item lain yang tidak ditanyakan (misal dilarang menyebut plastik jika ditanya botol kaca).
     * DILARANG menyertakan perkiraan umum pasar atau paragraf basa-basi jika harga resmi katalog sudah ada.
   - Hubungkan perhitungan dengan DAFTAR KATEGORI & HARGA BELI SAMPAH RESMI BANK SAMPAH DIGITAL di bawah.
   - Jika pengguna bertanya tentang harga atau nilai dari berat tertentu suatu jenis sampah (contoh: "menyetorkan 5 kg kardus, berapa harganya", "kalau bawa 10 kg botol plastik dapat berapa", "3 kg besi berapa uangnya"):
     a) Cari harga beli per kg resmi untuk jenis sampah tersebut dari data tabel database.
     b) Kalikan berat (kg) dengan harga per kg (Total = Berat × Harga/kg).
     c) Langsung sebutkan rincian perhitungannya secara jelas, ramah, dan to the point tanpa basa-basi sambutan panjang (contoh: "Harga kardus saat ini Rp 2.200/kg, jadi untuk 5 kg perkiraan nilainya adalah **Rp 11.000** (5 kg × Rp 2.200/kg)").
   - Jika ditanya harga umum tanpa berat, berikan harga resmi katalog di bawah.
   - PENTING: Kurangi basa-basi sambutan yang terlalu panjang jika pengguna langsung bertanya spesifik tentang harga, kalkulasi nilai, atau data operasional. Langsung jawab to the point!

4. KARAKTER & CARA MENJAWAB:
   - Bahasa: Bahasa Indonesia yang ramah, sopan, komunikatif, solutif, dan antusias menjaga kelestarian lingkungan.
   - To The Point: Hindari pengulangan salam/basa-basi sambutan yang bertele-tele jika pengguna langsung mengajukan pertanyaan teknis/kalkulasi/data. Langsung jawab intinya dengan jelas.
   - Format: Gunakan Markdown rapi (tebalkan poin penting dengan **bold**, gunakan bullet point untuk poin penjelasan, emoji yang sesuai seperti ♻️, 🌱, 💳, 💰, ⭐).

5. PENGETAHUAN KHUSUS:
   - Menjelaskan cara kerja Bank Sampah Digital:
     1. Pilah sampah di rumah (organik, anorganik berharga seperti plastik, kardus, kertas, logam).
     2. Bawa sampah terpilah ke Bank Sampah terdekat.
     3. Petugas menimbang dan mencatat transaksi ke sistem digital.
     4. Saldo rupiah langsung bertambah di Buku Tabungan Digital nasabah dan mendapatkan Poin Reward Hijau!
     5. Nasabah dapat mengajukan penarikan saldo (cash out) atau menukar poin dengan sembako/hadiah.
   - Menjawab pertanyaan harga secara akurat sesuai data riil di bawah.
   - Menjawab pertanyaan saldo atau data pribadi sesuai informasi pengguna di bawah.
   - Memberikan edukasi tips memilah sampah, jenis plastik (PET, HDPE, LDPE, PP), dan dampak positif pengurangan emisi karbon (CO2).

${pricesContext}

${userContext}

${schemaContext}

PANDUAN TAMBAHAN:
- Jangan pernah menulis, menebak, atau menyarankan query SQL mentah (SELECT/INSERT/UPDATE/DELETE) kepada pengguna. Jelaskan data dalam bahasa manusia; akses database hanya melalui intent sistem atau Function Calling tools yang sudah dibatasi RBAC.
- Jangan membocorkan data pribadi nasabah lain, kredensial, token, atau isi environment.
- Jika pengguna bertanya saldo mereka dan mereka adalah tamu/belum login, beritahu mereka dengan ramah untuk masuk (login) terlebih dahulu agar Asisten AI dapat melihat buku tabungan mereka.
- PRIORITAS: Jawab dulu pertanyaan yang berkaitan dengan data & operasional Bank Sampah Digital (pakai data riil di atas). Jika di luar konteks, jawab dengan pengetahuan umum yang ramah — tanpa menolak, tanpa pesan error, dan tanpa pesan maaf kaku.
`;
  }

  /**
   * Execute chat query to Nous Research Inference API
   * @param {Object} params
   * @param {string} params.message - Current user query
   * @param {Array} [params.history] - Conversation history array [{role, content}]
   * @param {Object} [params.user] - Authenticated user context
   */
  async chat({ message, history = [], user }) {
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new Error('Pesan pertanyaan tidak boleh kosong.');
    }

    // Refresh dynamic AI configuration from ai-config.json
    try {
      const activeConfig = loadAiConfig();
      if (activeConfig) {
        this.apiKey = activeConfig.NOUS_API_KEY;
        this.keyId = activeConfig.NOUS_KEY_ID;
        this.baseUrl = activeConfig.NOUS_API_BASE_URL;
        this.defaultModel = activeConfig.NOUS_MODEL;
        this.timeoutMs = activeConfig.NOUS_TIMEOUT_MS;
      }
    } catch (confErr) {
      console.warn('[NousChatbot] Gagal reload konfigurasi:', confErr.message);
    }

    console.log('[NousChatbot] Received message:', message.trim().substring(0, 100) + (message.trim().length > 100 ? '...' : ''));

    const trimmedMsg = message.trim();
    const q = trimmedMsg.toLowerCase();

    // 00-A. DETEKSI CARA KERJA / ALUR SISTEM BANK SAMPAH DIGITAL ("jelaskan cara kerja sistem bank sampah digital dari awal sampai akhir", dll)
    const isWorkflowQuery =
      q.includes('cara kerja') ||
      q.includes('bagaimana cara kerja') ||
      q.includes('alur kerja') ||
      q.includes('alur sistem') ||
      q.includes('mekanisme kerja') ||
      q.includes('proses kerja') ||
      q.includes('awal sampai akhir') ||
      q.includes('dari awal') ||
      q.includes('cara menabung sampah') ||
      q.includes('cara setor sampah') ||
      q.includes('alur setor') ||
      q.includes('alur menabung') ||
      q.includes('gimana cara nabung') ||
      (q.includes('alur') && (q.includes('bank sampah') || q.includes('setor') || q.includes('menabung') || q.includes('sampah') || q.includes('transaksi') || q.includes('sistem'))) ||
      (q.includes('bagaimana') && (q.includes('cara kerja') || q.includes('setor sampah') || q.includes('menabung sampah') || q.includes('nabung sampah') || q.includes('kerja sistem')));

    if (isWorkflowQuery) {
      const isEndToEnd = q.includes('awal sampai akhir') || q.includes('dari awal') || q.includes('lengkap') || q.includes('sistem') || q.includes('jelaskan cara kerja');
      const workflowAnswer = isEndToEnd
        ? `**Alur & Cara Kerja Sistem Bank Sampah Digital (Dari Awal Sampai Akhir):**\n\n` +
          `1. 📝 **Pendaftaran Nasabah (Registrasi Akun)**\n` +
          `   - Warga mendaftar sebagai nasabah melalui aplikasi web atau dibantu petugas di loket.\n` +
          `   - Nasabah mendapatkan nomor rekening unik (contoh: \`NSB-2026-0001\`) serta **Kartu Anggota Digital ber-QR Code**.\n\n` +
          `2. 🏠 **Pemilahan Sampah dari Rumah**\n` +
          `   - Nasabah memilah sampah anorganik bernilai ekonomis (botol plastik PET, gelas PP, kardus, kertas/HVS, kaleng aluminium, besi, kaca, dan minyak jelantah).\n` +
          `   - Sampah dipastikan dalam kondisi **bersih, kering, dan terpisah** dari sampah organik dapur.\n\n` +
          `3. ⚖️ **Penyetoran & Penimbangan di Loket**\n` +
          `   - Nasabah membawa sampah ke loket Bank Sampah Digital dan menunjukkan QR Code / nomor rekening kepada **Petugas Timbang**.\n` +
          `   - Petugas menimbang sampah secara terbuka dan mencatat kategori serta bobotnya (kg) langsung ke aplikasi sistem secara real-time.\n\n` +
          `4. 💰 **Konversi Nilai Otomatis ke Saldo & Poin Reward**\n` +
          `   - Sistem secara otomatis menghitung nilai rupiah berdasarkan bobot × harga beli resmi katalog.\n` +
          `   - **Buku Tabungan Digital**: Saldo rupiah otomatis bertambah saat itu juga.\n` +
          `   - **Poin Reward Hijau**: Nasabah otomatis memperoleh poin loyalitas untuk setiap kilogram sampah yang disetor.\n\n` +
          `5. 📦 **Penyimpanan di Gudang (Manajemen Inventaris)**\n` +
          `   - Sampah yang terkumpul masuk ke pencatatan stok gudang (*Inventory Management*) berdasarkan kategori untuk dipantau kapasitasnya secara digital.\n\n` +
          `6. 🚚 **Penjualan ke Mitra Industri / Pengepul (Offtaker)**\n` +
          `   - Setelah stok gudang memenuhi kuota, pihak pengelola (*Owner/Admin*) membuat transaksi penjualan ke pabrik daur ulang mitra dengan invoice resmi.\n\n` +
          `7. 🎁 **Pencairan Saldo & Penukaran Hadiah (Tahap Akhir)**\n` +
          `   - **Penarikan Saldo**: Nasabah dapat mencairkan saldo tabungan menjadi uang tunai di loket, transfer bank, atau e-wallet (GoPay/OVO/DANA).\n` +
          `   - **Penukaran Poin**: Poin reward hijau dapat ditukarkan dengan sembako (beras, minyak, gula) atau produk daur ulang di katalog reward! ♻️🌱`
        : `**Alur & Cara Kerja Menabung Sampah di Bank Sampah Digital:**\n\n` +
          `1. 🏠 **Pilah Sampah dari Rumah**: Pisahkan sampah anorganik bersih (botol plastik, kardus, kertas, kaleng logam, kaca) dari sampah basah.\n\n` +
          `2. 📍 **Bawa ke Loket**: Datangi loket Bank Sampah Digital terdekat dengan menunjukkan nomor rekening atau scan QR Code kartu anggota.\n\n` +
          `3. ⚖️ **Timbang Real-Time**: Petugas loket menimbang sampah dan mencatat kategori serta bobotnya langsung ke sistem aplikasi.\n\n` +
          `4. 💰 **Saldo & Poin Otomatis Masuk**: Nilai rupiah setoran langsung masuk ke **Buku Tabungan Digital** Anda, ditambah perolehan **Poin Reward Hijau**.\n\n` +
          `5. 🎁 **Pencairan & Reward**: Saldo tabungan dapat ditarik tunai/transfer kapan saja, dan poin dapat ditukar sembako di katalog reward! ♻️`;

      return {
        reply: workflowAnswer,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // 00-B. DETEKSI TUJUAN DIBUATNYA SISTEM BANK SAMPAH DIGITAL
    const isPurposeQuery =
      (q.includes('tujuan') || q.includes('kenapa dibuat') || q.includes('mengapa dibuat') || q.includes('alasan dibuat') || q.includes('fungsi sistem') || q.includes('kegunaan sistem') || q.includes('mengapa ada') || q.includes('kenapa ada')) &&
      (q.includes('bank sampah') || q.includes('bsd') || q.includes('sistem') || q.includes('aplikasi'));

    if (isPurposeQuery) {
      return {
        reply:
          `**Tujuan Dibuatnya Sistem Bank Sampah Digital:**\n\n` +
          `1. 🌱 **Mendorong Ekonomi Sirkular**: Mengubah sampah anorganik warga menjadi nilai ekonomis nyata berupa saldo tabungan rupiah digital dan poin reward hijau.\n\n` +
          `2. 💻 **Digitalisasi & Transparansi**: Menggantikan pencatatan manual buku tabungan menjadi sistem digital real-time yang akurat, aman, dan dapat dipantau nasabah kapan saja.\n\n` +
          `3. 📉 **Mengurangi Timbulan Sampah ke TPA**: Meminimalisasi volume sampah yang berakhir di TPA dengan memaksimalkan daur ulang sampah bernilai seperti botol plastik, kardus, kertas, logam, dan kaca.\n\n` +
          `4. 👥 **Pemberdayaan Masyarakat**: Membangun kebiasaan warga memilah sampah dari sumbernya (rumah tangga) secara konsisten demi kelestarian lingkungan dan kesejahteraan bersama. 🌍♻️`,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // 00. DETEKSI PERTANYAAN DEFINISI / KONSEP BANK SAMPAH DIGITAL ("apa itu bank sampah digital", dll)
    const isConceptQuery =
      !isWorkflowQuery &&
      !isPurposeQuery &&
      (
        (
          (q.includes('bank sampah') || q.includes('bsd')) &&
          (
            q.includes('apa itu') ||
            q.includes('apa sih') ||
            q.includes('apa yang') ||
            q.includes('pengertian') ||
            q.includes('definisi') ||
            q.includes('maksud') ||
            q.includes('konsep') ||
            q.includes('tentang') ||
            q.includes('jelaskan') ||
            q.includes('latar belakang')
          )
        ) ||
        q.includes('apa itu bank sampah') ||
        q.includes('apa bank sampah') ||
        q.includes('apa itu bsd') ||
        q.includes('apa bsd') ||
        q.includes('pengertian bank sampah') ||
        q.includes('definisi bank sampah') ||
        q.includes('tentang bank sampah') ||
        q === 'bank sampah digital' ||
        q === 'bank sampah'
      );

    if (isConceptQuery) {
      return {
        reply:
          `**Bank Sampah Digital** adalah platform pengelolaan sampah modern berbasis pemberdayaan masyarakat dan **ekonomi sirkular** yang mendigitalisasi proses pemilahan, penimbangan, dan pencatatan sampah bernilai ekonomis.\n\n` +
          `Melalui sistem ini, sampah anorganik yang dipilah warga (seperti botol plastik, kardus, kertas, logam, kaca, dan minyak jelantah) ditimbang di loket dan langsung dikonversi menjadi **saldo tabungan rupiah digital** serta **Poin Reward Hijau** yang dapat dicairkan atau ditukar sembako/hadiah.\n\n` +
          `**3 Langkah Utama:**\n` +
          `1. 🏠 **Pilah Sampah**: Warga memilah sampah bernilai daur ulang dari rumah dalam kondisi bersih dan kering.\n` +
          `2. ⚖️ **Timbang di Loket**: Petugas loket menimbang sampah dan mencatat transaksi langsung ke aplikasi sistem secara real-time.\n` +
          `3. 💰 **Tabungan & Reward**: Saldo rupiah otomatis bertambah di buku tabungan digital nasabah dan mendapatkan Poin Reward Hijau yang bisa ditukar hadiah menarik! 🌱`,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // 00-F. DETEKSI MENGAPA SALDO NASABAH BISA BERTAMBAH
    const isBalanceIncreaseQuery =
      (q.includes('mengapa') || q.includes('kenapa') || q.includes('bagaimana') || q.includes('gimana') || q.includes('alasan') || q.includes('sebab') || q.includes('dari mana')) &&
      (q.includes('saldo') || q.includes('tabungan')) &&
      (q.includes('bertambah') || q.includes('nambah') || q.includes('masuk') || q.includes('dapat') || q.includes('diperoleh') || q.includes('asal') || q.includes('bisa'));

    if (isBalanceIncreaseQuery) {
      return {
        reply:
          `**Mengapa Saldo Nasabah di Bank Sampah Digital Bisa Bertambah?**\n\n` +
          `Saldo buku tabungan digital nasabah dapat bertambah melalui mekanisme berikut:\n\n` +
          `1. ⚖️ **Penyetoran Sampah Daur Ulang**:\n` +
          `   Nasabah membawa sampah anorganik terpilah (botol plastik, kardus, kertas, kaleng logam, kaca, atau minyak jelantah) ke loket Bank Sampah Digital untuk ditimbang oleh petugas.\n\n` +
          `2. 💰 **Konversi Otomatis Sesuai Harga Katalog (Berat × Harga)**:\n` +
          `   Sistem secara otomatis menghitung nilai rupiah setoran:\n` +
          `   $$\\text{Nilai Setoran} = \\text{Berat Sampah (kg)} \\times \\text{Harga Beli Resmi (Rp/kg)}$$\n` +
          `   Nilai rupiah tersebut langsung dikreditkan (masuk) ke **Buku Tabungan Digital** nasabah saat transaksi dicatat secara real-time.\n\n` +
          `3. 🎁 **Bonus Poin Reward Hijau**:\n` +
          `   Selain saldo uang, nasabah juga otomatis mendapatkan Poin Reward Hijau untuk setiap kilogram sampah yang disetor, yang dapat ditukar dengan sembako atau hadiah menarik! 🌱`,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // 00-C. DETEKSI MANFAAT & KEUNTUNGAN
    const isBenefitQuery =
      (q.includes('manfaat') || q.includes('keuntungan') || q.includes('untung') || q.includes('faedah')) &&
      (q.includes('bank sampah') || q.includes('menabung') || q.includes('nabung') || q.includes('ikut'));

    if (isBenefitQuery) {
      return {
        reply:
          `**Manfaat & Keuntungan Bergabung dengan Bank Sampah Digital:**\n\n` +
          `- 💰 **Nilai Ekonomis (Uang Tambahan)**: Sampah terpilah tidak dibuang percuma, melainkan menghasilkan rupiah yang tercatat rapi di buku tabungan digital.\n` +
          `- 🎁 **Poin Reward & Hadiah**: Setiap kilogram sampah yang disetor menghasilkan Poin Hijau yang bisa ditukar sembako, minyak goreng, atau hadiah menarik.\n` +
          `- 📱 **Pencatatan Digital Transparan**: Memiliki buku tabungan digital dengan riwayat mutasi setoran dan penarikan yang aman dan akurat.\n` +
          `- 🌍 **Menjaga Lingkungan Hidup**: Mengurangi beban timbulan sampah ke TPA, mengurangi pencemaran plastik, serta mewujudkan ekonomi sirkular ramah lingkungan. 🌱`,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // 00-D. DETEKSI SAMPAH APA SAJA YANG DITERIMA
    const isAcceptedWasteQuery =
      (q.includes('sampah apa') && (q.includes('terima') || q.includes('diterima') || q.includes('bisa disetor') || q.includes('bisa ditabung') || q.includes('bisa dijual'))) ||
      (q.includes('jenis sampah') && (q.includes('diterima') || q.includes('apa saja') || q.includes('bisa disetor'))) ||
      (q.includes('kategori sampah') && (q.includes('apa saja') || q.includes('tersedia') || q.includes('diterima'))) ||
      q.includes('bisa setor apa saja') ||
      q.includes('apa saja yang bisa disetor');

    if (isAcceptedWasteQuery) {
      try {
        const catRows = await db('waste_categories')
          .leftJoin('waste_prices', function () {
            this.on('waste_categories.id', '=', 'waste_prices.waste_category_id')
              .andOn('waste_prices.is_active', '=', db.raw('?', [1]));
          })
          .where('waste_categories.is_active', 1)
          .select('waste_categories.name', 'waste_categories.unit', 'waste_prices.buying_price');

        if (catRows && catRows.length > 0) {
          const listText = catRows.map((c, i) => {
            const price = c.buying_price ? ` - Rp ${Number(c.buying_price).toLocaleString('id-ID')}/${c.unit}` : '';
            return `${i + 1}. **${c.name}**${price}`;
          }).join('\n');

          return {
            reply:
              `Berikut jenis sampah anorganik yang diterima di **Bank Sampah Digital** (kondisi bersih & kering):\n\n` +
              listText +
              `\n\n📌 *Catatan: Pastikan sampah botol plastik telah dibilas dan botol kaca tidak pecah.*`,
            source: 'DATABASE_TOOL',
            authorized: true,
            functionCall: null,
            model: 'database-tool',
          };
        }
      } catch (e) {}

      return {
        reply:
          `Jenis sampah yang diterima di **Bank Sampah Digital** meliputi:\n\n` +
          `1. 🧴 **Plastik**: Botol PET bersih (air mineral), gelas plastik (PP), botol shampo/sabun (HDPE), kantong kresek bersih.\n` +
          `2. 📦 **Kertas & Karton**: Kardus cokelat tebal, buku tulis/HVS, koran, majalah.\n` +
          `3. 🔩 **Logam & Besi**: Besi tua, kaleng biskuit, kaleng minuman aluminium, kuningan, tembaga.\n` +
          `4. 🍾 **Kaca**: Botol kecap, sirup, atau bir utuh (tidak pecah).\n` +
          `5. 🛢️ **Minyak Jelantah**: Minyak goreng bekas pakai yang disaring dalam botol/jeriken.\n\n` +
          `*Pastikan sampah disetor dalam kondisi bersih dan kering untuk mendapatkan nilai timbangan optimal.*`,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // 00-E. DETEKSI CARA PENARIKAN SALDO & PENUKARAN REWARD
    const isWithdrawRewardQuery =
      (q.includes('cara') || q.includes('bagaimana') || q.includes('gimana')) &&
      (q.includes('tarik saldo') || q.includes('tarik uang') || q.includes('mencairkan') || q.includes('cairkan saldo') || q.includes('penarikan dana') || q.includes('tukar poin') || q.includes('tukar reward') || q.includes('tukar hadiah'));

    if (isWithdrawRewardQuery) {
      return {
        reply:
          `**Panduan Penarikan Saldo & Penukaran Hadiah:**\n\n` +
          `💵 **1. Penarikan Saldo Tabungan**:\n` +
          `- Masuk ke menu **Buku Tabungan** pada dasbor akun Anda.\n` +
          `- Klik tombol **Tarik Saldo** dan masukkan nominal yang ingin ditarik.\n` +
          `- Pilih metode pencairan: **Tunai di Loket**, **Transfer Bank**, atau **E-Wallet** (GoPay/OVO/DANA).\n` +
          `- Konfirmasi pengajuan dengan PIN Anda. Petugas/Admin akan memverifikasi dan menyerahkan dana.\n\n` +
          `🎁 **2. Penukaran Poin Reward Hijau**:\n` +
          `- Buka menu **Katalog Reward / Hadiah**.\n` +
          `- Pilih sembako (minyak, beras, gula) atau merchandise sesuai saldo poin Anda.\n` +
          `- Klik **Tukar Poin**, dan tukarkan voucher penukaran Anda di loket Bank Sampah Digital! ⭐`,
        source: 'KNOWLEDGE_BASE',
        authorized: true,
        functionCall: null,
        model: 'knowledge-base',
      };
    }

    // DETEKSI PERTANYAAN ROLE SISTEM (RBAC)
    // 1. Jika menanyakan "BERAPA / JUMLAH" -> Jawab angka saja tanpa menyebutkan siapa saja
    const isCountRole = [
      'ada berapa role', 'ada brapa role', 'berapa role', 'brapa role',
      'berapa peran', 'brapa peran', 'jumlah role', 'jumlah peran',
      'ada berapa peran', 'ada brapa peran', 'total role', 'total peran'
    ].some(phrase => q.includes(phrase));

    if (isCountRole) {
      return {
        reply: 'Ada **4** role.',
        source: 'SYSTEM_ROLES',
        authorized: true,
        functionCall: null,
        model: 'system-roles',
      };
    }

    // 2. Jika menanyakan "APA SAJA / SIAPA SAJA / SEBUTKAN" -> Jawab daftar role
    const isDetailRole = [
      'role apa saja', 'peran apa saja', 'apa saja role', 'apa saja peran',
      'siapa saja role', 'siapa aja role', 'daftar role', 'daftar peran',
      'sebutkan role', 'sebutkan peran', 'jelaskan role', 'jelaskan peran',
      'role sistem', 'role di sistem', 'role yang ada', 'peran yang ada'
    ].some(phrase => q.includes(phrase)) || q === 'role' || q === 'peran';

    if (isDetailRole) {
      return {
        reply:
          `Sistem **Bank Sampah Digital** memiliki **4 Role Utama**:\n\n` +
          `1. 👑 **Administrator (ADMIN)**: Akses penuh ke seluruh konfigurasi, audit log, manajemen user, dan integrasi.\n` +
          `2. 📊 **Owner / Pengelola (OWNER)**: Dasbor analitik eksekutif, analisis keuangan, approval penarikan, dan stok gudang.\n` +
          `3. ⚖️ **Petugas Timbang (PETUGAS)**: Operasional loket penimbangan sampah, pencatatan setoran, dan kasir tunai.\n` +
          `4. 👤 **Nasabah Warga (NASABAH)**: Dasbor personal, kartu digital & QR, buku tabungan, dan reward.`,
        source: 'SYSTEM_ROLES',
        authorized: true,
        functionCall: null,
        model: 'system-roles',
      };
    }

    // 3. Jika menanyakan NAMA PEJABAT / PENGGUNA SISTEM BERDASARKAN ROLE ("siapa nama admin", "siapa owner", dll)
    const isAdminQuery = (q.includes('admin') || q.includes('administrator')) && (q.includes('siapa') || q.includes('nama'));
    const isOwnerQuery = (q.includes('owner') || q.includes('pemilik') || q.includes('pengelola') || q.includes('ketua')) && (q.includes('siapa') || q.includes('nama'));
    const isPetugasQuery = (q.includes('petugas') || q.includes('teller') || q.includes('kasir')) && (q.includes('siapa') || q.includes('nama'));
    const isNasabahQuery =
      (q.includes('nasabah') || q.includes('warga')) &&
      (q.includes('siapa nama') || q.includes('siapa nasabah') || q.includes('siapa saja nasabah') || q.includes('sebutkan nama') || q.includes('daftar nama') || q.includes('daftar warga') || q.includes('daftar nasabah') || q.includes('sebutkan warga') || q.includes('sebutkan nasabah') || q.includes('nama warga'));

    if (isAdminQuery) {
      return {
        reply: 'Administrator sistem adalah **Alivia Aprianti**.',
        source: 'SYSTEM_PERSONNEL',
        authorized: true,
        functionCall: null,
        model: 'system-personnel',
      };
    }
    if (isOwnerQuery) {
      return {
        reply: 'Owner / Pengelola bank sampah adalah **H. Mulyono**.',
        source: 'SYSTEM_PERSONNEL',
        authorized: true,
        functionCall: null,
        model: 'system-personnel',
      };
    }
    if (isPetugasQuery) {
      return {
        reply: 'Petugas timbang & kasir adalah **Dewi Sartika**.',
        source: 'SYSTEM_PERSONNEL',
        authorized: true,
        functionCall: null,
        model: 'system-personnel',
      };
    }
    if (isNasabahQuery) {
      try {
        const custList = await db('customers')
          .join('users', 'customers.user_id', 'users.id')
          .select('users.name', 'customers.account_no')
          .orderBy('customers.id', 'asc')
          .limit(30);

        if (custList.length > 0) {
          const formatted = custList.map((c, i) => `${i + 1}. **${c.name}** (${c.account_no})`).join('\n');
          return {
            reply: `Berikut daftar nama nasabah warga terdaftar (${custList.length} orang):\n\n${formatted}`,
            source: 'SYSTEM_PERSONNEL',
            authorized: true,
            functionCall: null,
            model: 'system-personnel',
          };
        }
      } catch (err) {}
      return {
        reply: 'Nasabah warga terdaftar antara lain **Budi Santoso (Warga RT 03)** dan Siti Aminah.',
        source: 'SYSTEM_PERSONNEL',
        authorized: true,
        functionCall: null,
        model: 'system-personnel',
      };
    }

    // 4. Deteksi Pertanyaan Saldo / Tabungan / Poin / Data Spesifik Nasabah Berdasarkan Nama
    const nonCustomerLookupWords = [
      'mengapa', 'kenapa', 'bagaimana', 'gimana', 'apakah', 'kapan', 'alasan',
      'sebab', 'bertambah', 'berkurang', 'nambah', 'cara', 'alur', 'tahapan',
      'dapat apa', 'fungsinya', 'tujuannya', 'masuk', 'keluar', 'cair', 'ditarik'
    ];
    const isConceptOrQuestion = nonCustomerLookupWords.some(w => q.includes(w));

    const isCustomerDataQuery =
      !isConceptOrQuestion &&
      (q.includes('saldo') || q.includes('tabungan') || q.includes('poin') || q.includes('point') || q.includes('rekening') || q.includes('setoran') || q.includes('sampah')) &&
      !q.includes('saldo saya') &&
      !q.includes('poin saya') &&
      !q.includes('tabungan saya') &&
      !q.includes('saldo seluruh') &&
      !q.includes('total saldo seluruh') &&
      !q.includes('seluruh nasabah') &&
      !q.includes('semua nasabah');

    if (isCustomerDataQuery) {
      const stopWords = [
        'berapa', 'brapa', 'jumlah', 'total', 'saldo', 'tabungan', 'poin', 'point',
        'uang', 'isi', 'cek', 'lihat', 'data', 'info', 'nasabah', 'warga', 'akun',
        'rekening', 'nomor', 'no', 'milik', 'punya', 'si', 'dari', 'pada', 'adalah',
        'terdaftar', 'nya', 'ya', 'dong', 'kah', 'tolong', 'bisa', 'mohon'
      ];
      const candidate = q
        .replace(/[?!.,;:()]/g, ' ')
        .split(/\s+/)
        .filter(w => !stopWords.includes(w))
        .join(' ')
        .trim();

      if (candidate.length >= 2) {
        try {
          const cust = await db('customers')
            .join('users', 'customers.user_id', 'users.id')
            .leftJoin('customer_wallets', 'customers.id', 'customer_wallets.customer_id')
            .leftJoin('points', 'customers.id', 'points.customer_id')
            .where(function () {
              this.where('users.name', 'like', '%' + candidate + '%')
                .orWhere('customers.account_no', 'like', '%' + candidate + '%');
            })
            .select(
              'customers.id',
              'users.name',
              'customers.account_no',
              'customers.status',
              'customer_wallets.current_balance',
              'customer_wallets.accumulated_earnings',
              'points.current_points'
            )
            .first();

          if (!cust) {
            const isExplicitPersonBalance =
              q.startsWith('saldo ') ||
              q.startsWith('cek saldo ') ||
              q.startsWith('tabungan ') ||
              q.startsWith('poin ') ||
              q.startsWith('berapa saldo ') ||
              q.startsWith('berapa tabungan ') ||
              q.startsWith('berapa poin ') ||
              q.includes('saldo milik') ||
              q.includes('saldo atas nama') ||
              q.includes('saldo si ') ||
              candidate.toLowerCase().startsWith('nsb-');

            if (isExplicitPersonBalance && candidate.split(' ').length <= 3) {
              return {
                reply: `Data nasabah dengan nama atau nomor akun "**${candidate}**" tidak ditemukan di sistem. Pastikan nama atau nomor rekening yang dimasukkan sudah benar.`,
                source: 'DATABASE_TOOL',
                authorized: true,
                functionCall: null,
                model: 'database-tool',
              };
            }
          }

          if (cust) {
            const bal = parseFloat(cust.current_balance || 0);
            const pts = parseInt(cust.current_points || 0, 10);

            if (q.includes('poin') || q.includes('point')) {
              return {
                reply: `Total poin reward **${cust.name}** adalah **${pts.toLocaleString('id-ID')} Poin**.`,
                source: 'DATABASE_TOOL',
                authorized: true,
                functionCall: null,
                model: 'database-tool',
              };
            }

            if (q.includes('setoran') || q.includes('sampah')) {
              let weight = 0;
              try {
                const dep = await db('waste_deposit_transactions').where({ customer_id: cust.id }).sum('total_weight_kg as total').first();
                weight = parseFloat(dep?.total || 0);
              } catch (e) {}
              return {
                reply: `Total sampah yang disetorkan **${cust.name}** adalah **${weight.toLocaleString('id-ID')} kg**.`,
                source: 'DATABASE_TOOL',
                authorized: true,
                functionCall: null,
                model: 'database-tool',
              };
            }

            return {
              reply: `Saldo tabungan **${cust.name}** adalah **Rp ${bal.toLocaleString('id-ID')}** (Poin: ${pts.toLocaleString('id-ID')}).`,
              source: 'DATABASE_TOOL',
              authorized: true,
              functionCall: null,
              model: 'database-tool',
            };
          }
        } catch (dbErr) {
          console.warn('[NousChatbot] Customer lookup error:', dbErr.message);
        }
      }
    }

    // 5. DETEKSI PERTANYAAN HARGA SAMPAH ("berapa harga botol kaca bening utuh", "harga kardus", "daftar harga")
    const isPriceQuery = (q.includes('harga') || q.includes('price') || q.includes('tarif') || q.includes('biaya')) && !q.includes('paling mahal') && !q.includes('termahal');
    if (isPriceQuery) {
      try {
        const categories = await db('waste_categories')
          .leftJoin('waste_prices', function () {
            this.on('waste_categories.id', '=', 'waste_prices.waste_category_id')
              .andOn('waste_prices.is_active', '=', db.raw('?', [1]));
          })
          .where('waste_categories.is_active', 1)
          .select(
            'waste_categories.id',
            'waste_categories.code',
            'waste_categories.name',
            'waste_categories.parent_category',
            'waste_categories.unit',
            'waste_prices.buying_price',
            'waste_prices.selling_price'
          );

        const stopWords = [
          'berapa', 'brapa', 'harga', 'harganya', 'tarif', 'biaya', 'price', 'rate',
          'beli', 'jual', 'saat', 'ini', 'sekarang', 'per', 'kilo', 'kg', 'liter',
          'satuan', 'dong', 'ya', 'kah', 'tolong', 'info', 'cek', 'ada', 'apa', 'saja',
          'daftar', 'sampah', 'jenis'
        ];
        const tokens = q
          .replace(/[^\w\s-]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 1 && !stopWords.includes(w));
        const cleanPhrase = tokens.join(' ');

        const scored = categories
          .filter((c) => c.buying_price)
          .map((item) => {
            const nameLower = item.name.toLowerCase();
            const parentLower = (item.parent_category || '').toLowerCase();
            const codeLower = item.code.toLowerCase();
            let score = 0;

            if (cleanPhrase && nameLower.includes(cleanPhrase)) score += 100 + cleanPhrase.length;
            if (cleanPhrase && cleanPhrase.includes(nameLower)) score += 80;

            let tokenMatches = 0;
            for (const t of tokens) {
              if (nameLower.includes(t)) {
                tokenMatches++;
                score += 10;
              } else if (parentLower.includes(t) || codeLower.includes(t)) {
                score += 5;
              }
            }
            return { item, score, tokenMatches };
          });

        scored.sort((a, b) => b.score - a.score);
        const top = scored[0];
        const topScore = top ? top.score : 0;

        if (top && topScore >= 10) {
          const topMatches = scored.filter((s) => s.score === topScore);
          if (topMatches.length === 1 || top.score >= 100) {
            const item = top.item;
            const unit = (item.unit || 'KG').toUpperCase();
            const buyStr = `Rp ${Number(item.buying_price).toLocaleString('id-ID')}`;
            let reply = `Harga resmi Bank Sampah Digital untuk **${item.name}** adalah **${buyStr} / ${unit}**`;
            if (item.selling_price && Number(item.selling_price) > 0) {
              reply += ` (harga jual: Rp ${Number(item.selling_price).toLocaleString('id-ID')} / ${unit}).`;
            } else {
              reply += '.';
            }

            return {
              reply,
              source: 'DATABASE_TOOL',
              authorized: true,
              functionCall: null,
              model: 'database-price',
            };
          } else {
            const lines = topMatches.map((s) => {
              const u = (s.item.unit || 'KG').toUpperCase();
              const buy = `Rp ${Number(s.item.buying_price).toLocaleString('id-ID')}`;
              return `- **${s.item.name}**: **${buy} / ${u}**`;
            });

            return {
              reply: `Berikut daftar harga resmi untuk **${cleanPhrase || 'kategori tersebut'}** di Bank Sampah Digital:\n\n` + lines.join('\n'),
              source: 'DATABASE_TOOL',
              authorized: true,
              functionCall: null,
              model: 'database-price',
            };
          }
        }

        // Jika pertanyaan daftar harga umum
        if (categories.length) {
          const lines = categories
            .filter((c) => c.buying_price)
            .map((c) => {
              const u = (c.unit || 'KG').toUpperCase();
              const buy = `Rp ${Number(c.buying_price).toLocaleString('id-ID')}`;
              return `- **${c.name}**: **${buy} / ${u}**`;
            });

          return {
            reply: `Berikut daftar harga beli resmi Bank Sampah Digital saat ini:\n\n` + lines.join('\n'),
            source: 'DATABASE_TOOL',
            authorized: true,
            functionCall: null,
            model: 'database-price',
          };
        }
      } catch (err) {
        console.warn('[NousChatbot] Error querying waste prices:', err.message);
      }
    }

    // EMERGENCY FALLBACK: Kategori sampah paling mahal / termahal
    const expensiveKeywords = ['paling mahal', 'termahal', 'harga tertinggi'];
    const expensiveDetected = expensiveKeywords.some(kw => q.includes(kw));

    if (expensiveDetected) {
      try {
        const expensiveWaste = await databaseToolsService.executeTool('get_waste_category_status', { waste_type: '' }, user);
        if (expensiveWaste && expensiveWaste.success) {
          const data = expensiveWaste.data;
          return {
            reply: `💰 **Sampah Termahal Saat Ini:**\n\n` +
              `Kategori: **${data.name}** (${data.code})\n` +
              `Satuan: **${data.unit}**\n` +
              `Harga Beli Resmi: **Rp ${(data.buying_price || 0).toLocaleString('id-ID')}**/${data.unit}.`,
            source: 'DATABASE_FALLBACK',
            authorized: true,
            functionCall: { tool: 'get_waste_category_status', arguments: { waste_type: '' }, data: data },
            model: 'database-fallback',
          };
        }
      } catch (e) {
        console.error('[NousChatbot] Emergency fallback failed:', e.message);
      }
    }

    // DETEKSI PANDUAN UMUM SEBELUM/SESUDAH LLM
    // Jika user bertanya tentang panduan umum, balas langsung tanpa memanggil LLM
    const guidanceKeywords = ['cara menabung', 'alur menabung', 'cara setor', 'alur setor', 'panduan menabung', 'panduan setor'];
    const guidanceDetected = guidanceKeywords.some(kw => q.includes(kw));

    if (guidanceDetected) {
      return {
        reply: 'Panduan Menabung Sampah di Bank Sampah Digital\n\n' +
          'Ikuti langkah-langkah terstruktur berikut untuk menabung sampah dan memperoleh saldo serta poin reward:\n\n' +
          '1. Pilah Sampah di Rumah: Pisahkan sampah bernilai ekonomi (botol plastik, kardus, kaleng logam, kertas) dalam kondisi bersih dan kering. Lepaskan tutup dan label.\n\n' +
          '2. Bawa ke Titik Kumpul/Petugas Timbang: Kunjungi loket Bank Sampah Digital terdekat. Tunjukkan kartu anggota atau nomor akun nasabah Anda kepada petugas timbang.\n\n' +
          '3. Timbang & Catat di Sistem: Petugas menimbang sampah secara terbuka dan mencatat kategori serta beratnya langsung ke sistem aplikasi.\n\n' +
          '4. Saldo Otomatis Masuk ke Akun: Nilai setoran rupiah langsung bertambah di Buku Tabungan Digital Anda, serta mendapatkan Poin Reward Hijau untuk setiap setoran!\n\n' +
          'Setelah menimbang, sampah Anda langsung diterima dan saldo akan tersedia untuk penarikan atau penukaran hadiah di katalog reward.',
        source: 'GUIDANCE',
        authorized: true,
        functionCall: null,
        model: 'guidance-fallback',
      };
    }

    // BLOKIR KODE PEMROGRAMAN — DICEK PALING AWAL sebelum memanggil AI
    // Hanya cocok jika ada KATA KERJA permintaan + istilah pemrograman
    const codeActionVerbs = [
      'buatkan', 'buat', 'tulis', 'contoh', 'memperbaiki', 'perbaiki',
      'mengerjakan', 'membuat', 'codingkan', 'programkan', 'scriptkan'
    ];

    const codeTerms = [
      'kode', 'coding', 'codingan', 'program', 'script', 'source code', 'aplikasi',
      'python', 'javascript', 'js', 'typescript', 'ts', 'html', 'css', 'java', 'php',
      'c++', 'cpp', 'c#', 'csharp', 'go', 'golang', 'rust', 'ruby', 'swift', 'kotlin',
      'dart', 'flutter', 'react', 'vue', 'angular', 'node', 'nodejs', 'express',
      'django', 'flask', 'fastapi', 'spring', 'laravel', 'codeigniter', 'symfony',
      'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'graphql', 'rest api', 'api',
      'bash', 'shell', 'powershell', 'cmd', 'batch', 'vba', 'excel', 'macro',
      'matlab', 'scala', 'perl', 'lua', 'haskell', 'clojure', 'elixir', 'erlang',
      'solidity', 'smart contract', 'web3', 'blockchain'
    ];

    let isCodeRequest = false;
    for (const verb of codeActionVerbs) {
      for (const term of codeTerms) {
        if (q.includes(`${verb} ${term}`)) {
          isCodeRequest = true;
          break;
        }
        if (term === 'kode' || term === 'coding' || term === 'codingan' || term === 'program' || term === 'script' || term === 'source code' || term === 'aplikasi') {
          if (q.includes(`${verb} ${term}`)) {
            isCodeRequest = true;
            break;
          }
        }
      }
      if (isCodeRequest) break;
    }

    const explicitCodeRequests = [
      'codinganku', 'codingan saya', 'kode saya', 'program saya', 'script saya',
      'kode python', 'coding python', 'program python', 'script python', 'source code python',
      'kode javascript', 'coding javascript', 'program javascript', 'script js', 'source code js',
      'kode html', 'coding html', 'program html', 'script html',
      'kode css', 'coding css', 'style css',
      'kode java', 'coding java', 'program java',
      'kode php', 'coding php', 'program php',
      'kode c++', 'coding c++', 'program c++',
      'kode c#', 'coding c#', 'program c#',
      'kode go', 'coding go', 'program go',
      'kode rust', 'coding rust', 'program rust',
      'buat website', 'buatkan website', 'membuat website',
      'buat api', 'buatkan api', 'membuat api',
      'coding website', 'coding aplikasi', 'coding sistem',
      // Tambahan untuk menangkap edge cases
      'tugas coding', 'tugas kode', 'tugas program', 'tugas script', 'tugas codingan',
      'codingan react', 'codingan vue', 'codingan angular', 'codingan flutter',
      'codingan django', 'codingan flask', 'codingan fastapi', 'codingan laravel',
      'codingan spring', 'codingan express', 'codingan node', 'codingan nextjs',
      'script bash', 'script shell', 'script powershell', 'script cmd', 'script bat',
      'kode sql', 'query sql', 'kode mysql', 'kode postgresql', 'kode mongodb',
      'kode react', 'kode vue', 'kode angular', 'kode flutter',
    ];

    if (!isCodeRequest) {
      isCodeRequest = explicitCodeRequests.some(phrase => q.includes(phrase));
    }

    // Tambahan: cek pola "mengerjakan tugas coding" (dengan kata di tengah)
    if (!isCodeRequest) {
      const verbWithGapPatterns = [
        'mengerjakan tugas coding', 'mengerjakan tugas kode', 'mengerjakan tugas program',
        'membuat coding', 'membuat kode', 'membuat program', 'membuat script', 'membuat aplikasi',
        'buatkan coding', 'buatkan kode', 'buatkan program', 'buatkan script',
      ];
      isCodeRequest = verbWithGapPatterns.some(pattern => q.includes(pattern));
    }

    if (isCodeRequest) {
      return {
        reply: 'Maaf, saya tidak dapat membuat kode pemrograman. Saya hanya membantu informasi dan layanan terkait Bank Sampah Digital.',
        model: 'local-fallback (Code Request Blocked)',
        provider: 'Nous Research Fallback',
        usage: null,
        keyIdMasked: this.keyId ? `${this.keyId.substring(0, 8)}...` : null,
      };
    }

    const systemPrompt = await this.buildSystemPrompt(user);

    // Sanitize and cap history to last 8 messages
    const validHistory = Array.isArray(history)
      ? history
          .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
          .slice(-8)
      : [];

    const messages = [
      { role: 'system', content: systemPrompt },
      ...validHistory,
      { role: 'user', content: trimmedMsg },
    ];

    // Auto-detect GroqCloud API key format
    const isGroq = Boolean(this.apiKey && this.apiKey.startsWith('gsk_'));
    const defaultGroqModel = 'qwen/qwen3.8-27b';
    const effectiveBaseUrl = isGroq ? 'https://api.groq.com/openai/v1' : this.baseUrl;

    const baseModelsToTry = isGroq
      ? [
          (this.defaultModel && (this.defaultModel.includes('qwen') || this.defaultModel.includes('gpt-oss'))) ? this.defaultModel : defaultGroqModel,
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b',
          'allam-2-7b'
        ]
      : [this.defaultModel, ...this.fallbackModels.filter((m) => m !== this.defaultModel)];
    const modelsToTry = [...new Set(baseModelsToTry)];
    const isAdmin = databaseToolsService.isAdmin(user);

    let lastError = null;

    for (const model of modelsToTry) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

      try {
        const requestPayload = {
          model,
          messages,
          max_tokens: 800,
          temperature: 0.7,
        };

        // Attach function calling declarations (Admin mendapat semua tool DB, non-Admin mendapat tool kalkulator)
        const allTools = databaseToolsService.getToolDeclarations();
        if (isAdmin) {
          requestPayload.tools = allTools;
          requestPayload.tool_choice = 'auto';
        } else {
          const publicTools = allTools.filter((t) => t.function?.name === 'calculate_waste_price');
          if (publicTools.length > 0) {
            requestPayload.tools = publicTools;
            requestPayload.tool_choice = 'auto';
          }
        }

        const reqHeaders = {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        };
        if (!isGroq && this.keyId) {
          reqHeaders['X-Key-Id'] = this.keyId;
        }

        const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: reqHeaders,
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify(requestPayload),
        });

        const data = await response.json();

        if (response.ok && data.choices && data.choices.length > 0) {
          const choice = data.choices[0];

          // Check if AI invoked Function Calling
          if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            const toolName = toolCall.function?.name;
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
            } catch (e) {
              toolArgs = {};
            }

            console.log(`[NousChatbot] Function Calling executed: ${toolName}`, toolArgs);
            const toolExec = await databaseToolsService.executeTool(toolName, toolArgs, user);

            return {
              reply: toolExec.summary || toolExec.message || 'Data berhasil diambil dari database.',
              model,
              provider: `Nous Research (Function Calling: ${toolName})`,
              usage: data.usage || null,
              keyIdMasked: this.keyId ? `${this.keyId.substring(0, 8)}...` : null,
              functionCall: {
                tool: toolName,
                arguments: toolArgs,
                data: toolExec.data,
              },
              source: toolExec.authorized === false ? 'ACCESS_RESTRICTED' : 'DATABASE_TOOL',
              authorized: toolExec.authorized !== false,
            };
          }

          let replyContent = choice.message?.content;

          // If the model stored reasoning or text in a different field
          if (!replyContent && choice.message?.reasoning) {
            replyContent = choice.message.reasoning;
          }

          if (replyContent && replyContent.trim()) {
            return {
              reply: replyContent.trim(),
              model,
              provider: 'Nous Research',
              usage: data.usage || null,
              keyIdMasked: this.keyId ? `${this.keyId.substring(0, 8)}...` : null,
              functionCall: null,
              source: 'GENERAL_KNOWLEDGE',
              authorized: true,
            };
          }
        }

        // If returned an error indicating model issues, try next model
        lastError = new Error(data.message || data.error?.message || `HTTP ${response.status}`);
        console.warn(`[NousChatbot] Model ${model} returned error:`, lastError.message);
      } catch (err) {
        lastError = err;
        const reason = err?.name === 'AbortError' ? `timeout after ${this.timeoutMs}ms` : err.message;
        console.warn(`[NousChatbot] Network or parsing error with ${model}:`, reason);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    // If all models failed, try database fallback instead of throwing error
    // This ensures the system can still respond with database data even when LLM is unavailable
    try {
      // Emergency fallback: check for database-related keywords in user message
      const fallbackKeywords = ['mahal', 'harga', 'paling mahal', 'kardus', 'karton', 'status'];
      const fallbackDetected = fallbackKeywords.some(kw => q.includes(kw));

      if (fallbackDetected) {
        // Query database for relevant information
        let toolName = 'get_waste_category_status';
        if (q.includes('mahal') || q.includes('harga') || q.includes('paling mahal')) {
          // Query most expensive waste
          const expensiveWaste = await databaseToolsService.executeTool('get_waste_category_status', { waste_type: '' }, user);
          if (expensiveWaste && expensiveWaste.success) {
            const data = expensiveWaste.data;
            return {
              reply: `💰 **Sampah Mahal Terjangkau:**\n\n` +
                `Kategori: **${data.name}** (${data.code})\n` +
                `Status: ${data.isActive ? 'Aktif' : 'Non-Aktif'}\n` +
                `Satuan: **${data.unit}**\n` +
                `Harga Beli: **Rp ${(data.buying_price || 0).toLocaleString('id-ID')}**/${data.unit}\n\n` +
                `Ini adalah sampah dengan harga beli tertinggi saat ini. ` +
                `Untuk kalkulasi: berat (kg) × harga per kg = total nilai.`,
              source: 'DATABASE_FALLBACK',
              authorized: true,
              functionCall: { tool: 'get_waste_category_status', arguments: { waste_type: '' }, data: data },
              model: 'database-fallback',
            };
          }
        } else if (q.includes('kardus') || q.includes('karton')) {
          // Query cardbox/carton status
          const cardboard = await databaseToolsService.executeTool('get_waste_category_status', { waste_type: 'kardus' }, user);
          if (cardboard && cardboard.success) {
            const data = cardboard.data;
            return {
              reply: `📦 **Status Kategori Kardus:**\n\n` +
                `Kategori: **${data.name}** (${data.code})\n` +
                `Status: ${data.isActive ? 'Aktif' : 'Non-Aktif'}\n` +
                `Satuan: **${data.unit}**\n` +
                `Harga Beli: **Rp ${(data.buying_price || 0).toLocaleString('id-ID')}**/${data.unit}\n\n` +
                `Kardus cokelat tebal adalah kategori sampah bernilai tinggi yang sering disetorkan.`,
              source: 'DATABASE_FALLBACK',
              authorized: true,
              functionCall: { tool: 'get_waste_category_status', arguments: { waste_type: 'kardus' }, data: data },
              model: 'database-fallback',
            };
          }
        }
      }

      // Jika tidak terdeteksi keyword emergency, kirim pesan informatif
      return {
        reply: 'Maaf, layanan AI sedang tidak tersedia. Silakan coba lagi dalam beberapa menit.',
        source: 'DATABASE_FALLBACK',
        authorized: false,
        model: 'database-fallback',
      };
    } catch (e) {
      console.error('[NousChatbot] Database fallback error:', e.message);
    }

    // If all models failed, try database/final fallback instead of throwing error
    // This ensures the system always responds helpfully, never with "Tidak ada intent"
    try {
      // Check for financial/guidance keywords in the user's message
      const finalKeywords = ['saldo', 'poin', 'tarik', 'mahal', 'harga', 'kardus', 'status', 'cara', 'menabung', 'setor', 'alur', 'daftar'];
      const finalDetected = finalKeywords.some(kw => q.includes(kw));

      if (finalDetected) {
        // Re-query database for the detected keywords
        if (q.includes('saldo') || q.includes('poin') || q.includes('tarik')) {
          return {
            reply: '💳 **Informasi Saldo & Poin**\\n\\n' +
              'Untuk melihat saldo dan poin reward Anda, silakan login ke dashboard akun Bank Sampah Digital Anda.\\n\\n' +
              'Saldo dari setoran sampah dapat ditarik sesuai nominal yang tersedia. Poin Reward Hijau dapat ditukarkan di katalog hadiah.\\n\\n' +
              'Jika Anda lupa password atau memiliki pertanyaan tentang transaksi, hubungi admin Bank Sampah.',
            source: 'DATABASE_FALLBACK',
            authorized: true,
            functionCall: null,
            model: 'database-fallback',
          };
        } else if (q.includes('mahal') || q.includes('harga') || q.includes('kardus') || q.includes('status')) {
          // This case is already handled by the emergency fallback above,
          // but as a final fallback, query database directly
          const category = await databaseToolsService.executeTool('get_waste_category_status', { waste_type: '' }, user);
          if (category && category.success) {
            const data = category.data;
            return {
              reply: `📦 **Status Kategori:** ${data.name} (${data.code})\\n` +
                `Status: ${data.isActive ? 'Aktif' : 'Non-Aktif'}\\n` +
                `Harga Beli: Rp ${(data.buying_price || 0).toLocaleString('id-ID')}/${data.unit}\\n\\n` +
                `Untuk pertanyaan lebih lanjut tentang harga atau kategori sampah, ketik "harga" atau "status".`,
              source: 'DATABASE_FALLBACK',
              authorized: true,
              functionCall: { tool: 'get_waste_category_status', arguments: { waste_type: '' }, data: data },
              model: 'database-fallback',
            };
          }
        } else if (q.includes('cara') || q.includes('menabung') || q.includes('setor') || q.includes('alur') || q.includes('daftar')) {
          // Guidance fallback already handled above, but as final fallback
          return {
            reply: '📋 **Panduan Menabung Sampah**\\n\\n' +
              '1. Pilah sampah di rumah (plastik, kardus, kaleng, kertas).\\n' +
              '2. Bawa ke loket timbang Bank Sampah terdekat.\\n' +
              '3. Timbang & catat di sistem.\\n' +
              '4. Saldo otomatis masuk ke akun Anda.\\n\\n' +
              'Untuk detail langkah-langkah, ketik "cara menabung".',
            source: 'GUIDANCE',
            authorized: true,
            functionCall: null,
            model: 'guidance-fallback',
          };
        }
      }

      // Jika tidak terdeteksi keyword khusus, kirim daftar topik yang tersedia
      return {
        reply: '🤖 **Bot Sampah siap membantu!**\\n\\nTopik yang bisa Anda tanyakan:\n' +
          '• "harga sampah berapa?" — Cek harga beli sampah mahal\\n' +
          '• "status kardus?" — Cek status kategori sampah\\n' +
          '• "cara menabung?" — Panduan lengkap menabung sampah\\n' +
          '• "saldo saya?" — Cek saldo dan poin reward\\n' +
          '• "tarik saldo?" — Petunjuk penarikan saldo\\n\\n' +
          'Ketik topik di atas atau tanyakan nama sampah spesifik untuk info langsung dari database.',
        source: 'DATABASE_FALLBACK',
        authorized: false,
        model: 'database-fallback',
      };
    } catch (e) {
      console.error('[NousChatbot] Final fallback error:', e.message);
    }

    // Safe default fallback - always return helpful text, never throw error
    // This ensures UI never shows error boxes and every response is status 200
    return {
      reply: 'Maaf, saya kurang memahami pertanyaan tersebut. Anda dapat menanyakan seputar daftar harga sampah, status kategori aktif, cara menabung sampah, atau informasi saldo akun Anda.',
      source: 'DATABASE_FALLBACK',
      authorized: false,
      model: 'database-fallback',
    };
  }
}

module.exports = new NousChatbotService();
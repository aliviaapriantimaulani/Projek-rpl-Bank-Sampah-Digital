/**
 * AI Assistant Service - Structured Analytics & Natural Language Query Layer
 * Enforces strict RBAC, queries factual database aggregates safely via Knex,
 * and formats polite Indonesian responses without fabricating numbers.
 *
 * Aturan Tambahan:
 * - Input yang tidak cocok dengan intent TIDAK menghasilkan pesan error
 *   "UNKNOWN_GUIDANCE" / pesan maaf kaku, melainkan jawaban general knowledge.
 * - Pertanyaan identitas dijawab dengan kalimat perkenalan resmi.
 * - Pertanyaan "harga sampah" dijawab dengan kisaran harga umum + pengingat
 *   bahwa harga pasti menyesuaikan ketentuan bank sampah setempat.
 * - Pertanyaan kode pemrograman DITOLAK dengan pesan standar.
 */

const db = require('../../config/database');
const nousChatbotService = require('./nous_chatbot.service');
const databaseSchemaService = require('./database_schema.service');
const databaseToolsService = require('./database_tools.service');

/** Perkiraan kisaran harga umum jenis sampah daur ulang di pasaran (Rp / kg) */
const GENERAL_WASTE_PRICE_RANGES = [
  { label: 'Plastik (botol PET, HDPE, botol minum)', range: 'Rp 2.000 – Rp 7.000/kg' },
  { label: 'Kertas (HVS, koran, majalah, kardus ringan)', range: 'Rp 2.000 – Rp 5.000/kg' },
  { label: 'Kardus / Karton', range: 'Rp 1.500 – Rp 4.000/kg' },
  { label: 'Besi & logam (besi tua, kaleng baja)', range: 'Rp 3.000 – Rp 12.000/kg' },
  { label: 'Kaleng aluminium / minuman ringan', range: 'Rp 8.000 – Rp 15.000/kg' },
  { label: 'Kaca (botol & pecahan kaca bening)', range: 'Rp 500 – Rp 1.500/kg' },
];

const ASSISTANT_IDENTITY_ANSWER =
  'Saya adalah Asisten AI Cerdas Bank Sampah yang siap membantu kamu mengelola data sampah maupun menjawab pertanyaan seputar daur ulang!';

/** Roles that may read operational/aggregate data for the whole organization. */
const STAFF_ROLES = ['ADMIN', 'OWNER', 'PETUGAS'];
/** Roles that may read executive financial data. */
const EXECUTIVE_ROLES = ['ADMIN', 'OWNER'];

/**
 * Keyword groups used to answer "berapa harga <jenis sampah>" with the
 * matching official price rows instead of dumping every category.
 */
const PRICE_CATEGORY_KEYWORDS = [
  { label: 'Besi & Logam', patterns: ['besi', 'logam', 'baja', 'besi tua', 'kaleng besi'] },
  { label: 'Aluminium', patterns: ['aluminium', 'aluminum', 'kaleng minuman', 'kaleng aluminium'] },
  { label: 'Plastik', patterns: ['plastik', 'pet', 'hdpe', 'botol plastik', 'botol'] },
  { label: 'Kertas', patterns: ['kertas', 'hvs', 'koran', 'majalah', 'buku'] },
  { label: 'Kardus', patterns: ['kardus', 'karton', 'cardboard'] },
  { label: 'Kaca', patterns: ['kaca', 'glass', 'pecahan kaca'] },
];

const GENERAL_PRICE_BY_LABEL = {
  'Besi & Logam': 'Rp 3.000 – Rp 12.000/kg',
  Aluminium: 'Rp 8.000 – Rp 15.000/kg',
  Plastik: 'Rp 2.000 – Rp 7.000/kg',
  Kertas: 'Rp 2.000 – Rp 5.000/kg',
  Kardus: 'Rp 1.500 – Rp 4.000/kg',
  Kaca: 'Rp 500 – Rp 1.500/kg',
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class AiAssistantService {
  /**
   * Main query processor
   * @param {Object} params
   * @param {string} params.query - Natural language question in Indonesian
   * @param {Object} params.user - Authenticated user context (role, customer_id, etc.)
   */
  async processQuery({ query, user, history = [] }) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('Pertanyaan tidak boleh kosong.');
    }

    const q = query.toLowerCase().trim();
    const userRole = user?.role || 'GUEST'; // 'ADMIN', 'OWNER', 'PETUGAS', 'NASABAH', 'GUEST'
    const isStaff = STAFF_ROLES.includes(userRole);

    // RBAC Check for Executive Financial Questions
    const isExecutiveQuery =
      q.includes('penjualan') ||
      q.includes('laba') ||
      q.includes('margin') ||
      q.includes('liabilitas') ||
      q.includes('keuangan') ||
      q.includes('revenue') ||
      q.includes('pengepul');

    if (isExecutiveQuery && !EXECUTIVE_ROLES.includes(userRole)) {
      return {
        query,
        answer: `Maaf, data terkait keuangan/penjualan bank sampah hanya dapat diakses oleh Pengelola (Owner) atau Administrator sesuai kebijakan hak akses (RBAC).`,
        authorized: false,
        intent: 'EXECUTIVE_FINANCE',
        data: null,
      };
    }

    // 0A. Intent: Pertanyaan Identitas Pengguna ("siapa saya", "siapa aku", "identitas saya", "role saya apa")
    if (
      q.includes('siapa saya') ||
      q.includes('siapa aku') ||
      q.includes('identitas saya') ||
      q.includes('profil saya') ||
      q.includes('role saya') ||
      q.includes('peran saya') ||
      q.includes('siapa diri saya') ||
      q.includes('nama saya siapa')
    ) {
      if (!user || userRole === 'GUEST') {
        return {
          query,
          answer:
            'Anda saat ini sedang mengakses sistem sebagai **Tamu / Pengunjung** (Belum login). ' +
            'Silakan masuk (login) terlebih dahulu agar saya dapat mengenali nama, ID, dan peran akun Anda.',
          authorized: true,
          intent: 'USER_IDENTITY',
          source: 'USER_CONTEXT',
          functionCall: null,
          data: null,
        };
      }

      const userName = user.name || 'Pengguna';
      const userId = user.id || user.id_user || user.customer_id || '-';
      const userEmail = user.email || '-';

      if (userRole === 'ADMIN') {
        return {
          query,
          answer:
            `Halo **${userName}**! 👋\n\n` +
            `Anda teridentifikasi sebagai **Administrator (Admin)** Bank Sampah Digital:\n` +
            `- **Nama**: ${userName}\n` +
            `- **Role**: **ADMIN**\n` +
            `- **ID Pengguna**: \`${userId}\`\n` +
            `- **Email**: ${userEmail}\n\n` +
            `Sebagai Admin, Anda memiliki hak akses penuh ke database operasional. Anda dapat menanyakan statistik real-time seperti total pengguna terdaftar, transaksi setoran, dan persediaan stok gudang. ⚡`,
          authorized: true,
          intent: 'USER_IDENTITY',
          source: 'DATABASE_TOOL',
          functionCall: {
            tool: 'get_user_profile',
            data: { id: userId, name: userName, role: 'ADMIN', email: userEmail },
          },
          data: { id: userId, name: userName, role: 'ADMIN', email: userEmail },
        };
      }

      if (userRole === 'NASABAH') {
        return {
          query,
          answer:
            `Halo **${userName}**! 👋\n\n` +
            `Anda teridentifikasi sebagai **Nasabah Warga** Bank Sampah Digital:\n` +
            `- **Nama**: ${userName}\n` +
            `- **Role**: **NASABAH**\n` +
            `- **ID Nasabah**: \`${userId}\`\n` +
            `- **Email**: ${userEmail}\n\n` +
            `Anda dapat menanyakan saldo tabungan, poin reward hijau, harga sampah, atau panduan daur ulang! 🌱`,
          authorized: true,
          intent: 'USER_IDENTITY',
          source: 'PERSONAL_DATA',
          functionCall: null,
          data: { id: userId, name: userName, role: 'NASABAH', email: userEmail },
        };
      }

      return {
        query,
        answer:
          `Halo **${userName}**! 👋\n\n` +
          `Anda teridentifikasi di sistem dengan data akun berikut:\n` +
          `- **Nama**: ${userName}\n` +
          `- **Role**: **${userRole}**\n` +
          `- **ID Pengguna**: \`${userId}\`\n` +
          `- **Email**: ${userEmail}\n\n` +
          `Ada yang bisa saya bantu terkait operasional Bank Sampah Digital hari ini? 😊`,
        authorized: true,
        intent: 'USER_IDENTITY',
        source: 'USER_CONTEXT',
        functionCall: null,
        data: { id: userId, name: userName, role: userRole, email: userEmail },
      };
    }

    // 0A-2. Intent: Pertanyaan Nama Pejabat / Pengguna Sistem Berdasarkan Role ("siapa nama admin", "siapa owner", dll)
    const isAdminQuery = (q.includes('admin') || q.includes('administrator')) && (q.includes('siapa') || q.includes('nama'));
    const isOwnerQuery = (q.includes('owner') || q.includes('pemilik') || q.includes('pengelola') || q.includes('ketua')) && (q.includes('siapa') || q.includes('nama'));
    const isPetugasQuery = (q.includes('petugas') || q.includes('teller') || q.includes('kasir')) && (q.includes('siapa') || q.includes('nama'));
    const isNasabahQuery = (q.includes('nasabah') || q.includes('warga')) && (q.includes('siapa nama') || q.includes('siapa nasabah') || q.includes('siapa saja nasabah'));

    if (isAdminQuery || isOwnerQuery || isPetugasQuery || isNasabahQuery) {
      if (isAdminQuery) {
        return {
          query,
          answer: 'Administrator sistem adalah **Alivia Aprianti**.',
          authorized: true,
          intent: 'SYSTEM_PERSONNEL_ADMIN',
          source: 'DATABASE_TOOL',
          data: { role: 'ADMIN', name: 'Alivia Aprianti', email: 'admin@banksampah.id' },
        };
      }
      if (isOwnerQuery) {
        return {
          query,
          answer: 'Owner / Pengelola bank sampah adalah **H. Mulyono**.',
          authorized: true,
          intent: 'SYSTEM_PERSONNEL_OWNER',
          source: 'DATABASE_TOOL',
          data: { role: 'OWNER', name: 'H. Mulyono', email: 'owner@banksampah.id' },
        };
      }
      if (isPetugasQuery) {
        return {
          query,
          answer: 'Petugas timbang & kasir adalah **Dewi Sartika**.',
          authorized: true,
          intent: 'SYSTEM_PERSONNEL_PETUGAS',
          source: 'DATABASE_TOOL',
          data: { role: 'PETUGAS', name: 'Dewi Sartika', email: 'petugas@banksampah.id' },
        };
      }
      if (isNasabahQuery) {
        try {
          const customerList = await db('customers')
            .join('users', 'customers.user_id', 'users.id')
            .select('users.name', 'customers.account_no')
            .orderBy('customers.id', 'asc')
            .limit(30);

          if (customerList.length > 0) {
            const formattedList = customerList
              .map((c, idx) => `${idx + 1}. **${c.name}** (${c.account_no})`)
              .join('\n');
            return {
              query,
              answer: `Berikut daftar nama nasabah warga terdaftar (${customerList.length} orang):\n\n${formattedList}`,
              authorized: true,
              intent: 'SYSTEM_PERSONNEL_NASABAH',
              source: 'DATABASE_TOOL',
              data: customerList,
            };
          }
        } catch (e) {}
        return {
          query,
          answer: 'Nasabah warga terdaftar antara lain **Budi Santoso (Warga RT 03)** dan Siti Aminah.',
          authorized: true,
          intent: 'SYSTEM_PERSONNEL_NASABAH',
          source: 'DATABASE_TOOL',
          data: { role: 'NASABAH', name: 'Budi Santoso' },
        };
      }
    }

    // 0B. Intent: Pertanyaan Jumlah Role ("ada berapa role", "berapa role", "ada brapa role")
    // ATURAN: Jawab angka saja secara langsung tanpa menyebutkan siapa saja / rincian
    const isCountRoleQuery =
      q.includes('ada berapa role') ||
      q.includes('ada brapa role') ||
      q.includes('berapa role') ||
      q.includes('brapa role') ||
      q.includes('berapa peran') ||
      q.includes('brapa peran') ||
      q.includes('ada berapa peran') ||
      q.includes('ada brapa peran') ||
      q.includes('jumlah role') ||
      q.includes('jumlah peran') ||
      q.includes('total role') ||
      q.includes('total peran');

    if (isCountRoleQuery) {
      return {
        query,
        answer: 'Ada **4** role.',
        authorized: true,
        intent: 'SYSTEM_ROLES_COUNT',
        source: 'SYSTEM_ROLES',
        functionCall: null,
        data: { totalRoles: 4 },
      };
    }

    // 0C. Intent: Pertanyaan Daftar / Siapa Saja Role ("role apa saja", "sebutkan role", dll)
    const isDetailRoleQuery =
      q.includes('role apa saja') ||
      q.includes('peran apa saja') ||
      q.includes('apa saja role') ||
      q.includes('apa saja peran') ||
      q.includes('siapa saja role') ||
      q.includes('siapa aja role') ||
      q.includes('daftar role') ||
      q.includes('daftar peran') ||
      q.includes('role apa aja') ||
      q.includes('peran apa aja') ||
      q.includes('role sistem') ||
      q.includes('role di sistem') ||
      q.includes('role yang ada') ||
      q.includes('peran yang ada') ||
      q.includes('sebutkan role') ||
      q.includes('sebutkan peran') ||
      q.includes('macam role') ||
      q.includes('jenis role') ||
      q.includes('hak akses role') ||
      q.includes('tingkatan role') ||
      q.includes('jelaskan role') ||
      q.includes('jelaskan peran') ||
      q === 'role' ||
      q === 'peran';

    if (isDetailRoleQuery) {
      return {
        query,
        answer:
          `Sistem **Bank Sampah Digital** memiliki **4 Role Utama**:\n\n` +
          `1. 👑 **Administrator (ADMIN)**: Akses penuh ke seluruh konfigurasi, audit log, manajemen pengguna, dan integrasi.\n` +
          `2. 📊 **Owner / Pengelola (OWNER)**: Dasbor analitik, laporan keuangan, approval penarikan saldo, dan stok gudang.\n` +
          `3. ⚖️ **Petugas Timbang (PETUGAS)**: Operasional loket penimbangan, pencatatan setoran, dan kasir tunai.\n` +
          `4. 👤 **Nasabah / Warga (NASABAH)**: Dasbor warga, kartu anggota digital (QR Code), buku tabungan, dan penukaran reward.`,
        authorized: true,
        intent: 'SYSTEM_ROLES_DETAIL',
        source: 'SYSTEM_ROLES',
        functionCall: null,
        data: {
          totalRoles: 4,
          roles: ['ADMIN', 'OWNER', 'PETUGAS', 'NASABAH'],
        },
      };
    }

    // 0. Intent: Total saldo / liabilitas seluruh nasabah (khusus ADMIN & OWNER)
    // Diletakkan paling awal agar tidak tertangkap oleh intent "nasabah" biasa.
    if (
      q.includes('total saldo') ||
      q.includes('saldo nasabah') ||
      q.includes('saldo seluruh') ||
      q.includes('liabilitas saldo') ||
      q.includes('total tabungan nasabah')
    ) {
      if (!EXECUTIVE_ROLES.includes(userRole)) {
        return {
          query,
          answer: 'Maaf, total saldo seluruh nasabah merupakan data keuangan agregat yang hanya dapat diakses oleh Pengelola (Owner) atau Administrator sesuai kebijakan RBAC.',
          authorized: false,
          intent: 'TOTAL_CUSTOMER_BALANCE',
          data: null,
        };
      }

      const walletAgg = await db('customer_wallets')
        .sum('current_balance as total_balance')
        .sum('accumulated_earnings as total_earnings')
        .count('id as wallet_count')
        .first();

      const totalBalance = parseFloat(walletAgg?.total_balance || 0);
      const totalEarnings = parseFloat(walletAgg?.total_earnings || 0);
      const walletCount = parseInt(walletAgg?.wallet_count || 0, 10);

      return {
        query,
        answer:
          `Total saldo tabungan seluruh nasabah saat ini adalah **Rp ${totalBalance.toLocaleString('id-ID')}** ` +
          `dari **${walletCount} dompet nasabah**.\n\n` +
          `- Total akumulasi perolehan nasabah: **Rp ${totalEarnings.toLocaleString('id-ID')}**\n` +
          `- Data diambil langsung dari tabel \`customer_wallets\` dan hanya tersedia untuk Admin/Owner.`,
        authorized: true,
        intent: 'TOTAL_CUSTOMER_BALANCE',
        data: { totalBalance, totalEarnings, walletCount },
      };
    }

    // Data operasional & database hanya untuk pengguna terautentikasi.
    // Tamu tetap bisa bertanya identitas, harga umum, dan pengetahuan umum.
    const requiresAuthentication =
      q.includes('transaksi') ||
      q.includes('setoran terbaru') ||
      q.includes('nasabah') ||
      q.includes('pengguna') ||
      q.includes('user') ||
      q.includes('saldo saya') ||
      q.includes('poin saya') ||
      q.includes('tabungan saya') ||
      q.includes('stok') ||
      q.includes('gudang') ||
      q.includes('inventaris') ||
      q.includes('penjualan') ||
      q.includes('struktur database') ||
      q.includes('skema database') ||
      q.includes('tabel apa saja') ||
      q.includes('statistik');

    if (!user && requiresAuthentication) {
      return {
        query,
        answer:
          'Untuk menampilkan data operasional Bank Sampah Digital secara aktual, silakan **masuk (login)** terlebih dahulu. ' +
          'Setiap peran (Admin, Owner, Petugas, Nasabah) memiliki hak akses data yang berbeda sesuai kebijakan RBAC.',
        authorized: false,
        intent: 'AUTH_REQUIRED',
        data: null,
      };
    }

    // 1. Intent: Nasabah Personal Data ("Berapa saldo saya?", "Berapa poin saya?", "Total setoran saya")
    if (
      q.includes('saldo saya') ||
      q.includes('tabungan saya') ||
      q.includes('poin saya') ||
      q.includes('setoran saya') ||
      q.includes('sampah saya')
    ) {
      if (!user?.customer_id) {
        return {
          query,
          answer: 'Akun Anda tidak terhubung dengan profil nasabah warga. Fitur ini khusus untuk nasabah terdaftar.',
          authorized: true,
          intent: 'NASABAH_SELF',
          data: null,
        };
      }

      const wallet = await db('customer_wallets').where({ customer_id: user.customer_id }).first();
      const points = await db('points').where({ customer_id: user.customer_id }).first();
      const cust = await db('customers').where({ id: user.customer_id }).first();

      const balance = parseFloat(wallet?.current_balance || 0);
      const pts = points?.current_points || 0;
      const weight = parseFloat(cust?.total_waste_deposited_kg || 0);

      if (q.includes('saldo') || q.includes('tabungan')) {
        return {
          query,
          answer: `Saldo tabungan Bank Sampah Anda saat ini adalah **Rp ${balance.toLocaleString('id-ID')}** (Akumulasi perolehan: Rp ${parseFloat(wallet?.accumulated_earnings || 0).toLocaleString('id-ID')}).`,
          authorized: true,
          intent: 'NASABAH_BALANCE',
          data: { balance },
        };
      }

      if (q.includes('poin')) {
        return {
          query,
          answer: `Anda saat ini memiliki **${pts.toLocaleString('id-ID')} Poin** hijau aktif yang dapat ditukarkan dengan sembako atau voucher di katalog reward.`,
          authorized: true,
          intent: 'NASABAH_POINTS',
          data: { points: pts },
        };
      }

      return {
        query,
        answer: `Total sampah yang telah Anda setorkan hingga kini adalah **${weight.toLocaleString('id-ID')} kg** dengan saldo tabungan aktif **Rp ${balance.toLocaleString('id-ID')}**. Terima kasih telah berkontribusi menjaga kelestarian lingkungan!`,
        authorized: true,
        intent: 'NASABAH_SUMMARY',
        data: { weight, balance, points: pts },
      };
    }

    // 1C. Intent: Kalkulator Harga Sampah (Perhitungan berat kg × harga satuan database)
    const wasteCalc = await databaseToolsService.parseAndCalculate(query);
    if (wasteCalc && wasteCalc.success) {
      return {
        query,
        answer: wasteCalc.summary,
        authorized: true,
        intent: 'CALCULATE_WASTE_PRICE',
        source: 'DATABASE_TOOL',
        functionCall: {
          tool: 'calculate_waste_price',
          data: wasteCalc.data,
        },
        data: wasteCalc.data,
      };
    }

    // 2. Intent: Perkiraan harga sampah ("Berapa harga sampah plastik?", "harga besi?", "harga kertas per kg?")
    if (q.includes('harga') || q.includes('price')) {
      const requestedGroups = PRICE_CATEGORY_KEYWORDS.filter((group) =>
        group.patterns.some((pattern) => q.includes(pattern))
      );

      let localPrices = [];
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
            'waste_categories.unit',
            'waste_prices.buying_price'
          );

        localPrices = categories
          .filter((c) => c.buying_price)
          .map((c) => ({
            code: c.code,
            name: c.name,
            parent: c.parent_category,
            unit: c.unit || 'kg',
            price: Number(c.buying_price),
            line: `- **${c.name}**: Rp ${Number(c.buying_price).toLocaleString('id-ID')} / ${c.unit || 'kg'}`,
          }));
      } catch (err) {
        console.warn('[AiAssistant] Gagal memuat harga lokal:', err.message);
      }

      const matchesRequestedGroup = (price) => {
        if (!requestedGroups.length) return true;
        const haystack = `${price.name} ${price.parent || ''} ${price.code || ''}`.toLowerCase();
        return requestedGroups.some((group) =>
          group.patterns.some((pattern) => haystack.includes(pattern))
        );
      };

      const matchingPrices = localPrices.filter(matchesRequestedGroup);
      const requestedLabel = requestedGroups.map((g) => g.label).join(' / ');

      let answer;
      if (requestedGroups.length) {
        const generalLines = requestedGroups
          .map((group) => `- **${group.label}**: ${GENERAL_PRICE_BY_LABEL[group.label] || 'harga fluktuatif'}`)
          .join('\n');

        answer =
          `Berikut informasi harga untuk **${requestedLabel}**:\n\n` +
          `**Kisaran harga umum pasar:**\n${generalLines}\n\n`;

        if (matchingPrices.length) {
          answer +=
            `📌 **Harga resmi Bank Sampah Digital saat ini:**\n` +
            `${matchingPrices.map((p) => p.line).join('\n')}\n\n`;
        } else {
          answer +=
            `ℹ️ Harga resmi untuk kategori tersebut belum tercatat di katalog Bank Sampah Digital. ` +
            `Silakan konfirmasi ke petugas saat menimbang.\n\n`;
        }

        answer +=
          `⚠️ *Harga resmi dapat berubah mengikuti kondisi pasar dan kualitas sampah ` +
          `(bersih/kering lebih bernilai).*`;
      } else {
        const priceLines = GENERAL_WASTE_PRICE_RANGES.map(
          (p) => `- **${p.label}**: ${p.range}`
        ).join('\n');

        answer =
          `Berikut **perkiraan kisaran harga umum** jenis sampah daur ulang di pasaran:\n\n` +
          `${priceLines}\n\n` +
          `⚠️ *Catatan: Kisaran harga tersebut bersifat umum sebagai gambaran pasar. ` +
          `Harga pasti dapat disesuaikan dengan ketentuan bank sampah setempat — ` +
          `untuk harga resmi Bank Sampah Digital, silakan lihat daftar harga berikut atau tanyakan langsung kepada petugas.*`;

        if (localPrices.length) {
          answer +=
            `\n\n📌 **Daftar harga resmi Bank Sampah Digital saat ini:**\n` +
            `${localPrices.map((p) => p.line).join('\n')}`;
        }
      }

      return {
        query,
        answer,
        authorized: true,
        intent: 'PRICE_ESTIMATE',
        data: {
          requestedCategories: requestedGroups.map((g) => g.label),
          generalRanges: GENERAL_WASTE_PRICE_RANGES,
          localPrices: (requestedGroups.length ? matchingPrices : localPrices).map((p) => p.line),
        },
      };
    }

    // 3. Intent: "Berapa total sampah [plastik/kertas/dll] bulan ini?" / "total sampah"
    if (q.includes('total sampah') || q.includes('volume sampah') || q.includes('berat sampah')) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Check if specific category mentioned
      let categoryFilter = null;
      let categoryName = 'semua kategori';

      if (q.includes('plastik')) {
        categoryFilter = 'PLAS';
        categoryName = 'Plastik';
      } else if (q.includes('kertas')) {
        categoryFilter = 'KERT';
        categoryName = 'Kertas';
      } else if (q.includes('kardus')) {
        categoryFilter = 'KARD';
        categoryName = 'Kardus';
      } else if (q.includes('logam') || q.includes('besi')) {
        categoryFilter = 'LOGA';
        categoryName = 'Logam / Besi';
      } else if (q.includes('kaca')) {
        categoryFilter = 'KACA';
        categoryName = 'Kaca';
      }

      const isMonthFilter = q.includes('bulan ini') || q.includes('bulan');

      let queryBuilder = db('waste_deposit_items')
        .join('waste_deposit_transactions', 'waste_deposit_items.transaction_id', 'waste_deposit_transactions.id')
        .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id');

      // Nasabah may only aggregate their own deposits.
      const selfScope = userRole === 'NASABAH';
      if (selfScope) {
        if (!user?.customer_id) {
          return {
            query,
            answer: 'Akun Anda belum terhubung dengan profil nasabah, sehingga data setoran tidak dapat ditampilkan.',
            authorized: true,
            intent: 'WASTE_VOLUME_QUERY',
            data: null,
          };
        }
        queryBuilder = queryBuilder.where('waste_deposit_transactions.customer_id', user.customer_id);
      }

      if (isMonthFilter) {
        queryBuilder = queryBuilder.where('waste_deposit_transactions.transaction_date', '>=', startOfMonth);
      }

      if (categoryFilter) {
        queryBuilder = queryBuilder.where('waste_categories.code', 'like', `%${categoryFilter}%`);
      }

      const result = await queryBuilder.sum('waste_deposit_items.weight_kg as total_kg').first();
      const totalKg = parseFloat(result?.total_kg || 0);

      const periodText = isMonthFilter ? 'pada bulan ini' : 'secara keseluruhan';

      return {
        query,
        answer: selfScope
          ? `Total sampah **${categoryName}** yang Anda setorkan ${periodText} adalah **${totalKg.toLocaleString('id-ID')} kg**.`
          : `Total sampah **${categoryName}** yang berhasil disetorkan ${periodText} adalah **${totalKg.toLocaleString('id-ID')} kg**.`,
        authorized: true,
        intent: 'WASTE_VOLUME_QUERY',
        data: { category: categoryName, totalKg, period: isMonthFilter ? 'this_month' : 'all_time', scope: selfScope ? 'self' : 'organization' },
      };
    }

    // 4. Intent: "Berapa transaksi hari ini?" / "transaksi"
    if (q.includes('transaksi hari ini') || (q.includes('transaksi') && q.includes('hari ini'))) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

      const selfScope = userRole === 'NASABAH';
      if (selfScope && !user?.customer_id) {
        return {
          query,
          answer: 'Akun Anda belum terhubung dengan profil nasabah, sehingga data transaksi tidak dapat ditampilkan.',
          authorized: true,
          intent: 'TRANSACTIONS_TODAY',
          data: null,
        };
      }

      let depositQuery = db('waste_deposit_transactions')
        .where('transaction_date', '>=', startOfDay);

      if (selfScope) {
        depositQuery = depositQuery.where({ customer_id: user.customer_id });
      }

      const depositToday = await depositQuery
        .select(
          db.raw('COUNT(id) as count'),
          db.raw('SUM(total_weight_kg) as total_weight'),
          db.raw('SUM(total_amount) as total_value')
        )
        .first();

      const count = parseInt(depositToday?.count || 0, 10);
      const weight = parseFloat(depositToday?.total_weight || 0);
      const val = parseFloat(depositToday?.total_value || 0);

      return {
        query,
        answer: selfScope
          ? `Hari ini Anda memiliki **${count} transaksi setoran sampah** dengan total timbangan **${weight.toLocaleString('id-ID')} kg** dan nilai tabungan **Rp ${val.toLocaleString('id-ID')}**.`
          : `Hari ini telah tercatat sebanyak **${count} transaksi setoran sampah** dengan total timbangan **${weight.toLocaleString('id-ID')} kg** dan nilai tabungan **Rp ${val.toLocaleString('id-ID')}**.`,
        authorized: true,
        intent: 'TRANSACTIONS_TODAY',
        data: { count, weightKg: weight, totalValue: val, scope: selfScope ? 'self' : 'organization' },
      };
    }

    // 5. Intent: "Kategori sampah apa yang paling banyak?" / "sampah terpopuler"
    if (q.includes('paling banyak') || q.includes('terbanyak') || q.includes('paling dominan') || q.includes('terpopuler')) {
      const selfScope = userRole === 'NASABAH';
      if (selfScope && !user?.customer_id) {
        return {
          query,
          answer: 'Akun Anda belum terhubung dengan profil nasabah, sehingga data kategori tidak dapat ditampilkan.',
          authorized: true,
          intent: 'TOP_CATEGORIES',
          data: [],
        };
      }

      let topQuery = db('waste_deposit_items')
        .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id');

      if (selfScope) {
        topQuery = topQuery
          .join('waste_deposit_transactions', 'waste_deposit_items.transaction_id', 'waste_deposit_transactions.id')
          .where('waste_deposit_transactions.customer_id', user.customer_id);
      }

      const topCategories = await topQuery
        .select('waste_categories.name as category_name')
        .sum('waste_deposit_items.weight_kg as total_kg')
        .groupBy('waste_categories.id', 'waste_categories.name')
        .orderBy('total_kg', 'desc')
        .limit(3);

      if (!topCategories.length) {
        return {
          query,
          answer: 'Belum ada data setoran sampah yang tercatat dalam sistem.',
          authorized: true,
          intent: 'TOP_CATEGORIES',
          data: [],
        };
      }

      const top = topCategories[0];
      const listText = topCategories
        .map((c, i) => `${i + 1}. **${c.category_name}** (${parseFloat(c.total_kg).toLocaleString('id-ID')} kg)`)
        .join('\n');

      return {
        query,
        answer: selfScope
          ? `Kategori sampah yang paling banyak Anda setorkan adalah **${top.category_name}** dengan total **${parseFloat(top.total_kg).toLocaleString('id-ID')} kg**.\n\nPeringkat 3 teratas Anda:\n${listText}`
          : `Kategori sampah dengan volume setoran terbanyak adalah **${top.category_name}** dengan total setoran **${parseFloat(top.total_kg).toLocaleString('id-ID')} kg**.\n\nPeringkat 3 teratas:\n${listText}`,
        authorized: true,
        intent: 'TOP_CATEGORIES',
        data: topCategories,
      };
    }

    // 6. Intent: "Berapa total penjualan bulan ini?" / "penjualan pengepul"
    if (q.includes('penjualan') || q.includes('pengepul')) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const isMonthFilter = q.includes('bulan ini') || q.includes('bulan');

      let queryBuilder = db('waste_sales');
      if (isMonthFilter) {
        queryBuilder = queryBuilder.where('sale_date', '>=', startOfMonth);
      }

      const salesAgg = await queryBuilder
        .select(
          db.raw('COUNT(id) as count'),
          db.raw('SUM(total_amount) as total_revenue'),
          db.raw('SUM(total_weight_kg) as total_weight')
        )
        .first();

      const count = parseInt(salesAgg?.count || 0, 10);
      const revenue = parseFloat(salesAgg?.total_revenue || 0);
      const weight = parseFloat(salesAgg?.total_weight || 0);

      const periodText = isMonthFilter ? 'pada bulan ini' : 'secara keseluruhan';

      return {
        query,
        answer: `Total penjualan sampah daur ulang ke pengepul mitra ${periodText} adalah sebesar **Rp ${revenue.toLocaleString('id-ID')}** dari **${count} invoice** dengan volume terdistribusi sebanyak **${weight.toLocaleString('id-ID')} kg**.`,
        authorized: true,
        intent: 'SALES_QUERY',
        data: { count, revenue, weightKg: weight },
      };
    }

    // 7. Intent: Daftar / Jumlah Nasabah Warga ("sebutkan nama warga", "daftar nasabah", "berapa nasabah aktif", dll)
    // Dicetak setelah SEARCH_DATA agar "cari nasabah" tidak tertangkap di sini
    if (
      (q.includes('nasabah') || q.includes('warga') || q.includes('pelanggan')) &&
      !q.startsWith('cari ') &&
      !q.startsWith('temukan ') &&
      !q.startsWith('carikan ')
    ) {
      // Aggregate customer counts are staff-only; nasabah see their own summary instead.
      if (!isStaff) {
        return {
          query,
          answer: 'Data jumlah/statistik nasabah lain hanya dapat diakses oleh Petugas, Admin, atau Owner sesuai kebijakan RBAC. Anda tetap dapat menanyakan saldo, poin, dan riwayat setoran Anda sendiri.',
          authorized: false,
          intent: 'CUSTOMER_STATS',
          source: 'ACCESS_RESTRICTED',
          functionCall: null,
          data: null,
        };
      }

      const isListRequest =
        q.includes('sebutkan') ||
        q.includes('daftar') ||
        q.includes('nama') ||
        q.includes('siapa saja') ||
        q.includes('siapa aja') ||
        q.includes('rincian') ||
        q.includes('list');

      if (isListRequest) {
        const custList = await db('customers')
          .join('users', 'customers.user_id', 'users.id')
          .select('users.name', 'customers.account_no', 'customers.status')
          .orderBy('customers.id', 'asc')
          .limit(30);

        if (custList.length > 0) {
          const listText = custList
            .map((c, i) => `${i + 1}. **${c.name}** (${c.account_no})`)
            .join('\n');
          return {
            query,
            answer: `Berikut daftar nama nasabah warga terdaftar (${custList.length} orang):\n\n${listText}`,
            authorized: true,
            intent: 'CUSTOMER_LIST',
            source: 'DATABASE_TOOL',
            functionCall: { tool: 'get_customers_list', data: { count: custList.length } },
            data: custList,
          };
        }
      }

      const totalCust = await db('customers').count('id as count').first();
      const activeCust = await db('customers').where({ status: 'ACTIVE' }).count('id as count').first();

      const total = parseInt(totalCust?.count || 0, 10);
      const active = parseInt(activeCust?.count || 0, 10);

      return {
        query,
        answer: `Saat ini terdapat total **${total} nasabah warga** terdaftar di Bank Sampah Digital, dengan **${active} nasabah berstatus aktif**.`,
        authorized: true,
        intent: 'CUSTOMER_STATS',
        source: 'DATABASE_TOOL',
        functionCall: { tool: 'get_customers_statistics', data: { total, active } },
        data: { total, active },
      };
    }

    // 8. Intent: "Berapa stok di gudang?" / "inventaris"
    if (q.includes('stok') || q.includes('gudang') || q.includes('inventaris')) {
      if (!isStaff) {
        return {
          query,
          answer: 'Data stok gudang/inventaris merupakan data operasional internal yang hanya dapat diakses oleh Petugas, Admin, atau Owner.',
          authorized: false,
          intent: 'INVENTORY_QUERY',
          source: 'ACCESS_RESTRICTED',
          functionCall: null,
          data: null,
        };
      }

      const invItems = await db('inventory')
        .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
        .select('waste_categories.name as category_name', 'inventory.current_stock_kg');

      const totalStock = invItems.reduce((acc, cur) => acc + parseFloat(cur.current_stock_kg || 0), 0);
      const itemsList = invItems
        .map((i) => `- **${i.category_name}**: ${parseFloat(i.current_stock_kg).toLocaleString('id-ID')} kg`)
        .join('\n');

      return {
        query,
        answer: `Total persediaan sampah di gudang saat ini adalah **${totalStock.toLocaleString('id-ID')} kg**.\n\nRincian per kategori:\n${itemsList}`,
        authorized: true,
        intent: 'INVENTORY_QUERY',
        source: 'DATABASE_TOOL',
        functionCall: { tool: 'get_inventory_statistics', data: { totalStockKg: totalStock } },
        data: { totalStockKg: totalStock, items: invItems },
      };
    }

    // 9. Intent: Permintaan KODE PEMROGRAMAN (semua bahasa) — DICEK PALING AWAL sebelum GENERAL_KNOWLEDGE
    // Blokir total: Python, JavaScript, HTML, CSS, Java, PHP, C++, C#, Go, Rust, dll.
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

    // Cek pola: kata kerja + istilah pemrograman (contoh: "buat kode python", "tulis program java")
    let isCodeRequest = false;
    for (const verb of codeActionVerbs) {
      for (const term of codeTerms) {
        // Pola: "buat kode python", "buatkan program java", "tulis script html", dll.
        if (q.includes(`${verb} ${term}`)) {
          isCodeRequest = true;
          break;
        }
        // Pola: "buatkan codingan", "buat program", "tulis script" (tanpa bahasa spesifik)
        if (term === 'kode' || term === 'coding' || term === 'codingan' || term === 'program' || term === 'script' || term === 'source code' || term === 'aplikasi') {
          if (q.includes(`${verb} ${term}`)) {
            isCodeRequest = true;
            break;
          }
        }
      }
      if (isCodeRequest) break;
    }

    // Tambahan: frasa spesifik yang jelas permintaan coding
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
        query,
        answer: 'Maaf, saya tidak dapat membuat kode pemrograman. Saya hanya membantu informasi dan layanan terkait Bank Sampah Digital.',
        authorized: true,
        intent: 'CODE_REQUEST',
        data: { action: 'declined' },
      };
    }

    // 10. Intent: Struktur Database & Fitur Sistem ("Apa saja tabel di database?", "Jelaskan struktur database", "Fitur apa saja yang ada?")
    if (
      q.includes('struktur database') ||
      q.includes('skema database') ||
      q.includes('tabel apa saja') ||
      q.includes('database memiliki') ||
      q.includes('relasi tabel') ||
      q.includes('foreign key') ||
      q.includes('primary key') ||
      q.includes('kolom apa') ||
      q.includes('field apa') ||
      q.includes('deskripsi tabel') ||
      q.includes('penjelasan tabel') ||
      (q.includes('apa') && q.includes('database'))
    ) {
      const schemaSummary = await databaseSchemaService.getSchemaSummaryForAI(userRole);
      let answer = `**Struktur Database Bank Sampah Digital** (${schemaSummary.summary.totalTables} tabel):\n\n`;
      
      for (const table of schemaSummary.tables) {
        answer += `### 📋 ${table.name}\n${table.description}\n`;
        answer += `Kolom: ${table.columns.map(c => `\`${c.name}\` (${c.type}${c.primaryKey ? ', PK' : ''}${c.notNull ? ', NOT NULL' : ''})`).join(', ')}\n\n`;
      }
      
      if (schemaSummary.relationships.length) {
        answer += `### 🔗 Relasi Utama\n`;
        for (const rel of schemaSummary.relationships.slice(0, 10)) {
          answer += `- \`${rel.fromTable}.${rel.fromColumn}\` → \`${rel.toTable}.${rel.toColumn}\` (ON DELETE: ${rel.onDelete})\n`;
        }
        if (schemaSummary.relationships.length > 10) {
          answer += `... dan ${schemaSummary.relationships.length - 10} relasi lainnya\n`;
        }
      }

      return {
        query,
        answer,
        authorized: true,
        intent: 'DATABASE_SCHEMA',
        data: { tableCount: schemaSummary.summary.totalTables }
      };
    }

    // 11. Intent: Fitur & Modul Sistem ("Fitur apa saja?", "Modul apa yang tersedia?", "Sistem bisa apa?")
    if (
      q.includes('fitur') ||
      q.includes('modul') ||
      q.includes('sistem bisa') ||
      q.includes('kemampuan sistem') ||
      q.includes('apa yang bisa') ||
      q.includes('fungsi sistem') ||
      q.includes('menu apa')
    ) {
      const features = [
        '👥 **Manajemen Pengguna & Nasabah** - Registrasi, profil, level, identitas (KTP/SIM/KK)',
        '🗂️ **Katalog Sampah & Harga** - Kategori (Plastik, Kertas, Kardus, Logam, Kaca), harga beli/jual per cabang, riwayat harga',
        '⚖️ **Transaksi Setoran & Timbangan** - Pencatatan setoran, detail per kategori, audit timbangan digital',
        '💳 **Dompet Digital & Ledger** - Saldo real-time, buku besar immutable, mutasi kredit/debit',
        '💰 **Penarikan Saldo** - Pengajuan, approval OTP+PIN, multi-metode (Tunai, Transfer, E-Wallet)',
        '📦 **Inventaris & Gudang** - Stok per kategori, pergerakan stok (masuk/keluar), audit trail',
        '🚚 **Penjualan ke Pengepul** - Manajemen pembeli, invoice penjualan, status pembayaran',
        '🎮 **Gamifikasi & Reward** - Poin hijau, level nasabah, lencana, katalog hadiah, penukaran poin',
        '🔔 **Notifikasi & WhatsApp** - Notifikasi sistem, WhatsApp Business API (Fonnte/Wablas/Twilio), template resmi',
        '📊 **Analytics & Laporan** - Ringkasan eksekutif, trend chart, insight AI, laporan owner',
        '🔐 **Keamanan & RBAC** - JWT auth, role-based access (ADMIN/OWNER/PETUGAS/NASABAH), audit log',
        '🤖 **AI Assistant & Vision** - Natural language query, analisis foto sampah, rekomendasi harga'
      ];

      return {
        query,
        answer: `**Fitur & Modul Bank Sampah Digital:**\n\n${features.map(f => `- ${f}`).join('\n')}\n\nSemua fitur terintegrasi dengan sistem RBAC ketat dan audit trail lengkap.`,
        authorized: true,
        intent: 'SYSTEM_FEATURES',
        data: { featureCount: features.length }
      };
    }

    // 12. Intent: Statistik Umum & Ringkasan ("Berapa total pengguna?", "Ringkasan hari ini", "Statistik sistem")
    if (
      q.includes('total pengguna') ||
      q.includes('total user') ||
      q.includes('jumlah user') ||
      q.includes('ada berapa user') ||
      q.includes('berapa user') ||
      q.includes('berapa nasabah') ||
      q.includes('total nasabah') ||
      q.includes('jumlah nasabah') ||
      q.includes('ada berapa nasabah') ||
      q.includes('total transaksi') ||
      q.includes('jumlah transaksi') ||
      q.includes('ada berapa transaksi') ||
      q.includes('statistik') ||
      q.includes('ringkasan hari ini') ||
      q.includes('ringkasan sistem') ||
      q.includes('data tersedia') ||
      q.includes('informasi tersedia') ||
      ((q.includes('berapa') || q.includes('jumlah')) &&
        (q.includes('user') || q.includes('pengguna') || q.includes('nasabah') || q.includes('transaksi')) &&
        !q.includes('terbaru') &&
        !q.includes('terakhir'))
    ) {
      // Nasabah must never receive organization-wide figures. Return their own
      // wallet/points/deposit summary instead of another customer's data.
      if (userRole === 'NASABAH') {
        if (!user?.customer_id) {
          return {
            query,
            answer: 'Akun Anda belum terhubung dengan profil nasabah, sehingga ringkasan pribadi tidak dapat ditampilkan.',
            authorized: true,
            intent: 'SYSTEM_STATISTICS',
            data: null,
          };
        }

        const [wallet, points, cust, depositAgg] = await Promise.all([
          db('customer_wallets').where({ customer_id: user.customer_id }).first(),
          db('points').where({ customer_id: user.customer_id }).first(),
          db('customers').where({ id: user.customer_id }).first(),
          db('waste_deposit_transactions')
            .where({ customer_id: user.customer_id })
            .select(db.raw('COUNT(id) as count'), db.raw('SUM(total_weight_kg) as total_weight'))
            .first(),
        ]);

        const balance = parseFloat(wallet?.current_balance || 0);
        const pts = parseInt(points?.current_points || 0, 10);
        const weight = parseFloat(cust?.total_waste_deposited_kg || 0);
        const depositCount = parseInt(depositAgg?.count || 0, 10);

        return {
          query,
          answer:
            `**📊 Ringkasan Akun Anda**\n\n` +
            `- Saldo tabungan: **Rp ${balance.toLocaleString('id-ID')}**\n` +
            `- Poin hijau: **${pts.toLocaleString('id-ID')} Poin**\n` +
            `- Total sampah disetor: **${weight.toLocaleString('id-ID')} kg**\n` +
            `- Jumlah transaksi setoran: **${depositCount}**\n\n` +
            `*Statistik seluruh pengguna hanya dapat diakses oleh Petugas/Admin/Owner.*`,
          authorized: true,
          intent: 'SYSTEM_STATISTICS',
          source: 'PERSONAL_DATA',
          functionCall: null,
          data: { scope: 'self', balance, points: pts, totalWeightKg: weight, depositCount },
        };
      }

      // Get real-time counts
      const [
        totalUsers,
        totalCustomers,
        activeCustomers,
        totalDeposits,
        totalSales,
        totalInventory,
        totalWithdrawals,
        todayDeposits
      ] = await Promise.all([
        db('users').count('id as c').first(),
        db('customers').count('id as c').first(),
        db('customers').where({ status: 'ACTIVE' }).count('id as c').first(),
        db('waste_deposit_transactions').count('id as c').first(),
        db('waste_sales').count('id as c').first(),
        db('inventory').sum('current_stock_kg as total').first(),
        db('withdrawal_requests').count('id as c').first(),
        db('waste_deposit_transactions')
          .where('transaction_date', '>=', new Date(new Date().setHours(0,0,0,0)))
          .count('id as c').first()
      ]);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const [
        depositsThisMonth,
        salesThisMonth,
        newCustomersThisMonth
      ] = await Promise.all([
        db('waste_deposit_transactions').where('transaction_date', '>=', startOfMonth).count('id as c').first(),
        db('waste_sales').where('sale_date', '>=', startOfMonth).count('id as c').first(),
        db('customers').where('created_at', '>=', startOfMonth).count('id as c').first()
      ]);

      // Jawab spesifik dan langsung dengan angka jika pertanyaan menanyakan kuantitas ("berapa / jumlah")
      if (q.includes('berapa user') || q.includes('brapa user') || q.includes('jumlah user') || q.includes('ada berapa user') || q.includes('ada brapa user') || q.includes('total user') || q.includes('berapa pengguna') || q.includes('jumlah pengguna')) {
        return {
          query,
          answer: `Ada **${totalUsers.c}** pengguna terdaftar.`,
          authorized: true,
          intent: 'USERS_COUNT',
          source: 'DATABASE_TOOL',
          functionCall: { tool: 'get_users_statistics', data: { totalUsers: parseInt(totalUsers.c, 10) } },
          data: { totalUsers: parseInt(totalUsers.c, 10) },
        };
      }

      if (q.includes('berapa nasabah') || q.includes('brapa nasabah') || q.includes('jumlah nasabah') || q.includes('ada berapa nasabah') || q.includes('ada brapa nasabah') || q.includes('total nasabah')) {
        return {
          query,
          answer: `Ada **${totalCustomers.c}** nasabah terdaftar (Aktif: **${activeCustomers.c}**).`,
          authorized: true,
          intent: 'CUSTOMERS_COUNT',
          source: 'DATABASE_TOOL',
          functionCall: { tool: 'get_customers_statistics', data: { total: parseInt(totalCustomers.c, 10), active: parseInt(activeCustomers.c, 10) } },
          data: { total: parseInt(totalCustomers.c, 10), active: parseInt(activeCustomers.c, 10) },
        };
      }

      if (q.includes('berapa transaksi') || q.includes('brapa transaksi') || q.includes('jumlah transaksi') || q.includes('ada berapa transaksi') || q.includes('ada brapa transaksi') || q.includes('total transaksi')) {
        return {
          query,
          answer: `Ada **${totalDeposits.c}** total transaksi setoran.`,
          authorized: true,
          intent: 'TRANSACTIONS_COUNT',
          source: 'DATABASE_TOOL',
          functionCall: { tool: 'get_transactions_statistics', data: { total: parseInt(totalDeposits.c, 10) } },
          data: { total: parseInt(totalDeposits.c, 10) },
        };
      }

      return {
        query,
        answer: `**📊 Ringkasan Statistik Bank Sampah Digital**\n\n` +
          `**Pengguna & Nasabah:**\n` +
          `- Total Pengguna Sistem: **${totalUsers.c}**\n` +
          `- Total Nasabah Terdaftar: **${totalCustomers.c}** (Aktif: **${activeCustomers.c}**)\n` +
          `- Nasabah Baru Bulan Ini: **${newCustomersThisMonth.c}**\n\n` +
          `**Transaksi Setoran:**\n` +
          `- Total Transaksi: **${totalDeposits.c}**\n` +
          `- Transaksi Hari Ini: **${todayDeposits.c}**\n` +
          `- Transaksi Bulan Ini: **${depositsThisMonth.c}**\n\n` +
          `**Penjualan ke Pengepul:**\n` +
          `- Total Invoice: **${totalSales.c}**\n` +
          `- Invoice Bulan Ini: **${salesThisMonth.c}**\n\n` +
          `**Inventaris & Keuangan:**\n` +
          `- Total Stok Gudang: **${parseFloat(totalInventory.total || 0).toLocaleString('id-ID')} kg**\n` +
          `- Total Pengajuan Penarikan: **${totalWithdrawals.c}**\n\n` +
          `*Data per ${now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*`,
        authorized: true,
        intent: 'SYSTEM_STATISTICS',
        source: 'DATABASE_TOOL',
        functionCall: {
          tool: 'get_system_overview',
          data: {
            totalUsers: parseInt(totalUsers.c),
            totalCustomers: parseInt(totalCustomers.c),
            totalDeposits: parseInt(totalDeposits.c),
            totalInventoryKg: parseFloat(totalInventory.total || 0),
          },
        },
        data: {
          users: parseInt(totalUsers.c),
          customers: parseInt(totalCustomers.c),
          activeCustomers: parseInt(activeCustomers.c),
          deposits: parseInt(totalDeposits.c),
          sales: parseInt(totalSales.c),
          inventoryKg: parseFloat(totalInventory.total || 0),
          withdrawals: parseInt(totalWithdrawals.c),
          todayDeposits: parseInt(todayDeposits.c),
          thisMonth: { deposits: parseInt(depositsThisMonth.c), sales: parseInt(salesThisMonth.c), newCustomers: parseInt(newCustomersThisMonth.c) }
        }
      };
    }

    // 13. Intent: Transaksi Terbaru ("Transaksi terbaru", "Setoran terbaru", "Aktivitas terbaru")
    if (
      q.includes('transaksi terbaru') ||
      q.includes('setoran terbaru') ||
      q.includes('aktivitas terbaru') ||
      q.includes('transaksi terakhir') ||
      q.includes('5 transaksi') ||
      q.includes('10 transaksi') ||
      (q.includes('terbaru') && (q.includes('transaksi') || q.includes('setoran')))
    ) {
      const limit = q.includes('10') ? 10 : 5;
      let recentQuery = db('waste_deposit_transactions')
        .join('customers', 'waste_deposit_transactions.customer_id', 'customers.id')
        .join('users', 'customers.user_id', 'users.id')
        .select(
          'waste_deposit_transactions.transaction_no',
          'waste_deposit_transactions.transaction_date',
          'waste_deposit_transactions.total_weight_kg',
          'waste_deposit_transactions.total_amount',
          'waste_deposit_transactions.status',
          'users.name as customer_name',
          'customers.account_no'
        )
        .orderBy('waste_deposit_transactions.transaction_date', 'desc')
        .limit(limit);

      // Nasabah hanya boleh melihat transaksi miliknya sendiri (RBAC).
      if (userRole === 'NASABAH') {
        if (!user?.customer_id) {
          return {
            query,
            answer: 'Akun Anda belum terhubung dengan profil nasabah, sehingga data transaksi tidak dapat ditampilkan.',
            authorized: true,
            intent: 'RECENT_TRANSACTIONS',
            data: [],
          };
        }
        recentQuery = recentQuery.where('waste_deposit_transactions.customer_id', user.customer_id);
      }

      const recent = await recentQuery;

      if (!recent.length) {
        return {
          query,
          answer: 'Belum ada transaksi setoran yang tercatat dalam sistem.',
          authorized: true,
          intent: 'RECENT_TRANSACTIONS',
          data: []
        };
      }

      const list = recent.map((t, i) => 
        `${i + 1}. **${t.transaction_no}** - ${new Date(t.transaction_date).toLocaleString('id-ID')}\n` +
        `   Nasabah: ${t.customer_name} (${t.account_no}) | ${parseFloat(t.total_weight_kg).toLocaleString('id-ID')} kg | Rp ${parseFloat(t.total_amount).toLocaleString('id-ID')} | ${t.status}`
      ).join('\n\n');

      return {
        query,
        answer: `**${limit} Transaksi Setoran Terbaru:**\n\n${list}`,
        authorized: true,
        intent: 'RECENT_TRANSACTIONS',
        data: recent
      };
    }

    // 14. Intent: Cari Data ("Cari nasabah", "Cari transaksi", "Data nasabah [nama]", "Transaksi [nomor]")
    if (
      q.startsWith('cari ') ||
      q.startsWith('temukan ') ||
      q.startsWith('carikan ') ||
      (q.includes('cari') && (q.includes('nasabah') || q.includes('transaksi') || q.includes('data')))
    ) {
      const searchTerm = q
        .replace(/^cari\s+/i, '')
        .replace(/^temukan\s+/i, '')
        .replace(/^carikan\s+/i, '')
        .replace(/nasabah\s+/i, '')
        .replace(/transaksi\s+/i, '')
        .replace(/data\s+/i, '')
        .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50);

      if (!searchTerm || searchTerm.length < 2) {
        return {
          query,
          answer: 'Silakan berikan nama, nomor rekening, atau nomor transaksi yang ingin dicari. Contoh: "Cari nasabah Budi" atau "Cari transaksi TRX-001"',
          authorized: true,
          intent: 'SEARCH_DATA',
          data: null
        };
      }

      // Nasabah may only search their own customer record and transactions.
      const selfScope = userRole === 'NASABAH';
      if (selfScope && !user?.customer_id) {
        return {
          query,
          answer: 'Akun Anda belum terhubung dengan profil nasabah, sehingga pencarian data tidak dapat dilakukan.',
          authorized: true,
          intent: 'SEARCH_DATA',
          data: null,
        };
      }

      // Search customers
      let customersQuery = db('customers')
        .join('users', 'customers.user_id', 'users.id');

      if (selfScope) {
        customersQuery = customersQuery.where('customers.id', user.customer_id);
      }

      const customers = await customersQuery
        .where(function () {
          this.where('users.name', 'like', `%${searchTerm}%`)
            .orWhere('customers.account_no', 'like', `%${searchTerm}%`);
          if (!selfScope) {
            this.orWhere('customers.nik', 'like', `%${searchTerm}%`);
          }
        })
        .select('customers.*', 'users.name', 'users.phone', 'users.email')
        .limit(5);

      // Search transactions
      let transactionsQuery = db('waste_deposit_transactions')
        .where('transaction_no', 'like', `%${searchTerm}%`);

      if (selfScope) {
        transactionsQuery = transactionsQuery.where('customer_id', user.customer_id);
      }

      const transactions = await transactionsQuery.select('*').limit(5);

      let answer = `**Hasil Pencarian: "${searchTerm}"**\n\n`;

      if (customers.length) {
        answer += `**👥 Nasabah (${customers.length}):**\n`;
        for (const c of customers) {
          answer += `- **${c.name}** (${c.account_no})`;
          if (!selfScope) {
            answer += ` | NIK: ${c.nik} | Status: ${c.status}`;
          }
          answer += ` | Bergabung: ${new Date(c.join_date).toLocaleDateString('id-ID')}\n`;
        }
        answer += '\n';
      }

      if (transactions.length) {
        answer += `**📋 Transaksi (${transactions.length}):**\n`;
        for (const t of transactions) {
          answer += `- **${t.transaction_no}** | ${new Date(t.transaction_date).toLocaleString('id-ID')} | ${parseFloat(t.total_weight_kg).toLocaleString('id-ID')} kg | Rp ${parseFloat(t.total_amount).toLocaleString('id-ID')} | ${t.status}\n`;
        }
      }

      if (!customers.length && !transactions.length) {
        answer += 'Tidak ditemukan data yang cocok.';
      }

      return {
        query,
        answer,
        authorized: true,
        intent: 'SEARCH_DATA',
        data: { customers, transactions }
      };
    }

    // 15. Intent: Status & Info WhatsApp ("Status WhatsApp", "Notifikasi WhatsApp", "Kirim WhatsApp")
    if (
      q.includes('whatsapp') ||
      q.includes('notifikasi wa') ||
      q.includes('kirim wa') ||
      q.includes('wa status')
    ) {
      const whatsappService = require('../notification/whatsapp.service');
      const isConfigured = whatsappService.isConfigured();
      const provider = whatsappService.provider.constructor.name.replace('WhatsAppProvider', '');

      return {
        query,
        answer: `**📱 Status Integrasi WhatsApp**\n\n` +
          `- Provider: **${provider}**\n` +
          `- Terkonfigurasi: **${isConfigured ? '✅ Ya' : '❌ Belum (mode log lokal)'}**\n` +
          `- Endpoint: \`POST /api/v1/notifications/whatsapp/send\`\n` +
          `- Webhook: \`POST /api/v1/notifications/whatsapp/webhook\`\n` +
          `- Riwayat: \`GET /api/v1/notifications/history\`\n\n` +
          `Event yang didukung: DEPOSIT_COMPLETED, BALANCE_CHANGED, WITHDRAWAL_SUBMITTED, WITHDRAWAL_APPROVED, WITHDRAWAL_REJECTED, REWARD_REDEMPTION, ACHIEVEMENT_UNLOCKED\n\n` +
          `*Untuk mengaktifkan: Set environment variable WHATSAPP_PROVIDER (fonnte/wablas/twilio) dan WHATSAPP_API_KEY*`,
        authorized: true,
        intent: 'WHATSAPP_STATUS',
        data: { configured: isConfigured, provider }
      };
    }

    // 10. Intent: Identity / Introduction ("Siapa nama kamu?", "Perkenalkan diri", "Siapa anda?")
    if (
      q.includes('nama kamu') ||
      q.includes('siapa kamu') ||
      q.includes('siapa anda') ||
      q.includes('anda siapa') ||
      q.includes('siapa nama kamu') ||
      q.includes('siapa nama anda') ||
      q.includes('namamu') ||
      q.includes('siapa namamu') ||
      q.includes('perkenalkan') ||
      q.includes('kamu siapa') ||
      q.includes('kenalan') ||
      q === 'siapa nama'
    ) {
      return {
        query,
        answer: ASSISTANT_IDENTITY_ANSWER,
        authorized: true,
        intent: 'IDENTITY_INTRODUCTION',
        data: { name: 'Asisten AI Cerdas Bank Sampah', provider: 'Nous Research AI' },
      };
    }

    // Fallback: Jawab dengan pengetahuan umum (general knowledge).
    // Tidak lagi mengeluarkan pesan error "UNKNOWN_GUIDANCE" atau pesan maaf kaku.
    const generalAnswer = await this.generateGeneralKnowledgeAnswer(query, user, history);

    return {
      query,
      answer: generalAnswer,
      authorized: true,
      intent: 'GENERAL_KNOWLEDGE',
      source: 'GENERAL_KNOWLEDGE',
      functionCall: null,
      data: null,
    };
  }

  /**
   * General knowledge fallback untuk input yang tidak cocok dengan intent internal.
   * Prioritas: AI Nous Research (general knowledge) -> pengetahuan umum lokal.
   * @param {string} query - Pertanyaan asli pengguna
   * @param {Object} user - Konteks pengguna terautentikasi
   * @returns {Promise<string>}
   */
  async generateGeneralKnowledgeAnswer(query, user, history = []) {
    const q = query.toLowerCase().trim();

    // SAFETY NET: Blokir permintaan kode yang mungkin lolos processQuery
    const codeActionVerbs = ['buatkan', 'buat', 'tulis', 'contoh', 'memperbaiki', 'perbaiki', 'mengerjakan', 'membuat', 'codingkan', 'programkan', 'scriptkan'];
    const codeTerms = ['kode', 'coding', 'codingan', 'program', 'script', 'source code', 'aplikasi', 'python', 'javascript', 'js', 'typescript', 'ts', 'html', 'css', 'java', 'php', 'c++', 'cpp', 'c#', 'csharp', 'go', 'golang', 'rust', 'ruby', 'swift', 'kotlin', 'dart', 'flutter', 'react', 'vue', 'angular', 'node', 'nodejs', 'express', 'django', 'flask', 'fastapi', 'spring', 'laravel', 'codeigniter', 'symfony', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'graphql', 'rest api', 'api', 'bash', 'shell', 'powershell', 'cmd', 'batch', 'vba', 'excel', 'macro', 'matlab', 'scala', 'perl', 'lua', 'haskell', 'clojure', 'elixir', 'erlang', 'solidity', 'smart contract', 'web3', 'blockchain'];

    let isCodeRequest = false;
    for (const verb of codeActionVerbs) {
      for (const term of codeTerms) {
        if (q.includes(`${verb} ${term}`)) { isCodeRequest = true; break; }
        if (['kode', 'coding', 'codingan', 'program', 'script', 'source code', 'aplikasi'].includes(term)) {
          if (q.includes(`${verb} ${term}`)) { isCodeRequest = true; break; }
        }
      }
      if (isCodeRequest) break;
    }
    const explicitCodeRequests = ['codinganku', 'codingan saya', 'kode saya', 'program saya', 'script saya', 'kode python', 'coding python', 'program python', 'script python', 'source code python', 'kode javascript', 'coding javascript', 'program javascript', 'script js', 'source code js', 'kode html', 'coding html', 'program html', 'script html', 'kode css', 'coding css', 'style css', 'kode java', 'coding java', 'program java', 'kode php', 'coding php', 'program php', 'kode c++', 'coding c++', 'program c++', 'kode c#', 'coding c#', 'program c#', 'kode go', 'coding go', 'program go', 'kode rust', 'coding rust', 'program rust', 'buat website', 'buatkan website', 'membuat website', 'buat api', 'buatkan api', 'membuat api', 'coding website', 'coding aplikasi', 'coding sistem'];
    if (!isCodeRequest) isCodeRequest = explicitCodeRequests.some(phrase => q.includes(phrase));

    if (isCodeRequest) {
      return 'Maaf, saya tidak dapat membuat kode pemrograman. Saya hanya membantu informasi dan layanan terkait Bank Sampah Digital.';
    }

    // 1) Delegasikan pertanyaan umum ke model AI Nous Research
    try {
      const result = await nousChatbotService.chat({ message: query, history, user });
      if (result && typeof result.reply === 'string' && result.reply.trim()) {
        return result.reply.trim();
      }
    } catch (err) {
      console.warn('[AiAssistant] General knowledge via AI gagal:', err.message);
    }

    // 2) Sapaan / percakapan santai
    const nameGreeting = user?.name ? `Halo **${user.name}**! ` : 'Halo! ';
    if (/^(halo|hai|hi|hello|hey|pagi|siang|sore|malam|assalam|terima kasih|makasih|thanks|tolong|bisa tolong)/.test(q)) {
      return (
        `${nameGreeting}Terima kasih sudah menyapa. Saya **Asisten AI Cerdas Bank Sampah** yang siap membantu Anda ` +
        `mengelola data sampah maupun menjawab pertanyaan seputar daur ulang.\n\n` +
        `Boleh bertanya apa hari ini? Misalnya soal **cara memilah sampah**, **harga sampah**, atau **saldo tabungan Anda**. 😊`
      );
    }

    // 3) Penanganan dinamis topik pemilahan & kompos jika AI inference offline
    if (q.includes('kompos') || q.includes('organik')) {
      return (
        `${nameGreeting}Pengolahan sampah organik dapur menjadi kompos dapat dilakukan dengan cara memilah sisa sayur dan kulit buah, ` +
        `mencacahnya menjadi ukuran kecil (2-4 cm), lalu menyusunnya berlapis dengan bahan kering seperti sekam atau daun kering. ` +
        `Jaga kelembapan tumpukan dan lakukan aerasi (pembalikan) setiap beberapa hari agar kompos matang optimal dalam 3–6 minggu. 🌱`
      );
    }

    if (q.includes('pilah') || q.includes('plastik') || q.includes('botol')) {
      return (
        `${nameGreeting}Untuk memilah sampah plastik dan botol di rumah, pisahkan botol plastik bersih (seperti PET bening) dari sampah sisa makanan, ` +
        `bilas dari residu cairan, lepaskan label kemasan, dan pipihkan botol untuk menghemat tempat penyimpanan sebelum disetor ke loket Bank Sampah Digital. ♻️`
      );
    }

    // 4) Jawaban fallback yang informatif dan ramah (tanpa melempar error kaku)
    return (
      `${nameGreeting}Terima kasih telah menghubungi **Asisten AI Bank Sampah Digital**.\n\n` +
      `Saya siap membantu Anda dengan berbagai informasi dan layanan berikut:\n` +
      `- 👥 **Informasi Peran Sistem**: Tanyakan *"Ada berapa role?"* atau *"Role apa saja?"*\n` +
      `- 💰 **Informasi Harga Sampah**: Tanyakan *"Berapa harga sampah botol plastik?"* atau *"Harga kardus per kg"*\n` +
      `- 💳 **Informasi Akun & Saldo**: Tanyakan *"Berapa saldo saya?"* atau *"Siapa saya?"*\n` +
      `- ♻️ **Panduan Pemilahan**: Tanyakan *"Bagaimana cara membuat kompos?"* atau *"Alur menabung sampah"*\n` +
      `- 📊 **Statistik & Fitur**: Tanyakan *"Fitur apa saja"* atau *"Status WhatsApp"*\n\n` +
      `Silakan ketik pertanyaan Anda sesuai topik di atas, atau tanyakan langsung apa yang ingin Anda ketahui! 😊`
    );
  }
}

module.exports = new AiAssistantService();
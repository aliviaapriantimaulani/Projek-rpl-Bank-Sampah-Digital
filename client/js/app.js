/**
 * Bank Sampah Digital - Global Application Logic & Event Handlers
 */

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <div>${message}</div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal helper
function openModal(title, bodyHtml, footerHtml = '') {
  const overlay = document.getElementById('global-modal-overlay');
  document.getElementById('modal-title-text').textContent = title;
  document.getElementById('modal-body-content').innerHTML = bodyHtml;
  document.getElementById('modal-footer-content').innerHTML =
    footerHtml || `<button class="btn btn-secondary" onclick="closeModal()">Tutup</button>`;

  overlay.classList.add('active');
}

function closeModal() {
  const overlay = document.getElementById('global-modal-overlay');
  overlay.classList.remove('active');
}

// 1-Click Quick Demo Login selector
function quickFillLogin(identifier, password) {
  const idInput = document.getElementById('login-identifier');
  const pwdInput = document.getElementById('login-password');
  if (idInput && pwdInput) {
    idInput.value = identifier;
    pwdInput.value = password;
    showToast(`Form diisi dengan akun demo: ${identifier}`, 'info');
  }
}

// Quick Switch Role from the top demo bar
async function quickSwitchRole(role) {
  const account = State.DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) return;

  try {
    showToast(`Beralih peran ke: ${account.title}...`, 'info');
    const res = await API.login(account.identifier, account.password);
    State.setAuth(res.data.user, res.data.token);
    showToast(`Berhasil masuk sebagai ${res.data.user.roleDisplay}!`, 'success');
    if (typeof Chatbot !== 'undefined' && typeof Chatbot.loadSuggestions === 'function') {
      Chatbot.loadSuggestions();
    }
    window.location.hash = Router.getDefaultRouteForRole(res.data.user.role);
    Router.handleRoute();
  } catch (err) {
    showToast(`Gagal berganti akun: ${err.message}`, 'error');
  }
}

// Login form submission
async function handleLoginSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-login-submit');
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Memverifikasi kredensial...';
  }

  try {
    const res = await API.login(identifier, password);
    State.setAuth(res.data.user, res.data.token);
    showToast(`Selamat datang, ${res.data.user.name}!`, 'success');
    window.location.hash = Router.getDefaultRouteForRole(res.data.user.role);
    Router.handleRoute();
  } catch (error) {
    showToast(error.message || 'Login gagal. Periksa data Anda.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Masuk ke Aplikasi';
    }
  }
}

// Logout
function handleLogout() {
  State.clearAuth();
  showToast('Sesi Anda telah diakhiri. Sampai jumpa kembali!', 'info');
  window.location.hash = '#/login';
  Router.handleRoute();
}

// Mobile sidebar toggle
function toggleMobileMenu(forceClose) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) {
    if (forceClose === true) {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    } else {
      const isOpen = sidebar.classList.toggle('open');
      if (backdrop) {
        if (isOpen) backdrop.classList.add('active');
        else backdrop.classList.remove('active');
      }
    }
  }
}

// ==============================================================================
// MODAL FORMS: USER MANAGEMENT (ADMIN)
// ==============================================================================

function openAddUserModal() {
  const body = `
    <form id="add-user-form" onsubmit="submitAddUser(event)">
      <div class="form-group">
        <label class="form-label">Nama Lengkap</label>
        <input type="text" id="nu-name" class="form-control" required placeholder="Contoh: Budi Santoso">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="nu-email" class="form-control" required placeholder="budi@banksampah.id">
      </div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" id="nu-username" class="form-control" required placeholder="budi_s">
      </div>
      <div class="form-group">
        <label class="form-label">Nomor Telepon</label>
        <input type="text" id="nu-phone" class="form-control" placeholder="08129990004">
      </div>
      <div class="form-group">
        <label class="form-label">Peran (Role)</label>
        <select id="nu-role" class="form-control" required>
          <option value="PETUGAS">Petugas Timbang / Teller</option>
          <option value="OWNER">Owner / Pengelola</option>
          <option value="ADMIN">Administrator Sistem</option>
          <option value="NASABAH">Nasabah / Warga</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Kata Sandi Awal</label>
        <input type="password" id="nu-password" class="form-control" required value="BankSampah123!" minlength="6">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Simpan Akun Pengguna</button>
    </form>
  `;

  openModal('Tambah Pengguna Baru', body);
}

async function submitAddUser(event) {
  event.preventDefault();
  const data = {
    name: document.getElementById('nu-name').value.trim(),
    email: document.getElementById('nu-email').value.trim(),
    username: document.getElementById('nu-username').value.trim(),
    phone: document.getElementById('nu-phone').value.trim(),
    roleName: document.getElementById('nu-role').value,
    password: document.getElementById('nu-password').value,
  };

  try {
    await API.createUser(data);
    showToast(`Pengguna ${data.name} berhasil ditambahkan!`, 'success');
    closeModal();
    Router.renderAdminUsers();
  } catch (err) {
    showToast(`Gagal menambahkan pengguna: ${err.message}`, 'error');
  }
}

async function deactivateUser(id, name) {
  if (!confirm(`Apakah Anda yakin ingin menonaktifkan pengguna ${name}?`)) return;

  try {
    await API.deleteUser(id);
    showToast(`Pengguna ${name} berhasil dinonaktifkan.`, 'success');
    Router.renderAdminUsers();
  } catch (err) {
    showToast(`Gagal menonaktifkan: ${err.message}`, 'error');
  }
}

// ==============================================================================
// MODAL FORMS: PRICE ADJUSTMENT (OWNER / ADMIN)
// ==============================================================================

function openPriceModal(catId, catName, currentBuying, currentSelling) {
  const body = `
    <form id="price-edit-form" onsubmit="submitPriceUpdate(event, ${catId})">
      <div style="margin-bottom: 1rem; font-size: 0.9rem;">
        Menyesuaikan harga untuk: <strong>${catName}</strong>
      </div>
      <div class="form-group">
        <label class="form-label">Harga Beli dari Nasabah (Rp / kg)</label>
        <input type="number" id="ep-buying" class="form-control" required value="${currentBuying}" min="100" step="50">
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual ke Pengepul (Rp / kg)</label>
        <input type="number" id="ep-selling" class="form-control" required value="${currentSelling}" min="100" step="50">
      </div>
      <div class="form-group">
        <label class="form-label">Alasan Perubahan Harga (Audit Trail)</label>
        <input type="text" id="ep-reason" class="form-control" placeholder="Contoh: Kenaikan harga daur ulang pabrik" required value="Penyesuaian pasar daur ulang">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Simpan & Perbarui Harga</button>
    </form>
  `;

  openModal(`Ubah Harga ${catName}`, body);
}

async function submitPriceUpdate(event, catId) {
  event.preventDefault();
  const buyingPrice = parseFloat(document.getElementById('ep-buying').value);
  const sellingPrice = parseFloat(document.getElementById('ep-selling').value);
  const reason = document.getElementById('ep-reason').value;

  try {
    await API.updateWastePrice(catId, { buyingPrice, sellingPrice, reason });
    showToast('Harga sampah berhasil diperbarui dan dicatat dalam riwayat!', 'success');
    closeModal();
    Router.renderWasteCatalog();
  } catch (err) {
    showToast(`Gagal mengubah harga: ${err.message}`, 'error');
  }
}

// ==============================================================================
// OPERATIONAL: WEIGHING & DEPOSIT (PETUGAS)
// ==============================================================================

function handleCustomerSelect(customerId) {
  const select = document.getElementById('deposit-customer-id');
  const box = document.getElementById('selected-customer-box');
  if (!select || !box) return;

  const selectedOpt = select.options[select.selectedIndex];
  if (!selectedOpt || !customerId) {
    box.innerHTML = `Silakan pilih nasabah untuk melihat kartu dan riwayat saldo.`;
    return;
  }

  const acc = selectedOpt.getAttribute('data-acc');
  const balance = Number(selectedOpt.getAttribute('data-balance') || 0);

  box.innerHTML = `
    <div style="background: var(--primary-50); border: 1px solid var(--primary-200); border-radius: var(--radius-md); padding: 0.875rem;">
      <div style="font-size: 0.75rem; color: var(--primary-800); text-transform: uppercase;">Rekening Terverifikasi</div>
      <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary-900);">${acc}</div>
      <div style="font-size: 0.85rem; margin-top: 0.25rem;">
        Saldo Dompet Saat Ini: <strong style="color: var(--primary-700);">Rp ${balance.toLocaleString('id-ID')}</strong>
      </div>
    </div>
  `;
}

function addDepositItemRow() {
  const container = document.getElementById('deposit-items-container');
  if (!container) return;

  const firstRow = container.querySelector('.deposit-item-row');
  if (!firstRow) return;

  const clone = firstRow.cloneNode(true);
  clone.querySelector('.item-weight').value = '';
  clone.querySelector('.item-subtotal').value = 'Rp 0';
  container.appendChild(clone);
}

function calculateDepositTotal() {
  const rows = document.querySelectorAll('.deposit-item-row');
  let grandTotal = 0;

  rows.forEach((row) => {
    const catSelect = row.querySelector('.item-category');
    const weightInput = row.querySelector('.item-weight');
    const subtotalInput = row.querySelector('.item-subtotal');

    const opt = catSelect.options[catSelect.selectedIndex];
    const price = Number(opt?.getAttribute('data-price') || 0);
    const weight = parseFloat(weightInput.value) || 0;

    const subtotal = Math.round(price * weight);
    grandTotal += subtotal;

    if (subtotalInput) {
      subtotalInput.value = `Rp ${subtotal.toLocaleString('id-ID')}`;
    }
  });

  const display = document.getElementById('deposit-total-display');
  if (display) {
    display.textContent = `Rp ${grandTotal.toLocaleString('id-ID')}`;
  }
}

async function handleDepositSubmit(event) {
  event.preventDefault();
  const customerId = document.getElementById('deposit-customer-id').value;
  if (!customerId) {
    showToast('Harap pilih nasabah terlebih dahulu.', 'error');
    return;
  }

  const rows = document.querySelectorAll('.deposit-item-row');
  const items = [];

  rows.forEach((row) => {
    const categoryId = parseInt(row.querySelector('.item-category').value, 10);
    const weightKg = parseFloat(row.querySelector('.item-weight').value);
    const aiRecordId = row.getAttribute('data-ai-record-id');
    const customPrice = row.getAttribute('data-custom-price');
    const qualityGrade = row.getAttribute('data-quality-grade');

    if (categoryId && weightKg > 0) {
      const itemObj = { categoryId, weightKg };
      if (aiRecordId) itemObj.aiRecordId = parseInt(aiRecordId, 10);
      if (customPrice) itemObj.customPricePerKg = parseFloat(customPrice);
      if (qualityGrade) itemObj.qualityGrade = qualityGrade;
      items.push(itemObj);
    }
  });

  if (items.length === 0) {
    showToast('Masukkan minimal 1 jenis sampah dengan berat lebih dari 0 kg.', 'error');
    return;
  }

  try {
    const res = await API.createDeposit({ customerId, items });
    showToast(
      `Setoran berhasil dicatat! Saldo Rp ${res.data.totalAmount.toLocaleString('id-ID')} masuk ke dompet nasabah.`,
      'success'
    );
    // Immediately show printable receipt
    showReceiptModal(res.data.transactionId);
  } catch (err) {
    showToast(`Gagal mencatat transaksi: ${err.message}`, 'error');
  }
}

// ==============================================================================
// OPERATIONAL: WITHDRAWAL APPROVALS (OWNER / ADMIN)
// ==============================================================================

async function handleApproveWithdrawal(id, requestNo, amount) {
  if (!confirm(`Setujui penarikan saldo ${requestNo} sebesar Rp ${Number(amount).toLocaleString('id-ID')}?`))
    return;

  try {
    await API.approveWithdrawal(id, 'Disetujui oleh pengelola loket');
    showToast(`Penarikan ${requestNo} berhasil disetujui & saldo telah dicairkan!`, 'success');
    Router.renderOwnerDashboard();
  } catch (err) {
    showToast(`Gagal menyetujui: ${err.message}`, 'error');
  }
}

function handleRejectWithdrawal(id, requestNo) {
  const reason = prompt(`Masukkan alasan penolakan untuk penarikan ${requestNo}:`, 'Saldo tidak mencukupi atau informasi rekening salah');
  if (!reason) return;

  API.rejectWithdrawal(id, reason)
    .then(() => {
      showToast(`Pengajuan penarikan ${requestNo} ditolak.`, 'info');
      Router.renderOwnerDashboard();
    })
    .catch((err) => {
      showToast(`Gagal menolak: ${err.message}`, 'error');
    });
}

// ==============================================================================
// NASABAH SELF-REGISTRATION
// ==============================================================================

async function handleRegisterNasabahSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-reg-nasabah-submit');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Mendaftarkan akun...';
  }

  const payload = {
    name: document.getElementById('reg-nb-name').value.trim(),
    nik: document.getElementById('reg-nb-nik').value.trim(),
    phone: document.getElementById('reg-nb-phone').value.trim(),
    email: document.getElementById('reg-nb-email').value.trim() || undefined,
    password: document.getElementById('reg-nb-password').value,
    pin: document.getElementById('reg-nb-pin').value.trim(),
    rtRw: document.getElementById('reg-nb-rtrw').value.trim() || undefined,
    kelurahan: document.getElementById('reg-nb-kelurahan').value.trim() || undefined,
    address: document.getElementById('reg-nb-address').value.trim() || undefined,
  };

  try {
    const res = await API.registerNasabah(payload);
    const data = res.data;
    showToast(`Pendaftaran berhasil! Nomor Rekening Anda: ${data.accountNo}`, 'success');

    openModal(
      '🎉 Pendaftaran Berhasil!',
      `
        <div style="text-align: center; padding: 1rem 0;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">♻️</div>
          <h3 style="color: var(--primary-800); margin-bottom: 0.5rem;">Selamat Datang, ${payload.name}!</h3>
          <p style="color: var(--slate-600); font-size: 0.9rem;">Akun nasabah dan buku tabungan digital Anda telah aktif.</p>
          
          <div style="background: var(--primary-50); border: 1.5px solid var(--primary-200); border-radius: var(--radius-md); padding: 1rem; margin: 1.25rem 0; text-align: left;">
            <div style="font-size: 0.75rem; color: var(--primary-700); font-weight: 700; text-transform: uppercase;">Nomor Rekening Anda</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">${data.accountNo}</div>
            <div style="font-size: 0.8rem; color: var(--slate-600); margin-top: 0.4rem;">
              Kode QR Transaksi: <code>${data.qrCodeToken}</code>
            </div>
          </div>
          <p style="font-size: 0.8rem; color: var(--slate-500);">Silakan masuk menggunakan email / username dan kata sandi yang baru Anda buat.</p>
        </div>
      `,
      `<button class="btn btn-primary btn-block" onclick="closeModal(); window.location.hash = '#/login'; quickFillLogin('${payload.phone || payload.name}', '${payload.password}');">Masuk ke Akun Sekarang</button>`
    );
  } catch (err) {
    showToast(`Pendaftaran gagal: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✨ Selesaikan Pendaftaran & Buat Akun';
    }
  }
}

// ==============================================================================
// CUSTOMER DIRECTORY & MANAGEMENT
// ==============================================================================

function filterCustomerTable() {
  const query = (document.getElementById('cust-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('cust-status-filter')?.value || 'ALL';
  const rows = document.querySelectorAll('.cust-row');

  rows.forEach((row) => {
    const searchData = row.getAttribute('data-search') || '';
    const statusData = row.getAttribute('data-status') || '';

    const matchesQuery = !query || searchData.includes(query);
    const matchesStatus = statusFilter === 'ALL' || statusData === statusFilter;

    row.style.display = matchesQuery && matchesStatus ? '' : 'none';
  });
}

function openRegisterCustomerModal() {
  const body = `
    <form id="reg-cust-modal-form" onsubmit="submitRegisterCustomerModal(event)">
      <div class="form-group">
        <label class="form-label">Nama Lengkap (Sesuai KTP)</label>
        <input type="text" id="rcm-name" class="form-control" required placeholder="Contoh: Siti Rahmawati">
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">NIK (16 Digit)</label>
          <input type="text" id="rcm-nik" class="form-control" required maxlength="16" placeholder="317101xxxxxx">
        </div>
        <div class="form-group">
          <label class="form-label">Nomor Telepon / WA</label>
          <input type="tel" id="rcm-phone" class="form-control" placeholder="08123456789">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">RT / RW</label>
          <input type="text" id="rcm-rtrw" class="form-control" placeholder="03/04">
        </div>
        <div class="form-group">
          <label class="form-label">Kelurahan</label>
          <input type="text" id="rcm-kel" class="form-control" placeholder="Sejahtera">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Alamat Rumah Lengkap</label>
        <textarea id="rcm-address" class="form-control" rows="2" placeholder="Jl. Anggrek No. 10"></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Daftarkan Nasabah & Buat Rekening</button>
    </form>
  `;
  openModal('Pendaftaran Nasabah Baru (Loket)', body);
}

async function submitRegisterCustomerModal(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('rcm-name').value.trim(),
    nik: document.getElementById('rcm-nik').value.trim(),
    phone: document.getElementById('rcm-phone').value.trim(),
    rtRw: document.getElementById('rcm-rtrw').value.trim(),
    kelurahan: document.getElementById('rcm-kel').value.trim(),
    address: document.getElementById('rcm-address').value.trim(),
  };

  try {
    const res = await API.registerCustomer(payload);
    showToast(`Nasabah ${payload.name} berhasil didaftarkan! No Rek: ${res.data.accountNo}`, 'success');
    closeModal();
    Router.renderCustomerDirectory();
  } catch (err) {
    showToast(`Gagal mendaftarkan nasabah: ${err.message}`, 'error');
  }
}

async function openCustomerDetailModal(customerId) {
  openModal('Detail Nasabah', '<div style="text-align: center; padding: 2rem;">Memuat detail nasabah...</div>');

  try {
    const res = await API.getCustomerDetail(customerId);
    const c = res.data;

    const body = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <!-- Digital Card Preview -->
        <div class="member-card" style="margin-bottom: 0;">
          <div class="member-card-header">
            <div class="member-card-bank-name">BANK SAMPAH DIGITAL</div>
            <span class="badge ${c.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}" style="background: rgba(255,255,255,0.2); color: white;">
              ${c.status}
            </span>
          </div>
          <div class="member-card-body">
            <div style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase;">Nomor Rekening</div>
            <div class="member-card-no">${c.account_no}</div>
            <div class="member-card-name">${c.name}</div>
            <div style="font-size: 0.8rem; opacity: 0.85;">NIK: ${c.nik || '-'} • RT/RW: ${c.rt_rw || '-'}</div>
          </div>
          <div class="member-card-footer">
            <div>
              <div style="font-size: 0.7rem; opacity: 0.8;">SALDO TABUNGAN</div>
              <div style="font-size: 1.35rem; font-weight: 800;">Rp ${Number(c.current_balance || 0).toLocaleString('id-ID')}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.7rem; opacity: 0.8;">LEVEL WARGA</div>
              <div style="font-weight: 700;">🌱 ${c.levelName || 'Warga'}</div>
            </div>
          </div>
        </div>

        <!-- QR Code & Stats -->
        <div style="display: grid; grid-template-columns: 1fr 1.3fr; gap: 1rem; align-items: center; background: var(--slate-50); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="text-align: center;">
            <div style="width: 110px; height: 110px; margin: 0 auto; background: white; border: 2px dashed var(--primary-400); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-direction: column;">
              <span style="font-size: 2.2rem;">📱</span>
              <span style="font-size: 0.65rem; font-weight: 700; color: var(--primary-700);">QR VERIFIED</span>
            </div>
            <code style="font-size: 0.7rem; display: block; margin-top: 0.4rem; word-break: break-all;">${c.qr_code_token || '-'}</code>
          </div>

          <div style="font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <div><strong>Total Sampah Disetor:</strong> <span style="color: var(--primary-800); font-weight: 700;">${c.totalWasteKg || 0} kg</span></div>
            <div><strong>Total Transaksi:</strong> <span>${c.totalTransactions || 0} kali</span></div>
            <div><strong>Poin Hijau:</strong> <span class="badge badge-warning">${c.current_points || 0} Pts</span></div>
            <div><strong>No. Telepon:</strong> <span>${c.phone || '-'}</span></div>
            <div><strong>Alamat:</strong> <span style="color: var(--slate-600);">${c.address || '-'}</span></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modal-body-content').innerHTML = body;
  } catch (err) {
    document.getElementById('modal-body-content').innerHTML = `<div style="color: var(--danger-red);">${err.message}</div>`;
  }
}

async function toggleCustomerStatus(customerId, currentStatus, customerName) {
  const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const actionLabel = newStatus === 'ACTIVE' ? 'mengaktifkan' : 'menonaktifkan';

  if (!confirm(`Apakah Anda yakin ingin ${actionLabel} akun nasabah ${customerName}?`)) return;

  try {
    await API.updateCustomerStatus(customerId, newStatus);
    showToast(`Status nasabah ${customerName} berhasil diubah menjadi ${newStatus}.`, 'success');
    Router.renderCustomerDirectory();
  } catch (err) {
    showToast(`Gagal mengubah status: ${err.message}`, 'error');
  }
}

// ==============================================================================
// FAST CUSTOMER LOOKUP & WEIGHING RECEIPT
// ==============================================================================

let fastLookupTimeout = null;
function handleFastCustomerLookup(query) {
  clearTimeout(fastLookupTimeout);
  const feedback = document.getElementById('lookup-feedback');
  if (!query || query.trim().length < 3) {
    if (feedback) feedback.textContent = '';
    return;
  }

  if (feedback) {
    feedback.textContent = '🔍 Mencari data nasabah...';
    feedback.style.color = 'var(--slate-500)';
  }

  fastLookupTimeout = setTimeout(async () => {
    try {
      const res = await API.lookupCustomer(query.trim());
      const cust = res.data;
      if (cust && cust.id) {
        const select = document.getElementById('deposit-customer-id');
        if (select) {
          select.value = cust.id;
          handleCustomerSelect(cust.id);
        }
        if (feedback) {
          feedback.textContent = `✅ Ditemukan: ${cust.name} (${cust.account_no}) • Saldo: Rp ${Number(cust.current_balance || 0).toLocaleString('id-ID')}`;
          feedback.style.color = 'var(--primary-700)';
        }
      }
    } catch (err) {
      if (feedback) {
        feedback.textContent = `❌ Nasabah tidak ditemukan untuk query: "${query}"`;
        feedback.style.color = 'var(--danger-red)';
      }
    }
  }, 300);
}

async function openDailySummaryModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal('Rekap Transaksi Hari Ini', '<div style="text-align:center; padding: 2rem;">Memuat rekap transaksi...</div>');

  try {
    const res = await API.getDailyTransactions(today);
    const d = res.data;

    const body = `
      <div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-bottom: 1.25rem;">
          <div style="background: var(--primary-50); padding: 0.75rem; border-radius: var(--radius-md); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Transaksi</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">${d.totalTransactions}</div>
          </div>
          <div style="background: var(--primary-50); padding: 0.75rem; border-radius: var(--radius-md); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Tonase</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">${d.totalWeightKg} kg</div>
          </div>
          <div style="background: var(--primary-50); padding: 0.75rem; border-radius: var(--radius-md); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Kas Masuk</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">Rp ${d.totalAmount.toLocaleString('id-ID')}</div>
          </div>
        </div>

        <div class="table-responsive" style="max-height: 280px; overflow-y: auto;">
          <table class="data-table" style="font-size: 0.8rem;">
            <thead>
              <tr>
                <th>No. Transaksi</th>
                <th>Nasabah</th>
                <th>Berat</th>
                <th>Nominal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${
                d.transactions.length === 0
                  ? `<tr><td colspan="5" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada transaksi setor sampah hari ini.</td></tr>`
                  : d.transactions
                      .map(
                        (t) => `
                <tr>
                  <td><code>${t.transaction_no}</code></td>
                  <td><strong>${t.customer_name}</strong></td>
                  <td>${t.total_weight_kg} kg</td>
                  <td><strong style="color: var(--primary-700);">Rp ${Number(t.total_amount).toLocaleString('id-ID')}</strong></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;" onclick="closeModal(); showReceiptModal(${t.id})">Struk</button>
                  </td>
                </tr>
              `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('modal-body-content').innerHTML = body;
  } catch (err) {
    document.getElementById('modal-body-content').innerHTML = `<div style="color: var(--danger-red);">${err.message}</div>`;
  }
}

async function showReceiptModal(txId) {
  openModal('Struk Digital Transaksi', '<div style="text-align: center; padding: 2rem;">Memuat struk transaksi...</div>');

  try {
    const res = await API.getTransactionReceipt(txId);
    const r = res.data;

    const receiptHtml = `
      <div id="printable-receipt" style="background: white; border: 1px dashed var(--slate-300); border-radius: var(--radius-md); padding: 1.5rem; font-family: monospace; font-size: 0.85rem; color: #1e293b; max-width: 420px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
          <div style="font-size: 1.1rem; font-weight: 800; color: #065f46;">BANK SAMPAH DIGITAL</div>
          <div style="font-size: 0.75rem; color: #64748b;">${r.branch_name || 'Bank Sampah Induk Pusat'}</div>
          <div style="font-size: 0.7rem; color: #94a3b8;">${r.branch_address || 'Jl. Lingkungan Bersih No. 01'}</div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
          <span>No. Transaksi:</span>
          <strong>${r.transaction_no}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
          <span>Waktu:</span>
          <span>${new Date(r.transaction_date).toLocaleString('id-ID')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
          <span>Nasabah:</span>
          <strong>${r.customer?.name || r.customer_name}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
          <span>No. Rekening:</span>
          <span>${r.customer?.account_no || r.account_no}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span>Petugas Timbang:</span>
          <span>${r.petugas_name}</span>
        </div>

        <div style="border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; padding: 0.6rem 0; margin-bottom: 0.75rem;">
          ${r.items
            .map(
              (it) => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
              <div>
                <strong>${it.category_name}</strong><br>
                <span style="font-size: 0.75rem; color: #64748b;">${it.weight_kg} ${it.unit} @ Rp ${Number(it.price_per_kg).toLocaleString('id-ID')}</span>
              </div>
              <div style="text-align: right; font-weight: 700;">
                Rp ${Number(it.subtotal).toLocaleString('id-ID')}
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 1.05rem; font-weight: 800; color: #065f46; margin-bottom: 0.5rem;">
          <span>TOTAL DITERIMA:</span>
          <span>Rp ${Number(r.total_amount).toLocaleString('id-ID')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #64748b; margin-bottom: 1rem;">
          <span>Total Berat:</span>
          <span>${r.total_weight_kg} kg</span>
        </div>

        <div style="text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 0.75rem; font-size: 0.75rem; color: #64748b;">
          Terima kasih telah berkontribusi merawat bumi!<br>
          <em>Sampahmu Adalah Tabungan Masa Depanmu</em>
        </div>
      </div>
    `;

    document.getElementById('modal-body-content').innerHTML = receiptHtml;
    document.getElementById('modal-footer-content').innerHTML = `
      <button class="btn btn-secondary" onclick="closeModal()">Tutup</button>
      <button class="btn btn-primary" onclick="printReceipt()">🖨️ Cetak Struk (Print)</button>
    `;
  } catch (err) {
    document.getElementById('modal-body-content').innerHTML = `<div style="color: var(--danger-red);">${err.message}</div>`;
  }
}

function printReceipt() {
  const content = document.getElementById('printable-receipt');
  if (!content) return;
  const printWindow = window.open('', '_blank', 'width=450,height=600');
  printWindow.document.write(`
    <html>
      <head><title>Struk Transaksi Setor Sampah</title></head>
      <body style="margin: 0; padding: 20px; font-family: monospace;">
        ${content.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

// ==============================================================================
// PIN & OTP SECURITY & WITHDRAWAL
// ==============================================================================

function toggleBankTransferFields(method) {
  const bankBox = document.getElementById('wd-bank-fields');
  if (bankBox) {
    bankBox.style.display = method === 'BANK_TRANSFER' ? 'block' : 'none';
  }
}

function openSetupPinModal() {
  const body = `
    <form id="setup-pin-form" onsubmit="submitSetupPin(event)">
      <p style="font-size: 0.85rem; color: var(--slate-600); margin-bottom: 1rem;">
        PIN Transaksi 6-digit digunakan untuk memverifikasi setiap pengajuan pencairan saldo tabungan Anda.
      </p>
      <div class="form-group">
        <label class="form-label">Masukkan PIN Baru (6 Digit Angka)</label>
        <input type="password" id="np-pin" class="form-control" required maxlength="6" minlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="Contoh: 123456" style="letter-spacing: 0.3rem; font-size: 1.25rem; text-align: center;">
      </div>
      <div class="form-group">
        <label class="form-label">Konfirmasi PIN Baru</label>
        <input type="password" id="np-pin-confirm" class="form-control" required maxlength="6" minlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="Ulangi 6 digit" style="letter-spacing: 0.3rem; font-size: 1.25rem; text-align: center;">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Simpan PIN Transaksi</button>
    </form>
  `;
  openModal('Atur PIN Transaksi', body);
}

async function submitSetupPin(event) {
  event.preventDefault();
  const pin = document.getElementById('np-pin').value.trim();
  const confirmPin = document.getElementById('np-pin-confirm').value.trim();

  if (pin !== confirmPin) {
    showToast('Konfirmasi PIN tidak cocok.', 'error');
    return;
  }

  try {
    await API.setupPin(pin);
    showToast('PIN Transaksi berhasil diatur & dienkripsi dengan aman!', 'success');
    closeModal();
  } catch (err) {
    showToast(`Gagal mengatur PIN: ${err.message}`, 'error');
  }
}

async function handleRequestOtp() {
  const btn = document.getElementById('btn-request-otp');
  const statusMsg = document.getElementById('otp-status-message');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Mengirim...';
  }

  try {
    const res = await API.requestOtp();
    const code = res.data?.previewCode;
    showToast('Kode OTP verifikasi berhasil dibuat!', 'success');
    if (statusMsg) {
      statusMsg.innerHTML = `<span style="color: var(--primary-700);">✅ Kode OTP Anda: <strong style="font-size: 0.9rem; letter-spacing: 0.1rem;">${code}</strong> (Berlaku 5 menit)</span>`;
    }
    // Auto-fill OTP field for convenient testing
    const otpInput = document.getElementById('wd-otp');
    if (otpInput && code) {
      otpInput.value = code;
    }
  } catch (err) {
    showToast(`Gagal meminta OTP: ${err.message}`, 'error');
    if (statusMsg) {
      statusMsg.innerHTML = `<span style="color: var(--danger-red);">❌ ${err.message}</span>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📲 Minta OTP';
    }
  }
}

async function handleWithdrawWithOtpPinSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-submit-withdraw');
  const amount = parseFloat(document.getElementById('wd-amount').value);
  const method = document.getElementById('wd-method').value;
  const pin = document.getElementById('wd-pin').value.trim();
  const otp = document.getElementById('wd-otp').value.trim();

  const payload = {
    amount,
    method,
    pin,
    otp,
  };

  if (method === 'BANK_TRANSFER') {
    payload.bankName = document.getElementById('wd-bank-name').value;
    payload.bankAccountNumber = document.getElementById('wd-bank-acc-no').value.trim();
    payload.bankAccountHolder = document.getElementById('wd-bank-acc-holder').value.trim();

    if (!payload.bankAccountNumber || !payload.bankAccountHolder) {
      showToast('Nomor rekening dan nama pemilik rekening bank wajib diisi.', 'error');
      return;
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Memproses penarikan...';
  }

  try {
    const res = await API.requestWithdrawalWithOtpPin(payload);
    showToast(
      `Pengajuan penarikan ${res.data.requestNo} sebesar Rp ${amount.toLocaleString('id-ID')} berhasil dikirim!`,
      'success'
    );
    Router.renderNasabahDashboard();
  } catch (err) {
    showToast(`Pengajuan penarikan gagal: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 Ajukan Penarikan Saldo';
    }
  }
}

// ==============================================================================
// BUYERS & WASTE SALES TO OFF-TAKERS
// ==============================================================================

function openAddBuyerModal() {
  const body = `
    <form id="add-buyer-form" onsubmit="submitAddBuyer(event)">
      <div class="form-group">
        <label class="form-label">Nama Perusahaan / Pengepul</label>
        <input type="text" id="nb-name" class="form-control" required placeholder="Contoh: UD Daur Ulang Berkah">
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Nama PIC / Kontak</label>
          <input type="text" id="nb-pic" class="form-control" placeholder="Contoh: Pak Joko">
        </div>
        <div class="form-group">
          <label class="form-label">Nomor Telepon / WA</label>
          <input type="tel" id="nb-phone" class="form-control" placeholder="08129990001">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Kategori Sampah yang Diterima</label>
        <input type="text" id="nb-categories" class="form-control" placeholder="Contoh: Plastik, Kertas, Logam">
      </div>
      <div class="form-group">
        <label class="form-label">Alamat Fasilitas / Gudang Pengepul</label>
        <textarea id="nb-address" class="form-control" rows="2" placeholder="Kawasan Pergudangan No. 5"></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Simpan Data Pengepul</button>
    </form>
  `;
  openModal('Tambah Mitra Pengepul Baru', body);
}

async function submitAddBuyer(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('nb-name').value.trim(),
    contactPerson: document.getElementById('nb-pic').value.trim(),
    phone: document.getElementById('nb-phone').value.trim(),
    address: document.getElementById('nb-address').value.trim(),
    wasteCategoriesAccepted: document.getElementById('nb-categories').value.trim(),
  };

  try {
    await API.createBuyer(payload);
    showToast(`Mitra pengepul ${payload.name} berhasil ditambahkan!`, 'success');
    closeModal();
    Router.renderBuyers();
  } catch (err) {
    showToast(`Gagal menambahkan pembeli: ${err.message}`, 'error');
  }
}

async function handleDeleteBuyer(id, name) {
  if (!confirm(`Hapus mitra pengepul ${name}?`)) return;

  try {
    await API.deleteBuyer(id);
    showToast(`Mitra pengepul ${name} telah dihapus.`, 'info');
    Router.renderBuyers();
  } catch (err) {
    showToast(`Gagal menghapus: ${err.message}`, 'error');
  }
}

async function openCreateSaleModal() {
  openModal('Catat Penjualan ke Pengepul', '<div style="text-align: center; padding: 2rem;">Memuat data gudang & pengepul...</div>');

  try {
    const [buyersRes, invRes] = await Promise.all([API.getBuyers(), API.getInventory()]);
    const buyers = buyersRes.data || [];
    const invItems = invRes.data?.items || [];

    const body = `
      <form id="create-sale-form" onsubmit="submitCreateSale(event)">
        <div class="form-group">
          <label class="form-label">Pilih Mitra Pengepul (Buyer)</label>
          <select id="sale-buyer-id" class="form-control" required>
            <option value="">-- Pilih Mitra Pengepul --</option>
            ${buyers.map((b) => `<option value="${b.id}">${b.name} (${b.phone || 'No Phone'})</option>`).join('')}
          </select>
        </div>

        <div style="background: var(--slate-50); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem;">
          <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
            <span>Barang yang Dijual dari Gudang:</span>
            <span style="font-size: 0.75rem; color: var(--slate-500);">Cek Ketersediaan Stok Real-Time</span>
          </div>

          <div id="sale-items-container">
            <div class="sale-item-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
              <div>
                <select class="form-control sale-category" onchange="handleSaleCategoryChange(this)" required>
                  <option value="">-- Pilih Jenis Sampah --</option>
                  ${invItems
                    .map(
                      (i) => `
                    <option value="${i.id}" data-stock="${i.current_stock_kg}" data-price="${i.selling_price}" data-unit="${i.unit}">
                      ${i.name} (Tersedia: ${i.current_stock_kg} ${i.unit})
                    </option>
                  `
                    )
                    .join('')}
                </select>
                <div class="stock-warning" style="font-size: 0.7rem; color: var(--slate-500); margin-top: 2px;"></div>
              </div>
              <div>
                <input type="number" step="0.1" min="0.1" class="form-control sale-weight" placeholder="Berat (kg)" oninput="calculateSaleTotal()" required>
              </div>
              <div>
                <input type="number" min="100" step="50" class="form-control sale-price" placeholder="Harga/kg" oninput="calculateSaleTotal()" required>
              </div>
            </div>
          </div>
        </div>

        <div style="background: var(--primary-50); padding: 0.85rem; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Nilai Penjualan:</div>
            <div id="sale-total-display" style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">Rp 0</div>
          </div>
          <button type="submit" class="btn btn-primary" style="font-weight: 700;">
            Buat Invoice & Potong Stok
          </button>
        </div>
      </form>
    `;

    document.getElementById('modal-body-content').innerHTML = body;
  } catch (err) {
    document.getElementById('modal-body-content').innerHTML = `<div style="color: var(--danger-red);">${err.message}</div>`;
  }
}

function handleSaleCategoryChange(selectElem) {
  const row = selectElem.closest('.sale-item-row');
  const opt = selectElem.options[selectElem.selectedIndex];
  const stock = parseFloat(opt?.getAttribute('data-stock') || 0);
  const defaultPrice = parseFloat(opt?.getAttribute('data-price') || 0);
  const unit = opt?.getAttribute('data-unit') || 'kg';

  const warningDiv = row.querySelector('.stock-warning');
  const priceInput = row.querySelector('.sale-price');
  const weightInput = row.querySelector('.sale-weight');

  if (priceInput && defaultPrice > 0) {
    priceInput.value = defaultPrice;
  }
  if (weightInput) {
    weightInput.max = stock;
  }
  if (warningDiv) {
    warningDiv.innerHTML = `Stok tersedia: <strong style="color: var(--primary-800);">${stock} ${unit}</strong>`;
  }

  calculateSaleTotal();
}

function calculateSaleTotal() {
  const rows = document.querySelectorAll('.sale-item-row');
  let grandTotal = 0;

  rows.forEach((r) => {
    const weight = parseFloat(r.querySelector('.sale-weight')?.value) || 0;
    const price = parseFloat(r.querySelector('.sale-price')?.value) || 0;
    grandTotal += Math.round(weight * price);
  });

  const display = document.getElementById('sale-total-display');
  if (display) {
    display.textContent = `Rp ${grandTotal.toLocaleString('id-ID')}`;
  }
}

async function submitCreateSale(event) {
  event.preventDefault();
  const buyerId = document.getElementById('sale-buyer-id').value;
  if (!buyerId) {
    showToast('Pilih mitra pengepul terlebih dahulu.', 'error');
    return;
  }

  const rows = document.querySelectorAll('.sale-item-row');
  const items = [];

  for (const r of rows) {
    const catSelect = r.querySelector('.sale-category');
    const opt = catSelect.options[catSelect.selectedIndex];
    const categoryId = parseInt(opt.value, 10);
    const availableStock = parseFloat(opt.getAttribute('data-stock') || 0);
    const weightKg = parseFloat(r.querySelector('.sale-weight').value);
    const unitPrice = parseFloat(r.querySelector('.sale-price').value);

    if (weightKg > availableStock) {
      showToast(`Berat yang dijual (${weightKg} kg) melebihi stok yang tersedia (${availableStock} kg)!`, 'error');
      return;
    }

    if (categoryId && weightKg > 0 && unitPrice > 0) {
      items.push({ wasteCategoryId: categoryId, weightKg, unitPrice });
    }
  }

  if (items.length === 0) {
    showToast('Masukkan minimal 1 jenis barang yang dijual.', 'error');
    return;
  }

  try {
    const res = await API.createSale({ buyerId: parseInt(buyerId, 10), items });
    showToast(`Penjualan berhasil dicatat! Invoice: ${res.data.invoiceNo}`, 'success');
    closeModal();
    Router.renderOwnerSales();
  } catch (err) {
    showToast(`Gagal mencatat penjualan: ${err.message}`, 'error');
  }
}

// ==============================================================================
// OPERATIONAL: NASABAH PORTAL ACTIONS
// ==============================================================================

async function handleRegisterCustomer(event) {
  event.preventDefault();
  const data = {
    name: document.getElementById('reg-name').value.trim(),
    nik: document.getElementById('reg-nik').value.trim(),
    phone: document.getElementById('reg-phone').value.trim(),
    rtRw: document.getElementById('reg-rtrw').value.trim(),
    kelurahan: document.getElementById('reg-kel').value.trim(),
    address: document.getElementById('reg-address').value.trim(),
  };

  try {
    const res = await API.registerCustomer(data);
    showToast(`Nasabah ${data.name} berhasil terdaftar dengan No: ${res.data.accountNo}!`, 'success');
    Router.renderPetugasCustomers();
  } catch (err) {
    showToast(`Gagal mendaftarkan nasabah: ${err.message}`, 'error');
  }
}

async function handleWithdrawSubmit(event) {
  event.preventDefault();
  const amount = parseFloat(document.getElementById('wd-amount').value);
  const method = document.getElementById('wd-method').value;
  const accountInfo = document.getElementById('wd-account').value;

  try {
    await API.requestWithdrawal(amount, method, accountInfo);
    showToast('Pengajuan penarikan berhasil dikirim! Menunggu persetujuan pengelola.', 'success');
    Router.renderNasabahDashboard();
  } catch (err) {
    showToast(`Gagal mengajukan penarikan: ${err.message}`, 'error');
  }
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  const name = document.getElementById('prof-name').value.trim();
  const phone = document.getElementById('prof-phone').value.trim();

  try {
    const res = await API.request('/auth/profile', {
      method: 'PUT',
      body: { name, phone },
    });
    State.setAuth(res.data, State.token);
    showToast('Profil Anda berhasil diperbarui!', 'success');
    Router.renderProfile();
  } catch (err) {
    showToast(`Gagal memperbarui profil: ${err.message}`, 'error');
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('pwd-current').value;
  const newPassword = document.getElementById('pwd-new').value;

  try {
    await API.changePassword(currentPassword, newPassword);
    showToast('Kata sandi berhasil diubah! Gunakan kata sandi baru untuk login berikutnya.', 'success');
    document.getElementById('pwd-current').value = '';
    document.getElementById('pwd-new').value = '';
  } catch (err) {
    showToast(`Gagal mengubah kata sandi: ${err.message}`, 'error');
  }
}

// ==============================================================================
// AI WASTE VISION & PRICE RECOMMENDATION
// ==============================================================================

async function handleAiImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const previewContainer = document.getElementById('ai-image-preview-container');
  const resultPanel = document.getElementById('ai-analysis-result-panel');

  // Client-side validation: Max 5MB, JPG/PNG/WEBP
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ukuran foto melebihi batas maksimum 5MB.', 'error');
    return;
  }

  // Display image preview
  const reader = new FileReader();
  reader.onload = (e) => {
    if (previewContainer) {
      previewContainer.innerHTML = `
        <img src="${e.target.result}" alt="Preview Sampah" class="ai-scan-preview">
        <div style="font-size: 0.7rem; color: var(--primary-700); font-weight: 700;">Ganti Foto (Klik di Sini)</div>
      `;
    }
  };
  reader.readAsDataURL(file);

  // Show loading indicator in result panel
  if (resultPanel) {
    resultPanel.innerHTML = `
      <div style="text-align: center; padding: 1rem 0;">
        <div style="font-size: 1.5rem; margin-bottom: 0.35rem;">⚡</div>
        <div style="font-weight: 700; color: var(--primary-800); font-size: 0.85rem;">Menganalisis Foto Sampah dengan AI...</div>
        <div style="font-size: 0.7rem; color: var(--slate-500);">Menghubungi AI Vision Provider & menghitung rekomendasi harga...</div>
      </div>
    `;
  }

  try {
    const formData = new FormData();
    formData.append('image', file);

    const res = await API.analyzeWasteImage(formData);
    const d = res.data;

    if (d.provider === 'UNCONFIGURED') {
      if (resultPanel) {
        resultPanel.innerHTML = `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: 0.75rem; color: #991b1b;">
            <div style="font-weight: 700; margin-bottom: 0.25rem;">⚠️ AI Vision Belum Dikonfigurasi</div>
            <div style="font-size: 0.75rem;">${d.explanation || 'Kunci API provider AI belum diisi pada konfigurasi server. Tidak ada fabrikasi data tiruan.'}</div>
            <div style="font-size: 0.75rem; margin-top: 0.4rem; color: var(--slate-600);">Silakan pilih jenis sampah secara manual pada baris timbangan di bawah.</div>
          </div>
        `;
      }
      return;
    }

    const confScore = Math.round((d.confidenceScore || 0) * 100);
    const confClass = confScore >= 80 ? 'ai-confidence-high' : confScore >= 50 ? 'ai-confidence-medium' : 'ai-confidence-low';
    const recPrice = d.recommendedPrice || 0;

    if (resultPanel) {
      resultPanel.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.95rem; color: var(--primary-900);">${d.detectedCategoryName || 'Kategori Terdeteksi'}</strong>
            <span class="ai-confidence-pill ${confClass}">Keyakinan: ${confScore}%</span>
          </div>

          <div style="font-size: 0.75rem; color: var(--slate-600); line-height: 1.35;">
            <em>"${d.explanation || 'Analisis visual citra sampah teridentifikasi.'}"</em>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: var(--slate-50); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div>
              <label style="font-size: 0.65rem; color: var(--slate-500); text-transform: uppercase;">Grade Kualitas:</label>
              <select id="ai-quality-grade" class="form-control form-control-sm" style="font-size: 0.75rem; padding: 0.25rem;">
                <option value="CLEAN" ${d.qualityGrade === 'CLEAN' ? 'selected' : ''}>Bersih (Grade A)</option>
                <option value="MIXED" ${d.qualityGrade === 'MIXED' ? 'selected' : ''}>Campur (Grade B)</option>
                <option value="CONTAMINATED" ${d.qualityGrade === 'CONTAMINATED' ? 'selected' : ''}>Kotor (Grade C)</option>
              </select>
            </div>
            <div>
              <label style="font-size: 0.65rem; color: var(--slate-500); text-transform: uppercase;">Harga Konfirmasi Petugas (Rp/kg):</label>
              <input type="number" id="ai-confirmed-price" class="form-control form-control-sm" value="${recPrice}" style="font-size: 0.85rem; font-weight: 800; color: var(--primary-900); padding: 0.25rem;">
            </div>
          </div>

          <button type="button" class="btn btn-primary btn-sm btn-block" onclick="applyAiRecommendationToWeighing(${d.recordId}, ${d.detectedCategoryId}, '${d.detectedCategoryName.replace(/'/g, "\\'")}', ${recPrice})">
            ✅ Masukkan Rekomendasi AI ke Baris Timbangan
          </button>
        </div>
      `;
    }
  } catch (err) {
    if (resultPanel) {
      resultPanel.innerHTML = `
        <div style="color: var(--danger-red); font-size: 0.8rem; text-align: center;">
          ❌ Gagal menganalisis citra: ${err.message}<br>
          <span style="font-size: 0.75rem; color: var(--slate-500);">Silakan pilih kategori secara manual di bawah.</span>
        </div>
      `;
    }
  }
}

async function applyAiRecommendationToWeighing(recordId, categoryId, categoryName, originalAiPrice) {
  const priceInput = document.getElementById('ai-confirmed-price');
  const qualitySelect = document.getElementById('ai-quality-grade');

  const confirmedPrice = priceInput ? parseFloat(priceInput.value) : originalAiPrice;
  const qualityAssessment = qualitySelect ? qualitySelect.value : 'CLEAN';
  const isPriceOverridden = confirmedPrice !== originalAiPrice;

  try {
    // Audit human-in-the-loop confirmation on the AI record
    await API.confirmAiAnalysis(recordId, {
      confirmedCategoryId: categoryId,
      confirmedPrice,
      qualityAssessment,
      isPriceOverridden,
    });

    // Populate or add to deposit item rows
    const container = document.getElementById('deposit-items-container');
    const firstRow = container.querySelector('.deposit-item-row');

    if (firstRow) {
      const select = firstRow.querySelector('.item-category');
      select.value = categoryId;
      firstRow.setAttribute('data-ai-record-id', recordId);
      firstRow.setAttribute('data-custom-price', confirmedPrice);
      firstRow.setAttribute('data-quality-grade', qualityAssessment);

      // Trigger subtotal recalculation
      calculateDepositTotal();

      showToast(`Rekomendasi AI (${categoryName}) berhasil diterapkan ke baris timbangan!`, 'success');
      const panel = document.getElementById('ai-analysis-result-panel');
      if (panel) {
        panel.innerHTML = `
          <div style="text-align: center; color: #065f46; font-weight: 700; padding: 0.5rem;">
            ✅ Rekomendasi AI untuk "${categoryName}" telah aktif di form timbangan (Rp ${confirmedPrice.toLocaleString('id-ID')}/kg).
          </div>
        `;
      }
    }
  } catch (err) {
    showToast(`Gagal mengonfirmasi rekomendasi AI: ${err.message}`, 'error');
  }
}

// ==============================================================================
// NATURAL LANGUAGE AI ASSISTANT MODAL (FACTUAL KNEX-BACKED)
// ==============================================================================

function openAiAssistantModal() {
  const body = `
    <div style="display: flex; flex-direction: column;">
      <div style="font-size: 0.8rem; color: var(--slate-600); margin-bottom: 0.75rem;">
        Asisten AI Bank Sampah menjawab pertanyaan operasional, finansial, dan stok berdasarkan data riil sistem (tidak mengarang jawaban).
      </div>

      <!-- Quick Prompt Suggestions -->
      <div style="display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
        <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.7rem; white-space: nowrap;" onclick="quickAskAi('Berapa total tabungan warga?')">
          💳 Total Tabungan
        </button>
        <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.7rem; white-space: nowrap;" onclick="quickAskAi('Kategori sampah apa yang paling banyak disetor?')">
          ♻️ Kategori Terpopuler
        </button>
        <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.7rem; white-space: nowrap;" onclick="quickAskAi('Bagaimana status stok gudang saat ini?')">
          📦 Stok Gudang
        </button>
        <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.7rem; white-space: nowrap;" onclick="quickAskAi('Berapa reduksi emisi karbon?')">
          🌍 Reduksi CO2
        </button>
      </div>

      <!-- Chat Messages Scroll Area -->
      <div class="ai-chat-box" id="ai-chat-messages">
        <div class="ai-msg ai-msg-bot">
          <strong>Asisten AI Bank Sampah:</strong><br>
          Halo, saya adalah Asisten AI Bank Sampah Digital. Ada yang bisa saya bantu terkait operasional, saldo tabungan, atau data inventaris hari ini?
        </div>
      </div>

      <!-- Input Bar -->
      <form id="ai-chat-form" onsubmit="handleAiAssistantSubmit(event)" style="display: flex; gap: 0.5rem;">
        <input type="text" id="ai-assistant-input" class="form-control" placeholder="Ketik pertanyaan dalam Bahasa Indonesia..." required style="flex: 1;">
        <button type="submit" id="ai-assistant-send-btn" class="btn btn-primary" style="font-weight: 700;">
          Kirim 🚀
        </button>
      </form>
    </div>
  `;

  openModal('🤖 Asisten AI Cerdas Bank Sampah', body);
}

function quickAskAi(prompt) {
  const input = document.getElementById('ai-assistant-input');
  if (input) {
    input.value = prompt;
    handleAiAssistantSubmit(new Event('submit'));
  }
}

async function handleAiAssistantSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const input = document.getElementById('ai-assistant-input');
  const chatBox = document.getElementById('ai-chat-messages');
  const sendBtn = document.getElementById('ai-assistant-send-btn');
  if (!input || !chatBox) return;

  const question = input.value.trim();
  if (!question) return;

  // Append user message
  chatBox.innerHTML += `
    <div class="ai-msg ai-msg-user">
      ${question}
    </div>
  `;
  input.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  // Loading state
  const loadingId = `loading-${Date.now()}`;
  chatBox.innerHTML += `
    <div class="ai-msg ai-msg-bot" id="${loadingId}">
      <em>Sedang memeriksa basis data...</em>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await API.askAiAssistant(question);
    const d = res.data;
    const botEl = document.getElementById(loadingId);

    if (botEl) {
      botEl.innerHTML = `
        <strong>Asisten AI Bank Sampah:</strong><br>
        ${d.answer.replace(/\n/g, '<br>')}
        <div style="margin-top: 0.5rem; font-size: 0.7rem; color: var(--slate-400); border-top: 1px solid var(--slate-100); padding-top: 0.25rem;">
          Query Intent: <code>${d.intent || 'DATABASE_LOOKUP'}</code> • Data Riil Terverifikasi
        </div>
      `;
    }
  } catch (err) {
    const botEl = document.getElementById(loadingId);
    if (botEl) {
      botEl.innerHTML = `
        <span style="color: var(--danger-red);">Maaf, terjadi kendala saat memproses pertanyaan: ${err.message}</span>
      `;
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

// ==============================================================================
// 7 DETAILED OWNER REPORTS HANDLERS
// ==============================================================================

async function loadSelectedReport() {
  const container = document.getElementById('report-result-container');
  const typeSelect = document.getElementById('report-type-select');
  const startDate = document.getElementById('report-start-date')?.value || '';
  const endDate = document.getElementById('report-end-date')?.value || '';

  if (!container || !typeSelect) return;

  const reportType = typeSelect.value;
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Memuat data laporan ${reportType}...</div>`;

  try {
    let query = '';
    if (startDate) query += `startDate=${encodeURIComponent(startDate)}&`;
    if (endDate) query += `endDate=${encodeURIComponent(endDate)}`;

    const res = await API.getOwnerReport(reportType, query);
    const data = res.data;

    let tableHtml = '';

    if (reportType === 'operational') {
      const items = data.transactions || [];
      tableHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
          <div style="background: var(--primary-50); padding: 0.75rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Transaksi</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">${data.totalTransactions || 0} kali</div>
          </div>
          <div style="background: var(--primary-50); padding: 0.75rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Tonase</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">${data.totalWeightKg || 0} kg</div>
          </div>
          <div style="background: var(--primary-50); padding: 0.75rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--primary-800);">Total Nilai Tabungan</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary-900);">Rp ${(data.totalAmount || 0).toLocaleString('id-ID')}</div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>No. Transaksi</th><th>Tanggal</th><th>Nasabah</th><th>Petugas</th><th>Berat</th><th>Nominal</th></tr>
            </thead>
            <tbody>
              ${items.map(t => `
                <tr>
                  <td><code>${t.transaction_no}</code></td>
                  <td>${new Date(t.transaction_date).toLocaleString('id-ID')}</td>
                  <td><strong>${t.customer_name}</strong></td>
                  <td>${t.petugas_name}</td>
                  <td><strong>${t.total_weight_kg} kg</strong></td>
                  <td><strong style="color: var(--primary-700);">Rp ${Number(t.total_amount).toLocaleString('id-ID')}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'financial') {
      const ledgers = data.ledgerEntries || [];
      tableHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
          <div style="background: #f0fdf4; padding: 0.75rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: #166534;">Total Kredit (Setoran Masuk)</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: #15803d;">Rp ${(data.totalCredit || 0).toLocaleString('id-ID')}</div>
          </div>
          <div style="background: #fef2f2; padding: 0.75rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: #991b1b;">Total Debit (Penarikan)</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: #b91c1c;">Rp ${(data.totalDebit || 0).toLocaleString('id-ID')}</div>
          </div>
          <div style="background: #f0f9ff; padding: 0.75rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: #075985;">Saldo Akhir Nasabah</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: #0369a1;">Rp ${(data.netBalance || 0).toLocaleString('id-ID')}</div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Waktu</th><th>Nasabah</th><th>Mutasi</th><th>Tipe</th><th>Nominal</th><th>Saldo Akhir</th></tr>
            </thead>
            <tbody>
              ${ledgers.map(l => `
                <tr>
                  <td>${new Date(l.created_at).toLocaleString('id-ID')}</td>
                  <td><strong>${l.customer_name}</strong> (${l.account_no})</td>
                  <td>${l.description}</td>
                  <td><span class="badge ${l.entry_type === 'CREDIT' ? 'badge-success' : 'badge-danger'}">${l.entry_type}</span></td>
                  <td><strong>Rp ${Number(l.amount).toLocaleString('id-ID')}</strong></td>
                  <td>Rp ${Number(l.balance_after).toLocaleString('id-ID')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'inventory') {
      const items = data.items || [];
      tableHtml = `
        <div style="margin-bottom: 1rem; font-weight: 700; color: var(--primary-900);">
          Valuasi Total Gudang: Rp ${(data.totalValuation || 0).toLocaleString('id-ID')} (${data.totalStockKg || 0} kg)
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Kode</th><th>Kategori</th><th>Nama Sampah</th><th>Stok Tersedia</th><th>Harga Beli</th><th>Harga Jual Pengepul</th><th>Estimasi Valuasi</th></tr>
            </thead>
            <tbody>
              ${items.map(i => `
                <tr>
                  <td><code>${i.code}</code></td>
                  <td><span class="badge badge-neutral">${i.parent_category}</span></td>
                  <td><strong>${i.name}</strong></td>
                  <td><strong style="color: var(--primary-800);">${i.current_stock_kg} ${i.unit}</strong></td>
                  <td>Rp ${Number(i.buying_price).toLocaleString('id-ID')}</td>
                  <td>Rp ${Number(i.selling_price).toLocaleString('id-ID')}</td>
                  <td><strong>Rp ${Number(i.valuation).toLocaleString('id-ID')}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      // Generic fallback for customer_activity, waste_category, sales, withdrawal
      tableHtml = `
        <div style="padding: 0.5rem 0;">
          <div style="margin-bottom: 1rem; font-weight: 700; color: var(--slate-800);">${data.title || 'Laporan Data Terpadu'}</div>
          <pre style="background: var(--slate-50); padding: 1rem; border-radius: var(--radius-md); font-size: 0.8rem; overflow-x: auto;">${JSON.stringify(data, null, 2)}</pre>
        </div>
      `;
    }

    container.innerHTML = tableHtml;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger-red); padding: 1rem;">Gagal memuat laporan: ${err.message}</div>`;
  }
}

function printCurrentReport() {
  const container = document.getElementById('report-result-container');
  const typeSelect = document.getElementById('report-type-select');
  if (!container || !typeSelect) return;

  const title = typeSelect.options[typeSelect.selectedIndex].text;
  const printWindow = window.open('', '_blank', 'width=800,height=700');
  printWindow.document.write(`
    <html>
      <head>
        <title>${title} - Bank Sampah Digital</title>
        <style>
          body { font-family: sans-serif; margin: 20px; color: #1e293b; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background: #f1f5f9; }
          h2 { color: #065f46; margin-bottom: 5px; }
          .header { border-bottom: 2px solid #065f46; padding-bottom: 10px; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>BANK SAMPAH DIGITAL</h2>
          <div>${title}</div>
          <small>Dicetak pada: ${new Date().toLocaleString('id-ID')}</small>
        </div>
        ${container.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

// ==============================================================================
// GAMIFICATION & REWARDS REDEMPTION HANDLERS
// ==============================================================================

async function handleRedeemReward(rewardId, pointsCost, rewardTitle) {
  if (!confirm(`Tukarkan ${pointsCost} Poin Anda untuk hadiah "${rewardTitle}"?`)) return;

  try {
    const res = await API.redeemReward(rewardId);
    showToast(`🎉 Hadiah "${rewardTitle}" berhasil ditukarkan! Kode Penukaran: ${res.data.redemptionCode}`, 'success');
    Router.renderGamificationView();
  } catch (err) {
    showToast(`Gagal menukar hadiah: ${err.message}`, 'error');
  }
}

// ==============================================================================
// AI MODEL SWITCHER HANDLERS (ADMIN ONLY)
// ==============================================================================

function updateAiModelBadge(model) {
  const badge = document.getElementById('ai-model-badge');
  if (!badge) return;

  const modelLabels = {
    'gemini': 'Gemini',
    'google/gemini-1.5-pro': 'Gemini',
    'gemini-1-5-pro': 'Gemini',
    'grok': 'Grok',
    'xai/grok-2': 'Grok',
    'grok-2': 'Grok'
  };
  badge.textContent = modelLabels[model] || (String(model).toLowerCase().includes('grok') ? 'Grok' : 'Gemini');
}

function initAiModelSwitcher() {
  const switcher = document.getElementById('sidebar-ai-switcher');
  const select = document.getElementById('ai-model-select');

  // Role-based visibility: only show for ADMIN
  const isAdmin = State.user && String(State.user.role).toUpperCase() === 'ADMIN';
  if (switcher) {
    switcher.style.display = isAdmin ? '' : 'none';
  }

  if (!isAdmin) return; // Non-admin: no further initialization needed

  const rawSaved = (typeof State !== 'undefined' && State.getAiModel)
    ? State.getAiModel()
    : (localStorage.getItem('bs_ai_model') || 'gemini');

  const savedModel = String(rawSaved).toLowerCase().includes('grok') ? 'grok' : 'gemini';

  if (select) {
    select.value = savedModel;
  }
  updateAiModelBadge(savedModel);
}

function handleAiModelChange(model) {
  // Client-side guard: only admin can change
  const isAdmin = State.user && String(State.user.role).toUpperCase() === 'ADMIN';
  if (!isAdmin) {
    showToast('⛔ Hanya Admin yang dapat mengubah model AI.', 'error');
    // Reset to default
    const select = document.getElementById('ai-model-select');
    if (select) select.value = 'gemini';
    return;
  }

  const normalized = model.toLowerCase().includes('grok') ? 'grok' : 'gemini';

  if (typeof State !== 'undefined' && State.setAiModel) {
    State.setAiModel(normalized);
  } else {
    localStorage.setItem('bs_ai_model', normalized);
  }

  updateAiModelBadge(normalized);

  const modelLabels = {
    'gemini': 'Google Gemini 1.5 Pro',
    'grok': 'xAI Grok 2',
  };
  showToast(`Model AI aktif diubah ke: ${modelLabels[normalized] || normalized}`, 'success');
    'deepseek-r1': 'DeepSeek R1',
  };
  const modelName = modelLabels[model] || model;
  showToast(`🤖 Model AI aktif diubah ke: ${modelName}`, 'success');
}

// ==============================================================================
// THEME TOGGLE (DARK / LIGHT MODE)
// ==============================================================================

function initTheme() {
  const savedTheme = localStorage.getItem('bs_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon(isDark);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('bs_theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
  showToast(isDark ? '🌙 Mode gelap diaktifkan' : '☀️ Mode terang diaktifkan', 'info');
}

function updateThemeIcon(isDark) {
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  const label = document.getElementById('theme-toggle-label');

  if (sunIcon) sunIcon.style.display = isDark ? 'block' : 'none';
  if (moonIcon) moonIcon.style.display = isDark ? 'none' : 'block';
  if (label) label.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
}

// ==============================================================================
// INITIALIZATION
// ==============================================================================

window.addEventListener('DOMContentLoaded', () => {
  initTheme(); // Apply saved theme before anything renders
  State.init();
  Router.init();
  initAiModelSwitcher();

  // Register PWA Service Worker if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('Bank Sampah Digital PWA Service Worker Registered!'))
      .catch((err) => console.log('Service Worker registration skipped:', err.message));
  }
});

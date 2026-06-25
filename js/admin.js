const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8787'
  : 'https://laksana.haerubirru17.workers.dev';

// Sesi / State Aplikasi
const state = {
  token: localStorage.getItem('admin_token') || null,
  telegramId: null,
  stateToken: null, // Token sementara saat menunggu OTP
  otpCountdown: 180, // 3 Menit
  otpTimerInterval: null,
  activeTab: 'dashboard',
  users: {
    data: [],
    page: 1,
    limit: 15,
    total: 0,
    search: '',
    plan: '',
    status: ''
  },
  logs: {
    data: [],
    page: 1,
    limit: 20,
    total: 0
  }
};

// ─────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuth();
});

// Periksa autentikasi saat aplikasi dimuat
async function checkAuth() {
  if (!state.token) {
    showLoginScreen();
    return;
  }

  try {
    const data = await apiCall('/admin/auth/me', 'GET');
    if (data && data.telegram_id) {
      state.telegramId = data.telegram_id;
      showMainApp();
      loadActiveTab();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Auth check error:', err);
    logout();
  }
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-app').classList.remove('active');
  document.getElementById('admin-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('admin-app').classList.add('active');
  }, 50);
  document.getElementById('sidebar-admin-tg-id').textContent = state.telegramId;
}

function logout() {
  state.token = null;
  state.telegramId = null;
  localStorage.removeItem('admin_token');
  showLoginScreen();
}

// ─────────────────────────────────────────────────────
// CORE API CALL WRAPPER
// ─────────────────────────────────────────────────────
async function apiCall(path, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const opts = { method, headers };
  if (body) {
    opts.body = JSON.stringify(body);
  }

  try {
    const resp = await fetch(`${API_BASE}${path}`, opts);
    
    // Autentikasi kedaluwarsa
    if (resp.status === 401 && path !== '/admin/auth/me') {
      alert('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
      logout();
      return null;
    }

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }
    return data;
  } catch (err) {
    alert(`Error: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────
function setupEventListeners() {
  // Login: Kirim OTP
  document.getElementById('form-otp-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tgId = document.getElementById('input-telegram-id').value.trim();
    if (!tgId) return;

    const btn = document.getElementById('btn-request-otp');
    btn.disabled = true;
    btn.textContent = 'Mengirim OTP...';

    try {
      const res = await apiCall('/admin/auth/otp-request', 'POST', { telegram_id: tgId });
      if (res && res.ok) {
        state.stateToken = res.state_token;
        document.getElementById('form-otp-request').style.display = 'none';
        document.getElementById('form-otp-verify').style.display = 'block';
        startOtpTimer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Kirim Kode OTP`;
    }
  });

  // Login: Verifikasi OTP
  document.getElementById('form-otp-verify').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('input-otp-code').value.trim();
    if (!otp || !state.stateToken) return;

    const btn = document.getElementById('btn-verify-otp');
    btn.disabled = true;
    btn.textContent = 'Memverifikasi...';

    try {
      const res = await apiCall('/admin/auth/otp-verify', 'POST', {
        otp,
        state_token: state.stateToken
      });
      if (res && res.token) {
        state.token = res.token;
        state.telegramId = res.admin.telegram_id;
        localStorage.setItem('admin_token', res.token);
        
        // Bersihkan state OTP
        clearInterval(state.otpTimerInterval);
        state.stateToken = null;

        showMainApp();
        state.activeTab = 'dashboard';
        updateTabUI();
        loadActiveTab();
      }
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Verifikasi & Masuk`;
    }
  });

  // Tombol Kembali dari verifikasi OTP
  document.getElementById('btn-back-to-step1').addEventListener('click', () => {
    clearInterval(state.otpTimerInterval);
    state.stateToken = null;
    document.getElementById('form-otp-verify').style.display = 'none';
    document.getElementById('form-otp-request').style.display = 'block';
  });

  // Tombol Logout
  document.getElementById('btn-logout-action').addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin logout?')) {
      logout();
    }
  });

  // Menu Sidebar SPA Navigation
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab === state.activeTab) return;
      state.activeTab = tab;
      updateTabUI();
      loadActiveTab();
    });
  });

  // Dashboard: Refresh
  document.getElementById('btn-refresh-dashboard').addEventListener('click', loadDashboardStats);

  // Users: Cari
  document.getElementById('btn-search-users').addEventListener('click', () => {
    state.users.page = 1;
    state.users.search = document.getElementById('user-search-query').value.trim();
    state.users.plan = document.getElementById('user-filter-plan').value;
    state.users.status = document.getElementById('user-filter-status').value;
    loadUsersList();
  });

  // Users: Pagination
  document.getElementById('btn-users-prev').addEventListener('click', () => {
    if (state.users.page > 1) {
      state.users.page--;
      loadUsersList();
    }
  });
  document.getElementById('btn-users-next').addEventListener('click', () => {
    const totalPages = Math.ceil(state.users.total / state.users.limit);
    if (state.users.page < totalPages) {
      state.users.page++;
      loadUsersList();
    }
  });

  // Settings: Simpan QRIS
  document.getElementById('form-qris-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('input-qris-url').value.trim();
    if (!url) return;

    try {
      const res = await apiCall('/admin/settings/qris', 'POST', { qris_url: url });
      if (res && res.ok) {
        alert('QRIS URL berhasil disimpan!');
        updateQrisPreview(url);
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Coupons: Buka modal kupon baru
  document.getElementById('btn-open-create-coupon').addEventListener('click', () => {
    showModal('modal-create-coupon');
  });

  // Coupons: Simpan kupon baru
  document.getElementById('form-create-coupon').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('coupon-input-code').value.trim();
    const type = document.getElementById('coupon-input-type').value;
    const value = parseInt(document.getElementById('coupon-input-value').value);
    const description = document.getElementById('coupon-input-description').value.trim();
    const max_uses = parseInt(document.getElementById('coupon-input-max-uses').value) || 0;
    const expired_at = document.getElementById('coupon-input-expired').value || null;

    try {
      const res = await apiCall('/admin/coupons', 'POST', {
        code, type, value, description, max_uses, expired_at
      });
      if (res && res.ok) {
        alert('Kupon berhasil dibuat!');
        closeModal('modal-create-coupon');
        document.getElementById('form-create-coupon').reset();
        loadCouponsList();
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Logs: Refresh & Pagination
  document.getElementById('btn-refresh-logs').addEventListener('click', loadLogsList);
  document.getElementById('btn-logs-prev').addEventListener('click', () => {
    if (state.logs.page > 1) {
      state.logs.page--;
      loadLogsList();
    }
  });
  document.getElementById('btn-logs-next').addEventListener('click', () => {
    const totalPages = Math.ceil(state.logs.total / state.logs.limit);
    if (state.logs.page < totalPages) {
      state.logs.page++;
      loadLogsList();
    }
  });
}

// ─────────────────────────────────────────────────────
// OTP COUNTDOWN TIMER
// ─────────────────────────────────────────────────────
function startOtpTimer() {
  state.otpCountdown = 180; // 3 menit
  document.getElementById('otp-timer').textContent = '03:00';
  document.getElementById('otp-timer-label').style.display = 'block';
  document.getElementById('link-resend-otp').style.display = 'none';

  clearInterval(state.otpTimerInterval);
  state.otpTimerInterval = setInterval(() => {
    state.otpCountdown--;
    
    if (state.otpCountdown <= 0) {
      clearInterval(state.otpTimerInterval);
      document.getElementById('otp-timer').textContent = '00:00';
      document.getElementById('otp-timer-label').style.display = 'none';
      document.getElementById('link-resend-otp').style.display = 'inline-block';
      return;
    }

    const min = Math.floor(state.otpCountdown / 60).toString().padStart(2, '0');
    const sec = (state.otpCountdown % 60).toString().padStart(2, '0');
    document.getElementById('otp-timer').textContent = `${min}:${sec}`;
  }, 1000);
}

// ─────────────────────────────────────────────────────
// SPA TAB NAVIGATION UI & DATA LOAD
// ─────────────────────────────────────────────────────
function updateTabUI() {
  // Update sidebar active menu
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
    if (item.getAttribute('data-tab') === state.activeTab) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update main content visible tab
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab.id === `tab-${state.activeTab}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update page heading
  const heading = {
    'dashboard': 'Dashboard Overview',
    'users': 'Manajemen Pengguna',
    'pricing': 'Paket Premium & QRIS',
    'coupons': 'Kupon Diskon',
    'logs': 'Log Audit Aktivitas'
  }[state.activeTab] || 'Dashboard';
  document.getElementById('page-heading').textContent = heading;
}

function loadActiveTab() {
  switch (state.activeTab) {
    case 'dashboard':
      loadDashboardStats();
      break;
    case 'users':
      loadUsersList();
      break;
    case 'pricing':
      loadPricingAndSettings();
      break;
    case 'coupons':
      loadCouponsList();
      break;
    case 'logs':
      loadLogsList();
      break;
  }
}

// ─────────────────────────────────────────────────────
// TAB 1: DASHBOARD ANALYTICS
// ─────────────────────────────────────────────────────
async function loadDashboardStats() {
  try {
    const data = await apiCall('/admin/stats');
    if (!data) return;

    // Render Stats
    document.getElementById('stat-total-users').textContent = data.stats.total_users.toLocaleString('id-ID');
    document.getElementById('stat-premium-users').textContent = data.stats.premium_users.toLocaleString('id-ID');
    document.getElementById('stat-new-users-30d').textContent = '+' + data.stats.new_users_30d.toLocaleString('id-ID');
    document.getElementById('stat-total-revenue').textContent = 'Rp ' + data.stats.total_revenue.toLocaleString('id-ID');

    // Render Recent Payments
    const tbody = document.getElementById('table-recent-payments');
    tbody.innerHTML = '';
    
    if (!data.recent_payments.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Belum ada riwayat transaksi upgrade.</td></tr>';
      return;
    }

    data.recent_payments.forEach(tx => {
      const date = formatDate(tx.created_at);
      const amount = 'Rp ' + tx.amount.toLocaleString('id-ID');
      
      let statusBadge = '';
      let actionBtn = '';
      
      if (tx.status === 'approved') {
        statusBadge = '<span class="badge badge-success">Approved</span>';
        actionBtn = `<span style="color: var(--text-dim); font-size: 0.8rem;">Diterima</span>`;
      } else if (tx.status === 'pending') {
        statusBadge = '<span class="badge badge-warning">Pending</span>';
        actionBtn = `
          <button class="btn-small btn-small-success" onclick="approvePremium('${tx.user_id}', '${tx.email}')">
            Approve
          </button>
        `;
      } else {
        statusBadge = `<span class="badge badge-danger">${tx.status}</span>`;
        actionBtn = '-';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${date}</td>
        <td style="font-weight: 600;">${tx.email}</td>
        <td><span class="badge badge-primary">${tx.pricing_id}</span></td>
        <td style="font-weight: 600;">${amount}</td>
        <td>${statusBadge}</td>
        <td><div class="btn-action-group">${actionBtn}</div></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// Quick approve premium helper from dashboard
async function approvePremium(userId, email) {
  const duration = prompt(`Aktifkan premium untuk ${email}.\nMasukkan durasi paket (30d, 90d, 365d, lifetime):`, '30d');
  if (!duration) return;

  try {
    const res = await apiCall(`/admin/users/${userId}/approve`, 'POST', { duration });
    if (res && res.ok) {
      alert(`Sukses mengaktifkan paket premium (${duration}) untuk user.`);
      loadDashboardStats();
    }
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────
// TAB 2: USER MANAGEMENT
// ─────────────────────────────────────────────────────
async function loadUsersList() {
  try {
    const { search, plan, status, page, limit } = state.users;
    let url = `/admin/users?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (plan) url += `&plan=${encodeURIComponent(plan)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    const data = await apiCall(url);
    if (!data) return;

    state.users.total = data.total;

    // Render Pagination Info
    const totalPages = Math.ceil(data.total / limit) || 1;
    document.getElementById('users-pagination-info').textContent = `Halaman ${page} dari ${totalPages} (Total: ${data.total} user)`;
    document.getElementById('btn-users-prev').disabled = page <= 1;
    document.getElementById('btn-users-next').disabled = page >= totalPages;

    // Render Users Table
    const tbody = document.getElementById('table-users-list');
    tbody.innerHTML = '';

    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Tidak ada user ditemukan.</td></tr>';
      return;
    }

    data.users.forEach(u => {
      const date = formatDate(u.created_at);
      const isPremium = u.plan === 'premium';
      const statusBadge = u.is_banned 
        ? '<span class="badge badge-danger">Banned</span>' 
        : '<span class="badge badge-success">Aktif</span>';
      
      const planBadge = isPremium 
        ? '<span class="badge badge-success">Premium</span>' 
        : '<span class="badge badge-primary">Free</span>';

      const expDate = u.plan_expired_at ? formatDate(u.plan_expired_at).slice(0, 10) : (isPremium ? 'Lifetime' : '-');

      const actionBtn = `
        <button class="btn-small btn-small-primary" onclick="viewUserDetail('${u.id}')">Detail</button>
        <button class="btn-small" onclick="promptResetPassword('${u.id}', '${u.email}')">Reset PW</button>
        ${u.is_banned 
          ? `<button class="btn-small btn-small-success" onclick="toggleBanUser('${u.id}', 'unban')">Unban</button>` 
          : `<button class="btn-small btn-small-danger" onclick="toggleBanUser('${u.id}', 'ban')">Ban</button>`
        }
        <button class="btn-small btn-small-danger" style="color: var(--danger);" onclick="deleteUser('${u.id}', '${u.email}')">Hapus</button>
      `;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${u.name}</td>
        <td>${u.email}</td>
        <td>${planBadge}</td>
        <td>${expDate}</td>
        <td>${statusBadge}</td>
        <td><div class="btn-action-group">${actionBtn}</div></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Users error:', err);
  }
}

async function viewUserDetail(userId) {
  try {
    const data = await apiCall(`/admin/users/${userId}`);
    if (!data) return;

    const u = data.user;
    document.getElementById('detail-user-id').textContent = u.id;
    document.getElementById('detail-user-name').textContent = u.name;
    document.getElementById('detail-user-email').textContent = u.email;
    document.getElementById('detail-user-tg-id').textContent = u.telegram_id || '-';
    document.getElementById('detail-user-plan').innerHTML = u.plan === 'premium' 
      ? '<span class="badge badge-success">Premium</span>' 
      : '<span class="badge badge-primary">Free</span>';
    document.getElementById('detail-user-expired').textContent = u.plan_expired_at ? formatDate(u.plan_expired_at) : (u.plan === 'premium' ? 'Lifetime' : '-');
    document.getElementById('detail-user-status').innerHTML = u.is_banned 
      ? '<span class="badge badge-danger">Banned</span>' 
      : '<span class="badge badge-success">Aktif</span>';
    document.getElementById('detail-user-tx-count').textContent = data.stats.transactions_count.toLocaleString('id-ID');

    // Payments history
    const list = document.getElementById('detail-user-payments-list');
    list.innerHTML = '';
    if (!data.payments.length) {
      list.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">Belum ada riwayat transaksi.</td></tr>';
    } else {
      data.payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatDate(p.created_at)}</td>
          <td><span class="badge badge-primary">${p.pricing_id}</span></td>
          <td style="font-weight:600;">Rp ${p.amount.toLocaleString('id-ID')}</td>
          <td><span class="badge ${p.status === 'approved' ? 'badge-success' : 'badge-warning'}">${p.status}</span></td>
        `;
        list.appendChild(tr);
      });
    }

    showModal('modal-user-detail');
  } catch (err) {
    console.error(err);
  }
}

async function promptResetPassword(userId, email) {
  const newPass = prompt(`Masukkan password baru untuk user ${email} (minimal 6 karakter):`);
  if (!newPass) return;

  try {
    const res = await apiCall(`/admin/users/${userId}/reset-password`, 'POST', { password: newPass });
    if (res && res.ok) {
      alert(`Password untuk user ${email} berhasil diubah.`);
    }
  } catch (e) {
    console.error(e);
  }
}

async function toggleBanUser(userId, action) {
  const confirmMsg = action === 'ban' 
    ? 'Apakah Anda yakin ingin memblokir (ban) user ini?' 
    : 'Apakah Anda yakin ingin membuka blokir (unban) user ini?';
  if (!confirm(confirmMsg)) return;

  try {
    const res = await apiCall(`/admin/users/${userId}/${action}`, 'POST');
    if (res && res.ok) {
      alert(res.message);
      loadUsersList();
    }
  } catch (e) {
    console.error(e);
  }
}

async function deleteUser(userId, email) {
  if (!confirm(`⚠️ PERINGATAN KERAS! ⚠️\n\nApakah Anda yakin ingin menghapus akun ${email} secara PERMANEN?\n\nSemua data transaksi, kategori, rekening, hutang, budgeting, dan data lainnya milik user ini akan dihilangkan 100% dari database.`)) {
    return;
  }

  try {
    const res = await apiCall(`/admin/users/${userId}`, 'DELETE');
    if (res && res.ok) {
      alert('Akun pengguna berhasil dihapus secara permanen.');
      loadUsersList();
    }
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────
// TAB 3: PACKAGES & QRIS SETTINGS
// ─────────────────────────────────────────────────────
async function loadPricingAndSettings() {
  try {
    // 1. Load Pricing Packages
    const pricing = await apiCall('/admin/pricing');
    const container = document.getElementById('pricing-list-container');
    container.innerHTML = '';

    if (!pricing || !pricing.length) {
      container.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; color: var(--text-dim); padding: 2rem;">Tidak ada data paket.</div>';
    } else {
      pricing.forEach(p => {
        const div = document.createElement('div');
        div.className = 'pricing-card';
        div.innerHTML = `
          <h3 style="border-bottom: 1px solid var(--panel-border); padding-bottom: 0.5rem; margin-bottom: 1rem; color: #818cf8;">
            Paket ${p.label} (${p.id})
          </h3>
          <form onsubmit="savePricingCard(event, '${p.id}')">
            <div class="form-group">
              <label>Nama Label Paket</label>
              <input type="text" id="pricing-label-${p.id}" class="input-control" value="${p.label}" required>
            </div>
            <div class="form-group">
              <label>Harga Paket (Rupiah)</label>
              <input type="number" id="pricing-price-${p.id}" class="input-control" value="${p.price}" required min="0">
            </div>
            <div class="form-group">
              <label>Harga Coret (Rupiah, Opsional)</label>
              <input type="number" id="pricing-orig-${p.id}" class="input-control" value="${p.original_price || ''}" min="0">
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
              <input type="checkbox" id="pricing-active-${p.id}" ${p.active ? 'checked' : ''} style="width:16px; height:16px;">
              <label for="pricing-active-${p.id}" style="margin-bottom:0; cursor:pointer;">Paket Aktif</label>
            </div>
            <button type="submit" class="btn-primary" style="margin-top: 1rem; padding: 0.5rem;">Update Paket</button>
          </form>
        `;
        container.appendChild(div);
      });
    }

    // 2. Load QRIS URL
    // Public API returns qris_url
    const pub = await apiCall('/pricing/public');
    if (pub && pub.qris_url) {
      document.getElementById('input-qris-url').value = pub.qris_url;
      updateQrisPreview(pub.qris_url);
    } else {
      document.getElementById('input-qris-url').value = '';
      document.getElementById('qris-preview-image').style.display = 'none';
      document.getElementById('qris-no-preview').style.display = 'block';
    }

  } catch (err) {
    console.error('Pricing/Settings error:', err);
  }
}

async function savePricingCard(e, pricingId) {
  e.preventDefault();
  const label = document.getElementById(`pricing-label-${pricingId}`).value.trim();
  const price = parseInt(document.getElementById(`pricing-price-${pricingId}`).value);
  const origVal = document.getElementById(`pricing-orig-${pricingId}`).value;
  const original_price = origVal ? parseInt(origVal) : null;
  const active = document.getElementById(`pricing-active-${pricingId}`).checked ? 1 : 0;

  try {
    const res = await apiCall('/admin/pricing', 'POST', {
      id: pricingId,
      price,
      original_price,
      label,
      active
    });
    if (res && res.ok) {
      alert(`Paket ${pricingId} berhasil diupdate!`);
      loadPricingAndSettings();
    }
  } catch (e) {
    console.error(e);
  }
}

function updateQrisPreview(url) {
  const img = document.getElementById('qris-preview-image');
  const txt = document.getElementById('qris-no-preview');
  if (url) {
    img.src = url;
    img.style.display = 'inline-block';
    txt.style.display = 'none';
  } else {
    img.style.display = 'none';
    txt.style.display = 'block';
  }
}

// ─────────────────────────────────────────────────────
// TAB 4: COUPON MANAGEMENT
// ─────────────────────────────────────────────────────
async function loadCouponsList() {
  try {
    const coupons = await apiCall('/admin/coupons');
    const container = document.getElementById('coupons-container');
    container.innerHTML = '';

    if (!coupons || !coupons.length) {
      container.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; color: var(--text-dim); padding: 2rem;">Tidak ada kupon diskon aktif saat ini.</div>';
      return;
    }

    coupons.forEach(c => {
      const typeLabel = c.type === 'percent' ? '%' : 'Rp';
      const discVal = c.type === 'percent' ? `${c.value}%` : `Rp ${c.value.toLocaleString('id-ID')}`;
      const uses = c.max_uses === 0 ? 'Unlimited' : `${c.used_count} / ${c.max_uses}`;
      const expiry = c.expired_at ? formatDate(c.expired_at).slice(0, 10) : 'Lifetime';

      const div = document.createElement('div');
      div.className = 'coupon-card';
      div.innerHTML = `
        <div class="coupon-code">${c.code}</div>
        <div class="coupon-desc">${c.description || '-'}</div>
        <div class="coupon-meta">
          <strong>Potongan:</strong> ${discVal}<br>
          <strong>Digunakan:</strong> ${uses}<br>
          <strong>Kadaluarsa:</strong> ${expiry}
        </div>
        <button class="btn-small btn-small-danger" style="margin-top: 1rem; width: 100%; border-color: transparent;" onclick="deleteCoupon('${c.code}')">
          Hapus Kupon
        </button>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Coupons error:', err);
  }
}

async function deleteCoupon(code) {
  if (!confirm(`Apakah Anda yakin ingin menghapus kupon "${code}"?`)) return;

  try {
    const res = await apiCall(`/admin/coupons/${code}`, 'DELETE');
    if (res && res.ok) {
      alert('Kupon berhasil dihapus.');
      loadCouponsList();
    }
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────
// TAB 5: AUDIT LOGS
// ─────────────────────────────────────────────────────
async function loadLogsList() {
  try {
    const { page, limit } = state.logs;
    const data = await apiCall(`/admin/audit-logs?page=${page}&limit=${limit}`);
    if (!data) return;

    state.logs.total = data.total;

    // Pagination info
    const totalPages = Math.ceil(data.total / limit) || 1;
    document.getElementById('logs-pagination-info').textContent = `Halaman ${page} dari ${totalPages} (Total: ${data.total} log)`;
    document.getElementById('btn-logs-prev').disabled = page <= 1;
    document.getElementById('btn-logs-next').disabled = page >= totalPages;

    const tbody = document.getElementById('table-logs-list');
    tbody.innerHTML = '';

    if (!data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">Belum ada log audit tercatat.</td></tr>';
      return;
    }

    data.logs.forEach(l => {
      const date = formatDate(l.created_at);
      const actionBadge = `<span class="badge badge-primary">${l.action}</span>`;
      
      let detailsStr = '';
      if (l.details) {
        try {
          const parsed = JSON.parse(l.details);
          detailsStr = `<pre style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace; background: rgba(0,0,0,0.2); padding: 0.4rem; border-radius: 4px; overflow-x:auto; max-width: 250px;">${JSON.stringify(parsed, null, 2)}</pre>`;
        } catch (_) {
          detailsStr = l.details;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size: 0.8rem; color: var(--text-muted);">${date}</td>
        <td><code>${l.admin_id}</code></td>
        <td>${actionBadge}</td>
        <td><code>${l.target || '-'}</code></td>
        <td>${detailsStr}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Logs error:', err);
  }
}

// ─────────────────────────────────────────────────────
// GLOBAL UTILITIES & MODAL HELPERS
// ─────────────────────────────────────────────────────
function showModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Tutup modal jika user klik overlay luar
window.onclick = function(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.classList.remove('active');
  }
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const date = d.getDate().toString().padStart(2, '0');
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const sec = d.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${date} ${hour}:${min}:${sec}`;
  } catch (_) {
    return dateStr;
  }
}

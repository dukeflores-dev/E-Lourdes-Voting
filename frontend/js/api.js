// Shared API utility for all frontend pages

const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options
  });

  // Handle non-JSON responses
  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = { error: await res.text() };
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function apiGet(endpoint) {
  return apiFetch(endpoint, { method: 'GET' });
}

async function apiPost(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function apiPut(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

async function apiDelete(endpoint) {
  return apiFetch(endpoint, { method: 'DELETE' });
}

async function apiPostForm(endpoint, formData) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    body: formData // No Content-Type header — let browser set multipart
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiPutForm(endpoint, formData) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    credentials: 'include',
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Toast notifications
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Check auth and redirect if needed
async function requireAuth(redirectTo = '/') {
  try {
    const data = await apiGet('/auth/me');
    return data.user;
  } catch {
    window.location.href = redirectTo;
    return null;
  }
}

async function requireAdminAuth() {
  const user = await requireAuth('/');
  if (user && user.role !== 'admin') {
    window.location.href = '/voter/dashboard.html';
    return null;
  }
  return user;
}

async function logout() {
  try {
    await apiPost('/auth/logout');
  } finally {
    window.location.href = '/';
  }
}

// Format dates
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Get initials for avatar placeholder
function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Confirm dialog (modal-based)
function showConfirm(message, onConfirm, title = 'Confirm Action') {
  let modal = document.getElementById('confirm-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h3 class="modal-title">⚠️ ${title}</h3>
        <button class="btn btn-ghost btn-icon" onclick="document.getElementById('confirm-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <p style="color: var(--text-secondary);">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('confirm-modal').remove()">Cancel</button>
        <button class="btn btn-danger" id="confirm-ok-btn">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });
}

// Set active nav item
function setActiveNav(href) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === href);
  });
}

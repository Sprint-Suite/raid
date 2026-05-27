// public/js/admin.js
//
// Admin page controller. Lists users, adds, rotates, and deletes them.
// All admin actions hit /api/admin/users; the page itself was already gated
// by requireAdmin on the server side, so any 401/404 here means we lost the
// session or the admin name is no longer ours — bounce to /login.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function setStatus(msg, tone) {
    const el = $('admin-status');
    el.textContent = msg || '';
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
  }

  function fmtExpiry(ms, expired) {
    if (ms == null) return 'never';
    const d = new Date(ms);
    const label = d.toISOString().slice(0, 10);
    return expired ? `${label} (expired)` : label;
  }

  async function request(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error(`auth lost (${res.status})`);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function showBanner(name, value) {
    $('admin-banner-name').textContent = name;
    $('admin-banner-value').textContent = value;
    $('admin-banner').hidden = false;
    $('admin-banner-value').focus?.();
  }

  function hideBanner() {
    $('admin-banner').hidden = true;
    $('admin-banner-value').textContent = '';
    $('admin-banner-name').textContent = '';
  }

  async function copyBannerValue() {
    const value = $('admin-banner-value').textContent;
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied to clipboard.');
    } catch (_err) {
      setStatus('Copy failed — select the value and copy it manually.', 'error');
    }
  }

  async function loadUsers() {
    const tbody = $('admin-users-body');
    try {
      const { users } = await request('/api/admin/users');
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="admin-table__empty">No users yet.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      for (const u of users) {
        const tr = document.createElement('tr');
        tr.dataset.name = u.name;
        tr.dataset.expired = String(u.expired);

        const name = document.createElement('td'); name.textContent = u.name;
        const created = document.createElement('td'); created.textContent = fmtDate(u.createdAt);
        const expires = document.createElement('td'); expires.textContent = fmtExpiry(u.expiresAt, u.expired);
        const session = document.createElement('td'); session.textContent = u.hasSession ? 'yes' : 'no';

        const actions = document.createElement('td');
        actions.className = 'admin-table__actions';
        const wrap = document.createElement('div');
        wrap.className = 'admin-table__row-actions';

        const rotate = document.createElement('button');
        rotate.type = 'button';
        rotate.className = 'btn btn--ghost';
        rotate.textContent = 'Rotate';
        rotate.addEventListener('click', () => onRotate(u.name));

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn--ghost';
        del.textContent = 'Delete';
        del.addEventListener('click', () => onDelete(u.name));

        wrap.append(rotate, del);
        actions.append(wrap);
        tr.append(name, created, expires, session, actions);
        tbody.append(tr);
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="admin-table__empty">Could not load users: ${err.message}</td></tr>`;
    }
  }

  async function onAdd(event) {
    event.preventDefault();
    const name = $('admin-add-name').value.trim();
    const daysRaw = $('admin-add-days').value.trim();
    const body = { name };
    if (daysRaw) body.expiresInDays = Number(daysRaw);

    const submit = $('admin-add-submit');
    submit.disabled = true;
    const prevLabel = submit.textContent;
    submit.textContent = 'Generating…';
    try {
      const { value, name: createdName } = await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      showBanner(createdName, value);
      $('admin-add-name').value = '';
      $('admin-add-days').value = '';
      setStatus(`Added "${createdName}".`);
      await loadUsers();
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = prevLabel;
    }
  }

  async function onRotate(name) {
    if (!window.confirm(`Rotate key for "${name}"? Any current session will be signed out.`)) return;
    try {
      const { value } = await request(`/api/admin/users/${encodeURIComponent(name)}/rotate`, { method: 'POST' });
      showBanner(name, value);
      setStatus(`Rotated "${name}".`);
      await loadUsers();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function onDelete(name) {
    if (!window.confirm(`Delete user "${name}"? This signs them out immediately and removes their key.`)) return;
    try {
      await request(`/api/admin/users/${encodeURIComponent(name)}`, { method: 'DELETE' });
      hideBanner();
      setStatus(`Deleted "${name}".`);
      await loadUsers();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function loadWhoami() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const { name } = await res.json();
        $('admin-whoami').textContent = `Signed in as ${name}`;
      }
    } catch (_err) { /* non-fatal */ }
  }

  async function onLogout() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (_err) { /* ignore */ }
    window.location.href = '/login.html';
  }

  function init() {
    $('admin-add-form').addEventListener('submit', onAdd);
    $('admin-banner-copy').addEventListener('click', copyBannerValue);
    $('admin-banner-dismiss').addEventListener('click', hideBanner);
    $('admin-logout').addEventListener('click', onLogout);
    loadWhoami();
    loadUsers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

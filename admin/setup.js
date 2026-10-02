(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const err = $('error'), btn = $('submit');
  fetch('/api/auth/setup-status').then((r) => r.json()).then((j) => {
    if (!j.needed) return location.replace('/admin/login.html');
    $('tokenBox').hidden = !j.tokenRequired;
    if (!j.enabled) { $('disabled').hidden = false; $('form').hidden = true; }
  }).catch(() => { err.textContent = 'Could not reach the server.'; err.hidden = false; });

  $('toggle').addEventListener('click', () => {
    const show = $('password').type === 'password';
    $('password').type = $('confirm').type = show ? 'text' : 'password';
    $('toggle').textContent = show ? 'Hide' : 'Show'; $('toggle').setAttribute('aria-pressed', String(show));
  });
  const mark = (fields) => {
    document.querySelectorAll('.field').forEach((f) => { f.classList.remove('invalid'); const e = f.querySelector('.err'); if (e) e.hidden = true; });
    Object.entries(fields || {}).forEach(([k, m]) => { const f = document.querySelector(`[data-field="${k}"]`); if (!f) return; f.classList.add('invalid'); const e = f.querySelector('.err'); e.textContent = m; e.hidden = false; });
  };
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true; mark({});
    if ($('password').value !== $('confirm').value) { mark({ confirm: 'The passwords do not match' }); return; }
    btn.disabled = true; btn.classList.add('loading');
    try {
      const r = await fetch('/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('name').value, email: $('email').value, password: $('password').value, token: $('token').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { mark(j.fields); const e2 = new Error(j.error || 'Setup failed.'); e2.fields = j.fields; throw e2; }
      location.replace('/admin/');
    } catch (ex) {
      if (!ex.fields) { err.textContent = ex.message === 'Failed to fetch' ? 'Could not reach the server.' : ex.message; err.hidden = false; }
      btn.disabled = false; btn.classList.remove('loading');
    }
  });
})();

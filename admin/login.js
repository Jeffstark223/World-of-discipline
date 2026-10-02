(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const err = $('error'), btn = $('submit');
  // no administrator yet? send to first-run setup
  fetch('/api/auth/setup-status').then((r) => r.json()).then((j) => { if (j.needed) location.replace('/admin/setup.html'); }).catch(() => {});
  // already signed in? go straight to the dashboard
  fetch('/api/auth/me').then((r) => { if (r.ok) location.replace('/admin/'); }).catch(() => {});

  $('toggle').addEventListener('click', () => {
    const show = $('password').type === 'password';
    $('password').type = show ? 'text' : 'password';
    $('toggle').textContent = show ? 'Hide' : 'Show';
    $('toggle').setAttribute('aria-pressed', String(show));
    $('toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
    btn.disabled = true; btn.classList.add('loading'); btn.firstChild.textContent = 'Signing in';
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Sign-in failed. Please try again.');
      location.replace('/admin/');
    } catch (ex) {
      err.textContent = ex.message === 'Failed to fetch' ? 'Could not reach the server. Check your connection and try again.' : ex.message;
      err.hidden = false;
      btn.disabled = false; btn.classList.remove('loading'); btn.firstChild.textContent = 'Sign in';
      $('password').select();
    }
  });
})();

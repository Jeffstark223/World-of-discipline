/* WOD Admin — core (helpers, UI primitives, form builder, generic resource list, router) */
(() => {
  'use strict';
  const W = (window.WOD = { pages: {}, state: { admin: null, unread: 0 } });

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (s) => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? esc(s) : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const dateOnly = (s) => { if (!s) return '—'; const d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? esc(s) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const today = () => new Date().toISOString().slice(0, 10);
  const time12 = (t) => { if (!t) return ''; const [h, m] = t.split(':'); return ((h % 12) || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'); };
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  Object.assign(W, { $, $$, esc, dt, dateOnly, today, time12, debounce });

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2.5.6 4 2.6 4 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>',
    heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.4 1a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.4-1a7 7 0 002.2 1.3L10 21h4l.4-2.5a7 7 0 002.2-1.3l2.4 1 2-3.4-2-1.5c.1-.4.1-.9 0-1.3z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    check: '<path d="M20 6L9 17l-5-5"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>', menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>', download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
    power: '<path d="M12 3v9M6.4 6.4a8 8 0 1011.2 0"/>', ext: '<path d="M14 3h7v7M21 3l-9 9M19 14v6H4V5h6"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  Object.assign(W, { icon });

  /* ---------- API ---------- */
  async function api(method, url, body) {
    const opt = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body instanceof FormData) opt.body = body;
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, opt); } catch { const e = new Error('Could not reach the server. Check your connection and try again.'); e.network = true; throw e; }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.startsWith('/api/auth/login')) { location.replace('/admin/login.html'); throw new Error('Your session has ended. Please sign in again.'); }
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.fields = data.fields; throw e; }
    return data;
  }
  W.api = api;

  /* ---------- toast / modal ---------- */
  function toast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.setAttribute('role', type === 'err' ? 'alert' : 'status');
    t.innerHTML = `${icon(type === 'err' ? 'x' : 'check')}<span>${esc(msg)}</span><button class="x" aria-label="Dismiss">×</button>`;
    $('#toasts').appendChild(t);
    const kill = () => t.remove();
    t.querySelector('.x').onclick = kill;
    setTimeout(kill, type === 'err' ? 8000 : 4000);
  }
  W.toast = toast;

  function modal({ title, body, footer = '', size = '', onOpen }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div>`;
    const prev = document.activeElement;
    const close = () => { document.removeEventListener('keydown', key); back.remove(); if (prev && prev.focus) prev.focus(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) back._down = true; });
    back.addEventListener('click', (e) => { if (e.target === back && back._down) close(); back._down = false; });
    $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', key);
    $('#modalRoot').appendChild(back);
    const first = $('input:not([type=hidden]):not([type=file]), textarea, select, .btn-primary', back);
    if (first) first.focus();
    if (onOpen) onOpen(back, close);
    return { el: back, close };
  }
  W.modal = modal;

  function confirmDialog({ title = 'Are you sure?', message, confirmText = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const m = modal({ title, size: 'sm', body: `<p>${esc(message)}</p>`,
        footer: `<button class="btn btn-ghost" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmText)}</button>` });
      let done = false;
      const fin = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
      $('[data-yes]', m.el).onclick = () => fin(true);
      $('[data-no]', m.el).onclick = () => fin(false);
      $$('[data-close]', m.el).forEach((b) => b.addEventListener('click', () => fin(false)));
      m.el.addEventListener('click', (e) => { if (e.target === m.el) fin(false); });
      $('[data-no]', m.el).focus();
    });
  }
  W.confirm = confirmDialog;

  /* ---------- form builder ---------- */
  const SOCIALS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x', 'X (Twitter)'], ['youtube', 'YouTube'], ['website', 'Website']];
  function fieldHTML(f, v, idp) {
    const id = `${idp}_${f.name}`;
    const val = v[f.name] ?? f.default ?? '';
    const req = f.required ? '<span class="req" aria-hidden="true"> *</span>' : '';
    const help = f.help ? `<span class="help">${esc(f.help)}</span>` : '';
    const wrap = (inner, extra = '') => `<div class="field ${extra}" data-field="${f.name}">${inner}<span class="err" hidden></span></div>`;
    switch (f.type) {
      case 'hidden': return `<input type="hidden" name="${f.name}" value="${esc(val)}" />`;
      case 'textarea': return wrap(`<label for="${id}">${esc(f.label)}${req}</label><textarea class="input" id="${id}" name="${f.name}" rows="${f.rows || 4}" maxlength="${f.max || 5000}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>${help}`);
      case 'select': return wrap(`<label for="${id}">${esc(f.label)}${req}</label><select class="input" id="${id}" name="${f.name}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(val) === String(o) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}`);
      case 'checkbox': return wrap(`<label class="switch"><input type="checkbox" name="${f.name}" ${Number(val) || val === true ? 'checked' : ''} /><span>${esc(f.label)}${f.help ? `<small>${esc(f.help)}</small>` : ''}</span></label>`);
      case 'image': return wrap(`<label for="${id}">${esc(f.label)}${req}</label><div class="imgfield"><div class="thumb" data-thumb style="${val ? `background-image:url('${esc(val).replace(/'/g, '%27')}')` : ''}">${val ? '' : icon('image')}</div>
        <div class="stack"><input class="input" id="${id}" name="${f.name}" type="text" value="${esc(val)}" placeholder="Paste an image address, or upload" maxlength="2000" />
        <div class="row"><button type="button" class="btn btn-ghost btn-sm" data-upload>${icon('upload')} Upload image</button><button type="button" class="btn btn-ghost btn-sm" data-clear>Remove</button><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden /></div></div></div>${help}`);
      case 'media': return wrap(`<label for="${id}">${esc(f.label)}${req}</label><div class="mediafield" data-kind="${f.kind}"><input class="input" id="${id}" name="${f.name}" type="text" value="${esc(val)}" maxlength="2000" placeholder="Paste a link (e.g. YouTube), or upload a file" />
        <div class="row"><button type="button" class="btn btn-ghost btn-sm" data-mupload>${icon('upload')} Upload ${f.kind} file</button><button type="button" class="btn btn-ghost btn-sm" data-clear>Remove</button><input type="file" accept="${f.kind === 'audio' ? 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg,.aac' : 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'}" hidden /></div>
        <div class="progress" hidden><div class="bar"><i></i></div><span></span></div></div><span class="help">${esc(f.help || '')}</span>`);
      case 'social': return `<div class="field" data-field="${f.name}"><span class="lbl">${esc(f.label)}</span><div class="grid2">${SOCIALS.map(([k, l]) => `<div class="field" style="margin-bottom:.6rem"><label for="${id}_${k}" style="font-weight:400">${l}</label><input class="input" id="${id}_${k}" name="${f.name}__${k}" type="url" placeholder="https://" value="${esc((val && val[k]) || '')}" /></div>`).join('')}</div><span class="err" hidden></span></div>`;
      default: return wrap(`<label for="${id}">${esc(f.label)}${req}</label><input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${f.required ? 'required' : ''} maxlength="${f.max || 500}" placeholder="${esc(f.placeholder || '')}" ${f.type === 'password' ? 'autocomplete="new-password"' : ''} />${help}`);
    }
  }
  function formHTML(fields, values = {}, idp = 'f') {
    const out = []; let row = [];
    const flush = () => { if (row.length) { out.push(`<div class="grid${row.length}">${row.join('')}</div>`); row = []; } };
    fields.forEach((f) => {
      const h = fieldHTML(f, values, idp);
      if (f.half) { row.push(h); if (row.length === (f.cols || 2)) flush(); } else { flush(); out.push(h); }
    });
    flush();
    return out.join('');
  }
  function readForm(form, fields) {
    const o = {};
    fields.forEach((f) => {
      if (f.type === 'checkbox') o[f.name] = form.elements[f.name].checked;
      else if (f.type === 'social') { const s = {}; SOCIALS.forEach(([k]) => { const v = form.elements[`${f.name}__${k}`].value.trim(); if (v) s[k] = v; }); o[f.name] = s; }
      else if (f.type === 'number') o[f.name] = form.elements[f.name].value === '' ? 0 : Number(form.elements[f.name].value);
      else if (form.elements[f.name]) o[f.name] = form.elements[f.name].value;
    });
    return o;
  }
  function showErrors(form, err) {
    $$('.field.invalid', form).forEach((n) => { n.classList.remove('invalid'); const e = $('.err', n); if (e) e.hidden = true; });
    let first = null;
    Object.entries(err.fields || {}).forEach(([k, msg]) => {
      const n = $(`[data-field="${k}"]`, form); if (!n) return;
      n.classList.add('invalid'); const e = $('.err', n); e.textContent = msg; e.hidden = false; first = first || n;
    });
    if (first) { const i = $('input,select,textarea', first); if (i) i.focus(); }
    return !!first;
  }
  function wireMedia(form) {
    $$('.mediafield', form).forEach((box) => {
      const txt = $('input[type=text]', box), file = $('input[type=file]', box), up = $('[data-mupload]', box);
      const prog = $('.progress', box), bar = $('.bar i', box), label = $('.progress span', box);
      $('[data-clear]', box).onclick = () => { txt.value = ''; };
      up.onclick = () => file.click();
      file.onchange = () => {
        const f = file.files[0]; if (!f) return;
        const fd = new FormData(); fd.append('file', f);
        const xhr = new XMLHttpRequest();
        box.classList.add('uploading'); up.disabled = true; prog.hidden = false; bar.style.width = '0%'; label.textContent = `Uploading ${f.name}…`;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); bar.style.width = p + '%'; label.textContent = `Uploading ${f.name}… ${p}% (${(e.loaded / 1048576).toFixed(1)} of ${(e.total / 1048576).toFixed(1)} MB)`; } };
        const end = () => { box.classList.remove('uploading'); up.disabled = false; file.value = ''; };
        xhr.onload = () => {
          let j = {}; try { j = JSON.parse(xhr.responseText); } catch { /* not json */ }
          if (xhr.status === 401) return location.replace('/admin/login.html');
          end();
          if (xhr.status === 201) { txt.value = j.url; bar.style.width = '100%'; label.textContent = `Uploaded: ${j.file_name} (${(j.size_bytes / 1048576).toFixed(1)} MB)`; toast(`${cap(box.dataset.kind)} file uploaded`); }
          else { prog.hidden = true; toast(j.error || `Upload failed (${xhr.status}).`, 'err'); }
        };
        xhr.onerror = () => { end(); prog.hidden = true; toast('Upload failed. Check your connection and try again.', 'err'); };
        xhr.open('POST', `/api/upload/media?kind=${box.dataset.kind}`); xhr.send(fd);
      };
    });
  }
  function wireImages(form) {
    wireMedia(form);
    $$('.imgfield', form).forEach((box) => {
      const txt = $('input[type=text]', box), file = $('input[type=file]', box), th = $('[data-thumb]', box), up = $('[data-upload]', box);
      const paint = () => { const u = txt.value.trim(); th.style.backgroundImage = u ? `url("${u.replace(/"/g, '%22')}")` : ''; th.innerHTML = u ? '' : icon('image'); };
      txt.addEventListener('input', paint);
      $('[data-clear]', box).onclick = () => { txt.value = ''; paint(); };
      up.onclick = () => file.click();
      file.onchange = async () => {
        if (!file.files[0]) return;
        const fd = new FormData(); fd.append('file', file.files[0]);
        up.disabled = true; up.classList.add('loading');
        try { const r = await api('POST', '/api/upload', fd); txt.value = r.url; paint(); toast('Image uploaded'); }
        catch (e) { toast(e.message, 'err'); }
        up.disabled = false; up.classList.remove('loading'); file.value = '';
      };
    });
  }
  Object.assign(W, { formHTML, readForm, showErrors, wireImages });

  /** Opens a modal form. onSave(values) must return a promise; throw to keep the form open with errors. */
  function formModal({ title, fields, values = {}, submitText = 'Save', size = '', onSave, extraTop = '' }) {
    const m = modal({ title, size, body: `<form novalidate>${extraTop}<div class="inline-error" data-top hidden></div>${formHTML(fields, values)}</form>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-save>${esc(submitText)}</button>` });
    const form = $('form', m.el), top = $('[data-top]', m.el), save = $('[data-save]', m.el);
    wireImages(form);
    const submit = async (e) => {
      if (e) e.preventDefault();
      top.hidden = true;
      if ($('.mediafield.uploading', form)) { toast('Please wait for the file upload to finish.', 'err'); return; }
      const missing = fields.filter((f) => f.required && !String(readForm(form, [f])[f.name] || '').trim());
      if (missing.length) { showErrors(form, { fields: Object.fromEntries(missing.map((f) => [f.name, `${f.label} is required`])) }); return; }
      save.disabled = true; save.classList.add('loading');
      try { await onSave(readForm(form, fields)); m.close(); }
      catch (err) {
        if (!showErrors(form, err) || !err.fields) { top.textContent = err.message; top.hidden = false; }
        else toast(err.message, 'err');
        save.disabled = false; save.classList.remove('loading');
      }
    };
    form.addEventListener('submit', submit); save.addEventListener('click', submit);
    return m;
  }
  W.formModal = formModal;

  /* ---------- small view helpers ---------- */
  const skeleton = () => '<div class="skel"><i></i><i></i><i></i><i></i></div>';
  const empty = (ico, title, text, btn = '') => `<div class="empty"><div class="ico">${icon(ico)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn}</div>`;
  const errorState = (e) => `<div class="empty"><div class="ico" style="background:var(--danger-pale);color:var(--danger)">${icon('x')}</div><h3>This could not be loaded</h3><p>${esc(e.message)}</p><button class="btn btn-ghost" data-retry>Try again</button></div>`;
  const badge = (t, c = '') => `<span class="badge ${c}">${esc(t)}</span>`;
  const pager = (st, label) => st.pages > 1 || st.total ? `<div class="pager"><span>${st.total} ${esc(label)}${st.total === 1 ? '' : 's'}</span>${st.pages > 1 ? `<span class="actions-row"><button class="btn btn-ghost btn-sm" data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>Previous</button><span style="align-self:center">Page ${st.page} of ${st.pages}</span><button class="btn btn-ghost btn-sm" data-pg="${st.page + 1}" ${st.page >= st.pages ? 'disabled' : ''}>Next</button></span>` : ''}</div>` : '';
  Object.assign(W, { skeleton, empty, errorState, badge, pager });

  /* ---------- generic resource list (sermons, events, ministries, leaders, pillars) ---------- */
  W.resource = (cfg) => async function render(box, params) {
    const st = { q: '', page: 1, f: {}, rows: [], total: 0, pages: 1, limit: cfg.reorder ? 200 : 15 };
    const filters = (cfg.filters || []).map((f) => `<select class="input" data-filter="${f.name}" aria-label="${esc(f.label)}">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`).join('');
    box.innerHTML = `${cfg.intro ? `<p class="desc" style="margin-bottom:1rem;color:var(--muted)">${esc(cfg.intro)}</p>` : ''}
      <div class="toolbar">${cfg.compact ? '' : `<div class="search">${icon('search')}<input class="input" type="search" placeholder="${esc(cfg.searchPlaceholder || 'Search')}" aria-label="Search" data-q /></div>${filters}`}
      <span class="grow"></span><button class="btn btn-primary" data-add>${icon('plus')} ${esc(cfg.addLabel || 'Add ' + cfg.singular)}</button></div>
      <div class="card table-card" data-tbl></div><div data-pg-box></div>`;
    const tbl = $('[data-tbl]', box), pg = $('[data-pg-box]', box);
    const filtering = () => !!st.q || Object.values(st.f).some(Boolean);

    async function load() {
      tbl.innerHTML = skeleton();
      try {
        const qs = new URLSearchParams({ limit: st.limit, page: st.page, ...(st.q ? { q: st.q } : {}), ...Object.fromEntries(Object.entries(st.f).filter(([, v]) => v)), ...(cfg.fixed || {}) });
        const d = await api('GET', `${cfg.endpoint}?${qs}`);
        Object.assign(st, { rows: d.items, total: d.total, pages: d.pages, page: d.page });
        draw();
      } catch (e) { tbl.innerHTML = errorState(e); pg.innerHTML = ''; }
    }
    function draw() {
      if (!st.rows.length) {
        tbl.innerHTML = filtering() ? empty('search', 'Nothing matches your search', 'Try different words or clear the filters.')
          : empty(cfg.emptyIcon || 'plus', `No ${cfg.plural || cfg.singular + 's'} yet`, cfg.emptyText || `Add your first ${cfg.singular} to get started.`, `<button class="btn btn-primary" data-add>${icon('plus')} Add ${esc(cfg.singular)}</button>`);
        pg.innerHTML = ''; return;
      }
      const canMove = cfg.reorder && !filtering();
      tbl.innerHTML = `<table class="tbl"><thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>${st.rows.map((r, i) => `<tr data-id="${r.id}">${cfg.columns.map((c, ci) => `<td class="${ci === 0 ? 'first' : ''}" data-label="${esc(c.label)}">${c.render(r, i)}</td>`).join('')}<td class="actions">
        ${cfg.reorder ? `<button class="icon-btn" data-act="up" aria-label="Move up" title="${canMove ? 'Move up' : 'Clear search and filters to reorder'}" ${!canMove || i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-btn" data-act="down" aria-label="Move down" title="${canMove ? 'Move down' : 'Clear search and filters to reorder'}" ${!canMove || i === st.rows.length - 1 ? 'disabled' : ''}>${icon('down')}</button>` : ''}
        ${cfg.feature ? `<button class="icon-btn ${r[cfg.feature.field] ? 'on' : ''}" data-act="feature" aria-label="${r[cfg.feature.field] ? 'Remove from featured' : 'Feature'}" title="${r[cfg.feature.field] ? 'Featured — click to remove' : 'Feature'}">${icon('star')}</button>` : ''}
        <button class="icon-btn" data-act="view" aria-label="View" title="View">${icon('eye')}</button>
        <button class="icon-btn" data-act="edit" aria-label="Edit" title="Edit">${icon('edit')}</button>
        ${cfg.toggle ? `<button class="btn btn-ghost btn-sm" data-act="toggle">${esc(cfg.toggle.isOn(r) ? cfg.toggle.offLabel : cfg.toggle.onLabel)}</button>` : ''}
        <button class="icon-btn danger" data-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>`;
      pg.innerHTML = cfg.reorder ? '' : pager(st, cfg.singular);
    }
    const rowOf = (el) => st.rows.find((r) => r.id === Number(el.closest('tr').dataset.id));

    function openForm(row) {
      const editing = !!row;
      formModal({ title: editing ? `Edit ${cfg.singular}` : `Add ${cfg.singular}`, fields: cfg.fields, size: cfg.modalSize || '',
        values: editing ? row : { ...(cfg.defaults ? cfg.defaults() : {}), ...(cfg.fixed && cfg.fixed.section ? { section: cfg.fixed.section } : {}) },
        submitText: editing ? 'Save changes' : `Add ${cfg.singular}`,
        async onSave(v) {
          await api(editing ? 'PUT' : 'POST', editing ? `${cfg.endpoint}/${row.id}` : cfg.endpoint, v);
          toast(editing ? `${cap(cfg.singular)} saved` : `${cap(cfg.singular)} added`); load();
        } });
    }
    function openView(row) {
      const rows = cfg.fields.filter((f) => f.type !== 'hidden').map((f) => {
        let v = row[f.name];
        if (f.type === 'checkbox') v = v ? 'Yes' : 'No';
        else if (f.type === 'select') v = (f.options.find(([o]) => o == v) || [, v])[1];
        else if (f.type === 'image') v = v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : '';
        else if (f.type === 'social') v = Object.entries(v || {}).map(([k, u]) => `${esc(k)}: ${esc(u)}`).join('\n');
        else if (f.type === 'url' || f.type === 'media') v = v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : '';
        else if (f.type === 'date') v = dateOnly(v);
        else v = esc(v);
        return `<dt>${esc(f.label)}</dt><dd>${v || '<span style="color:var(--faint)">Not set</span>'}</dd>`;
      }).join('');
      modal({ title: row[cfg.titleField || 'name'] || row.title || cap(cfg.singular), size: 'lg', body: `<dl class="dl">${rows}<dt>Last updated</dt><dd>${dt(row.updated_at)}</dd></dl>`,
        footer: `<button class="btn btn-ghost" data-close>Close</button>` });
    }
    async function act(a, row) {
      try {
        if (a === 'edit') return openForm(row);
        if (a === 'view') return openView(row);
        if (a === 'toggle') {
          const on = cfg.toggle.isOn(row);
          await api('PUT', `${cfg.endpoint}/${row.id}`, { [cfg.toggle.field]: on ? cfg.toggle.off : cfg.toggle.on });
          toast(on ? cfg.toggle.offDone : cfg.toggle.onDone); return load();
        }
        if (a === 'feature') {
          await api('PUT', `${cfg.endpoint}/${row.id}`, { [cfg.feature.field]: !row[cfg.feature.field] });
          toast(row[cfg.feature.field] ? 'Removed from featured' : 'Marked as featured'); return load();
        }
        if (a === 'delete') {
          const ok = await confirmDialog({ title: `Delete ${cfg.singular}?`, message: `“${row[cfg.titleField || 'name'] || row.title}” will be permanently deleted. This can’t be undone.`, confirmText: 'Delete', danger: true });
          if (!ok) return;
          await api('DELETE', `${cfg.endpoint}/${row.id}`); toast(`${cap(cfg.singular)} deleted`); return load();
        }
        if (a === 'up' || a === 'down') {
          const i = st.rows.findIndex((r) => r.id === row.id), j = a === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= st.rows.length) return;
          [st.rows[i], st.rows[j]] = [st.rows[j], st.rows[i]]; draw();
          try { await api('POST', `${cfg.endpoint}/reorder`, { ids: st.rows.map((r) => r.id) }); toast('Order saved'); }
          catch (e) { toast(e.message, 'err'); load(); }
        }
      } catch (e) { toast(e.message, 'err'); }
    }
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openForm(null);
      if (e.target.closest('[data-retry]')) return load();
      const p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); return load(); }
      const b = e.target.closest('[data-act]'); if (b && !b.disabled) { const row = rowOf(b); if (row) act(b.dataset.act, row); }
    });
    const q = $('[data-q]', box);
    if (q) q.addEventListener('input', debounce(() => { st.q = q.value.trim(); st.page = 1; load(); }));
    $$('[data-filter]', box).forEach((s) => s.addEventListener('change', () => { st.f[s.dataset.filter] = s.value; st.page = 1; load(); }));
    await load();
    if (params && params.get && params.get('new')) openForm(null);
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  W.cap = cap;
})();

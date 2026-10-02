/* WOD Admin — pages, router, boot */
(() => {
  'use strict';
  const W = window.WOD;
  const { $, $$, esc, dt, dateOnly, today, time12, debounce, icon, api, toast, modal, formModal, formHTML, readForm, showErrors, wireImages, skeleton, empty, errorState, badge, pager } = W;
  const confirmDialog = W.confirm;
  const P = W.pages;
  const stat = (s) => (s ? badge('Published', 'ok') : badge('Draft'));
  const act = (s) => (s ? badge('Active', 'ok') : badge('Disabled'));
  const thumb = (url, round, fallback = '') => `<div class="cell-thumb ${round ? 'round' : ''}" style="${url ? `background-image:url('${esc(url).replace(/'/g, '%27')}')` : ''}">${url ? '' : fallback}</div>`;
  const short = (s, n = 70) => (String(s || '').length > n ? esc(String(s).slice(0, n)) + '…' : esc(s || ''));
  const toggleBool = (field, onLabel, offLabel, onDone, offDone) => ({ field, on: 1, off: 0, isOn: (r) => !!r[field], onLabel, offLabel, onDone, offDone });

  /* ================= Dashboard ================= */
  P.dashboard = { title: 'Dashboard', async render(box) {
    box.innerHTML = skeleton();
    let d;
    try { d = await api('GET', '/api/dashboard'); } catch (e) { box.innerHTML = errorState(e); return; }
    const s = d.stats;
    const cards = [['Total sermons', s.sermons, '#/sermons'], ['Upcoming events', s.upcoming_events, '#/events'], ['Ministries', s.ministries, '#/ministries'], ['Leaders', s.leaders, '#/leadership'],
      ['Gallery items', s.gallery, '#/gallery'], ['Unread messages', s.unread_messages, '#/messages', s.unread_messages > 0], ['Active administrators', s.active_admins, '#/admins']];
    const st = d.storage;
    const banner = st.status === 'not_persistent'
      ? `<div class="banner danger" role="alert"><div>${icon('x')}</div><div><b>Data storage is not persistent</b>Anything you add can be lost when the server restarts or redeploys. ${esc(st.problems[0] || '')} See the README section “Deploying to Render”, or check Settings → Data and storage.</div></div>`
      : st.status === 'local' ? `<div class="banner warn"><div>${icon('settings')}</div><div><b>Running with local storage</b>This is fine for testing on a computer. Before going live on Render, follow the README to attach a Persistent Disk.</div></div>` : '';
    box.innerHTML = `${banner}
      <div class="stats">${cards.map(([l, n, href, alert]) => `<a class="card stat ${alert ? 'alert' : ''}" href="${href}"><div class="n">${n}</div><div class="l">${l}</div></a>`).join('')}</div>
      <div class="card card-pad" style="margin-bottom:1.25rem"><h2>Quick actions</h2><div class="actions-row" style="margin-top:.8rem">
        <a class="btn btn-primary" href="#/sermons?new=1">${icon('plus')} Add sermon</a><a class="btn btn-ghost" href="#/events?new=1">${icon('plus')} Add event</a>
        <a class="btn btn-ghost" href="#/gallery?upload=1">${icon('upload')} Upload photos</a><a class="btn btn-ghost" href="#/messages">${icon('mail')} Read messages</a>
        <a class="btn btn-ghost" href="#/homepage">${icon('home')} Edit homepage</a><a class="btn btn-ghost" href="#/admins?new=1">${icon('shield')} Add administrator</a></div></div>
      <div class="two-col">
        <div class="card"><div class="card-head"><h2>Recent sermons</h2><a href="#/sermons">View all</a></div>${d.recent_sermons.length ? `<ul class="mini-list">${d.recent_sermons.map((x) => `<li><div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.speaker || 'No speaker')} • ${dateOnly(x.preached_on)}</div></div>${stat(x.is_published)}</li>`).join('')}</ul>` : empty('mic', 'No sermons yet', 'Add a sermon to see it here.')}</div>
        <div class="card"><div class="card-head"><h2>Upcoming events</h2><a href="#/events">View all</a></div>${d.upcoming_events.length ? `<ul class="mini-list">${d.upcoming_events.map((x) => `<li><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${dateOnly(x.event_date)}${x.start_time ? ' • ' + time12(x.start_time) : ''}${x.location ? ' • ' + esc(x.location) : ''}</div></div></li>`).join('')}</ul>` : empty('calendar', 'No upcoming events', 'Events dated today or later appear here.', '<a class="btn btn-primary" href="#/events?new=1">Add event</a>')}</div>
        <div class="card"><div class="card-head"><h2>Recent messages</h2><a href="#/messages">Open inbox</a></div>${d.recent_messages.length ? `<ul class="mini-list">${d.recent_messages.map((x) => `<li><div class="grow"><div class="t">${esc(x.name)}${x.is_read ? '' : ' ' + badge('New', 'info')}</div><div class="s">${esc(x.subject || 'No subject')} — ${esc(String(x.message).slice(0, 60))}</div></div><span class="s">${dt(x.created_at)}</span></li>`).join('')}</ul>` : empty('mail', 'No messages yet', 'Messages sent from the website contact form appear here.')}</div>
        <div class="card"><div class="card-head"><h2>Recent activity</h2><a href="#/activity">View all</a></div>${d.recent_activity.length ? `<ul class="mini-list">${d.recent_activity.map((x) => `<li><div class="grow"><div class="t">${esc(x.action)}</div><div class="s">${esc(x.admin_name || x.admin_email || 'Unknown')}${x.details ? ' • ' + esc(x.details) : ''}</div></div><span class="s">${dt(x.created_at)}</span></li>`).join('')}</ul>` : empty('list', 'No activity yet', 'Actions by administrators are recorded here.')}</div>
      </div>`;
  } };

  /* ================= Resource pages ================= */
  P.sermons = { title: 'Sermons', render: W.resource({
    endpoint: '/api/sermons', singular: 'sermon', titleField: 'title', searchPlaceholder: 'Search title, speaker or series', emptyIcon: 'mic', modalSize: 'lg',
    filters: [{ name: 'status', label: 'Status', options: [['', 'All statuses'], ['published', 'Published'], ['draft', 'Drafts']] }, { name: 'featured', label: 'Featured', options: [['', 'All sermons'], ['1', 'Featured only']] }],
    columns: [
      { label: 'Sermon', render: (r) => `<div class="cell-main">${thumb(r.thumbnail_url, false, icon('mic'))}<div><div class="t">${esc(r.title)}</div><div class="s">${esc(r.series)}</div></div></div>` },
      { label: 'Speaker', render: (r) => esc(r.speaker) || '—' }, { label: 'Date', render: (r) => dateOnly(r.preached_on) },
      { label: 'Status', render: (r) => `<div class="badges">${stat(r.is_published)}${r.is_featured ? badge('Featured', 'info') : ''}</div>` }],
    feature: { field: 'is_featured' },
    toggle: toggleBool('is_published', 'Publish', 'Unpublish', 'Sermon published', 'Sermon unpublished'),
    defaults: () => ({ preached_on: today(), is_published: 1 }),
    fields: [
      { name: 'title', label: 'Title', required: true, max: 200 },
      { name: 'speaker', label: 'Speaker', half: true, max: 120 }, { name: 'preached_on', label: 'Date', type: 'date', required: true, half: true },
      { name: 'series', label: 'Series or category', half: true, max: 120, placeholder: 'e.g. Prayer Series' }, { name: 'duration', label: 'Length', half: true, max: 40, placeholder: 'e.g. 48 min' },
      { name: 'description', label: 'Description', type: 'textarea' }, { name: 'thumbnail_url', label: 'Thumbnail', type: 'image' },
      { name: 'video_url', label: 'Video', type: 'media', kind: 'video', help: 'Upload an MP4, WebM or MOV file, or paste a link (e.g. YouTube).' },
      { name: 'audio_url', label: 'Audio', type: 'media', kind: 'audio', help: 'Upload an MP3, M4A, WAV, OGG or AAC file, or paste a link.' },
      { name: 'is_featured', label: 'Feature this sermon', type: 'checkbox', help: 'Featured sermons appear first on the homepage.' },
      { name: 'is_published', label: 'Published', type: 'checkbox', help: 'Turn off to keep it as a draft that visitors cannot see.' }],
  }) };

  const evStatus = { published: ['Published', 'ok'], draft: ['Draft', ''], cancelled: ['Cancelled', 'bad'] };
  P.events = { title: 'Events', render: W.resource({
    endpoint: '/api/events', singular: 'event', titleField: 'name', searchPlaceholder: 'Search events', emptyIcon: 'calendar', modalSize: 'lg',
    filters: [{ name: 'when', label: 'When', options: [['', 'All dates'], ['upcoming', 'Upcoming'], ['past', 'Past']] }, { name: 'status', label: 'Status', options: [['', 'All statuses'], ['published', 'Published'], ['draft', 'Drafts'], ['cancelled', 'Cancelled']] }],
    columns: [
      { label: 'Event', render: (r) => `<div class="cell-main">${thumb(r.image_url, false, icon('calendar'))}<div><div class="t">${esc(r.name)}</div><div class="s">${esc(r.location)}</div></div></div>` },
      { label: 'Date', render: (r) => `${dateOnly(r.event_date)}<div class="s" style="color:var(--muted);font-size:.84rem">${r.start_time ? time12(r.start_time) + (r.end_time ? ' – ' + time12(r.end_time) : '') : esc(r.extra_info)}</div>` },
      { label: 'Category', render: (r) => (r.category ? badge(r.category, 'info') : '—') },
      { label: 'Status', render: (r) => `<div class="badges">${badge(...evStatus[r.status])}${r.event_date < today() ? badge('Past') : ''}</div>` }],
    toggle: { field: 'status', on: 'published', off: 'draft', isOn: (r) => r.status === 'published', onLabel: 'Publish', offLabel: 'Unpublish', onDone: 'Event published', offDone: 'Event unpublished' },
    defaults: () => ({ event_date: today(), status: 'published' }),
    fields: [
      { name: 'name', label: 'Event name', required: true, max: 200 },
      { name: 'event_date', label: 'Date', type: 'date', required: true, half: true, cols: 3 }, { name: 'start_time', label: 'Start time', type: 'time', half: true, cols: 3 }, { name: 'end_time', label: 'End time', type: 'time', half: true, cols: 3 },
      { name: 'location', label: 'Location', max: 200, half: true }, { name: 'category', label: 'Badge label', max: 60, half: true, placeholder: 'e.g. Youth, Outreach' },
      { name: 'extra_info', label: 'Extra info', max: 200, help: 'Shown after the location, e.g. “After 9:30 AM service”.' },
      { name: 'description', label: 'Description', type: 'textarea' }, { name: 'image_url', label: 'Image', type: 'image' },
      { name: 'registration_url', label: 'Registration link', type: 'url', max: 2000, help: 'Optional. Makes the event name a link on the website.' },
      { name: 'status', label: 'Status', type: 'select', options: [['published', 'Published — visible on the website'], ['draft', 'Draft — hidden'], ['cancelled', 'Cancelled — hidden']] }],
  }) };

  const ministriesCfg = {
    endpoint: '/api/ministries', singular: 'ministry', plural: 'ministries', titleField: 'name', searchPlaceholder: 'Search ministries', emptyIcon: 'users', reorder: true, modalSize: 'lg',
    filters: [{ name: 'status', label: 'Status', options: [['', 'All'], ['active', 'Active'], ['disabled', 'Disabled']] }],
    columns: [
      { label: 'Order', render: (r, i) => i + 1 },
      { label: 'Ministry', render: (r) => `<div class="cell-main">${thumb(r.image_url, false, esc(r.icon))}<div><div class="t">${esc(r.name)}</div><div class="s clip">${short(r.description)}</div></div></div>` },
      { label: 'Leader', render: (r) => esc(r.leader_name) || '—' }, { label: 'Meets', render: (r) => `<span class="clip" style="display:block">${esc(r.meeting_info) || '—'}</span>` }, { label: 'Status', render: (r) => act(r.is_active) }],
    toggle: toggleBool('is_active', 'Enable', 'Disable', 'Ministry enabled', 'Ministry disabled'),
    fields: [
      { name: 'name', label: 'Ministry name', required: true, max: 120 }, { name: 'icon', label: 'Icon', half: true, max: 16, help: 'An emoji, e.g. 🙏' }, { name: 'leader_name', label: 'Leader', half: true, max: 120 },
      { name: 'description', label: 'Description', type: 'textarea', max: 2000 }, { name: 'image_url', label: 'Image (replaces the icon)', type: 'image' },
      { name: 'meeting_info', label: 'Meeting information', max: 300, placeholder: 'e.g. Fridays at 6 PM' }, { name: 'contact_info', label: 'Contact information', max: 300 },
      { name: 'is_active', label: 'Active', type: 'checkbox', help: 'Turn off to hide this ministry from the website.' }],
    defaults: () => ({ is_active: 1 }),
  };
  P.ministries = { title: 'Ministries', render: W.resource(ministriesCfg) };

  P.leadership = { title: 'Leadership', render: W.resource({
    endpoint: '/api/leaders', singular: 'leader', titleField: 'name', searchPlaceholder: 'Search leaders', emptyIcon: 'user', reorder: true, modalSize: 'lg',
    filters: [{ name: 'status', label: 'Status', options: [['', 'All'], ['active', 'Active'], ['disabled', 'Disabled']] }],
    columns: [
      { label: 'Order', render: (r, i) => i + 1 },
      { label: 'Leader', render: (r) => `<div class="cell-main">${thumb(r.image_url, true, icon('user'))}<div><div class="t">${esc(r.name)}</div><div class="s">${esc(r.position)}</div></div></div>` },
      { label: 'Biography', render: (r) => `<span class="clip" style="display:block">${short(r.bio, 80) || '—'}</span>` }, { label: 'Status', render: (r) => act(r.is_active) }],
    toggle: toggleBool('is_active', 'Enable', 'Disable', 'Leader enabled', 'Leader disabled'),
    defaults: () => ({ is_active: 1, social_links: {} }),
    fields: [
      { name: 'name', label: 'Name', required: true, max: 120, half: true }, { name: 'position', label: 'Position or title', max: 120, half: true },
      { name: 'bio', label: 'Biography', type: 'textarea', rows: 6, max: 3000 }, { name: 'image_url', label: 'Profile image', type: 'image' },
      { name: 'social_links', label: 'Social links', type: 'social' }, { name: 'is_active', label: 'Active', type: 'checkbox', help: 'Turn off to hide this person from the website.' }],
  }) };

  /* ================= Homepage ================= */
  const pillarCfg = (section, singular) => ({
    endpoint: '/api/pillars', singular, plural: singular + 's', titleField: 'title', emptyIcon: 'star', reorder: true, compact: true, fixed: { section },
    columns: [{ label: 'Order', render: (r, i) => i + 1 }, { label: singular === 'core value' ? 'Core value' : 'Pillar', render: (r) => `<div class="cell-main">${r.icon ? `<div class="cell-thumb" style="font-size:1.1rem">${esc(r.icon)}</div>` : ''}<div><div class="t">${esc(r.title)}</div><div class="s clip">${short(r.description, 80)}</div></div></div>` }, { label: 'Status', render: (r) => act(r.is_active) }],
    toggle: toggleBool('is_active', 'Enable', 'Disable', 'Enabled', 'Disabled'),
    defaults: () => ({ is_active: 1, section }),
    fields: [{ name: 'section', type: 'hidden' }, ...(section === 'pillar' ? [{ name: 'icon', label: 'Icon', max: 16, help: 'A symbol or emoji, e.g. ✦', half: true }] : []), { name: 'title', label: 'Title', required: true, max: 120, half: section === 'pillar' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, max: 600 }, { name: 'is_active', label: 'Active', type: 'checkbox' }],
  });
  const HOME_SECTIONS = [
    ['Hero', 'The large banner at the top of the homepage. It currently shows the video only; fill in text to add a heading and buttons over it.', [
      { name: 'hero_badge', label: 'Badge (small text above the heading)', max: 200 }, { name: 'hero_heading', label: 'Heading', max: 200, help: 'Put *asterisks* around words to italicise them. A new line starts a new row.', type: 'textarea', rows: 2 },
      { name: 'hero_description', label: 'Description', type: 'textarea', rows: 3, max: 1000 },
      { name: 'hero_btn1_text', label: 'First button text', half: true, max: 60 }, { name: 'hero_btn1_url', label: 'First button link', half: true, max: 2000, placeholder: 'contact.html or https://…' },
      { name: 'hero_btn2_text', label: 'Second button text', half: true, max: 60 }, { name: 'hero_btn2_url', label: 'Second button link', half: true, max: 2000 },
      { name: 'hero_video_url', label: 'Background video address', max: 2000, help: 'e.g. vid1.mp4 or a full https:// address to an .mp4 file.' }, { name: 'hero_image_url', label: 'Background image', type: 'image', help: 'Used behind the video, or on its own if the video address is empty.' }]],
    ['About', 'The “Who we are” section on the homepage and the About page.', [
      { name: 'about_label', label: 'Small label', max: 100, half: true }, { name: 'about_stat_number', label: 'Highlight number', max: 20, half: true, help: 'e.g. 6+' },
      { name: 'about_stat_label', label: 'Highlight label', max: 80, help: 'e.g. Years of Ministry' },
      { name: 'about_heading', label: 'Heading', type: 'textarea', rows: 2, max: 200, help: 'Put *asterisks* around words to italicise them.' },
      { name: 'about_description', label: 'Description (homepage)', type: 'textarea', rows: 4, max: 2000 }, { name: 'about_page_description', label: 'Description (About page)', type: 'textarea', rows: 4, max: 2000 },
      { name: 'about_image', label: 'About image', type: 'image' }, { name: 'about_hero_image', label: 'About page banner image', type: 'image' },
      { name: 'about_hero_description', label: 'About page banner text', type: 'textarea', rows: 2, max: 1000 },
      { name: 'journey_heading', label: 'Our journey heading', max: 200 }, { name: 'journey_text', label: 'Our journey text', type: 'textarea', rows: 4, max: 2000 }]],
    ['Mission, vision and values', 'Shown on the homepage and the About page.', [
      { name: 'mission_text', label: 'Mission (short)', type: 'textarea', rows: 3, max: 2000 }, { name: 'vision_text', label: 'Vision (short)', type: 'textarea', rows: 3, max: 2000 },
      { name: 'values_text', label: 'Values', type: 'textarea', rows: 4, max: 2000 },
      { name: 'mission_card_text', label: 'Mission (About page card)', type: 'textarea', rows: 4, max: 2000 }, { name: 'vision_card_text', label: 'Vision (About page card)', type: 'textarea', rows: 4, max: 2000 }]],
    ['Other images', '', [{ name: 'leadership_group_image', label: 'Leadership page group photo', type: 'image' }]],
  ];
  P.homepage = { title: 'Homepage', async render(box) {
    box.innerHTML = skeleton();
    let d; try { d = await api('GET', '/api/homepage'); } catch (e) { box.innerHTML = errorState(e); return; }
    box.innerHTML = `<div class="page-head"><div><p>Edit the text and images on the homepage and About page. Changes go live as soon as you save.</p></div><a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${icon('ext')} View website</a></div><div class="stack-lg" id="sections"></div>`;
    const wrap = $('#sections', box);
    HOME_SECTIONS.forEach(([title, desc, fields], i) => {
      const c = document.createElement('form'); c.className = 'card card-pad'; c.noValidate = true;
      c.innerHTML = `<h2>${esc(title)}</h2>${desc ? `<p class="desc">${esc(desc)}</p>` : '<div style="height:.8rem"></div>'}<div class="inline-error" data-top hidden></div>${formHTML(fields, d.content, 'h' + i)}<button class="btn btn-primary" type="submit">Save ${esc(title.toLowerCase())}</button>`;
      wireImages(c);
      c.addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = $('button[type=submit]', c), top = $('[data-top]', c); top.hidden = true; btn.disabled = true; btn.classList.add('loading');
        try { await api('PUT', '/api/homepage', { content: readForm(c, fields) }); toast(`${title} saved`); showErrors(c, {}); }
        catch (err) { if (!showErrors(c, err)) { top.textContent = err.message; top.hidden = false; } toast(err.message, 'err'); }
        btn.disabled = false; btn.classList.remove('loading');
      });
      wrap.appendChild(c);
    });
    const lists = [['Vision pillars', 'The four short statements in the strip below the hero.', pillarCfg('pillar', 'pillar')], ['Core values', 'Shown on the About page. Numbers are added automatically in order.', pillarCfg('core_value', 'core value')]];
    for (const [title, desc, cfg] of lists) {
      const c = document.createElement('div'); c.className = 'card card-pad'; c.innerHTML = `<h2>${title}</h2><p class="desc">${desc}</p><div data-list></div>`;
      wrap.appendChild(c); await W.resource(cfg)($('[data-list]', c));
    }
  } };

  /* ================= Gallery ================= */
  P.gallery = { title: 'Gallery', async render(box, params) {
    const st = { q: '', page: 1, category: '', status: '', items: [], cats: [], pages: 1, total: 0 };
    box.innerHTML = `<div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search captions" aria-label="Search" data-q /></div>
      <select class="input" data-cat aria-label="Category"><option value="">All categories</option></select>
      <select class="input" data-status aria-label="Status"><option value="">All</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
      <span class="grow"></span><button class="btn btn-primary" data-upload>${icon('upload')} Upload images</button></div><div data-grid></div><div data-pg-box></div>`;
    const grid = $('[data-grid]', box), pg = $('[data-pg-box]', box);
    async function load() {
      grid.innerHTML = `<div class="card">${skeleton()}</div>`;
      try {
        const qs = new URLSearchParams({ page: st.page, ...(st.q && { q: st.q }), ...(st.category && { category: st.category }), ...(st.status && { status: st.status }) });
        const d = await api('GET', '/api/gallery?' + qs); Object.assign(st, { items: d.items, pages: d.pages, page: d.page, total: d.total, cats: d.categories });
        const sel = $('[data-cat]', box); sel.innerHTML = '<option value="">All categories</option>' + st.cats.map((c) => `<option ${c === st.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
        draw();
      } catch (e) { grid.innerHTML = `<div class="card">${errorState(e)}</div>`; }
    }
    function draw() {
      if (!st.items.length) { grid.innerHTML = `<div class="card">${st.q || st.category || st.status ? empty('search', 'No photos match', 'Try a different search or filter.') : empty('image', 'No photos yet', 'Upload photos to show them on the website’s Gallery page. The Gallery link appears in the site menu once there is at least one active photo.', `<button class="btn btn-primary" data-upload>${icon('upload')} Upload images</button>`)}</div>`; pg.innerHTML = ''; return; }
      grid.innerHTML = `<div class="gal-grid">${st.items.map((g) => `<div class="card gal-item ${g.is_active ? '' : 'off'}" data-id="${g.id}"><button class="ph" data-act="view" aria-label="Preview ${esc(g.caption || g.file_name)}" style="background-image:url('${esc(g.image_url)}')">${g.is_active ? '' : badge('Disabled')}</button>
        <div class="meta"><div class="t">${esc(g.caption) || '<span style="color:var(--faint);font-weight:400">No caption</span>'}</div><div class="s">${esc(g.category) || 'Uncategorised'}</div></div>
        <div class="btns"><button class="icon-btn" data-act="edit" aria-label="Edit" title="Edit">${icon('edit')}</button><button class="icon-btn" data-act="toggle" aria-label="${g.is_active ? 'Disable' : 'Enable'}" title="${g.is_active ? 'Disable' : 'Enable'}">${icon(g.is_active ? 'eye' : 'check')}</button><button class="icon-btn danger" data-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button></div></div>`).join('')}</div>`;
      pg.innerHTML = pager(st, 'photo');
    }
    function uploadModal() {
      let files = [];
      const m = modal({ title: 'Upload images', size: 'lg', body: `<div class="inline-error" data-top hidden></div><div class="drop" tabindex="0" role="button" data-drop><b>Choose images</b> or drag them here<br><small>JPG, PNG, GIF or WebP. Up to 20 at a time.</small><input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" hidden /></div><div class="previews" data-prev></div>
        <div class="grid2"><div class="field"><label for="g_cap">Caption (applies to all)</label><input class="input" id="g_cap" maxlength="300" /></div><div class="field"><label for="g_cat">Category</label><input class="input" id="g_cat" list="g_cats" maxlength="60" placeholder="e.g. Worship, Outreach" /><datalist id="g_cats">${st.cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div></div>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-go disabled>Upload</button>` });
      const drop = $('[data-drop]', m.el), inp = $('input[type=file]', m.el), prev = $('[data-prev]', m.el), go = $('[data-go]', m.el), top = $('[data-top]', m.el);
      const OK = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const paint = () => { prev.innerHTML = files.map((f, i) => `<div class="p" style="background-image:url('${URL.createObjectURL(f)}')"><button type="button" data-rm="${i}" aria-label="Remove">×</button></div>`).join(''); go.disabled = !files.length; go.textContent = files.length ? `Upload ${files.length} image${files.length > 1 ? 's' : ''}` : 'Upload'; };
      const add = (list) => { top.hidden = true; const bad = []; Array.from(list).forEach((f) => (OK.includes(f.type) ? files.push(f) : bad.push(f.name))); files = files.slice(0, 20); if (bad.length) { top.textContent = `Not an image we accept: ${bad.join(', ')}. Use JPG, PNG, GIF or WebP.`; top.hidden = false; } paint(); };
      drop.onclick = () => inp.click(); drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
      inp.onchange = () => { add(inp.files); inp.value = ''; };
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (e) => add(e.dataTransfer.files));
      prev.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(Number(b.dataset.rm), 1); paint(); } };
      go.onclick = async () => {
        const fd = new FormData(); files.forEach((f) => fd.append('images', f)); fd.append('caption', $('#g_cap', m.el).value); fd.append('category', $('#g_cat', m.el).value);
        go.disabled = true; go.classList.add('loading'); top.hidden = true;
        try { const r = await api('POST', '/api/gallery', fd); toast(`${r.items.length} image${r.items.length > 1 ? 's' : ''} uploaded`); m.close(); st.page = 1; load(); }
        catch (e) { top.textContent = e.message; top.hidden = false; go.disabled = false; go.classList.remove('loading'); }
      };
    }
    box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-upload]')) return uploadModal();
      if (e.target.closest('[data-retry]')) return load();
      const p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); return load(); }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const g = st.items.find((x) => x.id === Number(b.closest('[data-id]').dataset.id)); if (!g) return;
      try {
        if (b.dataset.act === 'view') modal({ title: g.caption || g.file_name || 'Photo', size: 'lg', body: `<img src="${esc(g.image_url)}" alt="${esc(g.caption)}" style="max-width:100%;border-radius:10px;display:block;margin:auto" /><p class="desc" style="margin-top:.8rem">${esc(g.file_name)} • ${(g.size_bytes / 1024).toFixed(0)} KB • uploaded ${dt(g.created_at)}</p>`, footer: '<button class="btn btn-ghost" data-close>Close</button>' });
        if (b.dataset.act === 'edit') formModal({ title: 'Edit photo', values: g, submitText: 'Save changes', extraTop: `<img src="${esc(g.image_url)}" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-bottom:1rem" />`,
          fields: [{ name: 'caption', label: 'Caption', max: 300 }, { name: 'category', label: 'Category', max: 60 }, { name: 'is_active', label: 'Active', type: 'checkbox', help: 'Turn off to hide this photo from the website.' }],
          async onSave(v) { await api('PUT', `/api/gallery/${g.id}`, v); toast('Photo saved'); load(); } });
        if (b.dataset.act === 'toggle') { await api('PUT', `/api/gallery/${g.id}`, { is_active: !g.is_active }); toast(g.is_active ? 'Photo disabled' : 'Photo enabled'); load(); }
        if (b.dataset.act === 'delete' && await confirmDialog({ title: 'Delete photo?', message: 'This photo will be permanently deleted from the gallery and the server. This can’t be undone.', confirmText: 'Delete', danger: true })) {
          await api('DELETE', `/api/gallery/${g.id}`); toast('Photo deleted'); load();
        }
      } catch (err) { toast(err.message, 'err'); }
    });
    $('[data-q]', box).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }));
    $('[data-cat]', box).addEventListener('change', (e) => { st.category = e.target.value; st.page = 1; load(); });
    $('[data-status]', box).addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; load(); });
    await load();
    if (params.get('upload')) uploadModal();
  } };

  /* ================= Messages ================= */
  P.messages = { title: 'Messages', async render(box) {
    const st = { q: '', status: '', subject: '', page: 1, items: [], pages: 1, total: 0 };
    box.innerHTML = `<div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search name, email or message" aria-label="Search" data-q /></div>
      <select class="input" data-status aria-label="Status"><option value="">All messages</option><option value="unread">Unread</option><option value="read">Read</option></select>
      <select class="input" data-subject aria-label="Topic"><option value="">All topics</option></select><span class="grow"></span><span data-count style="color:var(--muted)"></span></div>
      <div class="card table-card" data-tbl></div><div data-pg-box></div>`;
    const tbl = $('[data-tbl]', box), pg = $('[data-pg-box]', box);
    async function load() {
      tbl.innerHTML = skeleton();
      try {
        const qs = new URLSearchParams({ page: st.page, ...(st.q && { q: st.q }), ...(st.status && { status: st.status }), ...(st.subject && { subject: st.subject }) });
        const d = await api('GET', '/api/messages?' + qs); Object.assign(st, { items: d.items, pages: d.pages, page: d.page, total: d.total }); setUnread(d.unread);
        $('[data-count]', box).textContent = `${d.unread} unread`;
        $('[data-subject]', box).innerHTML = '<option value="">All topics</option>' + d.subjects.map((s) => `<option ${s === st.subject ? 'selected' : ''}>${esc(s)}</option>`).join('');
        draw();
      } catch (e) { tbl.innerHTML = errorState(e); }
    }
    function draw() {
      if (!st.items.length) { tbl.innerHTML = st.q || st.status || st.subject ? empty('search', 'No messages match', 'Try a different search or filter.') : empty('mail', 'No messages yet', 'Messages sent through the website contact form will appear here.'); pg.innerHTML = ''; return; }
      tbl.innerHTML = `<table class="tbl"><thead><tr><th>From</th><th>Topic</th><th>Message</th><th>Received</th><th></th></tr></thead><tbody>${st.items.map((m) => `<tr class="${m.is_read ? '' : 'unread'}" data-id="${m.id}"><td class="first"><div class="t">${esc(m.name)}${m.is_read ? '' : ' ' + badge('New', 'info')}</div><div class="s" style="color:var(--muted);font-size:.84rem">${esc(m.email)}</div></td><td data-label="Topic">${esc(m.subject) || '—'}</td><td data-label="Message"><span class="clip" style="display:block">${esc(m.message)}</span></td><td data-label="Received">${dt(m.created_at)}</td>
        <td class="actions"><button class="icon-btn" data-act="open" aria-label="Open" title="Open">${icon('eye')}</button><button class="icon-btn" data-act="read" aria-label="${m.is_read ? 'Mark unread' : 'Mark read'}" title="${m.is_read ? 'Mark unread' : 'Mark read'}">${icon(m.is_read ? 'mail' : 'check')}</button><button class="icon-btn danger" data-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>`;
      pg.innerHTML = pager(st, 'message');
    }
    const setRead = async (m, v) => { await api('PUT', `/api/messages/${m.id}`, { is_read: v }); m.is_read = v ? 1 : 0; };
    async function open(m) {
      if (!m.is_read) { try { await setRead(m, true); load(); } catch (e) { toast(e.message, 'err'); } }
      const md = modal({ title: m.subject || 'Message', size: 'lg', body: `<dl class="dl"><dt>From</dt><dd>${esc(m.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>${m.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(m.phone.replace(/[^\d+]/g, ''))}">${esc(m.phone)}</a></dd>` : ''}<dt>Received</dt><dd>${dt(m.created_at)}</dd></dl><div class="msg-body">${esc(m.message)}</div>`,
        footer: `<button class="btn btn-ghost" data-unread>Mark unread</button><button class="btn btn-danger" data-del>Delete</button><a class="btn btn-primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + (m.subject || 'Your message to World of Discipline'))}">Reply by email</a>` });
      $('[data-unread]', md.el).onclick = async () => { try { await setRead(m, false); toast('Marked as unread'); md.close(); load(); } catch (e) { toast(e.message, 'err'); } };
      $('[data-del]', md.el).onclick = async () => { md.close(); await del(m); };
    }
    async function del(m) {
      if (!(await confirmDialog({ title: 'Delete message?', message: `The message from ${m.name} will be permanently deleted.`, confirmText: 'Delete', danger: true }))) return;
      try { await api('DELETE', `/api/messages/${m.id}`); toast('Message deleted'); load(); } catch (e) { toast(e.message, 'err'); }
    }
    box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-retry]')) return load();
      const p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); return load(); }
      const b = e.target.closest('[data-act]'), row = e.target.closest('tr[data-id]');
      if (!row) return; const m = st.items.find((x) => x.id === Number(row.dataset.id));
      if (!b) { if (!e.target.closest('a')) open(m); return; }
      if (b.dataset.act === 'open') open(m);
      if (b.dataset.act === 'delete') del(m);
      if (b.dataset.act === 'read') { try { const was = m.is_read; await setRead(m, !was); toast(was ? 'Marked as unread' : 'Marked as read'); load(); } catch (err) { toast(err.message, 'err'); } }
    });
    $('[data-q]', box).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }));
    $('[data-status]', box).addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; load(); });
    $('[data-subject]', box).addEventListener('change', (e) => { st.subject = e.target.value; st.page = 1; load(); });
    await load();
  } };

  /* ================= repeater (used by Giving) ================= */
  let repN = 0;
  function repeater(host, items, fields, itemLabel) {
    const pfx = 'r' + (++repN) + '_';
    let rows = items.map((x) => ({ ...x }));
    const draw = () => {
      host.innerHTML = `<div class="rep">${rows.map((r, i) => `<div class="rep-item" data-i="${i}"><div class="rep-tools"><button type="button" class="icon-btn" data-m="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button type="button" class="icon-btn" data-m="1" aria-label="Move down" ${i === rows.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button type="button" class="icon-btn danger" data-rm aria-label="Remove ${esc(itemLabel)}">${icon('trash')}</button></div>${formHTML(fields, r, pfx + i)}</div>`).join('')}</div><button type="button" class="btn btn-ghost btn-sm" data-add>${icon('plus')} Add ${esc(itemLabel)}</button>`;
    };
    const sync = () => $$('.rep-item', host).forEach((el) => { rows[Number(el.dataset.i)] = readForm({ elements: Object.fromEntries($$('[name]', el).map((n) => [n.name, n])) }, fields); });
    host.addEventListener('click', (e) => {
      const it = e.target.closest('.rep-item'); const add = e.target.closest('[data-add]');
      if (!it && !add) return; sync();
      if (add) rows.push(Object.fromEntries(fields.map((f) => [f.name, '']))); else {
        const i = Number(it.dataset.i);
        if (e.target.closest('[data-rm]')) rows.splice(i, 1);
        const mv = e.target.closest('[data-m]'); if (mv) { const j = i + Number(mv.dataset.m); [rows[i], rows[j]] = [rows[j], rows[i]]; }
      }
      draw();
    });
    draw();
    return () => { sync(); return rows; };
  }

  /* ================= Giving ================= */
  P.giving = { title: 'Giving', async render(box) {
    box.innerHTML = skeleton();
    let g; try { g = await api('GET', '/api/giving'); } catch (e) { box.innerHTML = errorState(e); return; }
    const head = [{ name: 'giving_label', label: 'Small label', max: 100, half: true }, { name: 'giving_heading', label: 'Heading', max: 200, half: true, help: 'Use *asterisks* to italicise.' }, { name: 'giving_intro', label: 'Introduction', type: 'textarea', rows: 3, max: 1000 }];
    const verse = [{ name: 'verse_text', label: 'Scripture', type: 'textarea', rows: 2, max: 500 }, { name: 'verse_cite', label: 'Reference', max: 100 }];
    const cardF = [{ name: 'icon', label: 'Icon', max: 16, half: true }, { name: 'name', label: 'Name', max: 120, half: true }, { name: 'description', label: 'Description', type: 'textarea', rows: 3, max: 600 }, { name: 'button', label: 'Button text', max: 60 }];
    const kv = [{ name: 'label', label: 'Label', max: 80, half: true }, { name: 'value', label: 'Details', max: 200, half: true }];
    box.innerHTML = `<div class="banner warn"><div>${icon('heart')}</div><div><b>These details are shown publicly on the website</b>Check every bank and mobile money detail carefully before saving. Only enter information WOD wants the public to see.</div></div>
      <form class="stack-lg" novalidate><div class="card card-pad"><h2>Heading and introduction</h2><div style="height:.8rem"></div>${formHTML(head, g, 'gv')}</div>
      <div class="card card-pad"><h2>Ways to give</h2><p class="desc">The cards at the top of the giving section.</p><div data-cards></div></div>
      <div class="card card-pad"><h2>Bank account</h2><div style="height:.8rem"></div><div class="field"><label for="bt">Section title</label><input class="input" id="bt" maxlength="100" value="${esc(g.bank_title)}" /></div><div data-bank></div></div>
      <div class="card card-pad"><h2>Mobile money</h2><div style="height:.8rem"></div><div class="field"><label for="mt">Section title</label><input class="input" id="mt" maxlength="100" value="${esc(g.momo_title)}" /></div><div data-momo></div></div>
      <div class="card card-pad"><h2>Scripture</h2><div style="height:.8rem"></div>${formHTML(verse, g, 'vs')}</div>
      <div class="inline-error" data-top hidden></div><div><button class="btn btn-primary" type="submit">Save giving information</button></div></form>`;
    const form = $('form', box), top = $('[data-top]', box);
    const cards = repeater($('[data-cards]', box), g.giving_cards || [], cardF, 'option');
    const bank = repeater($('[data-bank]', box), g.bank_details || [], kv, 'detail');
    const momo = repeater($('[data-momo]', box), g.momo_details || [], kv, 'detail');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('button[type=submit]', form); top.hidden = true; btn.disabled = true; btn.classList.add('loading');
      try {
        await api('PUT', '/api/giving', { ...readForm(form, [...head, ...verse]), bank_title: $('#bt', form).value, momo_title: $('#mt', form).value, giving_cards: cards(), bank_details: bank(), momo_details: momo() });
        toast('Giving information saved'); showErrors(form, {});
      } catch (err) { if (!showErrors(form, err)) { top.textContent = err.message; top.hidden = false; } toast(err.message, 'err'); }
      btn.disabled = false; btn.classList.remove('loading');
    });
  } };

  /* ================= Admins ================= */
  P.admins = { title: 'Administrators', async render(box, params) {
    let items = [];
    box.innerHTML = `<div class="page-head"><p>Everyone here has full access. Each person signs in with their own account, and their actions are recorded in the activity log.</p><button class="btn btn-primary" data-add>${icon('plus')} Add administrator</button></div><div class="card table-card" data-tbl></div>`;
    const tbl = $('[data-tbl]', box), me = W.state.admin;
    async function load() {
      tbl.innerHTML = skeleton();
      try { items = (await api('GET', '/api/admins')).items; } catch (e) { tbl.innerHTML = errorState(e); return; }
      tbl.innerHTML = `<table class="tbl"><thead><tr><th>Administrator</th><th>Status</th><th>Last sign-in</th><th>Added</th><th></th></tr></thead><tbody>${items.map((a) => `<tr data-id="${a.id}"><td class="first"><div class="cell-main"><div class="avatar">${esc(a.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</div><div><div class="t">${esc(a.name)}${a.id === me.id ? ' ' + badge('You', 'info') : ''}</div><div class="s" style="color:var(--muted);font-size:.84rem">${esc(a.email)}</div></div></div></td>
        <td data-label="Status">${a.is_active ? badge('Active', 'ok') : badge('Disabled', 'bad')}</td><td data-label="Last sign-in">${a.last_login_at ? dt(a.last_login_at) : 'Never'}</td><td data-label="Added">${dt(a.created_at)}</td>
        <td class="actions"><button class="icon-btn" data-act="edit" aria-label="Edit" title="Edit">${icon('edit')}</button><button class="btn btn-ghost btn-sm" data-act="toggle">${a.is_active ? 'Disable' : 'Enable'}</button><button class="icon-btn danger" data-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>`;
    }
    const nameEmail = [{ name: 'name', label: 'Full name', required: true, max: 120 }, { name: 'email', label: 'Email', type: 'email', required: true, max: 254 }];
    const pw = (req) => ({ name: 'password', label: req ? 'Password' : 'New password (leave blank to keep the current one)', type: 'password', required: req, max: 200, help: 'At least 10 characters, with letters and numbers.' });
    const addAdmin = () => formModal({ title: 'Add administrator', fields: [...nameEmail, pw(true)], submitText: 'Add administrator', size: 'sm',
      async onSave(v) { await api('POST', '/api/admins', v); toast('Administrator added'); load(); } });
    box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-add]')) return addAdmin();
      if (e.target.closest('[data-retry]')) return load();
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = items.find((x) => x.id === Number(b.closest('tr').dataset.id));
      try {
        if (b.dataset.act === 'edit') formModal({ title: 'Edit administrator', values: a, fields: [...nameEmail, pw(false)], submitText: 'Save changes', size: 'sm',
          async onSave(v) { if (!v.password) delete v.password; await api('PUT', `/api/admins/${a.id}`, v); toast(v.password ? 'Administrator saved and password reset' : 'Administrator saved'); load(); if (a.id === me.id) refreshMe(); } });
        if (b.dataset.act === 'toggle') {
          if (a.is_active && !(await confirmDialog({ title: 'Disable administrator?', message: `${a.name} will be signed out and won’t be able to sign in until you enable the account again.`, confirmText: 'Disable', danger: true }))) return;
          await api('PUT', `/api/admins/${a.id}`, { is_active: !a.is_active }); toast(a.is_active ? 'Administrator disabled' : 'Administrator enabled'); load();
        }
        if (b.dataset.act === 'delete' && await confirmDialog({ title: 'Delete administrator?', message: `${a.name} (${a.email}) will be permanently deleted${a.id === me.id ? ' — this is your own account, and you will be signed out' : ''}. Their past actions stay in the activity log.`, confirmText: 'Delete', danger: true })) {
          await api('DELETE', `/api/admins/${a.id}`); toast('Administrator deleted'); if (a.id === me.id) return location.replace('/admin/login.html'); load();
        }
      } catch (err) { toast(err.message, 'err'); }
    });
    await load();
    if (params.get('new')) addAdmin();
  } };

  /* ================= Settings ================= */
  const SETTINGS_F = [{ name: 'church_name', label: 'Church name', max: 120 }, { name: 'footer_tagline', label: 'Footer tagline', type: 'textarea', rows: 2, max: 300 },
    { name: 'address', label: 'Address', type: 'textarea', rows: 2, max: 300, help: 'Shown on the Contact page. A new line starts a new row.' },
    { name: 'phone_1', label: 'Phone number 1', half: true, max: 40 }, { name: 'phone_2', label: 'Phone number 2', half: true, max: 40 },
    { name: 'email', label: 'Public email address', type: 'email', max: 254 }, { name: 'service_times', label: 'Service times', type: 'textarea', rows: 3, max: 500, help: 'One per line.' }];
  const SOCIAL_NAMES = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', x: 'X (Twitter)' };
  P.settings = { title: 'Settings', async render(box) {
    box.innerHTML = skeleton();
    let s, soc, storage;
    try { [s, soc, storage] = await Promise.all([api('GET', '/api/settings'), api('GET', '/api/social'), api('GET', '/api/settings/storage')]); } catch (e) { box.innerHTML = errorState(e); return; }
    const ok = storage.status === 'verified';
    box.innerHTML = `<div class="stack-lg">
      <form class="card card-pad" data-site novalidate><h2>Site and contact information</h2><p class="desc">Shown on the Contact page and in the website footer.</p><div class="inline-error" data-top hidden></div>${formHTML(SETTINGS_F, s, 's')}<button class="btn btn-primary" type="submit">Save site information</button></form>
      <form class="card card-pad" data-social novalidate><h2>Social media</h2><p class="desc">Only accounts with a link appear in the website footer. Leave a box empty to hide that icon.</p><div class="inline-error" data-top hidden></div>
        ${soc.items.map((l) => `<div class="field" data-field="${l.platform}"><label for="so_${l.platform}">${SOCIAL_NAMES[l.platform]}</label><input class="input" id="so_${l.platform}" name="${l.platform}" type="url" placeholder="https://" value="${esc(l.url)}" maxlength="2000" /><span class="err" hidden></span></div>`).join('')}<button class="btn btn-primary" type="submit">Save social links</button></form>
      <form class="card card-pad" data-pw novalidate><h2>Change your password</h2><p class="desc">You will stay signed in here; other devices are signed out.</p><div class="inline-error" data-top hidden></div>
        ${formHTML([{ name: 'current_password', label: 'Current password', type: 'password', required: true, max: 200 }, { name: 'new_password', label: 'New password', type: 'password', required: true, max: 200, help: 'At least 10 characters, with letters and numbers.' }, { name: 'confirm', label: 'Repeat new password', type: 'password', required: true, max: 200 }], {}, 'p')}<button class="btn btn-primary" type="submit">Change password</button></form>
      <div class="card card-pad"><h2>Data and storage</h2><p class="desc">Where WOD’s content is kept, and how to keep it safe.</p>
        <div class="banner ${ok ? 'ok' : storage.status === 'local' ? 'warn' : 'danger'}"><div>${icon(ok ? 'check' : 'x')}</div><div><b>${ok ? 'Stored on a separate mounted disk' : storage.status === 'local' ? 'Local storage (development)' : 'Not persistent — data can be lost'}</b>${ok ? 'The database and uploads are on a different disk from the application. Confirm in the Render dashboard that this is your Persistent Disk.' : storage.status === 'local' ? 'Fine for testing on a computer. Not suitable for Render without a Persistent Disk.' : esc(storage.problems.join(' '))}</div></div>
        <dl class="dl"><dt>Database file</dt><dd>${esc(storage.databasePath)}</dd><dt>Uploads folder</dt><dd>${esc(storage.uploadDir)}</dd></dl>
        <div style="margin-top:1.2rem"><a class="btn btn-ghost" href="/api/settings/backup" download>${icon('download')} Download database backup</a></div>
        <p class="desc" style="margin-top:.8rem">The backup contains all content, messages and administrator accounts (passwords are stored as one-way hashes). Keep it private. Uploaded images are backed up separately — see the README.</p></div></div>`;
    const handle = (sel, fields, send, done) => {
      const f = $(sel, box), top = $('[data-top]', f);
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = $('button[type=submit]', f); top.hidden = true; btn.disabled = true; btn.classList.add('loading');
        try { await send(f); toast(done); showErrors(f, {}); if (sel === '[data-pw]') f.reset(); }
        catch (err) { if (!showErrors(f, err) || !err.fields) { top.textContent = err.message; top.hidden = false; } toast(err.message, 'err'); }
        btn.disabled = false; btn.classList.remove('loading');
      });
    };
    handle('[data-site]', SETTINGS_F, (f) => api('PUT', '/api/settings', readForm(f, SETTINGS_F)), 'Site information saved');
    handle('[data-social]', [], (f) => api('PUT', '/api/social', { links: soc.items.map((l) => ({ platform: l.platform, url: f.elements[l.platform].value.trim(), is_active: 1 })) }), 'Social links saved');
    handle('[data-pw]', [], async (f) => {
      if (f.elements.new_password.value !== f.elements.confirm.value) { const e = new Error('The new passwords do not match.'); e.fields = { confirm: 'Does not match' }; throw e; }
      await api('POST', '/api/auth/change-password', { current_password: f.elements.current_password.value, new_password: f.elements.new_password.value });
    }, 'Password changed');
  } };

  /* ================= Activity ================= */
  P.activity = { title: 'Activity log', async render(box) {
    const st = { q: '', admin: '', page: 1, items: [], pages: 1, total: 0 };
    let admins = []; try { admins = (await api('GET', '/api/admins')).items; } catch { /* filter simply stays empty */ }
    box.innerHTML = `<div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search actions, people or items" aria-label="Search" data-q /></div>
      <select class="input" data-admin aria-label="Administrator"><option value="">All administrators</option>${admins.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div><div class="card table-card" data-tbl></div><div data-pg-box></div>`;
    const tbl = $('[data-tbl]', box), pg = $('[data-pg-box]', box);
    async function load() {
      tbl.innerHTML = skeleton();
      try {
        const d = await api('GET', '/api/activity?' + new URLSearchParams({ page: st.page, ...(st.q && { q: st.q }), ...(st.admin && { admin_id: st.admin }) })); Object.assign(st, { items: d.items, pages: d.pages, page: d.page, total: d.total });
        if (!d.items.length) { tbl.innerHTML = empty('list', st.q || st.admin ? 'No matching activity' : 'No activity yet', 'Actions by administrators are recorded here.'); pg.innerHTML = ''; return; }
        tbl.innerHTML = `<table class="tbl"><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Resource</th></tr></thead><tbody>${d.items.map((x) => `<tr><td class="first" style="white-space:nowrap">${dt(x.created_at)}</td><td data-label="Administrator"><div class="t" style="font-weight:700">${esc(x.admin_name || '—')}</div><div style="color:var(--muted);font-size:.84rem">${esc(x.admin_email)}</div></td><td data-label="Action">${esc(x.action)}</td><td data-label="Resource"><span class="clip" style="display:block">${esc(x.details || x.resource)}</span></td></tr>`).join('')}</tbody></table>`;
        pg.innerHTML = pager(st, 'entry').replace(/entrys/g, 'entries');
      } catch (e) { tbl.innerHTML = errorState(e); }
    }
    box.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) return load(); const p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); load(); } });
    $('[data-q]', box).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }));
    $('[data-admin]', box).addEventListener('change', (e) => { st.admin = e.target.value; st.page = 1; load(); });
    await load();
  } };

  /* ================= shell: nav, router, boot ================= */
  const NAV = [['dashboard', 'Dashboard', 'dashboard'], ['homepage', 'Homepage', 'home'], ['sermons', 'Sermons', 'mic'], ['events', 'Events', 'calendar'], ['ministries', 'Ministries', 'users'], ['leadership', 'Leadership', 'user'],
    ['gallery', 'Gallery', 'image'], ['messages', 'Messages', 'mail'], ['giving', 'Giving', 'heart'], ['admins', 'Admins', 'shield'], ['settings', 'Settings', 'settings'], ['activity', 'Activity log', 'list']];
  function setUnread(n) { W.state.unread = n; const b = $('#nav [data-badge]'); if (b) { b.textContent = n; b.hidden = !n; } }
  function buildNav() {
    $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${icon(i)}<span>${l}</span>${k === 'messages' ? '<span class="badge-count" data-badge hidden></span>' : ''}</a>`).join('') + `<div class="sep"></div><button type="button" id="logout">${icon('logout')}<span>Log out</span></button>`;
    $('#viewSite').innerHTML = `${icon('ext')} View website`; $('#menuBtn').innerHTML = icon('menu');
  }
  let token = 0;
  async function route() {
    const [path, qs] = (location.hash.slice(1) || '/dashboard').split('?');
    const key = path.replace(/^\//, ''); const page = P[key] || P.dashboard; const my = ++token;
    document.body.classList.remove('nav-open');
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.k === (P[key] ? key : 'dashboard')));
    $('#pageTitle').textContent = page.title; document.title = `${page.title} — WOD Admin`;
    const view = $('#view'); view.innerHTML = skeleton(); view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    const fresh = view.cloneNode(false); view.replaceWith(fresh); fresh.innerHTML = skeleton();
    try { if (my === token) await page.render(fresh, new URLSearchParams(qs || '')); } catch (e) { if (my === token) fresh.innerHTML = errorState(e); }
    if (qs && my === token) history.replaceState(null, '', '#/' + key);
    api('GET', '/api/messages?limit=1&status=unread').then((d) => setUnread(d.unread)).catch(() => {});
  }
  async function refreshMe() {
    const { admin } = await api('GET', '/api/auth/me'); W.state.admin = admin;
    $('#meName').textContent = admin.name; $('#meEmail').textContent = admin.email; $('#meAvatar').textContent = admin.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }
  async function boot() {
    try { await refreshMe(); } catch { location.replace('/admin/login.html'); return; }
    buildNav(); $('#boot').hidden = true; $('#shell').hidden = false;
    $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    $('#overlay').onclick = () => document.body.classList.remove('nav-open');
    $('#logout').onclick = async () => { try { await api('POST', '/api/auth/logout'); } finally { location.replace('/admin/login.html'); } };
    document.addEventListener('click', (e) => { const r = e.target.closest('[data-retry]'); if (r && !e.target.closest('[data-tbl],[data-grid],[data-list]')) route(); });
    window.addEventListener('hashchange', route); route();
  }
  boot();
})();

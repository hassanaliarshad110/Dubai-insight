/* Dubai Insight: every screen is drawn from data/realestate.json (Dubai Land Department open data, refreshed daily)
   and data/official.json (official figures as published by Dubai government bodies, each with its source). */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmt(n, d = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function big(n) {   // 1.2 million / 345,000
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return fmt(n / 1e9, a >= 1e11 ? 0 : 1) + ' billion';
  if (a >= 1e6) return fmt(n / 1e6, a >= 1e8 ? 0 : 2).replace(/\.?0+$/, '') + ' million';
  return fmt(n);
}
function aed(n, short) {
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return 'AED ' + fmt(n / 1e9, 1) + (short ? 'bn' : ' billion');
  if (a >= 1e6) return 'AED ' + fmt(n / 1e6, 1) + (short ? 'm' : ' million');
  return 'AED ' + fmt(n);
}
const ml = m => m ? MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '';
const mlong = m => m ? MONTH_LONG[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '';
const span = (a, b) => a && b ? (a.slice(0, 4) === b.slice(0, 4) ? `${MON[+a.slice(5, 7) - 1]} to ${mlong(b)}` : `${ml(a)} to ${ml(b)}`) : '';
function chg(p, invert) {
  if (p === null || p === undefined) return '';
  const up = p > 0, cls = p === 0 ? 'flat' : (up !== !!invert ? 'up' : 'down');
  return `<span class="chg ${cls}">${up ? '+' : ''}${fmt(p, 1)}%</span>`;
}
const pctOf = (a, b) => b ? (a - b) / b * 100 : null;
function pts(d) {   // change in percentage points
  if (d === null || d === undefined || Number.isNaN(d)) return '';
  const r = Math.round(d * 10) / 10;
  return `<span class="chg ${r === 0 ? 'flat' : r > 0 ? 'up' : 'down'}">${r > 0 ? '+' : ''}${fmt(r, 1)} pts</span>`;
}
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-(/])([a-z])/g, (m, a, b) => a + b.toUpperCase());

let RE = null, OFF = null;
const charts = {};
const OF = id => OFF && OFF.figures.find(f => f.id === id);

/* --------------------------------------------------------------- theme + charts */
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function palette() {
  return { fg: css('--chart-text'), grid: css('--chart-grid'), a: css('--chart-2'), b: '#C8922B', c: css('--chart-1'), d: '#0E9F6E', e: '#9333EA' };
}
function chart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  if (charts[id]) charts[id].destroy();
  const p = palette();
  Chart.defaults.font.family = css('--sans');
  Chart.defaults.color = p.fg;
  const base = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12, usePointStyle: false } }, tooltip: { callbacks: {} } },
    scales: {}
  };
  cfg.options = deepMerge(base, cfg.options || {});
  for (const k of Object.keys(cfg.options.scales || {})) {
    const s = cfg.options.scales[k];
    s.grid = Object.assign({ color: p.grid, drawTicks: false }, s.grid || {});
    s.border = { display: false };
    s.ticks = Object.assign({ color: p.fg, padding: 6 }, s.ticks || {});
  }
  charts[id] = new Chart(el, cfg);
}
function deepMerge(a, b) {
  const o = Array.isArray(a) ? [...a] : { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  return o;
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('theme', t); } catch (e) { }
  const b = $('#theme-btn');
  b.innerHTML = t === 'dark' ? `${icon('sun')}<span>Light mode</span>` : `${icon('moon')}<span>Dark mode</span>`;
  b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (current) render(current, true);
}
$('#theme-btn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

/* --------------------------------------------------------------- navigation */
let current = null, currentArea = null;
function closeGroups(except) { $$('.nav-g.open').forEach(g => { if (g !== except) { g.classList.remove('open'); g.querySelector('.nav-gt').setAttribute('aria-expanded', 'false'); } }); }
$$('.nav-gt').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation();
  const g = b.closest('.nav-g'), open = !g.classList.contains('open');
  closeGroups(g); g.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open));
}));
document.addEventListener('click', e => { if (!e.target.closest('.nav-g')) closeGroups(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGroups(); });
$$('.tab[data-view]').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));
$('#menu-btn').addEventListener('click', () => { const s = $('.side'), o = !s.classList.contains('open'); s.classList.toggle('open', o); $('#menu-btn').setAttribute('aria-expanded', String(o)); });
$('#scope-sel').addEventListener('change', e => { const v = e.target.value; v ? go('areas', v) : go('dashboard'); });

function go(view, area) {
  const h = '#' + view + (area ? '/' + encodeURIComponent(area) : '');
  if (location.hash !== h) location.hash = h; else route();
}
function route() {
  const [v, a] = location.hash.slice(1).split('/');
  const view = document.getElementById('view-' + (v || 'dashboard')) ? (v || 'dashboard') : 'dashboard';
  currentArea = a ? decodeURIComponent(a) : null;
  $$('.view').forEach(s => s.classList.toggle('is-on', s.id === 'view-' + view));
  $$('.tab[data-view]').forEach(t => { const on = t.dataset.view === view; t.classList.toggle('is-on', on); on ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'); });
  $$('.nav-g').forEach(g => g.classList.toggle('has-on', !!g.querySelector('.tab.is-on')));
  closeGroups();
  $('.side').classList.remove('open');
  $('#scope-sel').value = view === 'areas' && currentArea ? currentArea : '';
  render(view);
  $('#view-' + view).scrollTop = 0;
}
window.addEventListener('hashchange', route);

function render(view, redraw) {
  current = view;
  if (!RE && !OFF) return;
  const f = VIEWS[view];
  if (f) f();
}
function head(view, title, sub) { $(`#${view}-title`).textContent = title; $(`#${view}-sub`).innerHTML = sub || ''; }
function body(view, html) { $(`#${view}-body`).innerHTML = html; }

/* --------------------------------------------------------------- pieces */
function kpi(label, value, foot, extra) {
  return `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-row"><span class="kpi-value">${value}</span>${extra || ''}</div><div class="kpi-foot">${foot || ''}</div></div>`;
}
function card(title, sub, inner, cls, tools) {
  return `<div class="card ${cls || ''}"><div class="card-head"><div><h2>${title}</h2>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>${tools ? `<div class="card-tools">${tools}</div>` : ''}</div>${inner}</div>`;
}
const canvas = (id, h) => `<div class="chart-box" style="height:${h || 280}px"><canvas id="${id}" role="img"></canvas></div>`;
function srcLine(f) { return f ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.source)}</a>` : ''; }
function figCard(f, valueText) {
  if (!f) return '';
  const v = valueText || figValue(f);
  return `<div class="card kpi fig-card"><div class="kpi-label">${esc(f.label)}</div><div class="kpi-row"><span class="kpi-value">${v}</span></div>
    <div class="kpi-foot">${f.detail ? esc(f.detail) + '. ' : ''}${esc(f.by)}. <span class="src">${srcLine(f)}</span></div></div>`;
}
function figValue(f) {
  if (f.unit === '%') return fmt(f.value, 1) + '%';
  if (f.unit === '% more') return fmt(f.value) + '% more';
  if (f.unit === 'AED') return f.value >= 1e6 ? aed(f.value) : 'AED ' + fmt(f.value);
  return big(f.value);
}
const AS = () => RE && RE.area_span ? span(RE.area_span.from, RE.area_span.to) : '';
const COPY_NOTE = () => RE && RE.copy_source ? `Months before ${mlong(RE.api_first)} come from <a href="${esc(RE.copy_source.url)}" target="_blank" rel="noopener">a public copy of the Land Department's records</a> (CC BY 4.0).` : '';
const DLD_SRC = () => `<a href="https://dubailand.gov.ae/en/open-data/real-estate-data/" target="_blank" rel="noopener">Dubai Land Department open data</a>`;
function partialNote() {
  const m = RE && RE.monthly.find(r => r.partial);
  return m ? `${mlong(m.m)} is still being registered, so its figures are shown separately and will rise as late registrations arrive.` : '';
}
function sortable(tableId, rows, cols, onPick, sortKey, desc = true) {
  const st = { key: sortKey, desc };
  const draw = () => {
    const r = [...rows].sort((a, b) => {
      const x = a[st.key], y = b[st.key];
      if (typeof x === 'string' || typeof y === 'string') return st.desc ? String(y).localeCompare(String(x)) : String(x).localeCompare(String(y));
      return ((x ?? -Infinity) < (y ?? -Infinity) ? -1 : (x ?? -Infinity) > (y ?? -Infinity) ? 1 : 0) * (st.desc ? -1 : 1);
    });
    const t = document.getElementById(tableId);
    if (!t) return;
    t.innerHTML = `<thead><tr>${cols.map(c => `<th class="${c.num ? 'num ' : ''}has-sort"><button type="button" data-k="${c.k}" class="th-sort${st.key === c.k ? ' on' : ''}">${c.t}${st.key === c.k ? (st.desc ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${r.map(x => `<tr class="${onPick ? 'pick' : ''}" data-name="${esc(x.name || '')}">${cols.map(c => `<td class="${c.num ? 'num' : ''}" data-l="${esc(c.t)}">${c.f ? c.f(x[c.k], x) : esc(x[c.k])}</td>`).join('')}</tr>`).join('') || `<tr><td class="empty" colspan="${cols.length}">Nothing to show</td></tr>`}</tbody>`;
    $$('.th-sort', t).forEach(b => b.addEventListener('click', () => { if (st.key === b.dataset.k) st.desc = !st.desc; else { st.key = b.dataset.k; st.desc = true; } draw(); }));
    if (onPick) $$('tbody tr.pick', t).forEach(tr => tr.addEventListener('click', () => onPick(tr.dataset.name)));
  };
  draw();
}
const moneyAxis = v => v >= 1e9 ? (v / 1e9) + 'bn' : v >= 1e6 ? (v / 1e6) + 'm' : v >= 1e3 ? (v / 1e3) + 'k' : v;

/* --------------------------------------------------------------- DASHBOARD */
function viewDashboard() {
  const L = RE && RE.last12, P = RE && RE.prev12, R = RE && RE.rent && RE.rent.last12;
  head('dashboard', 'Dubai overview', RE ? `Property figures to ${mlong(RE.last_complete)}, refreshed every day. Other figures as last published.` : 'Official figures as last published');
  const pop = OF('pop_2025'), tour = OF('tour_2025'), veh = OF('veh_new_h1_2026'), biz = OF('biz_h1_2026'), sch = OF('school_students');
  const k1 = RE ? [
    kpi(`Property sales, ${span(L.from, L.to)}`, fmt(L.sales), `${aed(L.value)} in total; ${P ? 'the year before: ' + fmt(P.sales) : ''}`, chg(pctOf(L.sales, P && P.sales))),
    kpi('Typical price per square metre, flats', 'AED ' + fmt(L.ppsqm_flat), `Over the same 12 months; villas AED ${fmt(L.ppsqm_villa)}`, chg(pctOf(L.ppsqm_flat, P && P.ppsqm_flat))),
    kpi('Sold off-plan', fmt(L.offplan_share, 1) + '%', `Share of sales registered before the building was finished${P ? '; the 12 months before: ' + fmt(P.offplan_share, 1) + '%' : ''}`, P ? pts(L.offplan_share - P.offplan_share) : ''),
    R ? kpi(`Rental contracts, ${span(R.from, R.to)}`, fmt(R.contracts), `${fmt(R.new / R.contracts * 100, 0)}% new contracts, the rest renewals; typical flat rent AED ${fmt(R.flat)} a year`)
      : kpi('Mortgages registered', fmt(L.mortgages), `Over the same 12 months, and ${fmt(L.gifts)} properties given as gifts`),
  ].join('') : '';
  const k2 = [
    pop && kpi('Residents at the end of 2025', big(pop.value), `${esc(pop.detail)}. <span class="src">${srcLine(pop)}</span>`),
    tour && kpi('International visitors in 2025', big(tour.value), `Up 5% on 2024. <span class="src">${srcLine(tour)}</span>`),
    veh && kpi('New vehicles registered, Jan to Jun 2026', big(veh.value), `More than 1,000 a day. <span class="src">${srcLine(veh)}</span>`),
    biz && kpi('Business licences issued, Jan to Jun 2026', fmt(biz.value), `Mainland and free zones. <span class="src">${srcLine(biz)}</span>`),
  ].filter(Boolean).join('');
  const areas = RE ? RE.areas.slice(0, 10) : [];
  body('dashboard', `
    ${RE ? `<div class="kpis">${k1}</div>` : ''}
    <div class="kpis" style="margin-top:var(--gap)">${k2}</div>
    ${RE ? `<div class="grid" style="margin-top:var(--gap)">
      <div class="col-8">${card('Property sales every month', `Number of sales (bars) and their total value (line). ${partialNote()}`, canvas('d-sales', 300))}</div>
      <div class="col-4">${card('Busiest areas for sales', `${AS()}. Select an area for its profile.`, `<div class="table-scroll"><table class="data" id="d-areas"></table></div>`, 'panel')}</div>
      <div class="col-6">${card('Price per square metre', 'Median of each month\'s sales, flats and villas, AED', canvas('d-pp', 260))}</div>
      <div class="col-6">${card('Off-plan and ready', 'Share of each month\'s sales', canvas('d-off', 260))}</div>
    </div>` : ''}
    <p class="foot-src">Property: ${DLD_SRC()}, every sale registered in Dubai. ${COPY_NOTE()} Other figures: official releases, each linked to its source. <a href="#methods">How it's counted</a></p>`);
  if (!RE) return;
  const M = RE.monthly.slice(-37), p = palette();
  chart('d-sales', {
    data: {
      labels: M.map(r => ml(r.m)), datasets: [
        { type: 'bar', label: 'Sales', data: M.map(r => r.sales), backgroundColor: M.map(r => r.partial ? p.a + '55' : p.a), yAxisID: 'y', order: 2 },
        { type: 'line', label: 'Value (AED)', data: M.map(r => r.partial ? null : r.value), borderColor: p.b, backgroundColor: p.b, pointRadius: 0, borderWidth: 2, yAxisID: 'y1', order: 1 }]
    },
    options: {
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { callback: v => fmt(v) } }, y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: v => moneyAxis(v) } } },
      plugins: { tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y1' ? ' Value: ' + aed(c.raw) : ' Sales: ' + fmt(c.raw) + (M[c.dataIndex].partial ? ' (month still being registered)' : '') } } }
    }
  });
  ppChart('d-pp', M);
  chart('d-off', {
    type: 'bar', data: { labels: M.map(r => ml(r.m)), datasets: [
      { label: 'Off-plan', data: M.map(r => r.sales ? r.offplan / r.sales * 100 : null), backgroundColor: p.b },
      { label: 'Ready', data: M.map(r => r.sales ? r.ready / r.sales * 100 : null), backgroundColor: p.c }] },
    options: { scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } }, y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } } },
      plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw, 1)}%` } } } }
  });
  sortable('d-areas', areas, [
    { k: 'name', t: 'Area', f: v => `<span class="area-link">${esc(v)}</span>` },
    { k: 'sales', t: 'Sales', num: true, f: v => fmt(v) },
    { k: 'ppsqm_flat', t: 'Flats AED/m²', num: true, f: (v, r) => r.n_flat >= 10 ? fmt(v) : '–' }], n => go('areas', n), 'sales');
}
function ppChart(id, M) {
  const p = palette();
  chart(id, {
    type: 'line', data: { labels: M.map(r => ml(r.m)), datasets: [
      { label: 'Flats', data: M.map(r => r.partial ? null : r.ppsqm_flat), borderColor: p.a, backgroundColor: p.a, pointRadius: 0, borderWidth: 2, tension: .25, spanGaps: true },
      { label: 'Villas', data: M.map(r => r.partial ? null : r.ppsqm_villa), borderColor: p.b, backgroundColor: p.b, pointRadius: 0, borderWidth: 2, tension: .25, spanGaps: true }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } }, y: { ticks: { callback: v => fmt(v) } } },
      plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: AED ${fmt(c.raw)} per m²` } } } }
  });
}

/* --------------------------------------------------------------- SALES */
function viewSales() {
  head('sales', 'Property sales and prices', RE ? `Every sale registered with the Dubai Land Department, ${ml(RE.first_month)} to ${mlong(RE.monthly[RE.monthly.length - 1].m)}` : '');
  if (!RE) return body('sales', loadingNote());
  const L = RE.last12, P = RE.prev12, last = RE.monthly.filter(r => !r.partial).slice(-1)[0];
  body('sales', `
    <div class="kpis">
      ${kpi(`Sales, ${span(L.from, L.to)}`, fmt(L.sales), P ? `The 12 months before: ${fmt(P.sales)}` : '', chg(pctOf(L.sales, P && P.sales)))}
      ${kpi('Total value of those sales', aed(L.value), P ? `The 12 months before: ${aed(P.value)}` : '', chg(pctOf(L.value, P && P.value)))}
      ${kpi(`Median sale price, ${mlong(last.m)}`, aed(last.price_median), `Half of that month's ${fmt(last.sales)} sales were for less, half for more`)}
      ${kpi('Sold off-plan', fmt(L.offplan_share, 1) + '%', P ? `The 12 months before: ${fmt(P.offplan_share, 1)}%` : '', P ? pts(L.offplan_share - P.offplan_share) : '')}
    </div>
    <div class="grid" style="margin-top:var(--gap)">
      <div class="col-12">${card('Sales every month, off-plan and ready', partialNote(), canvas('s-month', 300))}</div>
      <div class="col-6">${card('Price per square metre', 'Median of each month\'s sales, AED per m²', canvas('s-pp', 260))}</div>
      <div class="col-6">${card('Mortgages and gifts', `Mortgages registered on property, and property given as a gift, each complete month since ${mlong(RE.api_first)}`, canvas('s-mg', 260))}</div>
      <div class="col-4">${card('What sells', `Sales by property type, ${span(L.from, L.to)}`, `<div class="table-scroll"><table class="data" id="s-type"></table></div>`)}</div>
      <div class="col-4">${card('Price bands', `How many sales at each price in AED, ${span(L.from, L.to)}`, canvas('s-bands', 240))}</div>
      <div class="col-4">${card('Flats by size', `Flat sales by number of bedrooms, ${span(L.from, L.to)}`, canvas('s-rooms', 240))}</div>
      <div class="col-12">${card('Every area', `${AS()}. Areas are the Land Department's own names. Typical price per m² is the average of monthly medians, weighted by the number of sales. Select an area for its profile.`,
        `<div class="tbl-tools"><input type="search" id="s-q" placeholder="Find an area" aria-label="Find an area"></div><div class="table-wrap"><table class="data" id="s-areas"></table></div>`)}</div>
      <div class="col-12">${card('Projects with the most sales', AS(), `<div class="table-wrap"><table class="data" id="s-proj"></table></div>`)}</div>
    </div>
    <p class="foot-src">Source: ${DLD_SRC()}. ${COPY_NOTE()} Sales include off-plan sales registered before completion. <a href="#methods">How it's counted</a></p>`);
  const M = RE.monthly.slice(-37), p = palette();
  chart('s-month', {
    type: 'bar', data: { labels: M.map(r => ml(r.m)), datasets: [
      { label: 'Off-plan', data: M.map(r => r.offplan), backgroundColor: M.map(r => r.partial ? p.b + '55' : p.b) },
      { label: 'Ready', data: M.map(r => r.ready), backgroundColor: M.map(r => r.partial ? p.a + '55' : p.a) }] },
    options: { scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12 } }, y: { stacked: true, ticks: { callback: v => fmt(v) } } },
      plugins: { tooltip: { callbacks: { footer: it => 'Total: ' + fmt(M[it[0].dataIndex].sales) + (M[it[0].dataIndex].partial ? ' (still being registered)' : '') } } } }
  });
  ppChart('s-pp', M);
  chart('s-mg', {
    type: 'line', data: { labels: M.map(r => ml(r.m)), datasets: [
      { label: 'Mortgages', data: M.map(r => r.partial ? null : r.mortgages), borderColor: p.a, backgroundColor: p.a, pointRadius: 0, borderWidth: 2 },
      { label: 'Gifts', data: M.map(r => r.partial ? null : r.gifts), borderColor: p.d, backgroundColor: p.d, pointRadius: 0, borderWidth: 2 }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } }, y: { beginAtZero: true, ticks: { callback: v => fmt(v) } } } }
  });
  const tot = RE.by_type.reduce((s, r) => s + r.count, 0);
  sortable('s-type', RE.by_type.map(r => ({ ...r, name: r.type, share: r.count / tot * 100 })), [
    { k: 'type', t: 'Type' }, { k: 'count', t: 'Sales', num: true, f: v => fmt(v) }, { k: 'share', t: 'Share', num: true, f: v => fmt(v, 1) + '%' }], null, 'count');
  chart('s-bands', { type: 'bar', data: { labels: RE.price_bands.map(b => ({ 'under 1M': 'Under 1m', '1M to 2M': '1m to 2m', '2M to 5M': '2m to 5m', '5M to 10M': '5m to 10m', '10M and over': '10m and over' }[b.band] || b.band)), datasets: [{ label: 'Sales', data: RE.price_bands.map(b => b.count), backgroundColor: p.a }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } }, y: { ticks: { callback: v => fmt(v) } } } } });
  const order = ['Studio', '1 B/R', '2 B/R', '3 B/R', '4 B/R', '5 B/R', 'Penthouse'];
  const rooms = RE.flat_rooms.filter(r => r.rooms !== 'Not stated').sort((a, b) => (order.indexOf(a.rooms) + 99 * (order.indexOf(a.rooms) < 0)) - (order.indexOf(b.rooms) + 99 * (order.indexOf(b.rooms) < 0))).slice(0, 8);
  chart('s-rooms', { type: 'bar', data: { labels: rooms.map(r => r.rooms.replace('B/R', 'bed')), datasets: [{ label: 'Flat sales', data: rooms.map(r => r.count), backgroundColor: p.c }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0 } }, y: { ticks: { callback: v => fmt(v) } } } } });
  const cols = [
    { k: 'name', t: 'Area', f: v => `<span class="area-link">${esc(v)}</span>` },
    { k: 'sales', t: 'Sales', num: true, f: v => fmt(v) },
    { k: 'value', t: 'Value', num: true, f: v => aed(v, true) },
    { k: 'offplan_share', t: 'Off-plan', num: true, f: v => v === null ? '–' : fmt(v, 0) + '%' },
    { k: 'mortgages', t: 'Mortgages', num: true, f: v => fmt(v) },
    { k: 'ppsqm_flat', t: 'Flats AED/m²', num: true, f: (v, r) => r.n_flat >= 10 ? fmt(v) : '–' },
    { k: 'ppsqm_villa', t: 'Villas AED/m²', num: true, f: (v, r) => r.n_villa >= 10 ? fmt(v) : '–' }];
  const draw = q => sortable('s-areas', RE.areas.filter(a => !q || a.name.toLowerCase().includes(q)), cols, n => go('areas', n), 'sales');
  draw('');
  $('#s-q').addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  sortable('s-proj', RE.top_projects.map(r => ({ ...r, name: r.name })), [
    { k: 'name', t: 'Project', f: v => esc(titleCase(v)) }, { k: 'area', t: 'Area' },
    { k: 'sales', t: 'Sales', num: true, f: v => fmt(v) }, { k: 'value', t: 'Value', num: true, f: v => aed(v, true) }], null, 'sales');
}

/* --------------------------------------------------------------- RENTS */
function viewRents() {
  const R = RE && RE.rent;
  head('rents', 'Rents', R && R.monthly.length ? `Every rental contract registered in Ejari, ${ml(R.first_month)} to ${mlong(R.monthly[R.monthly.length - 1].m)}` : '');
  if (!R || !R.last12) return body('rents', loadingNote('Rental contracts'));
  const L = R.last12, p = palette(), M = R.monthly.slice(-37);
  body('rents', `
    <div class="kpis">
      ${kpi(`Rental contracts, ${span(L.from, L.to)}`, fmt(L.contracts), `${fmt(L.new)} new contracts and ${fmt(L.contracts - L.new)} renewals`)}
      ${kpi('New contracts', fmt(L.new / L.contracts * 100, 0) + '%', 'Share of contracts that were new rather than renewals')}
      ${kpi('Typical annual rent, flats', 'AED ' + fmt(L.flat), 'Average of monthly medians, weighted by contracts')}
      ${kpi('Typical annual rent, villas', 'AED ' + fmt(L.villa), 'Average of monthly medians, weighted by contracts')}
    </div>
    <div class="grid" style="margin-top:var(--gap)">
      <div class="col-8">${card('Contracts every month', `New and renewed. ${partialNote()}`, canvas('r-month', 280))}</div>
      <div class="col-4">${card('Flat rents by size', `Typical annual rent, ${span(L.from, L.to)}`, canvas('r-rooms', 280))}</div>
      <div class="col-12">${card('Median annual rent each month', 'Flats and villas, AED a year', canvas('r-med', 240))}</div>
      <div class="col-12">${card('Every area', `${span(L.from, L.to)}. Typical annual rent, AED. Select an area for its profile.`,
        `<div class="tbl-tools"><input type="search" id="r-q" placeholder="Find an area" aria-label="Find an area"></div><div class="table-wrap"><table class="data" id="r-areas"></table></div>`)}</div>
    </div>
    <p class="foot-src">Source: ${DLD_SRC()} (Ejari rental contracts). <a href="#methods">How it's counted</a></p>`);
  chart('r-month', { type: 'bar', data: { labels: M.map(r => ml(r.m)), datasets: [
    { label: 'New', data: M.map(r => r.new), backgroundColor: M.map(r => r.partial ? p.b + '55' : p.b) },
    { label: 'Renewed', data: M.map(r => r.renewed), backgroundColor: M.map(r => r.partial ? p.a + '55' : p.a) }] },
    options: { scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 10 } }, y: { stacked: true, ticks: { callback: v => fmt(v) } } } } });
  chart('r-rooms', { type: 'bar', data: { labels: R.flat_rooms.map(r => r.rooms.replace(' bed rooms', ' bed').replace(' bed room', ' bed')), datasets: [{ label: 'Annual rent', data: R.flat_rooms.map(r => r.median), backgroundColor: p.a }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' AED ' + fmt(c.raw) + ' a year' } } }, scales: { x: { ticks: { callback: v => moneyAxis(v) } }, y: { grid: { display: false } } } } });
  chart('r-med', { type: 'line', data: { labels: M.map(r => ml(r.m)), datasets: [
    { label: 'Flats', data: M.map(r => r.flat), borderColor: p.a, backgroundColor: p.a, pointRadius: 0, borderWidth: 2, spanGaps: true },
    { label: 'Villas', data: M.map(r => r.villa), borderColor: p.b, backgroundColor: p.b, pointRadius: 0, borderWidth: 2, spanGaps: true }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12 } }, y: { ticks: { callback: v => moneyAxis(v) } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: AED ${fmt(c.raw)}` } } } } });
  const roomKeys = ['Studio', '1 bed room', '2 bed rooms', '3 bed rooms'];
  const rows = R.areas.map(a => ({ ...a, studio: a.rooms['Studio'], r1: a.rooms['1 bed room'], r2: a.rooms['2 bed rooms'], r3: a.rooms['3 bed rooms'], newShare: a.contracts ? a.new / a.contracts * 100 : null }));
  const cols = [
    { k: 'name', t: 'Area', f: v => `<span class="area-link">${esc(v)}</span>` },
    { k: 'contracts', t: 'Contracts', num: true, f: v => fmt(v) },
    { k: 'newShare', t: 'New', num: true, f: v => v === null ? '–' : fmt(v, 0) + '%' },
    { k: 'studio', t: 'Studio', num: true, f: v => v ? fmt(v) : '–' },
    { k: 'r1', t: '1 bed', num: true, f: v => v ? fmt(v) : '–' },
    { k: 'r2', t: '2 bed', num: true, f: v => v ? fmt(v) : '–' },
    { k: 'r3', t: '3 bed', num: true, f: v => v ? fmt(v) : '–' },
    { k: 'villa', t: 'Villa', num: true, f: (v, r) => r.n_villa >= 10 ? fmt(v) : '–' }];
  const draw = q => sortable('r-areas', rows.filter(a => !q || a.name.toLowerCase().includes(q)), cols, n => go('areas', n), 'contracts');
  draw('');
  $('#r-q').addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
}

/* --------------------------------------------------------------- AREAS */
function viewAreas() {
  if (!RE) { head('areas', 'Compare areas', ''); return body('areas', loadingNote()); }
  if (currentArea) return areaProfile(currentArea);
  head('areas', 'Compare areas', `Every area with property sales or rental contracts, ${AS()}. Areas are as the Dubai Land Department names them.`);
  const rent = Object.fromEntries((RE.rent.areas || []).map(a => [a.name, a]));
  const rows = RE.areas.map(a => ({ ...a, contracts: rent[a.name] ? rent[a.name].contracts : null, rent_flat: rent[a.name] ? rent[a.name].flat : null }));
  const names = RE.areas.map(a => a.name).sort();
  const opts = sel => `<option value="">Choose an area</option>` + names.map(n => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const A = rows[0] ? rows[0].name : '', B = rows[1] ? rows[1].name : '';
  body('areas', `
    ${card('Two areas side by side', 'Pick any two areas to compare their sales, prices and rents', `
      <div class="cmp-pick"><select id="cmp-a" aria-label="First area">${opts(A)}</select><span>and</span><select id="cmp-b" aria-label="Second area">${opts(B)}</select></div>
      <div id="cmp-out"></div>`)}
    <div style="margin-top:var(--gap)">${card('Every area', 'Select an area for its profile', `<div class="tbl-tools"><input type="search" id="a-q" placeholder="Find an area" aria-label="Find an area"></div><div class="table-wrap"><table class="data" id="a-all"></table></div>`)}</div>
    <p class="foot-src">Source: ${DLD_SRC()}. <a href="#methods">How it's counted</a></p>`);
  const cols = [
    { k: 'name', t: 'Area', f: v => `<span class="area-link">${esc(v)}</span>` },
    { k: 'sales', t: 'Sales', num: true, f: v => fmt(v) },
    { k: 'value', t: 'Value', num: true, f: v => aed(v, true) },
    { k: 'ppsqm_flat', t: 'Flats AED/m²', num: true, f: (v, r) => r.n_flat >= 10 ? fmt(v) : '–' },
    { k: 'ppsqm_villa', t: 'Villas AED/m²', num: true, f: (v, r) => r.n_villa >= 10 ? fmt(v) : '–' },
    { k: 'contracts', t: 'Rental contracts', num: true, f: v => v ? fmt(v) : '–' },
    { k: 'rent_flat', t: 'Flat rent AED/yr', num: true, f: v => v ? fmt(v) : '–' }];
  const draw = q => sortable('a-all', rows.filter(a => !q || a.name.toLowerCase().includes(q)), cols, n => go('areas', n), 'sales');
  draw('');
  $('#a-q').addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  const cmp = () => compareAreas($('#cmp-a').value, $('#cmp-b').value);
  $('#cmp-a').addEventListener('change', cmp); $('#cmp-b').addEventListener('change', cmp);
  cmp();
}
function areaRow(n) { return RE.areas.find(a => a.name === n); }
function rentRow(n) { return (RE.rent.areas || []).find(a => a.name === n); }
function compareAreas(a, b) {
  const out = $('#cmp-out');
  if (!a || !b) { out.innerHTML = ''; return; }
  const A = areaRow(a), B = areaRow(b), RA = rentRow(a), RB = rentRow(b);
  const line = (label, fa, fb) => `<tr><th scope="row">${label}</th><td class="num">${fa}</td><td class="num">${fb}</td></tr>`;
  out.innerHTML = `<div class="table-wrap" style="max-height:none;margin-top:12px"><table class="data cmp"><thead><tr><th></th><th class="num">${esc(a)}</th><th class="num">${esc(b)}</th></tr></thead><tbody>
    ${line('Sales, ' + AS(), fmt(A && A.sales), fmt(B && B.sales))}
    ${line('Mortgages registered', fmt(A && A.mortgages), fmt(B && B.mortgages))}
    ${line('Value of sales', aed(A && A.value), aed(B && B.value))}
    ${line('Sold off-plan', A && A.offplan_share !== null ? fmt(A.offplan_share, 0) + '%' : '–', B && B.offplan_share !== null ? fmt(B.offplan_share, 0) + '%' : '–')}
    ${line('Flats, AED per m²', A && A.n_flat >= 10 ? fmt(A.ppsqm_flat) : '–', B && B.n_flat >= 10 ? fmt(B.ppsqm_flat) : '–')}
    ${line('Villas, AED per m²', A && A.n_villa >= 10 ? fmt(A.ppsqm_villa) : '–', B && B.n_villa >= 10 ? fmt(B.ppsqm_villa) : '–')}
    ${line('Rental contracts', fmt(RA && RA.contracts), fmt(RB && RB.contracts))}
    ${line('Flat rent, AED a year', RA && RA.flat ? fmt(RA.flat) : '–', RB && RB.flat ? fmt(RB.flat) : '–')}
    ${line('Villa rent, AED a year', RA && RA.n_villa >= 10 ? fmt(RA.villa) : '–', RB && RB.n_villa >= 10 ? fmt(RB.villa) : '–')}
  </tbody></table></div>${canvas('cmp-chart', 240)}`;
  const p = palette(), months = RE.monthly.filter(r => !r.partial && r.src === 'dld').map(r => r.m);
  const ser = (X, i) => months.map(m => { const s = X && X.series.find(x => x[0] === m); return s ? s[i] : null; });
  chart('cmp-chart', { type: 'line', data: { labels: months.map(ml), datasets: [
    { label: a + ', flats AED/m²', data: ser(A, 2), borderColor: p.a, backgroundColor: p.a, pointRadius: 0, borderWidth: 2, spanGaps: true },
    { label: b + ', flats AED/m²', data: ser(B, 2), borderColor: p.b, backgroundColor: p.b, pointRadius: 0, borderWidth: 2, spanGaps: true }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } }, y: { ticks: { callback: v => fmt(v) } } } } });
}
function areaProfile(n) {
  const A = areaRow(n), R = rentRow(n);
  head('areas', n, `<a href="#areas">All areas</a> · Area profile, ${AS()}`);
  if (!A && !R) return body('areas', `<p class="empty-note">No sales or rental contracts recorded for this area this year.</p>`);
  const S = A ? A.series : [];
  const partialSet = new Set(RE.monthly.filter(r => r.partial).map(r => r.m));
  body('areas', `
    <div class="kpis">
      ${A ? kpi('Sales, ' + AS(), fmt(A.sales), `${fmt(A.mortgages)} mortgages and ${fmt(A.gifts)} gifts registered over the same months`) : ''}
      ${A ? kpi('Value of those sales', aed(A.value), `${A.offplan_share !== null ? fmt(A.offplan_share, 0) + '% sold off-plan' : ''}`) : ''}
      ${A && A.n_flat >= 10 ? kpi('Flats, typical AED per m²', fmt(A.ppsqm_flat), `From ${fmt(A.n_flat)} flat sales`) : A && A.n_villa >= 10 ? kpi('Villas, typical AED per m²', fmt(A.ppsqm_villa), `From ${fmt(A.n_villa)} villa sales`) : ''}
      ${R ? kpi('Rental contracts, ' + (R.span || AS()), fmt(R.contracts), R.flat ? `Typical flat rent AED ${fmt(R.flat)} a year` : '') : ''}
    </div>
    <div class="grid" style="margin-top:var(--gap)">
      ${A ? `<div class="col-8">${card('Sales and price every month', `Number of sales (bars) and the median flat price per m² (line). ${partialNote()}`, canvas('ap-sales', 280))}</div>` : ''}
      ${R && Object.keys(R.rooms).length ? `<div class="col-4">${card('Flat rents by size', 'Typical annual rent, AED', canvas('ap-rooms', 280))}</div>` : ''}
      ${A ? `<div class="col-12">${card('Where this area stands', 'Its rank among all areas of Dubai, ' + AS(), `<div class="stats rank-stats" id="ap-rank"></div>`)}</div>` : ''}
    </div>
    <p class="foot-src">Source: ${DLD_SRC()}. <a href="#methods">How it's counted</a></p>`);
  const p = palette();
  if (A) {
    chart('ap-sales', { data: { labels: S.map(s => ml(s[0])), datasets: [
      { type: 'bar', label: 'Sales', data: S.map(s => s[1]), backgroundColor: S.map(s => partialSet.has(s[0]) ? p.a + '55' : p.a), yAxisID: 'y', order: 2 },
      { type: 'line', label: 'Flats AED/m²', data: S.map(s => partialSet.has(s[0]) ? null : s[2]), borderColor: p.b, backgroundColor: p.b, pointRadius: 0, borderWidth: 2, yAxisID: 'y1', spanGaps: true, order: 1 }] },
      options: { scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 10 } }, y: { beginAtZero: true }, y1: { position: 'right', grid: { display: false }, ticks: { callback: v => fmt(v) } } } } });
    const rank = (k, desc = true) => { const xs = RE.areas.filter(r => r[k] !== null && (k !== 'ppsqm_flat' || r.n_flat >= 10)).sort((a, b) => desc ? b[k] - a[k] : a[k] - b[k]); const i = xs.findIndex(r => r.name === n); return i < 0 ? '–' : `${i + 1} of ${xs.length}`; };
    $('#ap-rank').innerHTML = [['Most sales', rank('sales')], ['Highest value of sales', rank('value')], ['Highest flat price per m²', A.n_flat >= 10 ? rank('ppsqm_flat') : '–'], ['Most sold off-plan', A.sales >= 20 ? rank('offplan_share') : '–']]
      .map(([t, v]) => `<div class="stat"><dt>${t}</dt><dd>${v}</dd></div>`).join('');
  }
  if (R && Object.keys(R.rooms).length) {
    const ks = ['Studio', '1 bed room', '2 bed rooms', '3 bed rooms', '4 bed rooms'].filter(k => R.rooms[k]);
    chart('ap-rooms', { type: 'bar', data: { labels: ks.map(k => k.replace(' bed rooms', ' bed').replace(' bed room', ' bed')), datasets: [{ label: 'Annual rent', data: ks.map(k => R.rooms[k]), backgroundColor: p.a }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' AED ' + fmt(c.raw) } } }, scales: { x: { ticks: { callback: v => moneyAxis(v) } }, y: { grid: { display: false } } } } });
  }
}

/* --------------------------------------------------------------- OFFICIAL-FIGURE SCREENS */
function figuresSection(view, title, sub, ids, extra) {
  head(view, title, sub);
  const figs = ids.map(OF).filter(Boolean);
  body(view, `<div class="kpis">${figs.map(f => figCard(f)).join('')}</div>${extra || ''}
    <p class="foot-src">Official figures as published, each linked to its source. Checked ${esc(OFF.checked)}. <a href="#sources">All sources</a></p>`);
}
function viewPopulation() {
  const age = OF('pop_age');
  figuresSection('population', 'Population', 'How many people live in Dubai, and how fast that is changing', ['pop_2025', 'pop_day', 'pop_men', 'gdp_2025'],
    `<div class="grid" style="margin-top:var(--gap)">
      <div class="col-6">${card('Residents', 'End of each year, as published', canvas('p-trend', 260))}</div>
      <div class="col-6">${card('Residents by age, 2025', `${esc(age.by)}. <span class="src">${srcLine(age)}</span>`, canvas('p-age', 260))}</div></div>`);
  const p = palette(), pts = [['2021', OF('pop_2021')], ['2024', OF('pop_2024')], ['2025', OF('pop_2025')]];
  chart('p-trend', { type: 'bar', data: { labels: pts.map(x => x[0]), datasets: [{ label: 'Residents', data: pts.map(x => x[1].value), backgroundColor: p.a }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) + ' residents' } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => moneyAxis(v) } } } } });
  chart('p-age', { type: 'doughnut', data: { labels: age.table.map(r => r[0]), datasets: [{ data: age.table.map(r => r[1]), backgroundColor: [p.b, p.a, p.c], borderWidth: 0 }] },
    options: { interaction: { mode: 'nearest' }, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)} (${fmt(c.raw / 4580300 * 100, 1)}%)` } } } } });
}
function viewTransport() {
  figuresSection('transport', 'Vehicles and transport', 'Cars on the road, public transport, taxis and the airport', ['veh_total', 'veh_new_h1_2026', 'veh_commercial', 'pt_2025', 'metro_h1_2026', 'taxi_2025', 'dxb_2025']);
}
function viewSchools() {
  const t = OF('school_trend');
  figuresSection('schools', 'Schools', 'Private schools, which most children in Dubai attend', ['school_students', 'school_count'],
    `<div style="margin-top:var(--gap)">${card('Private-school students', `${esc(t.by)}. <span class="src">${srcLine(t)}</span>`, canvas('sc-trend', 260))}</div>`);
  const p = palette();
  chart('sc-trend', { type: 'bar', data: { labels: t.table.map(r => r[0]), datasets: [{ label: 'Students', data: t.table.map(r => r[1]), backgroundColor: p.a }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false, ticks: { callback: v => fmt(v) } } } } });
}
function viewBusiness() {
  figuresSection('business', 'Business and economy', 'New businesses and the size of Dubai\'s economy', ['biz_h1_2026', 'biz_renew_h1_2026', 'biz_growth', 'gdp_h1_2026', 'gdp_q1_2026', 'gdp_2025']);
}
function viewTourism() {
  figuresSection('tourism', 'Tourism', 'Visitors, hotels and room rates', ['tour_2025', 'hotel_occ_2025', 'hotel_rooms_2025', 'hotel_adr_2025'],
    `<div style="margin-top:var(--gap)">${card('International overnight visitors', 'Dubai Department of Economy and Tourism', canvas('t-trend', 240))}</div>`);
  const p = palette(), a = OF('tour_2024'), b = OF('tour_2025');
  chart('t-trend', { type: 'bar', data: { labels: ['2024', '2025'], datasets: [{ label: 'Visitors', data: [a.value, b.value], backgroundColor: p.a }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + big(c.raw) + ' visitors' } } }, scales: { x: { beginAtZero: true, ticks: { callback: v => moneyAxis(v) } }, y: { grid: { display: false } } } } });
}

/* --------------------------------------------------------------- METHODS, SOURCES, ABOUT */
function viewMethods() {
  head('methods', "How it's counted", 'Every figure on Dubai Insight, and how it is worked out');
  body('methods', `<div class="prose">
    <h2>Property sales</h2>
    <p>Every property transaction registered with the Dubai Land Department is read from its open-data service, one month at a time, every day. The Land Department sorts transactions into sales, mortgages and gifts; Dubai Insight counts each group separately and never mixes them.</p>
    <ul>
      <li><b>Sales</b> include off-plan sales, which are registered before a building is finished, and sales of ready property. The share sold off-plan is the Land Department's own off-plan marker.</li>
      <li><b>Value</b> is the transaction value registered with the Land Department, in UAE dirhams.</li>
      <li><b>Price per square metre</b> is each sale's value divided by its registered area. Sales of under 15 m² are left out, and so are prices below AED 500 or above AED 400,000 per m². These are almost always whole buildings or plots registered as one unit, or entry errors. The monthly figure is the <b>median</b>: half of that month's sales were cheaper per m², half dearer.</li>
      <li><b>Twelve-month figures</b> cover the last 12 complete months. The typical price per m² over 12 months is the average of the 12 monthly medians, each weighted by its number of sales. Area prices are shown only where an area had at least 10 sales of that type.</li>
      <li><b>The current month</b> is still being registered, and the Land Department keeps adding its off-plan registrations for several weeks after the month ends. It is shown faded in the charts and is never used in 12-month totals. The last three months are pulled again every day so late registrations are picked up.</li>
      <li><b>Areas</b> are the Land Department's own area names. Some are land names that differ from the community names people use: Madinat Al Mataar, for example, is in Dubai South.</li>
      <li><b>Years before 2026.</b> The Land Department's open-data service holds the current year only. Earlier months come from a public copy of the Land Department's registered sales, published by Dubai Real Estate Data under a CC BY 4.0 licence. They are used for Dubai-wide figures only, because that copy names some areas differently. They were checked against the months taken directly from the Land Department for 2026, and every complete month's total agreed within 5%. Mortgages and gifts are shown from 2026 only.</li>
      <li><b>Area figures</b> cover the complete months of the current year, all taken directly from the Land Department.</li>
    </ul>
    <h2>Rents</h2>
    <p>Every rental contract registered in Ejari, read from the same Land Department service. A contract is counted in the month it was registered.</p>
    <ul>
      <li><b>Rent</b> is the annual amount on the contract. Contracts below AED 3,000 or above AED 20 million a year are left out as entry errors.</li>
      <li><b>New</b> and <b>renewed</b> are as the contract records them.</li>
      <li>Typical rents are monthly medians, combined over 12 months the same way as sale prices. Rents by size are shown only where there were at least 5 contracts for that size in the month.</li>
    </ul>
    <h2>Population, vehicles, business, tourism, schools and the economy</h2>
    <p>These are official figures exactly as Dubai government bodies published them. Each one shows who produced it, the period it covers, and a link to where it was published. Dubai Insight does not estimate or adjust them.</p>
    <h2>What Dubai Insight does not do</h2>
    <p>It does not forecast prices, value individual properties, or give investment advice. Every figure is a count, a sum or a median of registered records, or an official figure as published.</p>
  </div>`);
}
function viewSources() {
  head('sources', 'Data sources', 'Where every figure comes from, and when it was last refreshed');
  const rows = OFF ? OFF.figures.map(f => `<tr><td data-l="Figure">${esc(f.label)}</td><td data-l="Period">${esc(f.period)}</td><td data-l="Produced by">${esc(f.by)}</td><td data-l="Published"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.source)}</a></td></tr>`).join('') : '';
  body('sources', `
    ${card('Refreshed every day', '', `<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>Data</th><th>Covers</th><th>Last refreshed</th><th>Source</th></tr></thead><tbody>
      ${RE ? `<tr><td>Property sales, mortgages and gifts</td><td>${ml(RE.api_first)} to today</td><td>${new Date(RE.updated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' })} Dubai time</td><td>${DLD_SRC()}</td></tr>` : ''}
      ${RE && RE.rent.first_month ? `<tr><td>Rental contracts (Ejari)</td><td>${ml(RE.rent.first_month)} to today</td><td>Same refresh</td><td>${DLD_SRC()}</td></tr>` : ''}
      ${RE && RE.copy_source ? `<tr><td>Property sales before ${mlong(RE.api_first)}, Dubai-wide</td><td>${ml(RE.first_month)} to ${ml((RE.monthly.filter(r => r.src === 'copy').slice(-1)[0] || {}).m)}</td><td>Fixed history</td><td><a href="${esc(RE.copy_source.url)}" target="_blank" rel="noopener">Dubai Real Estate Data</a>, a public copy of Land Department records (CC BY 4.0)</td></tr>` : ''}
    </tbody></table></div>`)}
    <div style="margin-top:var(--gap)">${card('Official figures as published', OFF ? `Checked ${esc(OFF.checked)}` : '', `<div class="table-wrap" style="max-height:none"><table class="data wrap"><thead><tr><th>Figure</th><th>Period</th><th>Produced by</th><th>Published</th></tr></thead><tbody>${rows}</tbody></table></div>`)}</div>`);
}
function viewAbout() {
  head('about', 'About Dubai Insight', '');
  body('about', `<div class="prose">
    <p><b>Dubai Insight</b> brings Dubai's public data together in one place and explains it in plain language: what homes sell and rent for in every area, how fast the city is growing, and how many people visit, study and set up businesses here.</p>
    <p>It is independent and non-commercial, and it is not affiliated with the Government of Dubai or any of its departments. Every figure comes from official open data or an official publication, and every one links to where it came from.</p>
    <p>Property figures are refreshed every day from the Dubai Land Department's open data. Nothing on the site is a forecast, a valuation or investment advice.</p>
  </div>`);
}
function loadingNote(what) { return `<p class="empty-note">${what || 'Property figures'} are not available right now. Please try again later.</p>`; }

const VIEWS = { dashboard: viewDashboard, sales: viewSales, rents: viewRents, areas: viewAreas, population: viewPopulation, transport: viewTransport,
  schools: viewSchools, business: viewBusiness, tourism: viewTourism, methods: viewMethods, sources: viewSources, about: viewAbout };

/* --------------------------------------------------------------- start */
async function load() {
  const get = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  [RE, OFF] = await Promise.all([get('data/realestate.json'), get('data/official.json')]);
  const st = $('#side-status');
  st.classList.toggle('ok', !!RE);
  st.classList.toggle('stale', !RE);
  st.querySelector('.status-text').textContent = RE ? 'Data up to date' : 'Some data unavailable';
  st.title = RE ? `Property data refreshed ${new Date(RE.updated).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })} Dubai time` : 'Property data could not be loaded';
  if (RE) {
    const sel = $('#scope-sel');
    sel.innerHTML = '<option value="">Dubai: all areas</option>' + [...RE.areas].sort((a, b) => a.name.localeCompare(b.name)).map(a => `<option>${esc(a.name)}</option>`).join('');
  }
  setTheme(document.documentElement.getAttribute('data-theme') || 'light');
  route();
}
load();

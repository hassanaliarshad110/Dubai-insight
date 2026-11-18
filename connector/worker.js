// Dubai Insight connector: every dataset on the site, for any AI that speaks MCP (Claude, ChatGPT and others).
// Read-only. The data is built into the connector each time the site's data is refreshed (connector/build_data.py).
import { createServer, ToolError } from './mcp.js';
import { RE, OFF, LAWS, BUILT } from './data.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ml = m => m ? `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : null;
const r1 = v => v === null || v === undefined ? null : Math.round(v * 10) / 10;
const DLD = 'https://dubailand.gov.ae/en/open-data/real-estate-data/';
const DLP = 'https://dlp.dubai.gov.ae/';
const INDEX_URL = 'https://dubailand.gov.ae/en/eservices/rental-index/';
const NOT_ADVICE = 'Information only: not legal, financial or investment advice, a valuation or a forecast.';
let SITE = '';   // the public website, when it is live (wrangler var SITE_URL)

/* ------------------------------------------------------------------ areas */
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Everyday names for areas the Land Department records under another name. Several names can point to one area, and
// one everyday name can cover two of the Land Department's areas (the Marina is recorded both ways).
const ALIASES = {
  'downtown': ['Burj Khalifa'], 'downtown dubai': ['Burj Khalifa'], 'jvc': ['Jumeirah Village Circle'], 'jvt': ['Jumeirah Village Triangle'],
  'jlt': ['Jumeirah Lakes Towers'], 'jbr': ['Jumeirah Beach Residence'], 'marina': ['Dubai Marina', 'Marsa Dubai'], 'dubai marina': ['Dubai Marina', 'Marsa Dubai'],
  'dso': ['Silicon Oasis'], 'dubai silicon oasis': ['Silicon Oasis'], 'impz': ['Dubai Production City'], 'dip': ['Dubai Investment Park First', 'Dubai Investment Park Second'],
  'dubai investment park': ['Dubai Investment Park First', 'Dubai Investment Park Second'], 'mbr city': ['Mbr District 1', 'Mbr District 7', 'Hadaeq Sheikh Mohammed Bin Rashid'],
  'mohammed bin rashid city': ['Mbr District 1', 'Mbr District 7', 'Hadaeq Sheikh Mohammed Bin Rashid'], 'difc': ['Trade Center Second'], 'deira': ['Al Rega', 'Al Muteena', 'Al Murqabat', 'Naif', 'Al Sabkha', 'Al Ras', 'Port Saeed', 'Abu Hail', 'Hor Al Anz'],
  'tecom': ['Tecom Site A', 'Tecom Site D', 'Barsha Heights'], 'al barsha': ['Al Barsha First', 'Al Barsha Second', 'Al Barsha Third'],
  'international city': ['International City Ph 1', 'International City Ph 2 & 3'], 'arabian ranches': ['Arabian Ranches I', 'Arabian Ranches Ii', 'Arabian Ranches Iii'],
  'sports city': ['Dubai Sports City'], 'motor city': ['Motor City'], 'meydan': ['Meydan One', 'Meydan Avenue', 'Medyan Race Course Villas', 'Nad Al Shiba First'],
  'the springs': ['Emirate Living'], 'springs': ['Emirate Living'], 'the meadows': ['Emirate Living'], 'emirates hills': ['Emirate Living'],
  'al furjan': ['Al Furjan'], 'dubai south': ['Dubai South', 'Madinat Al Mataar'], 'expo city': ['Madinat Al Mataar'], 'creek harbour': ['Dubai Creek Harbour'],
  'damac hills 2': ['Al Hebiah Fifth'], 'akoya': ['Al Hebiah Fifth'], 'dubai hills estate': ['Dubai Hills'], 'mirdif': ['Mirdif'],
};
const allNames = () => [...new Set([...RE.areas.map(a => a.name), ...((RE.rent || {}).areas || []).map(a => a.name)])];
const saleRow = n => RE.areas.find(a => a.name === n);
const rentRow = n => ((RE.rent || {}).areas || []).find(a => a.name === n);

function matchAreas(q) {
  const t = norm(q);
  if (!t) return [];
  const names = allNames();
  const exact = names.filter(n => norm(n) === t);
  if (exact.length) return exact;
  if (ALIASES[t]) return ALIASES[t].filter(n => names.includes(n));
  const toks = t.split(' ');
  const hit = names.filter(n => { const nn = norm(n); return toks.every(k => nn.includes(k)); });
  if (hit.length) return hit;
  const ali = Object.entries(ALIASES).filter(([k]) => k.includes(t) || t.includes(k)).flatMap(([, v]) => v).filter(n => names.includes(n));
  return [...new Set(ali)];
}
// Areas named anywhere inside a longer text ("rents in business bay and jvc")
function areasIn(text) {
  const t = ' ' + norm(text) + ' ', names = allNames();
  const hit = names.filter(n => t.includes(' ' + norm(n) + ' '));
  for (const [k, v] of Object.entries(ALIASES)) if (t.includes(' ' + k + ' ')) hit.push(...v.filter(n => names.includes(n)));
  return [...new Set([...hit, ...matchAreas(text)])];
}
function oneArea(q) {
  const m = matchAreas(q);
  if (!m.length) throw new ToolError(`No area matches "${q}". Use find_area to look the name up; the Land Department uses its own area names (Downtown is "Burj Khalifa", JVC is "Jumeirah Village Circle").`);
  return m;
}
function areaBrief(n) {
  const a = saleRow(n), r = rentRow(n);
  return {
    area: n,
    sales: a ? a.sales : 0,
    value_aed: a ? a.value : 0,
    offplan_share_pct: a ? a.offplan_share : null,
    price_per_sqm_flat_aed: a && a.n_flat >= 10 ? a.ppsqm_flat : null,
    price_per_sqm_villa_aed: a && a.n_villa >= 10 ? a.ppsqm_villa : null,
    rental_contracts: r ? r.contracts : 0,
    typical_yearly_rent_flat_aed: r && r.n_flat >= 20 ? r.flat : null,
    typical_yearly_rent_villa_aed: r && r.n_villa >= 20 ? r.villa : null,
  };
}
const salesPeriod = () => ({ from: ml(RE.area_span.from), to: ml(RE.area_span.to) });
const rentPeriod = () => RE.rent && RE.rent.last12 ? { from: ml(RE.rent.last12.from), to: ml(RE.rent.last12.to), months_loaded: (RE.rent.monthly || []).filter(m => !m.partial).map(m => ml(m.m)) } : null;
const rankOf = (n, key, min = 10, minKey = null) => {
  const rows = RE.areas.filter(a => a[key] !== null && a[key] !== undefined && (!minKey || a[minKey] >= min));
  const s = [...rows].sort((x, y) => y[key] - x[key]);
  const i = s.findIndex(a => a.name === n);
  return i < 0 ? null : { rank: i + 1, of: s.length };
};
const SALES_NOTE = 'Sales are every sale registered with the Dubai Land Department (mortgages and gifts are counted separately). Price per square metre is the median of each sale\'s price divided by its area. Area names are the Land Department\'s.';
const RENT_NOTE = 'Rents are the median yearly rent of every contract registered in Ejari, all sizes together, new and renewed. They are not the Smart Rental Index, which is what the law uses for rent increases.';

/* ------------------------------------------------------------------ laws */
const lawById = id => LAWS.laws.find(l => l.id === id);
const lawName = c => { const l = lawById(c.law); return c.art ? `${l.short}, Article ${c.art}` : l.short; };
const STOP = new Set('the and for are can what who how does did has have with from that this when where which will would should could your you our their them they his her its not but any all into out about there than then just want wants need tell me my mine i we a an of to in on at is it be by or if do as so up'.split(' '));
const toks = q => norm(q).split(' ').filter(t => t.length > 2 && !STOP.has(t));
function scoreText(text, ts) { const h = norm(text); return ts.reduce((s, t) => s + (h.includes(t) ? 1 : 0), 0); }
const answerOut = q => ({ id: q.id, topic: q.topic, question: q.q, answer: q.a.join(' '), based_on: q.cite.map(c => ({ article: lawName(c), law_id: c.law, article_no: c.art, url: c.url })),
  ...(q.review ? { warning: 'The official wording of an article this answer relies on changed after it was last checked; read the article itself.' } : {}) });
const LAW_NOTE = 'Plain-language answers written from the official English texts on the Dubai Legal Portal; the Arabic text prevails. Disputes between landlords and tenants go to the Rental Disputes Settlement Centre. ' + NOT_ADVICE;

/* ------------------------------------------------------------------ rent increase (Decree 43 of 2013, Article 1) */
const BANDS = [[10, 0, 'up to 10% below the average'], [20, 5, '11% to 20% below'], [30, 10, '21% to 30% below'], [40, 15, '31% to 40% below'], [Infinity, 20, 'more than 40% below']];
function rentCheck(rent, avg, end) {
  const gap = (avg - rent) / avg * 100, g = Math.round(gap);
  const [, inc, label] = gap <= 0 ? BANDS[0] : BANDS.find(b => g <= b[0]);
  const out = {
    current_yearly_rent_aed: rent, average_yearly_rent_of_similar_units_aed: avg,
    rent_below_average_pct: r1(gap), band: gap <= 0 ? 'not below the average' : label,
    max_increase_pct: inc, max_increase_aed: Math.round(rent * inc / 100), max_new_rent_aed: Math.round(rent * (1 + inc / 100)),
    working: gap <= 0 ? 'The rent is not below the average for similar units, so no increase is allowed.'
      : `(${avg} - ${rent}) / ${avg} = ${r1(gap)}% below the average${Math.abs(gap - g) > 1e-9 ? `, ${g}% to the nearest whole percent` : ''}; band "${label}" allows ${inc}% of the current rent.`,
    near_band_edge: [10, 20, 30, 40].some(e => gap > e && gap < e + 1) ? 'The gap falls between two whole-percent bands; the Land Department\'s own calculator decides which applies.' : undefined,
    the_average: `The average must come from the official rent index (Decree 43 of 2013, Article 3), today the Dubai Land Department's Smart Rental Index: ${INDEX_URL}`,
    notice: 'Either side must give at least 90 days\' notice before the lease ends to change the rent or terms, unless the lease says otherwise (tenancy law, Article 14).',
    law: lawById('decree43').articles.filter(a => a.no <= 3).map(a => ({ article: a.no, text: a.text, url: a.url })),
    note: NOT_ADVICE,
  };
  if (end) {
    const d = new Date(end + 'T00:00:00Z');
    if (isNaN(d)) throw new ToolError('lease_end_date must be a date like 2027-03-31');
    const n = new Date(d.getTime() - 90 * 864e5);
    out.last_day_for_notice = n.toISOString().slice(0, 10);
  }
  return out;
}

/* ------------------------------------------------------------------ tools */
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = d => ({ type: 'string', description: d });
const int = (d, min, max) => ({ type: 'integer', description: d, ...(min !== undefined ? { minimum: min } : {}), ...(max !== undefined ? { maximum: max } : {}) });
const MEASURES = {
  sales: ['sales', null, 0], value: ['value', null, 0], price_per_sqm_flat: ['ppsqm_flat', 'n_flat', 10], price_per_sqm_villa: ['ppsqm_villa', 'n_villa', 10],
  offplan_share: ['offplan_share', 'sales', 20], mortgages: ['mortgages', null, 0],
  rent_flat: ['flat', 'n_flat', 20, true], rent_villa: ['villa', 'n_villa', 20, true], rental_contracts: ['contracts', null, 0, true],
};

const tools = [
  {
    name: 'dubai_overview', title: 'Dubai at a glance',
    description: 'Start here. Dubai property sales over the last 12 months against the 12 before (count, value, typical price per square metre for flats and villas, share sold off-plan), the latest month, rental contracts, the busiest areas, and headline official figures (population, visitors, new vehicles, business licences), with sources and how fresh the data is.',
    inputSchema: S({}),
    run() {
      const L = RE.last12, P = RE.prev12 || {}, R = RE.rent || {};
      const last = RE.monthly[RE.monthly.length - 1];
      const pick = ids => (OFF ? OFF.figures.filter(f => ids.includes(f.id)) : []).map(f => ({ figure: f.label, value: f.value, unit: f.unit, period: f.period, detail: f.detail, source: `${f.by}, ${f.source}`, url: f.url }));
      return {
        data_as_of: BUILT, property_data_refreshed: RE.updated,
        sales_last_12_months: { from: ml(L.from), to: ml(L.to), sales: L.sales, value_aed: L.value, price_per_sqm_flat_aed: L.ppsqm_flat, price_per_sqm_villa_aed: L.ppsqm_villa, offplan_share_pct: L.offplan_share },
        sales_12_months_before: P.sales ? { from: ml(P.from), to: ml(P.to), sales: P.sales, value_aed: P.value, price_per_sqm_flat_aed: P.ppsqm_flat, price_per_sqm_villa_aed: P.ppsqm_villa, offplan_share_pct: P.offplan_share } : null,
        latest_month: { month: ml(last.m), still_being_registered: !!last.partial, sales: last.sales, value_aed: last.value, mortgages: last.mortgages, gifts: last.gifts },
        rental_contracts: R.last12 ? { ...rentPeriod(), contracts: R.last12.contracts, new_contracts: R.last12.new, typical_yearly_rent_flat_aed: R.last12.flat, typical_yearly_rent_villa_aed: R.last12.villa } : null,
        busiest_areas: { period: salesPeriod(), areas: RE.areas.slice(0, 10).map(a => areaBrief(a.name)) },
        official_figures: pick(['pop_2025', 'tour_2025', 'veh_new_h1_2026', 'biz_h1_2026']),
        notes: [SALES_NOTE, RENT_NOTE, `Months before ${ml(RE.api_first)} come from a public copy of the Land Department's records (${(RE.copy_source || {}).name || ''}); area figures cover ${ml(RE.area_span.from)} onwards.`, NOT_ADVICE],
        sources: { sales_and_rents: DLD, history: (RE.copy_source || {}).url },
      };
    },
  },
  {
    name: 'find_area', title: 'Find an area',
    description: 'Look up Dubai areas by name, including everyday names (Downtown, JVC, JLT, Marina, DSO, MBR City). Returns the matching Land Department area names with their headline sales, price and rent figures. Use the exact name it gives in the other tools.',
    inputSchema: S({ query: str('All or part of an area name, e.g. "marina", "JVC", "al barsha"') }, ['query']),
    run({ query }) {
      const m = matchAreas(query);
      return { query, period: salesPeriod(), matches: m.slice(0, 25).map(areaBrief), more: m.length > 25 ? m.length - 25 : undefined,
        note: m.length ? 'Area names are as the Dubai Land Department records them.' : 'Nothing matches. Try a shorter word, or rank_areas to browse.' };
    },
  },
  {
    name: 'area_profile', title: 'Area profile',
    description: 'Everything for one area: sales, their value, off-plan share, mortgages and gifts, typical price per square metre for flats and villas, every month this year, its rank among all areas, the biggest projects selling there, and registered rental contracts with typical yearly rents. If a name covers several Land Department areas (e.g. Marina), each is returned.',
    inputSchema: S({ area: str('Area name, e.g. "Business Bay", "Downtown", "JVC"') }, ['area']),
    run({ area }) {
      const names = oneArea(area).slice(0, 6);
      const city = RE.last12;
      const profiles = names.map(n => {
        const a = saleRow(n), r = rentRow(n);
        return {
          area: n,
          sales: a ? {
            period: salesPeriod(), sales: a.sales, value_aed: a.value, offplan_share_pct: a.offplan_share, mortgages: a.mortgages, gifts: a.gifts,
            price_per_sqm_flat_aed: a.n_flat >= 10 ? a.ppsqm_flat : null, flat_sales: a.n_flat, price_per_sqm_villa_aed: a.n_villa >= 10 ? a.ppsqm_villa : null, villa_sales: a.n_villa,
            by_month: (a.series || []).map(s => ({ month: ml(s[0]), still_being_registered: RE.monthly.some(m => m.m === s[0] && m.partial) || undefined, sales: s[1], price_per_sqm_flat_aed: r1(s[2]), price_per_sqm_villa_aed: r1(s[3]), value_aed: s[4] })),
            rank: { by_sales: rankOf(n, 'sales'), by_value: rankOf(n, 'value'), by_flat_price_per_sqm: a.n_flat >= 10 ? rankOf(n, 'ppsqm_flat', 10, 'n_flat') : null },
            biggest_projects_selling: (RE.top_projects || []).filter(p => p.area === n).slice(0, 10).map(p => ({ project: p.name, sales: p.sales, value_aed: p.value })),
          } : 'No sales registered in this area over the period.',
          rents: r ? { ...rentPeriod(), contracts: r.contracts, new_contracts: r.new, typical_yearly_rent_flat_aed: r.n_flat >= 20 ? r.flat : null, flat_contracts: r.n_flat,
            typical_yearly_rent_villa_aed: r.n_villa >= 20 ? r.villa : null, villa_contracts: r.n_villa, typical_yearly_rent_office_aed: r.office } : 'No rental contracts registered here in the months loaded.',
        };
      });
      return { profiles, dubai_for_comparison: { last_12_months: `${ml(city.from)} to ${ml(city.to)}`, price_per_sqm_flat_aed: city.ppsqm_flat, price_per_sqm_villa_aed: city.ppsqm_villa, offplan_share_pct: city.offplan_share,
        typical_yearly_rent_flat_aed: (RE.rent.last12 || {}).flat }, notes: [SALES_NOTE, RENT_NOTE, NOT_ADVICE], source: DLD, page: SITE ? `${SITE}#areas/${encodeURIComponent(names[0])}` : undefined };
    },
  },
  {
    name: 'rank_areas', title: 'Rank areas',
    description: 'Rank every Dubai area by one measure: sales, value, price_per_sqm_flat, price_per_sqm_villa, offplan_share, mortgages, rent_flat, rent_villa or rental_contracts. Areas with too few sales or contracts for a reliable median are left out (min_count).',
    inputSchema: S({
      measure: { type: 'string', enum: Object.keys(MEASURES), description: 'What to rank by' },
      order: { type: 'string', enum: ['highest', 'lowest'], description: 'highest first (default) or lowest first' },
      limit: int('How many areas (default 20, up to 300)', 1, 300),
      min_count: int('Leave out areas with fewer sales or contracts than this behind the figure (default 10 for prices, 20 for rents)', 0),
    }, ['measure']),
    run({ measure, order = 'highest', limit = 20, min_count }) {
      const [key, nKey, defMin, isRent] = MEASURES[measure] || [];
      if (!key) throw new ToolError('Unknown measure');
      const min = min_count ?? defMin;
      const rows = (isRent ? RE.rent.areas : RE.areas).filter(a => a[key] !== null && a[key] !== undefined && (!nKey || (a[nKey] || 0) >= min));
      rows.sort((x, y) => order === 'lowest' ? x[key] - y[key] : y[key] - x[key]);
      return { measure, order, period: isRent ? rentPeriod() : salesPeriod(), areas_counted: rows.length, min_count: nKey ? min : undefined,
        areas: rows.slice(0, limit).map((a, i) => ({ rank: i + 1, ...areaBrief(a.name) })), notes: [isRent ? RENT_NOTE : SALES_NOTE] };
    },
  },
  {
    name: 'compare_areas', title: 'Compare areas',
    description: 'Two to ten areas side by side: sales, value, off-plan share, typical price per square metre, rental contracts and typical yearly rents, with Dubai as a whole for reference.',
    inputSchema: S({ areas: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10, description: 'Area names, e.g. ["Business Bay", "Dubai Marina", "JVC"]' } }, ['areas']),
    run({ areas }) {
      const rows = [], missing = [];
      for (const q of areas) { const m = matchAreas(q); if (m.length) m.slice(0, 3).forEach(n => rows.push({ asked_for: q, ...areaBrief(n) })); else missing.push(q); }
      const L = RE.last12;
      return { period: { sales: salesPeriod(), rents: rentPeriod() }, areas: rows, not_found: missing.length ? missing : undefined,
        dubai: { price_per_sqm_flat_aed_last_12_months: L.ppsqm_flat, price_per_sqm_villa_aed_last_12_months: L.ppsqm_villa, offplan_share_pct: L.offplan_share, typical_yearly_rent_flat_aed: (RE.rent.last12 || {}).flat },
        notes: [SALES_NOTE, RENT_NOTE] };
    },
  },
  {
    name: 'sales_by_month', title: 'Sales month by month',
    description: 'Dubai-wide property sales every month from January 2019: number, value, off-plan and ready, typical price per square metre for flats and villas, median sale price, and from 2026 mortgages and gifts. Optional from/to (YYYY-MM).',
    inputSchema: S({ from: str('First month, YYYY-MM (default: 24 months ago)'), to: str('Last month, YYYY-MM (default: latest)') }),
    run({ from, to }) {
      const all = RE.monthly;
      const f = from || all[Math.max(0, all.length - 24)].m, t = to || all[all.length - 1].m;
      const rows = all.filter(r => r.m >= f && r.m <= t).map(r => ({
        month: ml(r.m), still_being_registered: r.partial || undefined, source: r.src === 'copy' ? 'public copy of Land Department records' : 'Land Department open data',
        sales: r.sales, value_aed: r.value, offplan: r.offplan, ready: r.ready, offplan_share_pct: r.sales ? r1(r.offplan / r.sales * 100) : null,
        price_per_sqm_flat_aed: r1(r.ppsqm_flat), price_per_sqm_villa_aed: r1(r.ppsqm_villa), median_sale_price_aed: r.price_median,
        mortgages: r.mortgages ?? undefined, gifts: r.gifts ?? undefined,
      }));
      return { from: ml(f), to: ml(t), months: rows, notes: [SALES_NOTE, 'Mortgages and gifts are available from January 2026 only.'], source: DLD };
    },
  },
  {
    name: 'market_breakdown', title: 'Market breakdown',
    description: 'Dubai sales over the last 12 months broken down: by property type (flat, villa, office, land...), by price band, by flat size (studio, 1 bed, 2 bed...), and the projects with the most sales.',
    inputSchema: S({ part: { type: 'string', enum: ['all', 'types', 'price_bands', 'flat_sizes', 'projects'], description: 'Which breakdown (default all)' }, limit: int('Projects to list (default 25, up to 200)', 1, 200) }),
    run({ part = 'all', limit = 25 }) {
      const L = RE.last12, o = { period: `${ml(L.from)} to ${ml(L.to)}` };
      if (part === 'all' || part === 'types') o.by_property_type = RE.by_type.map(x => ({ type: x.type, sales: x.count, value_aed: x.value }));
      if (part === 'all' || part === 'price_bands') o.by_price_band_aed = RE.price_bands.map(x => ({ band: x.band, sales: x.count }));
      if (part === 'all' || part === 'flat_sizes') o.flats_by_size = RE.flat_rooms.map(x => ({ size: x.rooms, sales: x.count }));
      if (part === 'all' || part === 'projects') o.projects_with_most_sales = { period: salesPeriod(), projects: (RE.top_projects || []).slice(0, limit).map(p => ({ project: p.name, area: p.area, sales: p.sales, value_aed: p.value })) };
      o.source = DLD;
      return o;
    },
  },
  {
    name: 'rents', title: 'Rents',
    description: 'Rental contracts registered in Ejari: every month loaded (contracts, new and renewed, typical yearly rent for flats, villas, offices and shops), and by area (pass area for one area, or get the areas with the most contracts).',
    inputSchema: S({ area: str('One area (optional)'), limit: int('Areas to list when no area is given (default 30, up to 200)', 1, 200) }),
    run({ area, limit = 30 }) {
      const R = RE.rent || {};
      const months = (R.monthly || []).map(m => ({ month: ml(m.m), still_being_registered: m.partial || undefined, contracts: m.contracts, new: m.new, renewed: m.renewed,
        typical_yearly_rent_aed: { flat: m.flat, villa: m.villa, office: m.office, shop: m.shop } }));
      const out = { period: rentPeriod(), months };
      if (area) out.areas = oneArea(area).map(n => { const r = rentRow(n); return r ? { area: n, contracts: r.contracts, new: r.new, typical_yearly_rent_aed: { flat: r.n_flat >= 20 ? r.flat : null, villa: r.n_villa >= 20 ? r.villa : null, office: r.office }, flat_contracts: r.n_flat, villa_contracts: r.n_villa } : { area: n, note: 'No rental contracts registered here in the months loaded.' }; });
      else out.areas_with_most_contracts = [...(R.areas || [])].sort((a, b) => b.contracts - a.contracts).slice(0, limit).map(r => ({ area: r.name, contracts: r.contracts, new: r.new, typical_yearly_rent_flat_aed: r.n_flat >= 20 ? r.flat : null, typical_yearly_rent_villa_aed: r.n_villa >= 20 ? r.villa : null }));
      out.notes = [RENT_NOTE, 'Months not listed have not been loaded yet.'];
      out.source = DLD;
      return out;
    },
  },
  {
    name: 'official_figures', title: 'Official figures',
    description: 'Figures published by Dubai government bodies, each with its source and date: population and age, vehicles and transport (Metro, taxis, airport), private schools and students, business licences and the economy, tourism and hotels.',
    inputSchema: S({ topic: { type: 'string', enum: ['all', 'population', 'transport', 'schools', 'business', 'tourism'], description: 'Which topic (default all)' }, find: str('Words to look for in the figure names (optional)') }),
    run({ topic = 'all', find }) {
      let f = OFF ? OFF.figures : [];
      if (topic !== 'all') f = f.filter(x => x.section === topic);
      if (find) { const ts = toks(find); f = f.filter(x => ts.some(t => norm(x.label + ' ' + (x.detail || '')).includes(t))); }
      return { checked: OFF && OFF.checked, figures: f.map(x => ({ topic: x.section, figure: x.label, value: x.value, table: x.table, unit: x.unit, period: x.period, detail: x.detail, produced_by: x.by, published: x.source, url: x.url })) };
    },
  },
  {
    name: 'rent_increase_check', title: 'Rent increase check',
    description: 'The most a landlord can raise the rent at renewal under Decree 43 of 2013, from the current yearly rent and the average yearly rent of similar units in the Smart Rental Index, with the working and the decree\'s text. With lease_end_date, also the last day for the 90 days\' notice.',
    inputSchema: S({ current_rent: { type: 'number', description: 'Current yearly rent, AED', exclusiveMinimum: 0 }, average_rent: { type: 'number', description: 'Average yearly rent of similar units from the Smart Rental Index, AED', exclusiveMinimum: 0 }, lease_end_date: str('Lease end date, YYYY-MM-DD (optional)') }, ['current_rent', 'average_rent']),
    run({ current_rent, average_rent, lease_end_date }) { return rentCheck(+current_rent, +average_rent, lease_end_date); },
  },
  {
    name: 'search_law', title: 'Search Dubai property law',
    description: 'Search plain-language answers and the full official text of Dubai\'s property laws: the tenancy law (Law 26 of 2007 as amended), the rent increase decree (Decree 43 of 2013), the jointly owned property law (Law 6 of 2019: service charges, owners committees), the escrow law (Law 8 of 2007) and the interim register law (Law 13 of 2008 as amended: off-plan buyers who stop paying). Returns the best answers with the articles they rest on, and matching articles.',
    inputSchema: S({ query: str('A question or words, e.g. "eviction to sell the flat", "service charge not paid"'), topic: { type: 'string', enum: ['renting', 'owning', 'offplan'], description: 'Narrow to one topic (optional)' } }, ['query']),
    run({ query, topic }) {
      const ts = toks(query);
      const qs = LAWS.answers.filter(q => !topic || q.topic === topic).map(q => ({ q, s: scoreText(q.q, ts) * 3 + scoreText(q.tags.join(' '), ts) * 2 + scoreText(q.a.join(' '), ts) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 5).map(x => answerOut(x.q));
      const arts = [];
      for (const l of LAWS.laws) { if (topic && l.topic !== topic) continue; for (const a of l.articles) { const s = scoreText(a.heading + ' ' + a.text, ts); if (s) arts.push({ s, law_id: l.id, law: l.short, article_no: a.no, heading: a.heading, url: a.url, excerpt: a.text.replace(/\s+/g, ' ').slice(0, 300) }); } }
      arts.sort((a, b) => b.s - a.s);
      return { query, answers: qs, articles: arts.slice(0, 8).map(({ s, ...a }) => a), how: 'Read an article in full with get_law_article (law_id, article_no).', checked: LAWS.checked, note: LAW_NOTE };
    },
  },
  {
    name: 'get_law_article', title: 'Read a law article',
    description: 'The full official English text of one article (as amended), with its link on the Dubai Legal Portal. Without article, lists every article of the law with its heading. Laws: tenancy, decree43, note34 (2026 explanatory note on tenancy Article 34), jointly, escrow, interim.',
    inputSchema: S({ law: { type: 'string', enum: ['tenancy', 'decree43', 'note34', 'jointly', 'escrow', 'interim'], description: 'Which law' }, article: int('Article number (optional)', 0) }, ['law']),
    run({ law, article }) {
      const l = lawById(law);
      if (!l) throw new ToolError('Unknown law');
      const head = { law: l.short, name: l.name, url: l.url, fetched: l.fetched, sources: l.sources.map(s => ({ title: s.title, url: s.url })) };
      if (article === undefined || article === null) return { ...head, articles: l.articles.map(a => ({ article_no: a.no, heading: a.heading, amended_by: a.amended_by || undefined })) };
      const a = l.articles.find(x => x.no === article);
      if (!a) throw new ToolError(`${l.short} has no article ${article}. It has articles ${l.articles.map(x => x.no).join(', ')}.`);
      return { ...head, article_no: a.no, heading: a.heading, text: a.text, amended_by: a.amended_by || undefined, article_url: a.url,
        answers_citing_it: LAWS.answers.filter(q => q.cite.some(c => c.law === law && c.art === article)).map(q => q.q), note: 'Official English text; the Arabic text prevails.' };
    },
  },
  // The two tools ChatGPT's connectors and deep research look for: search returns ids, fetch returns one document.
  {
    name: 'search', title: 'Search Dubai Insight',
    description: 'Search everything in Dubai Insight (areas, law answers, law articles, official figures) and get ids to read with fetch.',
    inputSchema: S({ query: str('Search words') }, ['query']),
    run({ query }) {
      const ts = toks(query), res = [];
      for (const n of areasIn(query).slice(0, 5)) res.push({ id: `area:${n}`, title: `${n}: sales, prices and rents`, url: SITE ? `${SITE}#areas/${encodeURIComponent(n)}` : DLD });
      LAWS.answers.map(q => ({ q, s: scoreText(q.q + ' ' + q.tags.join(' '), ts) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 5).forEach(({ q }) => res.push({ id: `answer:${q.id}`, title: q.q, url: q.cite[0].url }));
      const arts = [];
      for (const l of LAWS.laws) for (const a of l.articles) { const s = scoreText(a.heading + ' ' + a.text, ts); if (s) arts.push({ s, id: `article:${l.id}:${a.no}`, title: `${l.short}${a.no ? ', Article ' + a.no : ''}${a.heading ? ': ' + a.heading : ''}`, url: a.url }); }
      arts.sort((a, b) => b.s - a.s).slice(0, 5).forEach(({ s, ...a }) => res.push(a));
      (OFF ? OFF.figures : []).filter(f => ts.some(t => norm(f.label).includes(t))).slice(0, 5).forEach(f => res.push({ id: `figure:${f.id}`, title: f.label, url: f.url }));
      if (!res.length || ts.some(t => ['dubai', 'market', 'overview', 'property', 'prices', 'sales'].includes(t))) res.push({ id: 'overview', title: 'Dubai property market at a glance', url: SITE || DLD });
      return { results: res };
    },
  },
  {
    name: 'fetch', title: 'Read a Dubai Insight item',
    description: 'Read one item found with search, by its id (area:<name>, answer:<id>, article:<law>:<no>, figure:<id> or overview).',
    inputSchema: S({ id: str('An id from search') }, ['id']),
    run({ id }) {
      const [kind, ...rest] = String(id).split(':');
      const doc = (title, obj, url) => ({ id, title, text: typeof obj === 'string' ? obj : JSON.stringify(obj), url, metadata: { source: 'Dubai Insight', data_as_of: BUILT } });
      if (kind === 'overview') return doc('Dubai property market at a glance', tools[0].run({}), SITE || DLD);
      if (kind === 'area') { const n = rest.join(':'); return doc(`${n}: sales, prices and rents`, tools.find(t => t.name === 'area_profile').run({ area: n }), SITE ? `${SITE}#areas/${encodeURIComponent(n)}` : DLD); }
      if (kind === 'answer') { const q = LAWS.answers.find(x => x.id === rest[0]); if (!q) throw new ToolError('Unknown id'); return doc(q.q, { ...answerOut(q), note: LAW_NOTE }, q.cite[0].url); }
      if (kind === 'article') { const out = tools.find(t => t.name === 'get_law_article').run({ law: rest[0], article: +rest[1] }); return doc(`${out.law}, Article ${out.article_no}`, out, out.article_url); }
      if (kind === 'figure') { const f = (OFF ? OFF.figures : []).find(x => x.id === rest[0]); if (!f) throw new ToolError('Unknown id'); return doc(f.label, f, f.url); }
      throw new ToolError('Unknown id. Use an id returned by search.');
    },
  },
];

const server = createServer({
  name: 'dubai-insight', title: 'Dubai Insight', version: BUILT,
  home: 'Dubai Insight explains Dubai\'s open public data in plain language.',
  instructions: 'Dubai Insight: Dubai\'s official open data in plain language, by Hassan Ali. Property sales (every sale registered with the Dubai Land Department, refreshed daily, history from 2019), rental contracts registered in Ejari, official figures (population, transport, schools, business, tourism) and Dubai property law (tenancy, rent increases, service charges, off-plan) with plain-language answers and the full official article texts. '
    + 'Start with dubai_overview; use find_area for area names (the Land Department\'s names differ from everyday ones: Downtown is "Burj Khalifa", JVC is "Jumeirah Village Circle"). '
    + 'Answer from the tools\' figures, name the figure, period and source you used, and say so when the data does not cover something. For law, cite the article numbers and say the Arabic text prevails. Ejari rent medians are not the Smart Rental Index. '
    + NOT_ADVICE,
  tools,
});

export default {
  fetch(request, env, ctx) {
    SITE = (env && env.SITE_URL) ? String(env.SITE_URL).replace(/\/?$/, '/') : '';
    return server.fetch(request, env, ctx);
  },
};
export { tools };

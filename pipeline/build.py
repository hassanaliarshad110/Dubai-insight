"""Turn the monthly Dubai Land Department summaries (data/dld/) and the official figures (data/official/)
into the small JSON files the website reads (site/data/).

    python pipeline/build.py
"""
import glob, json, os, time
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
OUT = os.path.join(HERE, '..', 'site', 'data')


def load_months(kind):
    out = {}
    for f in sorted(glob.glob(os.path.join(DATA, 'dld', kind, '*.json'))):
        d = json.load(open(f))
        out[d['month']] = d
    return out


def wavg(pairs):
    """average of monthly medians, weighted by how many records each month had"""
    pairs = [(v, n) for v, n in pairs if v is not None and n]
    tot = sum(n for _, n in pairs)
    return round(sum(v * n for v, n in pairs) / tot) if tot else None


def pct(a, b):
    return round((a - b) / b * 100, 1) if a is not None and b else None


def complete_months(months, today_ym):
    """the current month is still being registered: everything up to last month counts as complete"""
    return [m for m in months if m < today_ym]


def build_realestate(tx, rent, today_ym, hist=None):
    api_months = sorted(tx)
    hist = {m: v for m, v in (hist or {}).items() if not api_months or m < api_months[0]}
    city = dict(hist); city.update(tx)              # Dubai-wide series: the published copy before the API's first month
    months = sorted(city)
    full = complete_months(months, today_ym)
    monthly = []
    for m in months:
        d = city[m]
        g = d['groups']
        api = m in tx
        monthly.append({
            'm': m, 'partial': m >= today_ym, 'src': 'dld' if api else 'copy',
            'sales': d['sales']['count'], 'value': d['sales']['value'],
            'offplan': d['sales']['offplan'], 'ready': d['sales']['ready'], 'offplan_value': d['sales'].get('offplan_value'),
            'mortgages': g.get('Mortgage', {}).get('count', 0) if api else None, 'mortgage_value': g.get('Mortgage', {}).get('value', 0) if api else None,
            'gifts': g.get('Gifts', {}).get('count', 0) if api else None, 'gift_value': g.get('Gifts', {}).get('value', 0) if api else None,
            'ppsqm_flat': d['ppsqm_flat']['median'], 'ppsqm_villa': d['ppsqm_villa']['median'],
            'n_flat': d['ppsqm_flat']['n'], 'n_villa': d['ppsqm_villa']['n'],
            'price_median': d['sale_price']['median'],
        })
    last12 = full[-12:]
    prev12 = full[-24:-12]

    def span(ms):
        if not ms:
            return None
        rows = [r for r in monthly if r['m'] in ms]
        s = sum(r['sales'] for r in rows)
        mg = [r for r in rows if r['mortgages'] is not None]
        return {'from': ms[0], 'to': ms[-1], 'sales': s, 'value': sum(r['value'] for r in rows),
                'offplan_share': round(sum(r['offplan'] for r in rows) / s * 100, 1) if s else None,
                'mortgages': sum(r['mortgages'] for r in mg) if len(mg) == len(rows) else None,
                'gifts': sum(r['gifts'] for r in mg) if len(mg) == len(rows) else None,
                'ppsqm_flat': wavg([(r['ppsqm_flat'], r['n_flat']) for r in rows]),
                'ppsqm_villa': wavg([(r['ppsqm_villa'], r['n_villa']) for r in rows])}

    # by area: the DLD service's complete months (it serves the current year only), and a monthly series per area
    api_full = complete_months(api_months, today_ym)
    area_cur = api_full[-12:]
    series_months = api_months
    areas = defaultdict(lambda: {'series': {}})
    for m in api_months:
        for a, v in tx[m]['areas'].items():
            areas[a]['series'][m] = v
    area_rows = []
    for a, A in areas.items():
        cur = [A['series'][m] for m in area_cur if m in A['series']]
        pre = []
        s_cur = sum(x['sales'] for x in cur)
        s_pre = sum(x['sales'] for x in pre)
        if s_cur + s_pre == 0 and not any(x.get('mortgages') for x in cur):
            continue
        pf = wavg([(x['ppsqm_flat'], x['n_flat']) for x in cur])
        pf0 = wavg([(x['ppsqm_flat'], x['n_flat']) for x in pre])
        pv = wavg([(x['ppsqm_villa'], x['n_villa']) for x in cur])
        pv0 = wavg([(x['ppsqm_villa'], x['n_villa']) for x in pre])
        area_rows.append({
            'name': a, 'sales': s_cur, 'sales_prev': s_pre, 'sales_chg': pct(s_cur, s_pre),
            'value': sum(x['value'] for x in cur),
            'offplan_share': round(sum(x['offplan'] for x in cur) / s_cur * 100, 1) if s_cur else None,
            'mortgages': sum(x.get('mortgages', 0) for x in cur), 'gifts': sum(x.get('gifts', 0) for x in cur),
            'ppsqm_flat': pf, 'ppsqm_flat_chg': pct(pf, pf0) if sum(x['n_flat'] for x in cur) >= 20 and sum(x['n_flat'] for x in pre) >= 20 else None,
            'ppsqm_villa': pv, 'ppsqm_villa_chg': pct(pv, pv0) if sum(x['n_villa'] for x in cur) >= 20 and sum(x['n_villa'] for x in pre) >= 20 else None,
            'n_flat': sum(x['n_flat'] for x in cur), 'n_villa': sum(x['n_villa'] for x in cur),
            'series': [[m, A['series'][m]['sales'], A['series'][m]['ppsqm_flat'], A['series'][m]['ppsqm_villa'], A['series'][m]['value']]
                       for m in series_months if m in A['series']],
        })
    area_rows.sort(key=lambda r: -r['sales'])

    # mix over the last 12 complete months
    by_type, bands, rooms = defaultdict(lambda: {'count': 0, 'value': 0}), defaultdict(int), defaultdict(int)
    projects = defaultdict(lambda: {'sales': 0, 'value': 0, 'area': ''})
    for m in last12:
        d = city[m]
        for k, v in d['by_type'].items():
            by_type[k]['count'] += v['count']; by_type[k]['value'] += v['value']
        for k, v in d['price_bands'].items():
            bands[k] += v
        for k, v in d['flat_rooms'].items():
            rooms[k] += v
    for m in area_cur:                              # projects come from the DLD service's own months
        for p in tx[m].get('top_projects', []):
            P = projects[p['name']]
            P['sales'] += p['sales']; P['value'] += p['value']; P['area'] = p['area']
    band_order = ['under 1M', '1M to 2M', '2M to 5M', '5M to 10M', '10M and over']

    # rents
    rmonths = sorted(rent)
    rfull = complete_months(rmonths, today_ym)
    rmonthly = []
    for m in rmonths:
        d = rent[m]
        bt = d['by_type']
        rmonthly.append({'m': m, 'partial': m >= today_ym, 'contracts': d['rows'],
                         'new': d['versions'].get('New', 0), 'renewed': d['versions'].get('Renewed', 0),
                         'flat': (bt.get('Flat') or {}).get('median'), 'villa': (bt.get('Villa') or {}).get('median'),
                         'office': (bt.get('Office') or {}).get('median'), 'shop': (bt.get('Shop') or {}).get('median'),
                         'n_flat': (bt.get('Flat') or {}).get('n', 0), 'n_villa': (bt.get('Villa') or {}).get('n', 0)})
    r12 = rfull[-12:]
    r_rooms = defaultdict(list)
    r_areas = defaultdict(lambda: {'contracts': 0, 'new': 0, 'flat': [], 'villa': [], 'office': [], 'rooms': defaultdict(list)})
    for m in r12:
        d = rent[m]
        for k, v in d['flat_rooms'].items():
            r_rooms[k].append((v['median'], v['n']))
        for a, v in d['areas'].items():
            R = r_areas[a]
            R['contracts'] += v['contracts']; R['new'] += v['new']
            R['flat'].append((v['flat'], v['n_flat'])); R['villa'].append((v['villa'], v['n_villa']))
            R['office'].append((v['office'], 1 if v['office'] else 0))
            for k, med in v.get('flat_rooms', {}).items():
                R['rooms'][k].append((med, 1))
    rent_areas = sorted(({'name': a, 'contracts': R['contracts'], 'new': R['new'],
                          'flat': wavg(R['flat']), 'villa': wavg(R['villa']), 'office': wavg(R['office']),
                          'n_flat': sum(n for _, n in R['flat']), 'n_villa': sum(n for _, n in R['villa']),
                          'rooms': {k: wavg(v) for k, v in R['rooms'].items()}}
                         for a, R in r_areas.items() if R['contracts'] >= 10), key=lambda r: -r['contracts'])
    room_order = ['Studio', '1 bed room', '2 bed rooms', '3 bed rooms', '4 bed rooms', '5 bed rooms']

    return {
        'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'source': {'name': 'Dubai Land Department open data', 'url': 'https://dubailand.gov.ae/en/open-data/real-estate-data/'},
        'first_month': months[0] if months else None, 'last_complete': full[-1] if full else None,
        'api_first': api_months[0] if api_months else None,
        'area_span': {'from': area_cur[0], 'to': area_cur[-1]} if area_cur else None,
        'copy_source': next((v['source'] for v in hist.values()), None),
        'monthly': monthly, 'last12': span(last12), 'prev12': span(prev12),
        'areas': area_rows,
        'by_type': sorted(({'type': k, **v} for k, v in by_type.items()), key=lambda r: -r['count']),
        'price_bands': [{'band': b, 'count': bands.get(b, 0)} for b in band_order],
        'flat_rooms': sorted(({'rooms': k, 'count': v} for k, v in rooms.items()), key=lambda r: -r['count']),
        'top_projects': sorted(({'name': k, **v} for k, v in projects.items()), key=lambda r: -r['sales'])[:25],
        'rent': {
            'first_month': rmonths[0] if rmonths else None, 'last_complete': rfull[-1] if rfull else None,
            'monthly': rmonthly,
            'last12': {'from': r12[0], 'to': r12[-1],
                       'contracts': sum(rent[m]['rows'] for m in r12),
                       'new': sum(rent[m]['versions'].get('New', 0) for m in r12),
                       'flat': wavg([(r['flat'], r['n_flat']) for r in rmonthly if r['m'] in r12]),
                       'villa': wavg([(r['villa'], r['n_villa']) for r in rmonthly if r['m'] in r12])} if r12 else None,
            'flat_rooms': [{'rooms': k, 'median': wavg(r_rooms[k])} for k in sorted(r_rooms, key=lambda k: (room_order.index(k) if k in room_order else 99, k)) if wavg(r_rooms[k])],
            'areas': rent_areas,
        },
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    today_ym = time.strftime('%Y-%m', time.gmtime(time.time() + 4 * 3600))   # Dubai time
    tx, rent, hist = load_months('tx'), load_months('rent'), load_months('hist')
    if tx:
        re_ = build_realestate(tx, rent, today_ym, hist)
        json.dump(re_, open(os.path.join(OUT, 'realestate.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
        print('realestate.json', len(re_['monthly']), 'months of sales (', len(hist), 'from the published copy ),', len(re_['rent']['monthly']), 'of rents,', len(re_['areas']), 'areas')
    off = os.path.join(DATA, 'official.json')
    if os.path.exists(off):
        o = json.load(open(off))
        o['built'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        json.dump(o, open(os.path.join(OUT, 'official.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
        print('official.json', len(o.get('figures', [])), 'figures')
    import lawlib
    lawlib.main()


if __name__ == '__main__':
    main()

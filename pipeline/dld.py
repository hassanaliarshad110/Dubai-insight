"""Dubai Land Department open data: property transactions and rental contracts, month by month.

Each month is pulled from the DLD open-data API (the same feed as dubailand.gov.ae/en/open-data/real-estate-data)
and reduced to summary figures, kept in data/dld/. The latest months are pulled again on every run, because
registrations for a month keep arriving for several weeks after it ends; older months are pulled once.

    python pipeline/dld.py --budget-min 120 [--since 2019-01] [--rent-since 2023-01]
"""
import argparse, json, os, statistics, sys, time, urllib.request, urllib.error
from collections import defaultdict
from datetime import date

API = 'https://gateway.dubailand.gov.ae/open-data/'
HEAD = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
        'Referer': 'https://dubailand.gov.ae/', 'Origin': 'https://dubailand.gov.ae',
        'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json'}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'dld')
REFRESH_MONTHS = 3          # this month and the two before are always pulled again
PAGE = 10000


def log(*a):
    print(*a, flush=True)


def post(cmd, body, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(API + cmd, data=json.dumps(body).encode(), headers=HEAD, method='POST')
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())['response']['result'] or []
        except Exception as e:
            log(f'   retry {i + 1}/{tries} {cmd}: {str(e)[:120]}')
            time.sleep(10 * (i + 1))
    raise RuntimeError(f'{cmd} failed after {tries} tries')


def month_bounds(ym):
    y, m = map(int, ym.split('-'))
    first = date(y, m, 1)
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    last = date.fromordinal(nxt.toordinal() - 1)
    return first, last


def months_between(a, b):
    y, m = map(int, a.split('-'))
    out = []
    while f'{y:04d}-{m:02d}' <= b:
        out.append(f'{y:04d}-{m:02d}')
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def fetch_all(cmd, body_for):
    rows, skip = [], 0
    while True:
        part = post(cmd, body_for(skip))
        rows += part
        total = int(part[0].get('TOTAL') or 0) if part else 0
        skip += PAGE
        if not part or skip >= total:
            return rows, total


def num(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def q(vals, p):
    """quantile by linear interpolation; None when empty"""
    if not vals:
        return None
    s = sorted(vals)
    k = (len(s) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 1)


def summary(vals):
    return {'n': len(vals), 'p25': q(vals, .25), 'median': q(vals, .5), 'p75': q(vals, .75)}


# ------------------------------------------------------------------ transactions
def tx_month(ym):
    first, last = month_bounds(ym)
    f, t = first.strftime('%m/%d/%Y'), last.strftime('%m/%d/%Y')
    body = lambda skip: {'P_FROM_DATE': f, 'P_TO_DATE': t, 'P_GROUP_ID': '', 'P_IS_OFFPLAN': '', 'P_IS_FREE_HOLD': '',
                         'P_AREA_ID': '', 'P_USAGE_ID': '', 'P_PROP_TYPE_ID': '', 'P_TAKE': str(PAGE),
                         'P_SKIP': str(skip), 'P_SORT': 'TRANSACTION_NUMBER_ASC'}
    rows, total = fetch_all('transactions', body)
    groups = defaultdict(lambda: {'count': 0, 'value': 0.0})
    sales = {'count': 0, 'value': 0.0, 'offplan': 0, 'ready': 0, 'offplan_value': 0.0}
    by_type = defaultdict(lambda: {'count': 0, 'value': 0.0})
    by_rooms = defaultdict(int)
    bands = defaultdict(int)
    area = defaultdict(lambda: {'sales': 0, 'value': 0.0, 'offplan': 0, 'mortgages': 0, 'gifts': 0, 'ppsqm_flat': [], 'ppsqm_villa': [], 'ppsqm_all': []})
    projects = defaultdict(lambda: {'sales': 0, 'value': 0.0, 'area': ''})
    ppsqm_flat, ppsqm_villa, prices = [], [], []
    for r in rows:
        g = r.get('GROUP_EN') or 'Other'
        v = num(r.get('TRANS_VALUE')) or 0.0
        groups[g]['count'] += 1
        groups[g]['value'] += v
        a = (r.get('AREA_EN') or 'Unknown').strip().title()
        if g == 'Mortgage':
            area[a]['mortgages'] += 1
        elif g == 'Gifts':
            area[a]['gifts'] += 1
        if g != 'Sales':
            continue
        off = r.get('IS_OFFPLAN') == 1 or r.get('IS_OFFPLAN_EN') == 'Off-Plan'
        sales['count'] += 1
        sales['value'] += v
        sales['offplan' if off else 'ready'] += 1
        if off:
            sales['offplan_value'] += v
        sub = r.get('PROP_SB_TYPE_EN') or r.get('PROP_TYPE_EN') or 'Other'
        by_type[sub]['count'] += 1
        by_type[sub]['value'] += v
        if sub == 'Flat':
            by_rooms[r.get('ROOMS_EN') or 'Not stated'] += 1
        if v > 0:
            prices.append(v)
            b = ('under 1M' if v < 1e6 else '1M to 2M' if v < 2e6 else '2M to 5M' if v < 5e6 else '5M to 10M' if v < 1e7 else '10M and over')
            bands[b] += 1
        sz = num(r.get('ACTUAL_AREA')) or num(r.get('PROCEDURE_AREA'))
        A = area[a]
        A['sales'] += 1
        A['value'] += v
        A['offplan'] += off
        if v > 0 and sz and sz >= 15:
            pp = v / sz
            if 500 <= pp <= 400000:          # AED per sq m; drops data-entry errors (whole-building or token values)
                A['ppsqm_all'].append(pp)
                if sub == 'Flat':
                    ppsqm_flat.append(pp); A['ppsqm_flat'].append(pp)
                elif sub == 'Villa':
                    ppsqm_villa.append(pp); A['ppsqm_villa'].append(pp)
        p = (r.get('PROJECT_EN') or '').strip()
        if p:
            projects[p]['sales'] += 1
            projects[p]['value'] += v
            projects[p]['area'] = a
    areas = {}
    for a, A in area.items():
        areas[a] = {'sales': A['sales'], 'value': round(A['value']), 'offplan': A['offplan'], 'mortgages': A['mortgages'], 'gifts': A['gifts'],
                    'ppsqm_flat': q(A['ppsqm_flat'], .5), 'ppsqm_villa': q(A['ppsqm_villa'], .5), 'ppsqm_all': q(A['ppsqm_all'], .5),
                    'n_flat': len(A['ppsqm_flat']), 'n_villa': len(A['ppsqm_villa'])}
    top_projects = sorted(projects.items(), key=lambda kv: -kv[1]['sales'])[:40]
    return {
        'month': ym, 'rows': len(rows), 'reported_total': total, 'pulled': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'groups': {k: {'count': v['count'], 'value': round(v['value'])} for k, v in groups.items()},
        'sales': {k: (round(v) if isinstance(v, float) else v) for k, v in sales.items()},
        'sale_price': summary(prices),
        'ppsqm_flat': summary(ppsqm_flat), 'ppsqm_villa': summary(ppsqm_villa),
        'by_type': {k: {'count': v['count'], 'value': round(v['value'])} for k, v in by_type.items()},
        'flat_rooms': dict(by_rooms), 'price_bands': dict(bands),
        'areas': areas,
        'top_projects': [{'name': k, 'area': v['area'], 'sales': v['sales'], 'value': round(v['value'])} for k, v in top_projects],
    }


# ------------------------------------------------------------------ rental contracts (Ejari)
def rent_month(ym):
    first, last = month_bounds(ym)
    f, t = first.strftime('%m/%d/%Y'), last.strftime('%m/%d/%Y')
    body = lambda skip: {'P_FROM_DATE': f, 'P_TO_DATE': t, 'P_DATE_TYPE': '0', 'P_IS_FREE_HOLD': '', 'P_VERSION': '',
                         'P_AREA_ID': '', 'P_USAGE_ID': '', 'P_PROP_TYPE_ID': '', 'P_TAKE': str(PAGE),
                         'P_SKIP': str(skip), 'P_SORT': 'CONTRACT_NUMBER_ASC'}
    rows, total = fetch_all('rents', body)
    ver = defaultdict(int)
    by_sub = defaultdict(lambda: {'count': 0, 'annual': []})
    area = defaultdict(lambda: {'contracts': 0, 'new': 0, 'flat': [], 'villa': [], 'office': [], 'flat_rooms': defaultdict(list)})
    flat_rooms = defaultdict(list)
    for r in rows:
        v = r.get('VERSION_EN') or 'Other'
        ver[v] += 1
        amt = num(r.get('ANNUAL_AMOUNT')) or num(r.get('CONTRACT_AMOUNT'))
        sub = r.get('PROP_SUB_TYPE_EN') or r.get('PROP_TYPE_EN') or 'Other'
        a = (r.get('AREA_EN') or 'Unknown').strip().title()
        A = area[a]
        A['contracts'] += 1
        A['new'] += v == 'New'
        by_sub[sub]['count'] += 1
        if amt and 3000 <= amt <= 20000000:
            by_sub[sub]['annual'].append(amt)
            key = {'Flat': 'flat', 'Villa': 'villa', 'Office': 'office'}.get(sub)
            if key:
                A[key].append(amt)
            if sub == 'Flat':
                rooms = (r.get('ROOMS') or '').strip() or 'Not stated'
                flat_rooms[rooms].append(amt)
                A['flat_rooms'][rooms].append(amt)
    areas = {a: {'contracts': A['contracts'], 'new': A['new'],
                 'flat': q(A['flat'], .5), 'villa': q(A['villa'], .5), 'office': q(A['office'], .5),
                 'n_flat': len(A['flat']), 'n_villa': len(A['villa']),
                 'flat_rooms': {k: q(v, .5) for k, v in A['flat_rooms'].items() if len(v) >= 5}}
             for a, A in area.items()}
    return {
        'month': ym, 'rows': len(rows), 'reported_total': total, 'pulled': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'versions': dict(ver),
        'by_type': {k: dict(summary(v['annual']), count=v['count']) for k, v in by_sub.items()},
        'flat_rooms': {k: summary(v) for k, v in flat_rooms.items()},
        'areas': areas,
    }


# ------------------------------------------------------------------ driver
def run(kind, months, fn, deadline):
    d = os.path.join(ROOT, kind)
    os.makedirs(d, exist_ok=True)
    today = date.today().strftime('%Y-%m')
    y, mo = map(int, today.split('-'))
    for _ in range(REFRESH_MONTHS - 1):
        y, mo = (y - 1, 12) if mo == 1 else (y, mo - 1)
    recent = set(months_between(f'{y:04d}-{mo:02d}', today))
    # newest first, so the site is useful after the first run; missing months before refreshing old ones
    todo = [m for m in reversed(months) if m in recent or not os.path.exists(os.path.join(d, m + '.json'))]
    empty_streak = 0
    for m in todo:
        if time.time() > deadline:
            log(f'{kind}: time budget used; {m} and older wait for the next run')
            return False
        t = time.time()
        try:
            out = fn(m)
        except Exception as e:
            log(f'{kind} {m}: FAILED {e}')
            continue
        if out['rows'] == 0:
            empty_streak += 1
            log(f'{kind} {m}: no records')
            if m < today and empty_streak >= 3:
                log(f'{kind}: three empty months in a row; the feed starts after {m}')
                open(os.path.join(d, '_start.txt'), 'w').write(m)
                return True
            continue
        empty_streak = 0
        with open(os.path.join(d, m + '.json'), 'w') as fh:
            json.dump(out, fh, separators=(',', ':'), ensure_ascii=False)
        log(f'{kind} {m}: {out["rows"]:,} records in {time.time() - t:.0f}s')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default='2019-01')
    ap.add_argument('--rent-since', default='2023-01')
    ap.add_argument('--budget-min', type=float, default=120)
    ap.add_argument('--only', choices=['tx', 'rent'])
    a = ap.parse_args()
    start = time.time()
    deadline = start + a.budget_min * 60
    today = date.today().strftime('%Y-%m')
    for kind, since, fn in [('tx', a.since, tx_month), ('rent', a.rent_since, rent_month)]:
        if a.only and a.only != kind:
            continue
        stop = os.path.join(ROOT, kind, '_start.txt')
        if os.path.exists(stop):
            since = max(since, open(stop).read().strip())
        # transactions get two-thirds of the time on the first pass, rents what is left
        dl = deadline if kind == 'rent' else start + a.budget_min * 60 * (0.6 if not a.only else 1)
        run(kind, months_between(since, today), fn, dl)
    log(f'done in {(time.time() - start) / 60:.1f} min')


if __name__ == '__main__':
    main()

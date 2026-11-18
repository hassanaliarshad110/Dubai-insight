"""Find the Dubai open datasets the site needs: their download links, size and columns.
Runs on GitHub's build machines (they can reach Dubai Pulse and the DLD portal)."""
import csv, io, json, re, sys, time, urllib.request, urllib.error

UA = {'User-Agent': 'Mozilla/5.0 (DubaiInsight data refresh; +https://github.com/hassanaliarshad110/dubai-insight)'}
OUT = {}

def get(url, n=None, method='GET', data=None, headers=None, timeout=90):
    h = dict(UA); h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read(n) if n else r.read()
        return r.status, dict(r.headers), body

def log(*a):
    print(*a, flush=True)

# 1. Dubai Pulse catalog of every open dataset
CAT_PAGE = 'https://www.dubaipulse.gov.ae/data/smartdubai-general/smart_dubai_dubai_pulse_data_catalog_open-open'

def links_on(page):
    try:
        st, hd, b = get(page)
    except Exception as e:
        log('PAGE FAIL', page, e); return []
    html = b.decode('utf-8', 'replace')
    return sorted(set(re.findall(r'https://www\.dubaipulse\.gov\.ae/dataset/[0-9a-f-]+/resource/[0-9a-f-]+/download/[^"\'<> ]+', html)))

def peek(url, nbytes=40000):
    try:
        st, hd, b = get(url, n=nbytes)
        txt = b.decode('utf-8-sig', 'replace')
        lines = txt.splitlines()
        return {'status': st, 'length': hd.get('Content-Length'), 'type': hd.get('Content-Type'),
                'header': lines[0][:600] if lines else '', 'sample': [l[:400] for l in lines[1:4]]}
    except Exception as e:
        return {'error': str(e)[:300]}

cat_links = links_on(CAT_PAGE)
log('catalog links', cat_links)
catalog_rows = []
for u in cat_links:
    try:
        st, hd, b = get(u, timeout=180)
        rows = list(csv.DictReader(io.StringIO(b.decode('utf-8-sig', 'replace'))))
        log('catalog rows', len(rows), 'columns', list(rows[0].keys()) if rows else None)
        catalog_rows = rows
        break
    except Exception as e:
        log('CATALOG FAIL', u, e)

# keep one line per dataset
datasets = {}
for r in catalog_rows:
    keys = {k.lower(): v for k, v in r.items()}
    name = keys.get('dataset_name') or keys.get('dataset') or keys.get('table_name') or ''
    if name and name not in datasets:
        datasets[name] = {k: (v or '')[:200] for k, v in keys.items() if 'column' not in k and 'attribute' not in k}
OUT['catalog_dataset_count'] = len(datasets)
OUT['catalog_datasets'] = datasets

# 2. The datasets we want, by page; more are found from the catalog by keyword
PAGES = {
  'dld_transactions': 'https://www.dubaipulse.gov.ae/data/dld-transactions/dld_transactions-open',
  'dld_residential_sale_index': 'https://www.dubaipulse.gov.ae/data/dld-transactions/dld_residential_sale_index-open',
  'dsc_population_by_community': 'https://www.dubaipulse.gov.ae/data/dsc-statistics/dsc_population_by_community-open',
  'ded_license_master': 'https://www.dubaipulse.gov.ae/data/ded-licenses/ded_license_master-open',
  'ded_license_activities': 'https://www.dubaipulse.gov.ae/data/ded-licenses/ded_license_activities-open',
  'ded_business_activities': 'https://www.dubaipulse.gov.ae/data/ded-licenses/ded_business_activities-open',
  'rta_metro_ridership': 'https://www.dubaipulse.gov.ae/data/rta-rail/rta_metro_ridership-open',
  'rta_metro_stations': 'https://www.dubaipulse.gov.ae/data/rta-rail/rta_metro_stations-open',
  'rta_taxi_fleet': 'https://www.dubaipulse.gov.ae/data/roads-and-cars/rta_taxi_dubai_fleet-open',
  'dtcm_hotels': 'https://www.dubaipulse.gov.ae/data/dtcm-general/dtcm_hotel_establishment_performance-open',
  'dsc_statistics_service': 'https://www.dubaipulse.gov.ae/organisation/dubai-statistics-center/service/dsc-statistics',
  'dld_transactions_service': 'https://www.dubaipulse.gov.ae/organisation/dld/service/dld-transactions',
  'rta_org': 'https://www.dubaipulse.gov.ae/organisation/rta',
}
found = {}
for key, page in PAGES.items():
    ls = links_on(page)
    found[key] = {'page': page, 'downloads': ls[:40], 'n_downloads': len(ls)}
    log(key, len(ls), ls[:5])
    time.sleep(1)

# keyword search in the catalog for other things we want
KW = ['vehicle', 'licen', 'population', 'school', 'hotel', 'rent', 'ejari', 'unit', 'building', 'project',
      'birth', 'traffic', 'accident', 'police', 'crime', 'dewa', 'electric', 'water', 'airport', 'passenger',
      'tram', 'bus', 'taxi', 'park', 'mall', 'health', 'clinic', 'price', 'index', 'trade', 'customs', 'gdp']
hits = {}
for name, meta in datasets.items():
    blob = (name + ' ' + ' '.join(meta.values())).lower()
    for k in KW:
        if k in blob:
            hits.setdefault(k, []).append(name)
OUT['keyword_hits'] = {k: sorted(set(v))[:80] for k, v in hits.items()}

# peek at each download (first ~40 KB)
for key, info in found.items():
    info['peek'] = {}
    for u in info['downloads'][:3]:
        info['peek'][u] = peek(u)
        time.sleep(0.5)
OUT['pages'] = found

# 3. CKAN API (Dubai Pulse is built on CKAN) and the DLD open-data gateway
for u in ['https://www.dubaipulse.gov.ae/api/3/action/package_show?id=dld_transactions-open',
          'https://www.dubaipulse.gov.ae/api/3/action/package_list',
          'https://gateway.dubailand.gov.ae/open-data/transactions',
          'https://dubailand.gov.ae/en/open-data/real-estate-data/']:
    OUT.setdefault('probes', {})[u] = peek(u, 3000)

json.dump(OUT, open(sys.argv[1] if len(sys.argv) > 1 else 'discovery.json', 'w'), indent=1, ensure_ascii=False)
log('done')

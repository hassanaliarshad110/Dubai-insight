"""Second probe: find the data feeds behind the reachable portals."""
import urllib.request, re, json, time
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}
def get(u, n=None, data=None, headers=None, method=None, t=40):
    h = dict(UA); h.update(headers or {})
    req = urllib.request.Request(u, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.status, r.headers, (r.read(n) if n else r.read())
def p(*a): print(*a, flush=True)

# 1. DLD open-data page: scripts and API endpoints it calls
try:
    st, hd, b = get('https://dubailand.gov.ae/en/open-data/real-estate-data/')
    html = b.decode('utf-8', 'replace')
    p('DLD page bytes', len(html))
    for m in sorted(set(re.findall(r'(?:https?:)?//[a-zA-Z0-9.-]+(?:/[^"\'\s<>]*)?', html))):
        if any(k in m.lower() for k in ['api', 'open', 'data', 'gateway', 'service', '.js']):
            p('  DLD URL', m[:200])
    for m in sorted(set(re.findall(r'["\'](/[^"\']*(?:api|Api|API|open-data|OpenData|Data)[^"\']*)["\']', html)))[:60]:
        p('  DLD PATH', m[:200])
    for m in re.findall(r'(?:fetch|ajax|url|post|get)\s*[(:]\s*["\']([^"\']+)["\']', html)[:40]:
        p('  DLD CALL', m[:200])
    # pull and grep each local script
    srcs = sorted(set(re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)))
    for s in srcs:
        u = s if s.startswith('http') else ('https://dubailand.gov.ae' + s if s.startswith('/') else 'https://dubailand.gov.ae/' + s)
        if 'dubailand' not in u: continue
        try:
            _, _, jb = get(u)
            js = jb.decode('utf-8', 'replace')
            hits = sorted(set(re.findall(r'["\'`]((?:https?:)?//[^"\'`]+|/[a-zA-Z0-9_\-/]*(?:api|Api|open|Open|data|Data|Transaction|transaction|Rent|rent)[a-zA-Z0-9_\-/]*)["\'`]', js)))
            if hits: p('  JS', u[:120], len(js)); [p('     ', h[:180]) for h in hits[:40]]
        except Exception as e:
            p('  JS FAIL', u[:120], e)
except Exception as e:
    p('DLD FAIL', e)

# 2. Bayanat: search for Dubai datasets (try CKAN and their own API)
for u in ['https://bayanat.ae/api/3/action/package_search?q=dubai&rows=5',
          'https://bayanat.ae/en/dataset?q=dubai',
          'https://bayanat.ae/en/Search?q=dubai',
          'https://bayanat.ae/api/datasets?search=dubai']:
    try:
        st, hd, b = get(u, n=3000)
        p('BAYANAT', st, u, hd.get('Content-Type'), b[:300])
    except Exception as e:
        p('BAYANAT FAIL', u, str(e)[:150])

# 3. KAPSARC: every dataset mentioning Dubai
try:
    st, hd, b = get('https://datasource.kapsarc.org/api/explore/v2.1/catalog/datasets?where=search(%22dubai%22)&limit=100&select=dataset_id,metas')
    d = json.loads(b)
    p('KAPSARC total', d.get('total_count'))
    for r in d['results']:
        m = r.get('metas', {}).get('default', {})
        p('  KAP', r['dataset_id'], '|', (m.get('title') or '')[:90], '|', m.get('modified'), '|', m.get('records_count'))
except Exception as e:
    p('KAPSARC FAIL', e)

# 4. Hugging Face mirrors
try:
    st, hd, b = get('https://huggingface.co/api/datasets?search=dubai&limit=30')
    for r in json.loads(b):
        p('  HF', r['id'], r.get('lastModified'), r.get('downloads'))
except Exception as e:
    p('HF FAIL', e)

# 5. Dubai Pulse API: does a public (keyless) call work?
for u in ['https://api.dubaipulse.gov.ae/open/dld/dld_transactions-open-api?limit=1',
          'https://api.dubaipulse.gov.ae/shared/rta/rta_tram_stations-open-api',
          'https://api.dubaipulse.gov.ae/open/dsc/dsc_population_by_community-open-api']:
    try:
        st, hd, b = get(u, n=600)
        p('PULSE API', st, u, b[:300])
    except Exception as e:
        p('PULSE API FAIL', u, str(e)[:150])

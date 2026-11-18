"""Third probe: the Dubai Land Department open-data calls, and KAPSARC's Dubai tables."""
import urllib.request, re, json
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
      'Referer': 'https://dubailand.gov.ae/en/open-data/real-estate-data/', 'Origin': 'https://dubailand.gov.ae'}
def get(u, n=None, data=None, headers=None, method=None, t=60):
    h = dict(UA); h.update(headers or {})
    req = urllib.request.Request(u, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.status, r.headers, (r.read(n) if n else r.read())
def p(*a): print(*a, flush=True)

_, _, b = get('https://dubailand.gov.ae/scripts/publicData.js?v=10')
js = b.decode('utf-8', 'replace')
# every endpoint-looking string and the code around ajax calls
for m in sorted(set(re.findall(r'["\'`]([^"\'`]*(?:open-data|opendata|OpenData|api/|gateway)[^"\'`]*)["\'`]', js))):
    p('EP', m[:220])
for m in re.finditer(r'(url\s*:\s*[^,\n]{0,200})', js):
    p('URL', m.group(1)[:220])
i = js.find('open-data')
p('CONTEXT', js[max(0, i-1500):i+2500].replace('\n', ' ')[:4000])
try:
    _, _, b2 = get('https://dubailand.gov.ae/scripts/api/OpenDataApi.js')
    p('OPENDATAAPI', b2.decode('utf-8', 'replace')[:6000].replace('\n', ' '))
except Exception as e:
    p('OPENDATAAPI FAIL', e)

for u in ['https://datasource.kapsarc.org/api/explore/v2.1/catalog/datasets?q=dubai&limit=100&select=dataset_id,title,modified,records_count',
          'https://datasource.kapsarc.org/api/explore/v2.1/catalog/datasets?q=dubai&limit=100']:
    try:
        _, _, b = get(u)
        d = json.loads(b)
        p('KAPSARC total', d.get('total_count'))
        for r in d.get('results', []):
            p('  KAP', r.get('dataset_id'), '|', str(r.get('title') or r.get('metas', {}).get('default', {}).get('title'))[:100], '|', r.get('modified') or r.get('metas', {}).get('default', {}).get('modified'))
        break
    except Exception as e:
        p('KAPSARC FAIL', u, e)

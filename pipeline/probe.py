import urllib.request, re
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
      'Referer': 'https://dubailand.gov.ae/en/open-data/real-estate-data/', 'Origin': 'https://dubailand.gov.ae'}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
        return r.read().decode('utf-8', 'replace')
api = get('https://dubailand.gov.ae/scripts/api/OpenDataApi.js')
print('=== OpenDataApi.js', len(api))
for ln in api.splitlines():
    if ln.strip(): print('ODA|', ln.rstrip()[:300])
pd = get('https://dubailand.gov.ae/scripts/publicData.js?v=10')
print('=== publicData.js', len(pd))
for i, ln in enumerate(pd.splitlines()):
    if re.search(r'openDataApi|gateway|url|P_FROM|P_TO|ajax|fetch\(|\$\.(post|get)|ApiUrl|apiUrl|Endpoint|endpoint', ln):
        print('PD|', i, ln.strip()[:300])
cfg = get('https://dubailand.gov.ae/Umbraco/Api/Utils/ConfigJs')
for m in sorted(set(re.findall(r'["\']?([A-Za-z_]*(?:[Oo]pen[Dd]ata|OPEN_DATA|openData)[A-Za-z_]*)["\']?\s*[:=]\s*["\']([^"\']+)["\']', cfg))):
    print('CFG|', m)
for m in sorted(set(re.findall(r'https://gateway\.dubailand\.gov\.ae/open-data[^"\'\s\\]*', cfg + pd + api))):
    print('GW|', m)

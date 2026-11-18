import urllib.request, json, time
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
      'Referer': 'https://dubailand.gov.ae/', 'Origin': 'https://dubailand.gov.ae',
      'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json'}
B = 'https://gateway.dubailand.gov.ae/open-data/'
def post(cmd, body):
    t = time.time()
    req = urllib.request.Request(B + cmd, data=json.dumps(body).encode(), headers=UA, method='POST')
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    return d['response']['result'], time.time() - t
tx = lambda f, t, take, skip='0', g='': {"P_FROM_DATE": f, "P_TO_DATE": t, "P_GROUP_ID": g, "P_IS_OFFPLAN": "", "P_IS_FREE_HOLD": "",
      "P_AREA_ID": "", "P_USAGE_ID": "", "P_PROP_TYPE_ID": "", "P_TAKE": take, "P_SKIP": skip, "P_SORT": "TRANSACTION_NUMBER_ASC"}
for take in ['1000', '5000', '20000']:
    try:
        r, s = post('transactions', tx('10/01/2026', '10/31/2026', take))
        print(f'TAKE| {take} got {len(r)} total {r[0]["TOTAL"] if r else 0} in {s:.1f}s', flush=True)
    except Exception as e:
        print('TAKE FAIL|', take, str(e)[:150], flush=True)
# groups and earliest data
for g in ['1', '2', '3']:
    try:
        r, s = post('transactions', tx('10/01/2026', '10/31/2026', '3', g=g))
        print('GROUP|', g, r[0]['GROUP_EN'] if r else None, r[0]['TOTAL'] if r else 0, flush=True)
    except Exception as e:
        print('GROUP FAIL|', g, str(e)[:120])
for y in ['2010', '2015', '2020', '2023', '2025']:
    try:
        r, s = post('transactions', tx(f'01/01/{y}', f'12/31/{y}', '1'))
        print('YEAR|', y, r[0]['TOTAL'] if r else 0, f'{s:.1f}s', flush=True)
    except Exception as e:
        print('YEAR FAIL|', y, str(e)[:120])
rent = {"P_FROM_DATE": "10/01/2026", "P_TO_DATE": "10/31/2026", "P_DATE_TYPE": "0", "P_IS_FREE_HOLD": "", "P_VERSION": "",
        "P_AREA_ID": "", "P_USAGE_ID": "", "P_PROP_TYPE_ID": "", "P_TAKE": "5000", "P_SKIP": "0", "P_SORT": "CONTRACT_NUMBER_ASC"}
try:
    r, s = post('rents', rent); print(f'RENT| got {len(r)} total {r[0]["TOTAL"] if r else 0} in {s:.1f}s')
    print('RENTKEYS|', sorted(set(x.get('VERSION_EN') for x in r)), sorted(set(x.get('USAGE_EN') for x in r))[:10], sorted(set(x.get('PROP_SUB_TYPE_EN') for x in r))[:30])
except Exception as e:
    print('RENT FAIL|', str(e)[:150])
r, s = post('transactions', tx('10/01/2026', '10/31/2026', '5000'))
from collections import Counter
print('TXGROUPS|', Counter(x['GROUP_EN'] for x in r).most_common())
print('TXPROC|', Counter(x['PROCEDURE_EN'] for x in r).most_common(15))
print('TXTYPE|', Counter((x['PROP_TYPE_EN'], x['PROP_SB_TYPE_EN']) for x in r).most_common(15))
print('TXUSAGE|', Counter(x['USAGE_EN'] for x in r).most_common())
for k in ['projects', 'buildings', 'units', 'lands', 'brokers']:
    body = {"P_FROM_DATE": "", "P_TO_DATE": "", "P_TAKE": "2", "P_SKIP": "0", "P_SORT": ""}
    try:
        rr, s = post(k, body); print('OTHER|', k, len(rr), (rr[0].get('TOTAL') if rr else None), json.dumps(rr[0])[:500] if rr else '')
    except Exception as e:
        print('OTHER FAIL|', k, str(e)[:120])

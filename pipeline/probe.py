import urllib.request, json, re
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
      'Referer': 'https://dubailand.gov.ae/', 'Origin': 'https://dubailand.gov.ae',
      'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json, text/plain, */*'}
def post(u, body, n=4000):
    req = urllib.request.Request(u, data=json.dumps(body).encode(), headers=UA, method='POST')
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.status, r.headers, r.read(n)
cfg = urllib.request.urlopen(urllib.request.Request('https://dubailand.gov.ae/Umbraco/Api/Utils/ConfigJs', headers=UA), timeout=60).read().decode('utf-8','replace')
m = re.search(r'openDataApi["\']?\s*[:=]\s*["\']([^"\']+)', cfg); base = m.group(1) if m else 'https://gateway.dubailand.gov.ae/open-data'
print('BASE|', base)
m = re.search(r'captchaEnabled["\']?\s*[:=]\s*([a-z]+)', cfg); print('CAPTCHA|', m.group(1) if m else '?')
tx = {"P_FROM_DATE": "11/01/2026", "P_TO_DATE": "11/07/2026", "P_GROUP_ID": "", "P_IS_OFFPLAN": "", "P_IS_FREE_HOLD": "",
      "P_AREA_ID": "", "P_USAGE_ID": "", "P_PROP_TYPE_ID": "", "P_TAKE": "5", "P_SKIP": "0", "P_SORT": "TRANSACTION_NUMBER_ASC"}
rent = {"P_FROM_DATE": "11/01/2026", "P_TO_DATE": "11/07/2026", "P_DATE_TYPE": "0", "P_IS_FREE_HOLD": "", "P_VERSION": "",
        "P_AREA_ID": "", "P_USAGE_ID": "", "P_PROP_TYPE_ID": "", "P_TAKE": "5", "P_SKIP": "0", "P_SORT": "CONTRACT_NUMBER_ASC"}
for cmd, body in [('transactions', tx), ('rents', rent), ('carea-lookup', {}), ('projects-lookup', {})]:
    try:
        st, hd, b = post(base + '/' + cmd, body)
        print('API|', cmd, st, hd.get('Content-Type'), b[:1500].decode('utf-8','replace').replace('\n',' '))
    except Exception as e:
        body_txt = ''
        try: body_txt = e.read()[:400]
        except Exception: pass
        print('API FAIL|', cmd, str(e)[:150], body_txt)
for cmd, body in [('transactions', dict(tx, P_TAKE="200"))]:
    try:
        req = urllib.request.Request(base + '/' + cmd + '/export/csv', data=json.dumps(body).encode(), headers=UA, method='POST')
        with urllib.request.urlopen(req, timeout=120) as r:
            b = r.read(); print('CSV|', r.status, r.headers.get('Content-Type'), len(b)); print('CSVHEAD|', b[:800].decode('utf-8-sig','replace').replace('\n',' || '))
    except Exception as e:
        print('CSV FAIL|', str(e)[:200])

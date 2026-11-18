"""Probe: Mollak service charges, the rental index, DLD lists, and the Dubai Legal Portal."""
import urllib.request, json
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
      'Referer': 'https://dubailand.gov.ae/', 'Origin': 'https://dubailand.gov.ae', 'Accept': 'application/json, text/plain, */*'}
def call(u, body=None, method=None, n=1500):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(UA)
    if data: h['Content-Type'] = 'application/json; charset=utf-8'
    try:
        with urllib.request.urlopen(urllib.request.Request(u, data=data, headers=h, method=method or ('POST' if data else 'GET')), timeout=60) as r:
            print('OK |', r.status, method or ('POST' if data else 'GET'), u, '|', r.headers.get('Content-Type'), '|', r.read(n).decode('utf-8', 'replace').replace('\n', ' ')[:n], flush=True)
    except urllib.error.HTTPError as e:
        print('ERR|', e.code, u, '|', e.read(300), flush=True)
    except Exception as e:
        print('ERR|', u, '|', str(e)[:150], flush=True)
G = 'https://gateway.dubailand.gov.ae'
for path in ['/mollak/public/servicecharge', '/mollak/public/managementcompany', '/mollak/public/boardmember',
             '/mollak/public/servicecharge/communities', '/mollak/public/servicecharge/masterCommunities',
             '/ejarirentalindex/', '/indexes-api', '/brokers/', '/offices/']:
    call(G + path)
for path, body in [('/mollak/public/servicecharge', {}), ('/open-data/projects', {"P_FROM_DATE": "01/01/2026", "P_TO_DATE": "11/01/2026", "P_DATE_TYPE": "0", "P_PRJ_TYPE_ID": "", "P_PRJ_STATUS": "", "P_ZONE_ID": "", "P_AREA_ID": "", "P_TAKE": "3", "P_SKIP": "0", "P_SORT": ""}),
                   ('/open-data/brokers', {"P_TAKE": "3", "P_SKIP": "0", "P_SORT": "", "P_NAME": "", "P_GENDER": "", "P_OFFICE": ""}),
                   ('/open-data/buildings', {"P_FROM_DATE": "", "P_TO_DATE": "", "P_AREA_ID": "", "P_ZONE_ID": "", "P_IS_FREE_HOLD": "", "P_IS_LEASE_HOLD": "", "P_IS_OFFPLAN": "", "P_TAKE": "3", "P_SKIP": "0", "P_SORT": ""})]:
    call(G + path, body)
# Mollak service-charge index: the DLD's public page and its scripts
call('https://dubailand.gov.ae/en/eservices/service-charge-index/', n=600)
call('https://dubailand.gov.ae/en/eservices/rental-index/', n=600)
# legal portal and the Hugging Face copy of Dubai legislation
call('https://dlp.dubai.gov.ae/en/Pages/Legislation.aspx', n=400)
call('https://dlp.dubai.gov.ae/Legislation%20Reference/2019/Law%20No.%20(6)%20of%202019.html', n=400)
call('https://huggingface.co/api/datasets/ohalkhateeb/DubaiLegislation', n=2500)
call('https://huggingface.co/datasets/ohalkhateeb/DubaiLegislation/raw/main/README.md', n=2500)

"""Quick reachability check of Dubai/UAE open-data hosts from GitHub's build machines."""
import urllib.request, time, socket
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}
URLS = [
 'https://www.dubaipulse.gov.ae/', 'https://api.dubaipulse.gov.ae/', 'https://dubaipulse.gov.ae/',
 'https://dubailand.gov.ae/en/open-data/real-estate-data/', 'https://gateway.dubailand.gov.ae/open-data/transactions',
 'https://www.dubailand.gov.ae/', 'https://data.dubailand.gov.ae/',
 'https://bayanat.ae/', 'https://bayanat.ae/en/Data', 'https://fcsc.gov.ae/', 'https://www.dsc.gov.ae/',
 'https://www.rta.ae/', 'https://www.dubaidet.gov.ae/', 'https://www.dm.gov.ae/', 'https://www.khda.gov.ae/',
 'https://www.digitaldubai.ae/', 'https://www.dubai.ae/', 'https://u.ae/',
 'https://datasource.kapsarc.org/api/explore/v2.1/catalog/datasets?where=search(%22dubai%22)&limit=5',
 'https://www.kaggle.com/', 'https://huggingface.co/api/datasets?search=dubai&limit=5',
 'https://data.abudhabi/', 'https://www.mediaoffice.ae/',
]
for u in URLS:
    t = time.time()
    try:
        req = urllib.request.Request(u, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            b = r.read(400)
            print(f'OK   {r.status} {time.time()-t:5.1f}s {u} | {b[:120]!r}', flush=True)
    except Exception as e:
        print(f'FAIL {time.time()-t:5.1f}s {u} | {str(e)[:120]}', flush=True)

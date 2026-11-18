import urllib.request, json
UA = {'User-Agent': 'Mozilla/5.0 DubaiInsight'}
def get(u, n=None):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
        return r.read(n) if n else r.read()
for ds in ['dubairealestatedata/dubai-real-estate-sales-transactions', 'happyendpoint/dubai-property-sales-transactions-2021-2026',
           'happyendpoint/dubai-rental-contracts-2021-2026', 'datadubai/dubai-real-estate-dld', 'pablo2319/dubai-dld-monthly-stats',
           'viewit-ai/full-dubai-pulse', 'happyendpoint/dubai-real-estate-monthly-market-summary']:
    try:
        info = json.loads(get(f'https://huggingface.co/api/datasets/{ds}'))
        files = [(s['rfilename'], s.get('size')) for s in info.get('siblings', [])]
        print('DS|', ds, '| license', (info.get('cardData') or {}).get('license'), '| modified', info.get('lastModified'))
        for f, sz in files[:25]: print('   F|', f, sz)
        try:
            card = get(f'https://huggingface.co/datasets/{ds}/raw/main/README.md', 4000).decode('utf-8', 'replace')
            print('   CARD|', card.replace('\n', ' ')[:1500])
        except Exception as e: print('   CARD FAIL', e)
        # first lines of the first csv
        for f, sz in files:
            if f.endswith('.csv'):
                head = get(f'https://huggingface.co/datasets/{ds}/resolve/main/{f}', 1500).decode('utf-8', 'replace')
                print('   HEAD|', f, '|', head.replace('\n', ' || ')[:1200]); break
    except Exception as e:
        print('DS FAIL|', ds, str(e)[:150])

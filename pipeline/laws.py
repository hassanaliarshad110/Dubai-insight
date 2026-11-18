"""Download the official English texts of Dubai's property laws from the Dubai Legal Portal and split them into articles.

Writes data/laws/<id>.json: title, official URL, when fetched, a hash of the text (to spot changes), and the articles.
Run weekly; if a law's hash changes, the job prints CHANGED so the summaries that cite it can be checked again.
"""
import hashlib, html, json, os, re, sys, time, urllib.request

LAWS = {
  'decree43_2013': ('Decree No. (43) of 2013 Determining Rent Increase for Real Property in the Emirate of Dubai', '2013/Decree No. (43) of 2013 Determining Rent Increase for Real Property.html'),
  'law26_2007': ('Law No. (26) of 2007 Regulating the Relationship between Landlords and Tenants in the Emirate of Dubai', '2007/Law No. (26) of 2007.html'),
  'law33_2008': ('Law No. (33) of 2008 Amending Law No. (26) of 2007', '2009/Law No. (33) of 2008 Amending Law No. (26) of 2007.html'),
  'law6_2019': ('Law No. (6) of 2019 Concerning Ownership of Jointly Owned Real Property in the Emirate of Dubai', '2019/Law No. (6) of 2019 Concerning Ownership of Jointly Owned Real Property in the Emirate of Dubai.html'),
  'law8_2007': ('Law No. (8) of 2007 Concerning Escrow Accounts for Real Estate Development in the Emirate of Dubai', '2007/Law No. (8) of 2007.html'),
  'law13_2008': ('Law No. (13) of 2008 Regulating the Interim Real Property Register in the Emirate of Dubai', '2008/Law No. (13) of 2008.html'),
  'law9_2009': ('Law No. (9) of 2009 Amending Law No. (13) of 2008', '2009/Law No. (9) of 2009.html'),
  'law19_2017': ('Law No. (19) of 2017 Amending Law No. (13) of 2008', '2017/Law No. (19) of 2017 Amending Law No. (13) of 2008 Regulating the Interim Real Property Register in the Emirate of Dubai.html'),
  'law19_2020': ('Law No. (19) of 2020 Amending Law No. (13) of 2008', '2020/Law No. (19) of 2020 Amending Law No. (13) of 2008 Regulating the Interim Real Property Register in the Emirate of Dubai.html'),
  'notes_art34_2026': ('Explanatory Notes on Article (34) of Law No. (26) of 2007', '2026/Explanatory Notes on Article (34) of Law No. (26) of 2007 Relationship between Landlords and Tenants.html'),
}
BASE = 'https://dlp.dubai.gov.ae/Legislation%20Reference/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'laws')
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}


def url_variants(path):
    q = urllib.parse.quote(path)                       # ( ) stay as they are
    yield BASE + q
    yield BASE + q.replace('(', '%28').replace(')', '%29')


def fetch(path):
    last = None
    for u in url_variants(path):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
                raw = r.read()
                enc = r.headers.get_content_charset() or 'utf-8'
                return u, raw.decode(enc, 'replace')
        except Exception as e:
            last = e
    raise RuntimeError(f'{path}: {last}')


def to_text(h):
    h = re.sub(r'(?is)<(script|style|head)[^>]*>.*?</\1>', ' ', h)
    h = re.sub(r'(?i)<br\s*/?>', '\n', h)
    h = re.sub(r'(?i)</(p|div|tr|li|h\d|table)>', '\n', h)
    h = re.sub(r'(?i)<td[^>]*>', ' ', h)
    t = html.unescape(re.sub(r'<[^>]+>', '', h)).replace('\xa0', ' ')
    t = re.sub(r'[ \t]+', ' ', t)
    lines = [ln.strip() for ln in t.split('\n')]
    out, blank = [], 0
    for ln in lines:
        if not ln:
            blank += 1
            if blank == 1: out.append('')
            continue
        blank = 0
        out.append(ln)
    return '\n'.join(out).strip()


def split_articles(text):
    parts = re.split(r'\n(?=Article\s*\(\s*\d+\s*\)\s*\n)', '\n' + text)
    arts, preamble = [], parts[0].strip()
    for p in parts[1:]:
        m = re.match(r'Article\s*\(\s*(\d+)\s*\)\s*\n', p)
        body = p[m.end():].strip()
        # the heading above an article is the last short line of the previous block; keep the body as is
        arts.append({'no': int(m.group(1)), 'text': body})
    return preamble, arts


def main():
    import urllib.parse  # noqa
    os.makedirs(OUT, exist_ok=True)
    changed = []
    for key, (title, path) in LAWS.items():
        try:
            url, h = fetch(path)
        except Exception as e:
            print('FAIL', key, e, flush=True); continue
        text = to_text(h)
        sha = hashlib.sha256(text.encode()).hexdigest()
        fn = os.path.join(OUT, key + '.json')
        old = json.load(open(fn)) if os.path.exists(fn) else None
        if old and old.get('sha256') == sha:
            print('same', key, flush=True); continue
        pre, arts = split_articles(text)
        json.dump({'id': key, 'title': title, 'url': url, 'fetched': time.strftime('%Y-%m-%d'), 'sha256': sha,
                   'preamble': pre[:4000], 'articles': arts, 'text_chars': len(text)},
                  open(fn, 'w'), ensure_ascii=False, indent=1)
        print(('CHANGED ' if old else 'new ') + key, len(arts), 'articles', len(text), 'chars', flush=True)
        if old: changed.append(key)
        time.sleep(1)
    if changed:
        print('LAWS CHANGED:', ', '.join(changed), '- check the answers that cite them')


if __name__ == '__main__':
    import urllib.parse
    main()

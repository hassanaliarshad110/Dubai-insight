"""Builds site/data/laws.json: the law library and the plain-language answers.

Reads the official texts in data/laws/ (downloaded weekly by laws.py) and the hand-written answers in
data/guide/answers.json. Amending laws are folded into the law they amend, so each article shows the
wording in force, with a note of where it came from.

Every answer cites articles. data/guide/cited.json keeps a fingerprint of each cited article as it read when
the answer was last checked. If the official wording changes, the answer is flagged "needs review" on the site
and the log says so, until someone re-reads it and runs:  python pipeline/lawlib.py --stamp
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAWS = os.path.join(ROOT, 'data', 'laws')
GUIDE = os.path.join(ROOT, 'data', 'guide')
OUT = os.path.join(ROOT, 'site', 'data')

# The library: what each entry is called on the site, its base text, and the amending texts folded into it
# (later amendments last, so they win). replaces=None means "every article in the amending law except its
# first (the 'hereby superseded' line) and its closing articles", given as a list of article numbers.
LIBRARY = [
    {'id': 'tenancy', 'short': 'Tenancy law', 'name': 'Law No. 26 of 2007 regulating the relationship between landlords and tenants, as amended by Law No. 33 of 2008',
     'topic': 'renting', 'base': 'law26_2007', 'amend': [('law33_2008', [2, 3, 4, 9, 13, 14, 15, 25, 26, 29, 36])]},
    {'id': 'decree43', 'short': 'Rent increase decree', 'name': 'Decree No. 43 of 2013 determining rent increase for real property in Dubai',
     'topic': 'renting', 'base': 'decree43_2013', 'amend': []},
    {'id': 'note34', 'short': 'Note on Article 34', 'name': 'Explanatory note on Article 34 of the tenancy law (2026): stopping interference with a tenant and documenting it',
     'topic': 'renting', 'base': 'notes_art34_2026', 'amend': []},
    {'id': 'jointly', 'short': 'Jointly owned property law', 'name': 'Law No. 6 of 2019 concerning ownership of jointly owned real property in Dubai',
     'topic': 'owning', 'base': 'law6_2019', 'amend': []},
    {'id': 'escrow', 'short': 'Escrow law', 'name': 'Law No. 8 of 2007 concerning escrow accounts for real estate development in Dubai',
     'topic': 'offplan', 'base': 'law8_2007', 'amend': []},
    {'id': 'interim', 'short': 'Interim register law', 'name': 'Law No. 13 of 2008 regulating the interim real property register, as amended (Article 11 as replaced by Law No. 19 of 2020)',
     'topic': 'offplan', 'base': 'law13_2008', 'amend': [('law9_2009', [2]), ('law19_2020', [11])]},
]
SHORT_SRC = {'law33_2008': 'Law No. 33 of 2008', 'law9_2009': 'Law No. 9 of 2009', 'law19_2020': 'Law No. 19 of 2020'}


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def load(i):
    return json.load(open(os.path.join(LAWS, i + '.json')))


def build_law(spec):
    base = load(spec['base'])
    arts = {}
    if base['articles']:
        for a in base['articles']:
            arts.setdefault(a['no'], {'no': a['no'], 'heading': a['heading'], 'text': a['text'], 'from': None})
    else:  # explanatory notes have no articles: one entry for the whole text
        arts[0] = {'no': 0, 'heading': 'Explanatory note', 'text': base['preamble'], 'from': None}
    sources = [{'id': spec['base'], 'title': base['title'], 'url': base['url'], 'fetched': base['fetched']}]
    for aid, nos in spec['amend']:
        am = load(aid)
        seen = set()
        for a in am['articles'][1:]:          # [0] is "Articles (..) are hereby superseded by the following"
            if a['no'] in nos and a['no'] not in seen:
                seen.add(a['no'])
                old = arts.get(a['no'], {})
                arts[a['no']] = {'no': a['no'], 'heading': a['heading'] or old.get('heading', ''), 'text': a['text'], 'from': aid}
        missing = set(nos) - seen
        if missing:
            print('WARNING', spec['id'], aid, 'did not supply articles', sorted(missing), flush=True)
        sources.append({'id': aid, 'title': am['title'], 'url': am['url'], 'fetched': am['fetched']})
    out = []
    for no in sorted(arts):
        a = arts[no]
        src = next(s for s in sources if s['id'] == (a['from'] or spec['base']))
        out.append({'no': no, 'heading': a['heading'], 'text': a['text'], 'url': src['url'],
                    'amended_by': SHORT_SRC.get(a['from']) if a['from'] else None})
    return {'id': spec['id'], 'short': spec['short'], 'name': spec['name'], 'topic': spec['topic'],
            'url': sources[0]['url'], 'sources': sources, 'fetched': max(s['fetched'] for s in sources), 'articles': out}


def main():
    stamp = '--stamp' in sys.argv
    laws = [build_law(s) for s in LIBRARY]
    by = {(l['id'], a['no']): a for l in laws for a in l['articles']}
    guide = json.load(open(os.path.join(GUIDE, 'answers.json')))
    cited_fn = os.path.join(GUIDE, 'cited.json')
    cited = json.load(open(cited_fn)) if os.path.exists(cited_fn) else {}
    review = []
    for q in guide['answers']:
        q['review'] = False
        for c in q['cite']:
            a = by.get((c['law'], c['art']))
            if not a:
                sys.exit(f"answer {q['id']} cites {c['law']} article {c['art']}, which is not in the library")
            k = f"{c['law']}:{c['art']}"
            h = sha(a['text'])
            c['url'] = a['url']
            if stamp:
                cited[k] = h
            elif cited.get(k) != h:
                q['review'] = True
        if q['review']:
            review.append(q['id'])
    if stamp:
        json.dump(dict(sorted(cited.items())), open(cited_fn, 'w'), indent=1)
        print('stamped', len(cited), 'cited articles')
    if review:
        print('NEEDS REVIEW (cited wording changed since last check):', ', '.join(review), flush=True)
    os.makedirs(OUT, exist_ok=True)
    out = {'checked': guide['checked'], 'note': guide['note'], 'topics': guide['topics'], 'answers': guide['answers'], 'laws': laws}
    json.dump(out, open(os.path.join(OUT, 'laws.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('laws.json', len(laws), 'laws,', sum(len(l['articles']) for l in laws), 'articles,', len(guide['answers']), 'answers')


if __name__ == '__main__':
    main()

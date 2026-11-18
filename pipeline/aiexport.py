"""Writes the files that let people use their own AI with Dubai Insight's data:

  site/llms.txt               what the site is and where the AI-readable files are (llmstxt.org convention)
  site/ai/dubai-insight.md    every figure on the site plus the plain-language law answers, in one Markdown file
                              that can be attached to any AI chat or read by an AI that browses the web

Built from the same JSON the site uses, after build.py and lawlib.py have run.
"""
import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
DATA = os.path.join(SITE, 'data')
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def ml(m):
    return f"{MON[int(m[5:7]) - 1]} {m[:4]}" if m else ''


def n(v, d=0):
    return '–' if v is None else f"{v:,.{d}f}"


def load(name):
    p = os.path.join(DATA, name)
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    RE, OFF, LAWS = load('realestate.json'), load('official.json'), load('laws.json')
    L = []
    w = L.append
    w('# Dubai Insight: data for AI assistants')
    w('')
    w(f"Generated {time.strftime('%d %B %Y', time.gmtime())}. Dubai Insight explains Dubai's open public data in plain language. "
      'Made by Hassan Ali. Information only: nothing here is legal, financial or investment advice, a valuation or a forecast.')
    w('')
    w('How to use this file: answer from the figures below and say which figure you used. If something is not covered, say so '
      'rather than guessing. For law questions, quote the article numbers given and remind the reader that the Arabic text of '
      'Dubai legislation prevails and that the Rental Disputes Settlement Centre decides disputes.')
    if RE:
        a, b = RE['last12'], RE.get('prev12') or {}
        w('')
        w('## Property sales (Dubai Land Department open data)')
        w('')
        w(f"Every sale registered with the Dubai Land Department. Months from {ml(RE['api_first'])} come from the Land Department's open "
          f"data API, refreshed daily; earlier months come from a public copy of the same records ({RE['copy_source']['name'] if RE.get('copy_source') else ''}). "
          'Price per square metre is the median of each sale\'s price divided by its area.')
        w('')
        w(f"- 12 months {ml(a['from'])} to {ml(a['to'])}: {n(a['sales'])} sales worth AED {n(a['value'] / 1e9, 1)} billion"
          + (f" (the 12 months before: {n(b.get('sales'))} sales)" if b else ''))
        w(f"- Typical price per square metre: flats AED {n(a['ppsqm_flat'])}, villas AED {n(a['ppsqm_villa'])}")
        w(f"- Sold off-plan: {n(a['offplan_share'], 1)}% of sales" + (f" (12 months before: {n(b.get('offplan_share'), 1)}%)" if b else ''))
        w('')
        w('### Month by month')
        w('')
        w('| Month | Sales | Value (AED m) | Off-plan % | Flats AED/m² | Villas AED/m² | Mortgages | Note |')
        w('|---|---|---|---|---|---|---|---|')
        for r in RE['monthly'][-25:]:
            off = r['offplan'] / r['sales'] * 100 if r.get('sales') and r.get('offplan') is not None else None
            w(f"| {ml(r['m'])} | {n(r['sales'])} | {n(r['value'] / 1e6)} | {n(off, 1)} | {n(r.get('ppsqm_flat'))} | {n(r.get('ppsqm_villa'))} | "
              f"{n(r.get('mortgages'))} | {'still being registered' if r.get('partial') else ''} |")
        w('')
        span = RE.get('area_span') or {}
        w(f"### Areas ({ml(span.get('from'))} to {ml(span.get('to'))}, by number of sales)")
        w('')
        w('| Area | Sales | Value (AED m) | Off-plan % | Flats AED/m² | Villas AED/m² |')
        w('|---|---|---|---|---|---|')
        for x in RE['areas']:
            w(f"| {x['name']} | {n(x['sales'])} | {n(x['value'] / 1e6)} | {n(x.get('offplan_share'), 1)} | "
              f"{n(x['ppsqm_flat']) if x.get('n_flat', 0) >= 10 else '–'} | {n(x['ppsqm_villa']) if x.get('n_villa', 0) >= 10 else '–'} |")
        R = RE.get('rent') or {}
        if R.get('areas'):
            r12 = R['last12']
            w('')
            w(f"## Rental contracts (Ejari, {ml(r12['from'])} to {ml(r12['to'])})")
            w('')
            w(f"{n(r12['contracts'])} contracts registered, {n(r12['new'])} of them new (the rest renewals). Typical yearly rent: flats AED {n(r12['flat'])}, "
              f"villas AED {n(r12['villa'])}. These are medians of all registered contracts, every size together; they are not the official "
              'Smart Rental Index, which is what the law uses for rent increases.')
            w('')
            w('| Area | Contracts | New | Typical flat rent (AED/yr) | Typical villa rent (AED/yr) |')
            w('|---|---|---|---|---|')
            for x in R['areas']:
                w(f"| {x['name']} | {n(x['contracts'])} | {n(x['new'])} | {n(x['flat']) if x.get('n_flat', 0) >= 20 else '–'} | "
                  f"{n(x['villa']) if x.get('n_villa', 0) >= 20 else '–'} |")
    if OFF:
        w('')
        w('## Official figures (as published by Dubai government bodies)')
        w('')
        for f in OFF['figures']:
            val = (', '.join(f"{k}: {n(v)}" for k, v in f['table']) if 'table' in f else n(f.get('value'), 1 if f['unit'] == '%' else 0))
            w(f"- {f['label']} ({f['period']}): {val} {f['unit']}"
              + (f". {f['detail']}" if f.get('detail') else '') + f". Source: {f['by']}, {f['source']} <{f['url']}>")
    if LAWS:
        w('')
        w('## Rent increases at renewal (Decree 43 of 2013, Article 1)')
        w('')
        w('The most the rent can rise depends on how far the current rent is below the average rent of similar units in the RERA rent '
          'index (now the Dubai Land Department Smart Rental Index): up to 10% below, no increase; 11% to 20% below, 5% of the current '
          'rent; 21% to 30% below, 10%; 31% to 40% below, 15%; more than 40% below, 20%. Either side must give at least 90 days\' '
          'notice before the lease ends to change the rent or terms, unless the lease says otherwise (tenancy law, Article 14).')
        w('')
        w(f"## Plain-language answers on Dubai property law (checked {LAWS['checked']})")
        w('')
        w(LAWS['note'])
        names = {l['id']: l['short'] for l in LAWS['laws']}
        for t in LAWS['topics']:
            w('')
            w(f"### {t['title']}")
            w('')
            w(t['intro'])
            for q in LAWS['answers']:
                if q['topic'] != t['id']:
                    continue
                cites = '; '.join(f"{names[c['law']]}{', Article ' + str(c['art']) if c['art'] else ''} <{c['url']}>" for c in q['cite'])
                w('')
                w(f"**{q['q']}**")
                w('')
                w(' '.join(q['a']))
                w('')
                w(f"Based on: {cites}")
        w('')
        w('### The laws used')
        w('')
        for l in LAWS['laws']:
            w(f"- {l['short']}: {l['name']} <{l['url']}>")
    os.makedirs(os.path.join(SITE, 'ai'), exist_ok=True)
    md = '\n'.join(L) + '\n'
    open(os.path.join(SITE, 'ai', 'dubai-insight.md'), 'w').write(md)
    open(os.path.join(SITE, 'llms.txt'), 'w').write(
        '# Dubai Insight\n\n'
        "> Dubai's open public data explained in plain language: property sales and prices from the Dubai Land Department, "
        'rental contracts, population, transport, business and tourism figures, a rent increase check and plain-language answers '
        'on Dubai property law with article citations. Made by Hassan Ali. Information only, not advice.\n\n'
        '## Data for AI assistants\n\n'
        '- [Everything on the site in one Markdown file](ai/dubai-insight.md): figures, area tables and law answers, refreshed daily\n\n'
        '## Machine-readable data\n\n'
        '- [Property sales and rents](data/realestate.json)\n'
        '- [Official figures with sources](data/official.json)\n'
        '- [Law library and answers](data/laws.json)\n')
    print('ai/dubai-insight.md', len(md), 'chars; llms.txt')


if __name__ == '__main__':
    main()

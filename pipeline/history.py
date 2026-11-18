"""Dubai-wide monthly history of property sales before 2026.

The Dubai Land Department's open-data service only serves the current year, so the years before come from the
public copy of the DLD's registered sales published by Dubai Real Estate Data (dubairealestatedata.com) on
Hugging Face under CC BY 4.0, itself taken from the Dubai Pulse open-data platform. Checked against the months
pulled directly from the DLD for 2026: monthly totals agree within 5%.

Only Dubai-wide figures are kept (its area names differ from the DLD service's). Writes data/dld/hist/YYYY-MM.json.
    python pipeline/history.py [--since 2019-01] [--until 2025-12]
"""
import argparse, json, os, subprocess, sys

URL = 'https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/resolve/main/dld_sales_transactions.parquet'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'dld', 'hist')
SOURCE = {'name': 'Dubai Real Estate Data, public copy of Dubai Land Department registered sales (CC BY 4.0)',
          'url': 'https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default='2019-01')
    ap.add_argument('--until', default='2025-12')
    a = ap.parse_args()
    try:
        import pandas as pd  # noqa
    except ImportError:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'pandas', 'pyarrow'], check=True)
    import pandas as pd
    path = '/tmp/dld_sales.parquet'
    if not os.path.exists(path):
        subprocess.run(['curl', '-sSfL', '--retry', '3', '-o', path, URL], check=True)
    df = pd.read_parquet(path)
    df['m'] = pd.to_datetime(df['instance_date'], errors='coerce').dt.strftime('%Y-%m')
    df = df[(df['m'] >= a.since) & (df['m'] <= a.until)].copy()
    df['price_aed'] = pd.to_numeric(df['price_aed'], errors='coerce').fillna(0)
    df['area_sqm'] = pd.to_numeric(df['area_sqm'], errors='coerce')
    df['off'] = df['reg_type_label'].str.lower().eq('off-plan')
    df['sub'] = df['property_sub_type'].fillna(df['property_type_label']).fillna('Other')
    pp = df['price_aed'] / df['area_sqm']
    df['pp'] = pp.where((df['area_sqm'] >= 15) & (df['price_aed'] > 0) & (pp >= 500) & (pp <= 400000))
    rooms = {0: 'Studio', 1: '1 B/R', 2: '2 B/R', 3: '3 B/R', 4: '4 B/R', 5: '5 B/R'}

    def q(s, p):
        s = s.dropna()
        return round(float(s.quantile(p)), 1) if len(s) else None

    os.makedirs(ROOT, exist_ok=True)
    for m, g in df.groupby('m'):
        flats, villas, priced = g.loc[g['sub'] == 'Flat', 'pp'], g.loc[g['sub'] == 'Villa', 'pp'], g.loc[g['price_aed'] > 0, 'price_aed']
        v = g['price_aed']
        bands = {'under 1M': int((v.between(1, 1e6 - 1)).sum()), '1M to 2M': int((v.between(1e6, 2e6 - 1)).sum()),
                 '2M to 5M': int((v.between(2e6, 5e6 - 1)).sum()), '5M to 10M': int((v.between(5e6, 1e7 - 1)).sum()), '10M and over': int((v >= 1e7).sum())}
        out = {
            'month': m, 'rows': int(len(g)), 'source': SOURCE,
            'groups': {'Sales': {'count': int(len(g)), 'value': round(float(v.sum()))}},
            'sales': {'count': int(len(g)), 'value': round(float(v.sum())), 'offplan': int(g['off'].sum()), 'ready': int((~g['off']).sum()),
                      'offplan_value': round(float(v[g['off']].sum()))},
            'sale_price': {'n': int(len(priced)), 'p25': q(priced, .25), 'median': q(priced, .5), 'p75': q(priced, .75)},
            'ppsqm_flat': {'n': int(flats.notna().sum()), 'median': q(flats, .5)},
            'ppsqm_villa': {'n': int(villas.notna().sum()), 'median': q(villas, .5)},
            'by_type': {k: {'count': int(len(x)), 'value': round(float(x['price_aed'].sum()))} for k, x in g.groupby('sub')},
            'flat_rooms': {rooms.get(int(k), str(k)): int(n) for k, n in g.loc[g['sub'] == 'Flat', 'rooms_bucket'].dropna().value_counts().items()},
            'price_bands': bands,
        }
        with open(os.path.join(ROOT, m + '.json'), 'w') as fh:
            json.dump(out, fh, separators=(',', ':'), ensure_ascii=False)
    print('history months written:', df['m'].nunique(), 'rows', len(df))


if __name__ == '__main__':
    main()

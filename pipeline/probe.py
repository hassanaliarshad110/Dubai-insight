"""Check the published copy of the DLD sales history against the months pulled directly from the DLD API."""
import json, glob, os, subprocess, sys
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'pandas', 'pyarrow'], check=True)
import pandas as pd
url = 'https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/resolve/main/dld_sales_transactions.parquet'
subprocess.run(['curl', '-sSL', '-o', '/tmp/s.parquet', url], check=True)
print('SIZE|', os.path.getsize('/tmp/s.parquet'))
df = pd.read_parquet('/tmp/s.parquet')
print('ROWS|', len(df), list(df.columns))
for c in ['reg_type_label', 'property_type_label', 'property_sub_type', 'usage_label', 'rooms_bucket', 'procedure_name_en', 'is_pre_registration', 'quality_flags']:
    print('VALS|', c, df[c].value_counts(dropna=False).head(15).to_dict())
df['m'] = pd.to_datetime(df['instance_date'], errors='coerce').dt.strftime('%Y-%m')
by = df.groupby('m').agg(n=('transaction_id', 'size'), v=('price_aed', 'sum'), off=('reg_type_label', lambda s: (s == 'Off-plan').sum()))
print('YEARS|', df.groupby(df['m'].str[:4]).size().loc['2015':].to_dict())
for f in sorted(glob.glob('data/dld/tx/2026-*.json')):
    d = json.load(open(f)); m = d['month']
    if m in by.index:
        r = by.loc[m]
        print(f'CMP| {m} api sales {d["sales"]["count"]:>6} copy {int(r.n):>6} diff {int(r.n) - d["sales"]["count"]:>+6} ({(int(r.n) - d["sales"]["count"]) / d["sales"]["count"] * 100:+.1f}%) | api value {d["sales"]["value"]/1e9:.2f}bn copy {r.v/1e9:.2f}bn | api offplan {d["sales"]["offplan"]} copy {int(r.off)}')
# area names: overlap with DLD API area names
api_areas = set()
for f in glob.glob('data/dld/tx/2026-*.json'):
    api_areas |= set(json.load(open(f))['areas'])
cp = set(df.loc[df['m'] >= '2026-01', 'area_name_en'].dropna().str.strip().str.title())
print('AREAS| api', len(api_areas), 'copy', len(cp), 'both', len(api_areas & cp), 'only api', sorted(api_areas - cp)[:15], 'only copy', sorted(cp - api_areas)[:15])

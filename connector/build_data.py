"""Writes connector/data.js: the site's data (site/data/*.json, made by pipeline/build.py) as a module the connector
bundles. Run after build.py; the connector workflow does both before every deploy."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'site', 'data')


def load(name):
    return json.load(open(os.path.join(DATA, name), encoding='utf-8'))


def main():
    re_, off, laws = load('realestate.json'), load('official.json'), load('laws.json')
    built = (re_.get('updated') or '')[:10]
    js = ('// Made by connector/build_data.py from site/data. Do not edit.\n'
          f'export const BUILT = {json.dumps(built)};\n'
          f'export const RE = {json.dumps(re_, separators=(",", ":"), ensure_ascii=False)};\n'
          f'export const OFF = {json.dumps(off, separators=(",", ":"), ensure_ascii=False)};\n'
          f'export const LAWS = {json.dumps(laws, separators=(",", ":"), ensure_ascii=False)};\n')
    out = os.path.join(ROOT, 'connector', 'data.js')
    open(out, 'w', encoding='utf-8').write(js)
    print('connector/data.js', len(js), 'chars, data as of', built)


if __name__ == '__main__':
    main()

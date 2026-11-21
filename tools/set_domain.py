#!/usr/bin/env python3
"""Point the site at a custom domain.

    python3 tools/set_domain.py earthdiary.example

Rewrites every absolute URL of the GitHub Pages address to the new domain
(canonical links, Open Graph tags, sitemap, robots.txt, structured data),
fixes the paths in 404.html and writes the CNAME file GitHub Pages needs.
Run it once, commit, push, then add the DNS record at your registrar.
"""
import pathlib, re, sys

OLD_HOSTS = ['https://emmazhao422.github.io/earth-diary/']

def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'[a-z0-9.-]+\.[a-z]{2,}', sys.argv[1].lower()):
        sys.exit('usage: python3 tools/set_domain.py yourdomain.com')
    domain = sys.argv[1].lower()
    root = pathlib.Path(__file__).resolve().parent.parent
    cname = root / 'CNAME'
    old = OLD_HOSTS + ([f'https://{cname.read_text().strip()}/'] if cname.exists() else [])
    new = f'https://{domain}/'
    changed = []
    for path in list(root.glob('*.html')) + [root / 'sitemap.xml', root / 'robots.txt', root / 'README.md']:
        text = path.read_text(encoding='utf-8')
        out = text
        for o in old:
            out = out.replace(o, new)
        if path.name == '404.html':
            out = out.replace('"/earth-diary/', '"/')
        if out != text:
            path.write_text(out, encoding='utf-8')
            changed.append(path.name)
    cname.write_text(domain + '\n')
    print(f'Now pointing at {new}')
    print('Updated:', ', '.join(changed + ['CNAME']))
    print('Next: commit + push, then at your registrar add a CNAME record  www -> emmazhao422.github.io')
    print('      (for a bare domain, add the four GitHub Pages A records listed in the GitHub docs).')

if __name__ == '__main__':
    main()

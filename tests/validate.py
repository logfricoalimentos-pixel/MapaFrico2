"""Validação sem dependências: HTML real (ignora <script> em comentários CSS)."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess, tempfile, collections
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.active = False; self.scripts = []; self.ids = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'): self.ids.append(attrs['id'])
        if tag == 'script':
            self.active = not attrs.get('src'); self.scripts.append('')
    def handle_endtag(self, tag):
        if tag == 'script': self.active = False
    def handle_data(self, data):
        if self.active: self.scripts[-1] += data
p = Page(); p.feed(Path('ARENA.html').read_text())
assert not [k for k,v in collections.Counter(p.ids).items() if v > 1], 'IDs duplicados'
for text in p.scripts:
    if not text.strip(): continue
    with tempfile.NamedTemporaryFile(suffix='.js', mode='w') as f:
        f.write(text); f.flush(); subprocess.run(['node', '--check', f.name], check=True)
subprocess.run(['node', '--test', 'tests/recovery.cjs'], check=True)
print('HTML, IDs e scripts inline: OK')

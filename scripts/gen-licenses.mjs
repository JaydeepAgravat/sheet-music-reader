#!/usr/bin/env node
/**
 * Generates src/features/support/licenses.json (the in-app Licences screen) from:
 *  - Fonts: assets/licenses/*  (Inter, Source Serif 4, Bravura — SIL OFL 1.1)
 *  - Icons: Phosphor (@phosphor-icons/core, MIT; only the glyphs we use are bundled)
 *  - JS libraries that actually ship: every package in a release Metro bundle's source map, plus
 *    every package.json "dependency" (native-only packages have no JS in the bundle)
 *  - Android libraries: the curated list in scripts/licenses/android.json (see its _readme)
 *
 * Usage: npm run licenses                              (builds a throwaway release bundle, ~10 s)
 *        npm run licenses -- --sourcemap <file.map>     (reuse the source map of a release build)
 *        npm run licenses -- --no-bundle                (package.json dependencies only; incomplete)
 *
 * Output is deterministic (sorted, no timestamps), so re-running without changes is a no-op diff.
 * Identical licence texts are stored once (`texts`) and referenced by id.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'src/features/support/licenses.json');
const useBundle = !process.argv.includes('--no-bundle');
const mapArg = process.argv.indexOf('--sourcemap');
const givenMap = mapArg > 0 ? path.resolve(process.argv[mapArg + 1] ?? '') : null;

const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const readJson = p => JSON.parse(read(p));

// ---------------------------------------------------------------- text helpers

/** CRLF → LF, trims, and reflows hard-wrapped paragraphs so text wraps naturally on any width. */
function normalise(text) {
  const clean = text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  const rule = l => /^[-=_*]{3,}/.test(l);
  // Lines that start something of their own: indented, list items, rules, headings.
  const starts = l => /^\s/.test(l) || /^([-*•]|\(?[0-9a-z]{1,3}[.)])\s/i.test(l) || rule(l) || l.startsWith('#');
  // Lines that stand alone: rules and short ALL-CAPS headings ("PREAMBLE", "DEFINITIONS").
  const alone = l => rule(l) || (l.length < 40 && l.split(' ').length <= 4 && /^[A-Z0-9 '"()&-]+$/.test(l) && /[A-Z]{3}/.test(l));
  return clean
    .split('\n\n')
    .map(para => {
      const lines = para.split('\n');
      let text = lines[0] ?? '';
      for (let i = 1; i < lines.length; i++) {
        const join = !starts(lines[i]) && !alone(lines[i]) && !alone(lines[i - 1]);
        text += (join ? ' ' : '\n') + lines[i];
      }
      return text;
    })
    .join('\n\n');
}

const MIT = c => `MIT License

${c}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const BSD3 = c => `BSD 3-Clause License

${c}

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

const ISC = c => `ISC License

${c}

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

const APACHE = () => read('assets/licenses/Apache-2.0.txt');

/** Full text for an SPDX id when a package ships no LICENSE file. */
function templateText(spdx, copyright, url) {
  const c = copyright || 'Copyright (c) the authors';
  if (/^MIT$/i.test(spdx)) return MIT(c);
  if (/^ISC$/i.test(spdx)) return ISC(c);
  if (/^BSD-3-Clause$/i.test(spdx)) return BSD3(c);
  if (/^Apache-2\.0$/i.test(spdx)) return `${c}\n\n${APACHE()}`;
  return `Licensed under ${spdx}.${url ? ` See ${url}` : ''}`;
}

function copyrightLine(text) {
  const line = text.split(/\r?\n/).find(l => /^\s*(copyright|\(c\)|©)/i.test(l));
  return line ? line.trim() : '';
}

const texts = {};
function textId(text) {
  const t = normalise(text);
  const id = crypto.createHash('sha1').update(t).digest('hex').slice(0, 12);
  texts[id] = t;
  return id;
}

// ---------------------------------------------------------------- fonts & icons

const fontDefs = [
  { id: 'font:inter', name: 'Inter', file: 'assets/licenses/Inter-OFL.txt', url: 'https://rsms.me/inter' },
  { id: 'font:source-serif-4', name: 'Source Serif 4', file: 'assets/licenses/SourceSerif4-OFL.md', url: 'https://github.com/adobe-fonts/source-serif' },
  { id: 'font:bravura', name: 'Bravura (SMuFL music font)', file: 'assets/licenses/Bravura-OFL.txt', url: 'https://github.com/steinbergmedia/bravura' },
];
const fonts = fontDefs.map(f => {
  const text = read(f.file);
  const copyright = text.split(/This Font Software is licensed/)[0].replace(/\s+/g, ' ').trim();
  return { id: f.id, name: f.name, version: '', license: 'OFL-1.1', copyright, url: f.url, textId: textId(text) };
});

const phosphor = readJson('node_modules/@phosphor-icons/core/package.json');
const phosphorText = read('node_modules/@phosphor-icons/core/LICENSE');
const icons = [
  {
    id: 'icons:phosphor',
    name: 'Phosphor Icons',
    version: phosphor.version,
    license: phosphor.license ?? 'MIT',
    copyright: copyrightLine(phosphorText),
    url: 'https://phosphoricons.com',
    textId: textId(phosphorText),
  },
];

// ---------------------------------------------------------------- JS libraries

/** Package directories (relative to root) whose JS is in a source map. */
function packageDirsFromMap(file) {
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sources = (map.sections ?? [{ map }]).flatMap(s => s.map.sources ?? []);
  const dirs = new Set();
  for (const src of sources) {
    const rel = path.relative(root, src);
    const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(rel);
    if (m) dirs.add(m[1]);
  }
  return [...dirs];
}

/** Package directories that end up in a release bundle (builds one into a temp dir). */
function bundledPackageDirs() {
  if (givenMap) return packageDirsFromMap(givenMap);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'licenses-'));
  try {
    try {
      execFileSync(
        'npx',
        ['react-native', 'bundle', '--platform', 'android', '--dev', 'false', '--entry-file', 'index.js',
          '--bundle-output', path.join(tmp, 'index.js'), '--sourcemap-output', path.join(tmp, 'index.map'), '--assets-dest', path.join(tmp, 'res')],
        { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
      );
    } catch {
      console.error('licenses: the release bundle failed to build (see above). Fix it, or pass --sourcemap / --no-bundle.');
      process.exit(1);
    }
    return packageDirsFromMap(path.join(tmp, 'index.map'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

function npmItem(dir) {
  const pkg = readJson(path.join(dir, 'package.json'));
  const spdx = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses?.[0]?.type || 'UNKNOWN');
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '';
  const url = (pkg.homepage || repo || `https://www.npmjs.com/package/${pkg.name}`).replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');
  const file = fs.readdirSync(path.join(root, dir)).find(f => LICENSE_FILE.test(f));
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? '';
  let text;
  let copyright;
  if (file) {
    text = read(path.join(dir, file));
    copyright = copyrightLine(text);
  } else {
    copyright = author ? `Copyright (c) ${author.replace(/\s*[<(].*$/, '')}` : '';
    text = templateText(spdx, copyright, url);
  }
  return { id: `npm:${pkg.name}`, name: pkg.name, version: pkg.version, license: spdx, copyright, url, textId: textId(text) };
}

const rootPkg = readJson('package.json');
const dirs = new Set(Object.keys(rootPkg.dependencies ?? {}).map(n => `node_modules/${n}`));
if (useBundle) bundledPackageDirs().forEach(d => dirs.add(d));
else console.warn('licenses: --no-bundle → only direct dependencies (transitive JS packages are missing)');

const byName = new Map();
for (const dir of [...dirs].sort()) {
  if (!fs.existsSync(path.join(root, dir, 'package.json'))) continue;
  const item = npmItem(dir);
  const seen = byName.get(item.name);
  // Deduplicate by package: several nested copies list all their versions under one entry.
  if (seen) {
    if (!seen.version.split(', ').includes(item.version)) seen.version = [seen.version, item.version].sort().join(', ');
  } else byName.set(item.name, item);
}

// ---------------------------------------------------------------- Android libraries

const android = readJson('scripts/licenses/android.json').libraries.map(l => {
  let text;
  if (l.text === 'MIT') text = MIT(l.copyright);
  else if (l.text === 'BSD-3-Clause') text = BSD3(l.copyright);
  else if (l.text === 'Apache-2.0') text = `${l.copyright}\n\n${APACHE()}`;
  else if (l.text.startsWith('file:')) text = read(l.text.slice(5));
  else if (l.text.startsWith('note:')) text = l.text.slice(5);
  else throw new Error(`android.json: unknown text kind for ${l.id}: ${l.text}`);
  return { id: l.id, name: l.name, version: '', license: l.license, copyright: l.copyright, url: l.url, textId: textId(text) };
});

const libraries = [...byName.values(), ...android].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

// Only keep texts that are referenced (textId() may have seen duplicates from nested copies).
const groups = [
  { id: 'fonts', items: fonts },
  { id: 'icons', items: icons },
  { id: 'libraries', items: libraries },
];
const used = new Set(groups.flatMap(g => g.items.map(i => i.textId)));
const sortedTexts = Object.fromEntries(Object.keys(texts).filter(k => used.has(k)).sort().map(k => [k, texts[k]]));

const json = JSON.stringify({ version: 1, groups, texts: sortedTexts }, null, 1) + '\n';
fs.writeFileSync(out, json);
const unknown = libraries.filter(l => l.license === 'UNKNOWN').map(l => l.name);
console.log(
  `licenses: ${fonts.length} fonts, ${icons.length} icon set, ${libraries.length} libraries (${byName.size} npm + ${android.length} Android), ` +
    `${Object.keys(sortedTexts).length} distinct texts → ${path.relative(root, out)} (${(json.length / 1024).toFixed(0)} KB)`,
);
if (unknown.length) console.warn(`licenses: no licence declared for: ${unknown.join(', ')}`);

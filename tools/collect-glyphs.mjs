// 收集页面上每种网页字体实际渲染的字符，写入 tools/glyphs.json，供字体子集化
// 用法：先 `node tools/serve.mjs`，再 `node tools/collect-glyphs.mjs [http://localhost:6099]`
// 依赖 puppeteer-core 或 playwright 与本机 Chrome，可用 PUPPETEER_FROM 指向依赖目录
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynamicHandStrings, scriptStrings } from './font-role-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(process.env.PUPPETEER_FROM ? join(process.env.PUPPETEER_FROM, 'noop.js') : import.meta.url);
let chromium, playwright = false;
try { chromium = req('puppeteer-core'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  chromium = req('playwright').chromium;
  playwright = true;
}
const base = (process.argv[2] || 'http://localhost:6099').replace(/\/$/, '');
const CHROME = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

const buckets = { serif: new Set(), serifItalic: new Set(), hand: new Set(), mono: new Set(), sans: new Set(), phone: new Set() };
const add = (key, text) => { for (const ch of text) buckets[key].add(ch); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  for (const path of ['/', '/404.html', '/en/', '/en/__missing__']) {
    const page = await browser.newPage();
    if (playwright) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.route('**/__live', route => route.abort());
    } else await page.setViewport({ width: 1440, height: 900 });
    await page.goto(base + path, { waitUntil: playwright ? 'networkidle' : 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    const got = await page.evaluate(() => {
      const out = { serif: '', serifItalic: '', hand: '', mono: '', sans: '', phone: '' };
      const pick = (ff) => (/^"?Fraunces/.test(ff) ? 'serif' : /Caveat/.test(ff) ? 'hand' : /Geist Mono/.test(ff) ? 'mono' : /^"?Geist/.test(ff) ? 'sans' : /^"?NP (Roboto|Droid)/.test(ff) ? 'phone' : null);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const el = n.parentElement;
        if (!el || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
        const cs = getComputedStyle(el);
        const key = pick(cs.fontFamily);
        if (key) out[key] += n.data;
        if (key === 'serif' && cs.fontStyle === 'italic') out.serifItalic += n.data;
      }
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of ['::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          const c = cs.content;
          if (c && c !== 'none' && c !== 'normal' && /^".*"$/.test(c)) {
            const key = pick(cs.fontFamily);
            if (key) out[key] += c.slice(1, -1);
          }
        }
      }
      return out;
    });
    for (const k of Object.keys(buckets)) add(k, got[k] || '');
    await page.close();
  }
} finally {
  await browser.close();
}

// 静音与开发者提示使用手写体，应用内文字仍由原生字体承担
const PHONE_JS = new Set(['phone.js', 'phone-ui.js', 'app-preview.js', 'app-settings.js', 'app-library.js', 'app-home.js', 'app-header.js', 'app-demo-data.js', 'app-song-edit.js', 'dsp.js', 'demos.js', 'lyrics.js']);
for (const f of readdirSync(join(ROOT, 'assets/js'))) {
  const src = readFileSync(join(ROOT, 'assets/js', f), 'utf8');
  for (const value of dynamicHandStrings(f, src)) add('hand', value);
  for (const value of scriptStrings(src)) {
    if (!/[\u3000-\u9fff\uff00-\uffef]/.test(value)) continue;
    // 手机里的界面文案（音效页各分区、提示条等）大多在切换后才写入，直接从源码收
    if (PHONE_JS.has(f)) add('phone', value);
  }
}

const json = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, [...v].sort().join('')]));
writeFileSync(join(ROOT, 'tools/glyphs.json'), JSON.stringify(json, null, 1) + '\n');
console.log(Object.entries(json).map(([k, v]) => `${k}: ${[...v].length}`).join('  '));

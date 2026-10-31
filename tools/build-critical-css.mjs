#!/usr/bin/env node
// 从原始规则生成首屏样式，完整样式仍是全站行为的来源
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const sourceNames = ['base', 'sections', 'motion'];
const families = new Set(['Fraunces', 'Fraunces Critical', 'NP Serif', 'NP Hand', 'Caveat', 'Caveat Critical', 'Geist', 'Geist Mono', 'MiSans']);
const components = /^(hero|nav|menu|route|crayon|cr|doodle|lamp|signals|eyebrow|display|ul|btn|fig)(?:$|__|--)/;
const utilities = new Set(['wrap', 'lead', 'small', 'hand', 'mono', 'i', 'draw', 'sprite', 'skip', 'sr-only', 'lamp-glow', 'swap-text', 'img-fade', 'img-wait', 'dl-in', 'js', 'no-js', 'np-fallback']);
const grouping = /^@(media|supports|container|layer)\b/i;

// 字符串、注释和函数参数中的标点不能当成规则边界
function boundary(css, start, stops) {
  let quote = '', round = 0, square = 0, braces = 0;
  for (let i = start; i < css.length; i++) {
    const char = css[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) throw new Error('Unclosed CSS comment');
      i = end + 1;
      continue;
    }
    if (char === '(') { round++; continue; }
    if (char === ')') { round--; continue; }
    if (char === '[') { square++; continue; }
    if (char === ']') { square--; continue; }
    if (round || square) continue;
    if (!braces && stops.includes(char)) return i;
    if (char === '{') braces++;
    if (char === '}') braces--;
    if (braces < 0) throw new Error('Unexpected CSS closing brace');
  }
  if (quote || round || square || braces) throw new Error('Unclosed CSS rule or value');
  return css.length;
}

function rules(css) {
  const result = [];
  let start = 0;
  while (start < css.length) {
    if (/\s/.test(css[start])) { start++; continue; }
    if (css.startsWith('/*', start)) {
      const end = css.indexOf('*/', start + 2);
      if (end === -1) throw new Error('Unclosed CSS comment');
      start = end + 2;
      continue;
    }
    const open = boundary(css, start, '{;');
    if (open === css.length) throw new Error('CSS rule has no block');
    const header = css.slice(start, open).trim();
    if (css[open] === ';') {
      result.push({ header, body: null });
      start = open + 1;
    } else {
      const end = boundary(css, open + 1, '}');
      if (end === css.length) throw new Error('Unclosed CSS block');
      const body = css.slice(open + 1, end);
      result.push({ header, body, children: grouping.test(header) ? rules(body) : null });
      start = end + 1;
    }
  }
  return result;
}

function compact(css, declarations = false) {
  let result = '', quote = '', space = false;
  const punctuation = declarations ? '{}:;,' : '{},';
  function append(char) {
    if (space && result && !punctuation.includes(result.at(-1)) && !punctuation.includes(char)) result += ' ';
    space = false;
    result += char;
  }
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '\\') { append(char + (css[++i] || '')); continue; }
    if (quote) { result += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; append(char); continue; }
    if (char === '/' && css[i + 1] === '*') {
      i = css.indexOf('*/', i + 2) + 1;
      space = true;
    } else if (/\s/.test(char)) {
      space = true;
    } else append(char);
  }
  return result.trim().replace(/;$/, '');
}

function splitSelectors(header) {
  const selectors = [];
  let start = 0;
  while (start < header.length) {
    const end = boundary(header, start, ',');
    selectors.push(header.slice(start, end));
    start = end + 1;
  }
  return selectors;
}

function criticalSelector(selector) {
  if (/\[data-(?:stagger|split|stamp)(?:=|\])/.test(selector) || /\[data-reveal=/.test(selector) || /dsim-win/.test(selector)) return false;
  if (selector.trim() === 'code' || /\]\s+code$/.test(selector) || /\.draw path:nth-child\([34]\)/.test(selector)) return false;
  const classes = [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]);
  return classes.every(name => components.test(name) || utilities.has(name) || name.startsWith('is-'));
}

function fallbackRules(css, characters) {
  return rules(css).flatMap(rule => {
    if (rule.header !== '@font-face' || !/font-family:\s*["']MiSans["']/.test(rule.body) || !/font-weight:\s*400\s*;/.test(rule.body)) return [];
    const range = /unicode-range:\s*([^;]+)/i.exec(rule.body);
    if (!range) throw new Error('MiSans face is missing its unicode range');
    const spans = range[1].split(',').map(part => {
      const match = /^\s*U\+([\da-f]+)(?:-([\da-f]+))?\s*$/i.exec(part);
      if (!match) throw new Error('Unsupported MiSans unicode range: ' + part);
      return [parseInt(match[1], 16), parseInt(match[2] || match[1], 16)];
    });
    const points = [...characters].filter(point => spans.some(([start, end]) => point >= start && point <= end)).sort((a, b) => a - b);
    if (!points.length) return [];
    const source = /url\((["'])\.\.\/fonts\/misans-400\/(\d+)\.woff2\1\)/.exec(rule.body);
    if (!source) throw new Error('MiSans fallback must retain an existing source shard');
    const unicode = points.map(point => 'U+' + point.toString(16).toUpperCase().padStart(4, '0')).join(',');
    return [{ ...rule, body: rule.body.replace(source[0], `url("../fonts/misans-400-critical/${source[2]}.woff2")`).replace(range[0], 'unicode-range: ' + unicode) }];
  });
}

export function extractCriticalCss(sources, { fallbackCss = '', characters = new Set() } = {}) {
  const parsed = sources.flatMap(source => rules(source));
  parsed.push(...fallbackRules(fallbackCss, characters));
  const animationNames = new Set();
  const criticalFonts = new Set(parsed.filter(rule => rule.header === '@font-face' && /-critical\.woff2/.test(rule.body)).map(rule => /font-family:\s*["']?([^;"']+)/.exec(rule.body)?.[1].trim()));
  function keep(rule) {
    if (rule.children) return rule.children.some(keep);
    if (/^content-visibility:\s*auto;?$/.test(rule.body?.trim())) return true;
    if (/^@(?:-webkit-)?keyframes\b/i.test(rule.header)) return false;
    if (rule.header === '@font-face') {
      const family = /font-family:\s*["']?([^;"']+)/.exec(rule.body)?.[1].trim();
      return families.has(family) && (!criticalFonts.has(family) || /-critical\.woff2/.test(rule.body));
    }
    return !rule.header.startsWith('@') && splitSelectors(rule.header).some(criticalSelector);
  }
  function collect(list) {
    for (const rule of list) {
      if (rule.children) collect(rule.children);
      else if (keep(rule)) {
        let start = 0;
        while (start < rule.body.length) {
          const end = boundary(rule.body, start, ';');
          const declaration = rule.body.slice(start, end);
          if (/^\s*animation(?:-name)?\s*:/.test(declaration)) {
            for (const name of declaration.matchAll(/[a-zA-Z_][\w-]*/g)) animationNames.add(name[0]);
          }
          start = end + 1;
        }
      }
    }
  }
  collect(parsed);
  function emit(list) {
    return list.flatMap(rule => {
      if (rule.children) {
        const children = emit(rule.children);
        return children ? [compact(rule.header) + '{' + children + '}'] : [];
      }
      const frame = /^@(?:-webkit-)?keyframes\s+([\w-]+)/i.exec(rule.header);
      if (frame ? !animationNames.has(frame[1]) : !keep(rule)) return [];
      let body = compact(rule.body, true);
      if (rule.header === '@font-face') body = body.replace(/(^|;)font-weight:400;/g, '$1').replace(/(^|;)font-style:normal;/g, '$1');
      return [compact(rule.header) + '{' + body + '}'];
    }).join('');
  }
  return '/* Generated by tools/build-critical-css.mjs; edit the source stylesheets */\n' + emit(parsed) + '\n';
}

export async function buildCriticalCss() {
  const [sources, fallbackCss, pages] = await Promise.all([
    Promise.all(sourceNames.map(name => readFile(new URL(`assets/css/${name}.css`, root), 'utf8'))),
    readFile(new URL('assets/css/desktop-fonts.css', root), 'utf8'),
    Promise.all(['index.html', 'en/index.html'].map(path => readFile(new URL(path, root), 'utf8'))),
  ]);
  // 字形子集保留原 MiSans 分片边界与字重，完整桌面字体按原路径延后加载
  const characters = new Set();
  for (const page of pages) {
    const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(page)?.[0];
    if (!hero) throw new Error('Hero section not found while collecting fallback font characters');
    for (const character of hero) {
      const point = character.codePointAt(0);
      if (point >= 0x2e80) characters.add(point);
    }
  }
  return extractCriticalCss(sources, { fallbackCss, characters });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await buildCriticalCss();
  const target = new URL('assets/css/critical.css', root);
  const page = new URL('index.html', root);
  const html = await readFile(page, 'utf8');
  const inline = '<style id="critical-css">\n' + output.replaceAll('../fonts/', 'assets/fonts/') + '</style>';
  const entry = /<style id="critical-css">[\s\S]*?<\/style>|<link rel="stylesheet" href="assets\/css\/critical\.css">/;
  if (!entry.test(html)) throw new Error('Critical stylesheet entry not found in index.html');
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== output) throw new Error('critical.css is stale; run node tools/build-critical-css.mjs');
    if (!html.includes(inline)) throw new Error('Inline critical CSS is stale; run node tools/build-critical-css.mjs');
  } else if (process.argv.includes('--stdout')) process.stdout.write(output);
  else {
    await writeFile(target, output);
    await writeFile(page, html.replace(entry, inline));
  }
  if (!process.argv.includes('--stdout')) console.log(`critical.css: ${Buffer.byteLength(output)} bytes`);
}

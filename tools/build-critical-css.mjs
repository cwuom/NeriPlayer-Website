#!/usr/bin/env node
// 从原始规则生成首屏样式，完整样式仍是全站行为的来源
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const sourceNames = ['base', 'sections', 'motion'];
const families = new Set(['Fraunces', 'Fraunces Critical', 'Fraunces Critical ZH', 'NP Serif', 'NP Serif Critical', 'NP Hand', 'NP Hand Critical', 'Caveat', 'Caveat Critical', 'Geist', 'Geist Mono', 'MiSans', 'MiSans Critical']);
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

function compact(css, declarations = false, preserveComments = false, trimSemicolon = declarations) {
  let result = '', quote = '', space = false, lastPunctuation = false;
  const punctuation = declarations ? '{}:;,' : '{},';
  function append(char) {
    const isPunctuation = char.length === 1 && punctuation.includes(char);
    if (space && result && !lastPunctuation && !isPunctuation) result += ' ';
    space = false;
    result += char;
    lastPunctuation = isPunctuation;
  }
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '\\') { append(char + (css[++i] || '')); continue; }
    if (quote) { result += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; append(char); continue; }
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) throw new Error('Unclosed CSS comment');
      if (preserveComments) result += css.slice(i, end + 2);
      else space = true;
      i = end + 1;
    } else if (/\s/.test(char)) {
      space = true;
    } else append(char);
  }
  const trimmed = result.trim();
  return trimSemicolon ? trimmed.replace(/;$/, '') : trimmed;
}

// 完整样式只压缩安全的空白，不改写数值、变量、选择器或动画规则
export function minifyCss(css) {
  function declarations(body) {
    const result = [];
    let start = 0;
    while (start < body.length) {
      const end = boundary(body, start, ';');
      const declaration = body.slice(start, end).trimStart().replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, '');
      const colon = boundary(declaration, 0, ':');
      const property = declaration.slice(0, colon).trim();
      if (property.startsWith('--') && colon < declaration.length) {
        // 自定义属性是供 var() 替换的 token 流，保留其值中的原始空白
        result.push(property + ':' + declaration.slice(colon + 1));
      } else if (/^-?[a-zA-Z_][\w-]*$/.test(property) && colon < declaration.length) {
        result.push(property + ':' + compact(declaration.slice(colon + 1), true, true, false));
      } else if (declaration.trim()) {
        // 未识别的嵌套语法原样保留，不能按声明删除选择器中的空白
        result.push(declaration.trim());
      }
      start = end + 1;
    }
    return result.join(';');
  }
  return rules(css).map(rule => {
    const header = compact(rule.header, false, true);
    if (rule.body === null) return header + ';';
    const nested = rule.children || /^@(?:-webkit-)?keyframes\b/i.test(rule.header);
    return header + '{' + (nested ? minifyCss(rule.body) : declarations(rule.body)) + '}';
  }).join('');
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
  if (selector.trim() === '.no-js body') return false;
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
    return [{ ...rule, body: rule.body.replace(source[0], `url("../fonts/misans-400-shell-critical/${source[2]}.woff2")`).replace(range[0], 'unicode-range: ' + unicode).replace(/font-family:\s*["']MiSans["']/, 'font-family: "MiSans Critical"') }];
  });
}

export function extractCriticalCss(sources, { fallbackCss = '', characters = new Set() } = {}) {
  const parsed = sources.flatMap(source => rules(source));
  const hasCriticalCjk = parsed.some(rule => rule.header === '@font-face' && /font-family:\s*["']MiSans Critical["']/.test(rule.body) && /font-weight:\s*400\s*;/.test(rule.body) && /-critical\.woff2/.test(rule.body));
  if (!hasCriticalCjk) parsed.push(...fallbackRules(fallbackCss, characters));
  const animationNames = new Set();
  const criticalFonts = new Set(parsed.filter(rule => rule.header === '@font-face' && /-critical(?:\.woff2|\/)/.test(rule.body)).map(rule => /font-family:\s*["']?([^;"']+)/.exec(rule.body)?.[1].trim()));
  function keep(rule) {
    if (rule.children) return rule.children.some(keep);
    if (/^content-visibility:\s*auto;?$/.test(rule.body?.trim())) return true;
    if (/^@(?:-webkit-)?keyframes\b/i.test(rule.header)) return false;
    if (rule.header === '@font-face') {
      const family = /font-family:\s*["']?([^;"']+)/.exec(rule.body)?.[1].trim();
      return families.has(family) && (!criticalFonts.has(family) || /-critical(?:\.woff2|\/)/.test(rule.body));
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
      let declarations = rule.body;
      if (rule.header === ':root') {
        const used = [];
        let start = 0;
        while (start < declarations.length) {
          const end = boundary(declarations, start, ';');
          const declaration = declarations.slice(start, end);
          // 首屏在 body 使用独立栈，章节恢复原栈之前一定已经拿到完整样式
          if (!/^\s*--(?:serif|sans|hand|full-serif|full-sans|full-hand)\s*:/.test(declaration)) used.push(declaration);
          start = end + 1;
        }
        declarations = used.join(';');
      }
      let body = compact(declarations, true);
      if (rule.header === '@font-face') body = body.replace(/(^|;)font-weight:400;/g, '$1').replace(/(^|;)font-style:normal;/g, '$1').replace(/\s+format\(["']woff2["']\)/g, '');
      return [compact(rule.header) + '{' + body + '}'];
    }).join('');
  }
  // 完整样式的初次应用不应把屏外控件的浏览器默认色当成用户操作来过渡
  const startupGate = 'html.js:not(.np-styles-ready) :is(.station,.footer),html.js:not(.np-styles-ready) :is(.station,.footer) *,html.js:not(.np-styles-ready) :is(.station,.footer)::before,html.js:not(.np-styles-ready) :is(.station,.footer)::after,html.js:not(.np-styles-ready) :is(.station,.footer) *::before,html.js:not(.np-styles-ready) :is(.station,.footer) *::after{transition:none!important}';
  return '/* Generated by tools/build-critical-css.mjs; edit the source stylesheets */\n' + emit(parsed) + startupGate + '\n';
}

export async function buildCriticalCss() {
  const [sources, fallbackCss, pages, github] = await Promise.all([
    Promise.all(sourceNames.map(name => readFile(new URL(`assets/css/${name}.css`, root), 'utf8'))),
    readFile(new URL('assets/css/desktop-fonts.css', root), 'utf8'),
    Promise.all(['index.html', 'en/index.html'].map(path => readFile(new URL(path, root), 'utf8'))),
    readFile(new URL('assets/js/github.js', root), 'utf8'),
  ]);
  // 首屏与完整字体各自收集字集，避免正文加载改变已经显示的首屏字形
  const characters = new Set();
  for (const page of pages) {
    const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(page)?.[0];
    if (!hero) throw new Error('Hero section not found while collecting fallback font characters');
    for (const character of hero) {
      const point = character.codePointAt(0);
      if (point >= 0x2e80) characters.add(point);
    }
    for (const shell of page.matchAll(/<(header|aside|div|a)\b[^>]*class="(?:nav|route|menu|skip)(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/\1>/g)) {
      for (const character of shell[2].replace(/<[^>]*>/g, '')) if (character.codePointAt(0) >= 0x2e80) characters.add(character.codePointAt(0));
    }
  }
  const cta = /var CTA = \{[\s\S]*?(?=\n  NP\.github =)/.exec(github)?.[0];
  if (!cta) throw new Error('Dynamic first-screen CTA labels not found');
  for (const character of cta) if (character.codePointAt(0) >= 0x2e80) characters.add(character.codePointAt(0));
  return extractCriticalCss(sources, { fallbackCss, characters });
}

export function syncCriticalFontPreloads(html, css) {
  const faces = rules(css).filter(rule => rule.header === '@font-face');
  function source(family, weight = null, style = null) {
    const matches = faces.filter(rule => rule.body.includes(`font-family:"${family}";`) && (weight === null || (Number(/(?:^|;)font-weight:(\d+)(?:;|$)/.exec(rule.body)?.[1] || 400) === weight)) && (style === null || (/font-style:([^;]+)/.exec(rule.body)?.[1] || 'normal') === style));
    if (matches.length !== 1) throw new Error(`Expected one ${family} ${weight || ''} critical font`);
    const href = /url\("\.\.\/fonts\/([^"?]+)"\)/.exec(matches[0].body)?.[1];
    if (!href) throw new Error(`Missing ${family} critical font URL`);
    return 'assets/fonts/' + href;
  }
  const cjk = source('MiSans Critical', 400);
  const hasChineseSerif = faces.some(rule => rule.body.includes('font-family:"Fraunces Critical ZH";'));
  let foundCjk = false;
  const output = html.replace(/<link\b[^>]*\bdata-hero-cjk\b[^>]*>\n?/g, tag => {
    if (foundCjk) return '';
    foundCjk = true;
    return tag.replace(/href="[^"]+"/, `href="${cjk}"`);
  }).replace(/<link\b[^>]*href="assets\/fonts\/(fraunces(?:-italic)?(?:-zh)?|np-serif|np-hand|caveat)(?:-[a-f0-9]+)?-critical\.woff2"[^>]*>/g, (tag, role) => {
    const base = role.replace(/-zh$/, '');
    const family = base.startsWith('fraunces') && hasChineseSerif ? 'Fraunces Critical ZH' : { fraunces: 'Fraunces Critical', 'fraunces-italic': 'Fraunces Critical', 'np-serif': 'NP Serif Critical', 'np-hand': 'NP Hand Critical', caveat: 'Caveat Critical' }[base];
    const style = base.startsWith('fraunces') ? (base.endsWith('italic') ? 'italic' : 'normal') : null;
    const updated = tag.replace(/href="[^"]+"/, `href="${source(family, null, style)}"`).replace(/\sdata-hero-en-font="[^"]*"/g, '');
    return hasChineseSerif && base === 'fraunces-italic' ? updated.replace(/>$/, ` data-hero-en-font="${source('Fraunces Critical', null, 'italic')}">`) : updated;
  });
  if (!foundCjk) throw new Error('Critical CJK font preload not found');
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await buildCriticalCss();
  const target = new URL('assets/css/critical.css', root);
  const page = new URL('index.html', root);
  const html = await readFile(page, 'utf8');
  const preloaded = syncCriticalFontPreloads(html, output);
  const inline = '<style id="critical-css">\n' + output.replaceAll('../fonts/', 'assets/fonts/') + '</style>';
  const entry = /<style id="critical-css">[\s\S]*?<\/style>|<link rel="stylesheet" href="assets\/css\/critical\.css">/;
  if (!entry.test(html)) throw new Error('Critical stylesheet entry not found in index.html');
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== output) throw new Error('critical.css is stale; run node tools/build-critical-css.mjs');
    if (!html.includes(inline)) throw new Error('Inline critical CSS is stale; run node tools/build-critical-css.mjs');
    if (html !== preloaded) throw new Error('Critical CJK font preloads are stale; run node tools/build-critical-css.mjs');
  } else if (process.argv.includes('--stdout')) process.stdout.write(output);
  else {
    await writeFile(target, output);
    await writeFile(page, preloaded.replace(entry, inline));
  }
  if (!process.argv.includes('--stdout')) console.log(`critical.css: ${Buffer.byteLength(output)} bytes`);
}

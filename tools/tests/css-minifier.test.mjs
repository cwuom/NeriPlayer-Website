import assert from 'node:assert/strict';
import test from 'node:test';
import * as generator from '../build-critical-css.mjs';

function minify(source) {
  assert.equal(typeof generator.minifyCss, 'function', 'the stylesheet minifier must be exported');
  return generator.minifyCss(source);
}

test('minification preserves descendant selectors before pseudo classes', () => {
  assert.equal(
    minify('/* source */ .foo :is(.bar, .baz), .foo:hover > .child { color: red; transition: opacity .2s, color .3s; }'),
    '.foo :is(.bar,.baz),.foo:hover > .child{color:red;transition:opacity .2s,color .3s}'
  );
});

test('nested conditions and every keyframe retain their original order and timings', () => {
  assert.equal(minify(`
    @layer components;
    @media (width >= 320px) {
      @supports (display: grid) {
        .foo :not(.hidden) { animation: float 1.2s cubic-bezier(.2, .7, .1, 1) 120ms; }
      }
    }
    @keyframes float { from { transform: translate(0, 1px); } 50%, 75% { opacity: .5; } to { transform: translate(1px, 2px); } }
    @keyframes unused { to { opacity: 0; } }
  `), '@layer components;@media (width >= 320px){@supports (display: grid){.foo :not(.hidden){animation:float 1.2s cubic-bezier(.2,.7,.1,1) 120ms}}}@keyframes float{from{transform:translate(0,1px)}50%,75%{opacity:.5}to{transform:translate(1px,2px)}}@keyframes unused{to{opacity:0}}');
});

test('quoted text, data URLs, escaped spaces and math token boundaries remain intact', () => {
  const source = String.raw`.foo\ bar::after { content: "x } { ; /* literal */  y"; background: url("data:image/svg+xml,<svg a='{x};'>a, b</svg>"); width: calc(100% - 2 * var(--gap, 3px)); }`;
  assert.equal(minify(source), String.raw`.foo\ bar::after{content:"x } { ; /* literal */  y";background:url("data:image/svg+xml,<svg a='{x};'>a, b</svg>");width:calc(100% - 2 * var(--gap,3px))}`);
});

test('inline comments do not introduce a descendant or join identifier tokens', () => {
  assert.equal(
    minify('.foo/**/:hover, .foo /**/:focus { color: var(--tone, red/**/blue); }'),
    '.foo/**/:hover,.foo/**/ :focus{color:var(--tone,red/**/blue)}'
  );
});

test('escaped punctuation at selector and value boundaries is not removed', () => {
  assert.equal(
    minify(String.raw`.escaped\; { animation-name: pulse\;; color: red; }`),
    String.raw`.escaped\;{animation-name:pulse\;;color:red}`
  );
});

test('escaped commas do not erase the following descendant or font-name space', () => {
  assert.equal(
    minify(String.raw`.escaped\, .child { font-family: Family\, Name; }`),
    String.raw`.escaped\, .child{font-family:Family\, Name}`
  );
});

test('custom property values and unknown nested syntax are preserved conservatively', () => {
  assert.equal(
    minify('.foo { --tokens: a : b,  c ; --empty: ; --block: { a: b; }; color: red; &:hover { color: blue; } }'),
    '.foo{--tokens: a : b,  c ;--empty: ;--block: { a: b; };color:red;&:hover { color: blue; }}'
  );
});

test('the result is repeatable and rejects incomplete CSS instead of dropping rules', () => {
  const once = minify('.a { color: rgb(1, 2, 3); } @keyframes a { to { opacity: 1; } }');
  assert.equal(minify(once), once);
  for (const source of ['.a { color: red;', '.a { content: "unterminated; }', '.a { color: red; /* open']) {
    assert.throws(() => minify(source), /Unclosed/);
  }
});

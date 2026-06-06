// render のユニットテスト — node:test（Node 標準）で外部依存ゼロ。
//
//   node --test test/
//
// 流し読み防止ツールの土台は「描画が正しいこと」。ここが崩れると
// 「承認は描画でする」運用が成立しない（ISO/IEC 25010:2023 機能正確性）。
// 特に過去に踏んだ欠陥は回帰テストとして固定する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inline, renderTable, renderBlocks, parseFrontmatter, slugify, mdToHtml,
} from '../src/render.mjs';

// ── inline: コードスパン退避の正確性（旧センチネル欠陥の回帰テスト） ──
test('inline: 裸の数字をコードスパン化しない（旧 " 3 " 誤マッチの回帰）', () => {
  assert.equal(inline('Node version 3 is faster than 2'),
    'Node version 3 is faster than 2');
  assert.equal(inline('step 1 and step 0 done'), 'step 1 and step 0 done');
});

test('inline: 本文の数字が別コードスパン本文を引っ張らない（相互汚染の回帰）', () => {
  // codes[0]="code" があっても、本文中の "0" は code[0] に化けない
  assert.equal(inline('`code` and plain 0 text'),
    '<code>code</code> and plain 0 text');
});

test('inline: コードスパンに数字を含められる', () => {
  assert.equal(inline('use `npm run 5` now'),
    'use <code>npm run 5</code> now');
});

test('inline: 強調・斜体・リンク・エスケープ', () => {
  assert.equal(inline('**a** and *b*'), '<strong>a</strong> and <em>b</em>');
  assert.equal(inline('[t](u)'), '<a href="u">t</a>');
  assert.equal(inline('1 < 2 & 3 > 0'), '1 &lt; 2 &amp; 3 &gt; 0');
});

test('inline: null/undefined は空文字', () => {
  assert.equal(inline(null), '');
  assert.equal(inline(undefined), '');
});

// ── renderTable: cmp-mark と推奨列マーカー ──
test('renderTable: yes/no/mid/na が cmp-mark に変換される', () => {
  const html = renderTable(['| 軸 | A |', '|---|---|', '| 速度 | yes |']);
  assert.match(html, /cmp-mark cmp-mark--yes/);
});

test('renderTable: ヘッダの [*] で推奨列、ラベルからは [*] を除去', () => {
  const html = renderTable(['| 軸 | B [*] |', '|---|---|', '| 速度 | yes |']);
  assert.match(html, /is-recommended/);
  assert.doesNotMatch(html, /\[\*\]/); // ヘッダから除去されている
});

test('renderTable: 本文セル内の `[*]` コードスパンは壊さない（ADR-0000 自己言及の回帰）', () => {
  // 記法を説明する表が、自分の説明（`[*]`）を食わないこと
  const html = renderTable(['| 記法 | 意味 |', '|---|---|', '| `[*]` | 推奨列マーカー |']);
  assert.match(html, /<code>\[\*\]<\/code>/);
});

// ── parseFrontmatter ──
test('parseFrontmatter: スカラ・引用・配列・ブロックスカラー・本文分離', () => {
  const text = [
    '---',
    'adr: "0002"',
    'status: accepted',
    'tags: [Process, Format]',
    'lead: |',
    '  1 行目',
    '  2 行目',
    '---',
    '本文ここから',
  ].join('\n');
  const { meta, body } = parseFrontmatter(text);
  assert.equal(meta.adr, '0002');
  assert.equal(meta.status, 'accepted');
  assert.deepEqual(meta.tags, ['Process', 'Format']);
  assert.equal(meta.lead, '1 行目\n2 行目');
  assert.equal(body.trim(), '本文ここから');
});

test('parseFrontmatter: frontmatter 無しは空 meta と全文 body', () => {
  const { meta, body } = parseFrontmatter('# 見出し\n本文');
  assert.deepEqual(meta, {});
  assert.equal(body, '# 見出し\n本文');
});

// ── slugify / 見出し ──
test('slugify: 記号除去とハイフン化、空なら section', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('！？'), 'section');
});

test('renderBlocks: 見出しの {#id} を尊重、省略時は自動 slug', () => {
  assert.match(renderBlocks('## 背景 {#context}'), /<h2 id="context">背景<\/h2>/);
  assert.match(renderBlocks('## Hello World'), /<h2 id="hello-world">/);
});

// ── callout / コードブロック / =html パススルー ──
test('renderBlocks: callout のタイプ・タイトル・本文', () => {
  const html = renderBlocks('> [!WARNING] 反証\n> 崩れる条件');
  assert.match(html, /callout--warning/);
  assert.match(html, /callout-title">反証/);
});

test('renderBlocks: ```=html は生 HTML をエスケープせず通す', () => {
  const html = renderBlocks('```=html\n<div class="donut">x</div>\n```');
  assert.match(html, /<div class="donut">x<\/div>/);
});

test('renderBlocks: 通常コードブロックはエスケープする', () => {
  const html = renderBlocks('```js\na < b\n```');
  assert.match(html, /a &lt; b/);
  assert.match(html, /language-js/);
});

// ── mdToHtml スモーク ──
test('mdToHtml: 完全な ADR がスキャフォルドを生成する', () => {
  const md = [
    '---', 'adr: "0001"', 'title: テスト', 'status: accepted', 'date: 2026-06-06', '---',
    '## Context {#context}', '背景。',
  ].join('\n');
  const html = mdToHtml(md);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<title>ADR-0001 · テスト<\/title>/);
  assert.match(html, /status-accepted/);
  assert.match(html, /<h2 id="context">Context<\/h2>/);
});

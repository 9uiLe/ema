#!/usr/bin/env node
// lint — ADR 正本 Markdown のテンプレ充足チェック
//
// ADR-0000 のレビュー観点のうち「機械で確かめられるもの」を自動化する。
// 外部依存ゼロ。終了コードで通知（ERROR があれば 1）。
//
// 統一 CLI（推奨）:
//   ema lint                              # adr/*.md を検査
//   ema lint adr/0002-adr-source-format.md
// 直接起動（互換）:
//   node src/commands/lint.mjs [files...]
//
// 対象は frontmatter に `adr:` を持つ .md のみ（ガイド等は type: guide でスロット検査を免除）。
//
// frontmatter 解析・有効 Status 値はジェネレータと同じ src/render.mjs を
// 共有する（DRY: 規約の単一表現。lint と gen が別解釈で食い違うのを防ぐ）。

import { readFile, readdir } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, STATUS_VALID } from '../render.mjs';
import { findAdrDir } from '../paths.mjs';
import { PLACEHOLDERS } from '../template.mjs';

const ADR_DIR = findAdrDir();
const VALID_STATUS = STATUS_VALID;

export const help = `ema lint — 固定スロット・反証スロットの充足を検査（外部依存ゼロ）

使い方:
  ema lint [files...]

引数:
  files            検査対象の .md（省略時は docs/decisions/*.md すべて。adr: を持つ .md のみ対象）

オプション:
  -h, --help       このヘルプ

終了コード:
  0  ERROR なし / 1  ERROR あり（反証スロット欠落・残存プレースホルダ・frontmatter 不備など）`;

// frontmatter ＋ 本文を取り出す（adr: を持たない .md は対象外として null を返す）
function readFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const { meta, body } = parseFrontmatter(text);
  return { meta, body };
}

// コードスパン・コードブロックを除いた本文を返す。
// プレースホルダ検査は「地の文に雛形が残っているか」を見たい。コード内（`軸1` のような
// 言及や説明）は未充足ではないので、検査対象から外して誤検出を防ぐ。
function stripCode(body) {
  return body
    .replace(/```[\s\S]*?```/g, '') // フェンス付きコードブロック
    .replace(/`[^`]*`/g, '');        // インラインコードスパン
}

// 本文の見出しテキスト一覧
function headings(body) {
  return body.split('\n')
    .map((l) => /^#{2,4}\s+(.*?)(?:\s+\{#[\w-]+\})?\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
}

// 推奨スロット（見出しテキストに含まれていれば充足）
const SLOTS = [
  { name: 'Context', test: (hs) => hs.some((h) => /context|背景/i.test(h)), level: 'warn' },
  { name: 'Decision', test: (hs) => hs.some((h) => /decision(?!\s+drivers)|決定|採用/i.test(h)), level: 'warn' },
  { name: 'Considered Options', test: (hs) => hs.some((h) => /option|選択肢|considered/i.test(h)), level: 'warn' },
  { name: 'Consequences', test: (hs) => hs.some((h) => /consequence|帰結|結果/i.test(h)), level: 'warn' },
  { name: '反証スロット（この決定が間違いになるとしたら）', test: (hs, body) => hs.some((h) => /間違いになるとしたら|反証|falsif/i.test(h)) || /\[!WARNING\]/.test(body), level: 'error' },
  { name: 'References', test: (hs) => hs.some((h) => /reference|参考|参照/i.test(h)), level: 'warn' },
];

// 終了コードを返す（0=ERROR なし / 1=ERROR あり / 2=引数エラー）。
export async function run(argv = []) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(help); return 0; }
  const files = argv.filter((a) => !a.startsWith('-'));

  const list = files.length
    ? files.map((f) => resolve(f))
    : (await readdir(ADR_DIR)).filter((e) => e.endsWith('.md')).map((e) => join(ADR_DIR, e));

  let errors = 0, warns = 0, linted = 0;

  for (const file of list) {
    const text = await readFile(file, 'utf8');
    const fmParsed = readFrontmatter(text);
    const name = basename(file);
    if (!fmParsed || !('adr' in fmParsed.meta)) continue; // ADR でない .md は対象外
    linted++;
    const { meta, body } = fmParsed;
    const issues = [];

    // frontmatter 必須キー
    for (const key of ['adr', 'title', 'status', 'date']) {
      if (!meta[key]) issues.push(['error', `frontmatter に ${key} が無い`]);
    }
    if (meta.status && !VALID_STATUS.includes(String(meta.status).toLowerCase())) {
      issues.push(['error', `status が不正: ${meta.status}（${VALID_STATUS.join(' / ')}）`]);
    }

    // ガイド等はスロット検査を免除
    if (String(meta.type || '').toLowerCase() !== 'guide') {
      const hs = headings(body);
      for (const slot of SLOTS) {
        if (!slot.test(hs, body)) issues.push([slot.level, `スロット欠落: ${slot.name}`]);
      }
      // テンプレ雛形の残存（半端 ADR）を検出する。反証スロットの空欄は error。
      // コード内の言及は未充足ではないので除外してから判定する（誤検出の防止）。
      const prose = stripCode(body);
      for (const ph of PLACEHOLDERS) {
        if (prose.includes(ph.marker)) {
          issues.push([ph.level, `プレースホルダ残存（${ph.slot}）: "${ph.marker}"`]);
        }
      }
    }

    if (issues.length === 0) {
      console.log(`  ✓ ${name}`);
    } else {
      console.log(`  ✗ ${name}`);
      for (const [level, msg] of issues) {
        if (level === 'error') errors++; else warns++;
        console.log(`      ${level === 'error' ? 'ERROR' : 'warn '}  ${msg}`);
      }
    }
  }

  console.log(`\n  ${linted} 件検査 · ERROR ${errors} · warn ${warns}`);
  return errors ? 1 : 0;
}

// 直接起動された場合のみ実行（ema 経由では import されるだけ）。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = (await run(process.argv.slice(2))) ?? 0;
}

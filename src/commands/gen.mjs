#!/usr/bin/env node
// gen — Markdown 正本 → デザインシステム HTML ジェネレータ（CLI 層）
//
// ADR-0002 の決定（正本 ≠ 表示）の実装。外部依存ゼロ（Node 標準のみ）。
// 変換ロジックは副作用のない seam として src/render.mjs に分離してあり、
// この CLI はファイル IO と引数解析のみを担う（試験性: lib 側を node:test で被覆）。
//
// 統一 CLI（推奨）:
//   ema gen                 # adr/*.md をすべて生成
//   ema gen adr/0002-*.md   # 指定ファイルのみ
//   ema gen --check         # 生成せず差分の有無だけ確認（CI 用、終了コードで通知）
// 直接起動（互換）:
//   node src/commands/gen.mjs [files...] [--check]
//
// 規約記法の仕様は docs/format.md を参照。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, basename, dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mdToHtml } from '../render.mjs';
import { findAdrDir } from '../paths.mjs';
import { assetsStatus, provisionAssets } from '../assets.mjs';

const ADR_DIR = findAdrDir();

export const help = `ema gen — Markdown 正本 → HTML 生成（外部依存ゼロ）

使い方:
  ema gen [files...] [--check]

引数:
  files            生成対象の .md（省略時は docs/decisions/*.md すべて）

オプション:
  --check          生成せず正本・assets との不整合だけ検出（CI 用、不整合があれば終了コード 1）
  -h, --help       このヘルプ

備考:
  生成時、HTML が参照する assets が欠落・ドリフトしていれば供給し直す（無スタイル HTML の防止）。
  --check では assets の欠落・ドリフトも不整合として報告する。`;

// 終了コードを返す（0=成功 / 1=--check で不整合 / 2=引数エラー）。
export async function run(argv = []) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(help); return 0; }
  const check = argv.includes('--check');
  const files = argv.filter((a) => !a.startsWith('-'));

  const list = files.length
    ? files.map((f) => resolve(f))
    : (await readdir(ADR_DIR)).filter((e) => e.endsWith('.md')).map((e) => join(ADR_DIR, e));

  let changed = 0, wrote = 0;
  for (const src of list) {
    const md = await readFile(src, 'utf8');
    const html = mdToHtml(md);
    const dest = join(dirname(src), basename(src).replace(/\.md$/, '.html'));
    const prev = existsSync(dest) ? await readFile(dest, 'utf8') : null;
    if (prev !== html) {
      changed++;
      if (check) {
        console.log(`  [stale] ${basename(dest)}`);
      } else {
        await writeFile(dest, html);
        wrote++;
        console.log(`  generated ${basename(dest)}`);
      }
    }
  }

  // HTML が参照する assets の整合（無スタイル HTML / ドリフトの防止）。
  // 出力先ディレクトリごとに 1 度だけ判定する。
  const dirs = [...new Set(list.map((f) => dirname(resolve(f))))];
  let assetIssues = 0, provisioned = 0;
  for (const dir of dirs) {
    const status = await assetsStatus(dir);
    if (status === 'ok' || status === 'self') continue;
    if (check) {
      assetIssues++;
      console.log(`  [assets ${status}] ${join(dir, 'assets')}`);
    } else {
      await provisionAssets(dir);
      provisioned++;
      console.log(`  assets ${status === 'missing' ? '供給' : '更新'}: ${join(dir, 'assets')}`);
    }
  }

  if (check) {
    const total = changed + assetIssues;
    if (total) {
      const parts = [];
      if (changed) parts.push(`HTML ${changed} 件が正本と不整合`);
      if (assetIssues) parts.push(`assets ${assetIssues} 件が欠落/ドリフト`);
      console.error(`\n${parts.join('・')}です。\`ema gen\` を実行してください。`);
      return 1;
    }
    console.log('  すべての HTML・assets が正本と一致しています。');
    return 0;
  }
  console.log(`\n  ${wrote} 件生成（${list.length} 件中、差分なしはスキップ）${provisioned ? ` · assets ${provisioned} ディレクトリ供給` : ''}。`);
  return 0;
}

// 直接起動された場合のみ実行（ema 経由では import されるだけ）。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = (await run(process.argv.slice(2))) ?? 0;
}

#!/usr/bin/env node
// where — 次に ADR がどこへ何番で作られるかを「書く前に」見せる（CLI 層・読み取り専用）
//
// ema new の書き込み先は cwd/祖先の docs/decisions/ 解決に依存する。これを事前に可視化すれば、
// フォールバックによる誤配置（ツールリポへの混入）を書く前に検知できる（自己記述性・ユーザエラー防止性）。
// 何も書き込まない。外部依存ゼロ。
//
// 統一 CLI（推奨）:
//   ema where
// 直接起動（互換）:
//   node src/commands/where.mjs

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveAdrDir, describeReason } from '../paths.mjs';
import { assetsStatus } from '../assets.mjs';
import { nextNumber } from './new.mjs';

export const help = `ema where — 次の ADR の作成先・番号を事前表示（書き込みなし・外部依存ゼロ）

使い方:
  ema where

オプション:
  -h, --help       このヘルプ`;

// 終了コードを返す（0=通常 / 1=フォールバック警告状態）。
export async function run(argv = []) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(help); return 0; }

  const { dir, reason } = resolveAdrDir();
  const fellBack = reason === 'fell-back-to-tool-repo';
  const num = existsSync(dir) ? await nextNumber(dir) : '0000';
  const assets = await assetsStatus(dir);

  console.log(`  対象ディレクトリ: ${dir}`);
  console.log(`  解決理由        : ${describeReason(reason)}`);
  console.log(`  次番号          : ${num}`);
  console.log(`  assets          : ${assets}`);

  if (fellBack) {
    console.log('');
    console.log('  ⚠ docs/decisions/ が見つからず、ツール自身のリポジトリにフォールバックしています。');
    console.log('    ここで始めるなら:  ema init');
    return 1;
  }
  if (assets === 'missing' || assets === 'drift') {
    console.log('');
    console.log(`  ⚠ assets が ${assets} です。ema init か ema gen で供給できます。`);
  }
  return 0;
}

// 直接起動された場合のみ実行（ema 経由では import されるだけ）。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = (await run(process.argv.slice(2))) ?? 0;
}

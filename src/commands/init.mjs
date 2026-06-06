#!/usr/bin/env node
// init — 新規リポジトリに ADR ワークフローを一発で用意する（CLI 層）
//
// 既存リポへの導入が手作業（mkdir docs/decisions + assets の手コピー）に依存していると、
// 初見ユーザは最初の数分で躓き、`ema new` のサイレントなフォールバック誤配置も誘発する。
// init は cwd に docs/decisions/ と assets/ を用意し、0000 テンプレ/ガイドを種まきして
// 「0000=テンプレ、実決定は 0001 から」の規約を固定する。
// 冪等（何度実行しても同じ結果）に設計する（設置性: ISO/IEC 25010:2023）。外部依存ゼロ。
//
// 統一 CLI（推奨）:
//   ema init                 # cwd に docs/decisions/ ＋ assets ＋ 0000 ガイドを用意
//   ema init --no-template   # 0000 ガイドの種まきを省略
// 直接起動（互換）:
//   node src/commands/init.mjs [--no-template]

import { mkdir, readdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_REPO_ROOT, DECISIONS_REL } from '../paths.mjs';
import { provisionAssets } from '../assets.mjs';

export const help = `ema init — 新規リポに ADR ワークフローを用意（冪等・外部依存ゼロ）

使い方:
  ema init [--no-template]

オプション:
  --no-template    0000 テンプレ/ガイドの種まきを省略する
  -h, --help       このヘルプ

行うこと（既にあるものはスキップ＝冪等）:
  - cwd に docs/decisions/ を作成
  - docs/decisions/assets/ に HTML 用の静的資産を供給
  - ADR がまだ無ければ 0000 テンプレ/ガイドを種まき（実決定は 0001 から）`;

const TOOL_DECISIONS = join(TOOL_REPO_ROOT, DECISIONS_REL);

// dir に NNNN-*.md（実 ADR）が既にあるか。
async function hasAdr(dir) {
  if (!existsSync(dir)) return false;
  return (await readdir(dir)).some((e) => /^\d{4}-.*\.md$/.test(e));
}

// ツールリポの 0000-*.{md,html} を target へ複製する。
async function seedTemplate(target) {
  const seeds = (await readdir(TOOL_DECISIONS)).filter((e) => /^0000-.*\.(md|html)$/.test(e));
  for (const name of seeds) {
    await cp(join(TOOL_DECISIONS, name), join(target, name));
  }
  return seeds;
}

// 終了コードを返す（0=成功 / 2=引数エラー）。
export async function run(argv = []) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(help); return 0; }
  const withTemplate = !argv.includes('--no-template');

  const target = join(process.cwd(), DECISIONS_REL);

  // ツール自身のリポジトリで叩いた場合は何もしない（自分の上に自分を配り直さない）。
  if (join(TOOL_REPO_ROOT, DECISIONS_REL) === target) {
    console.log('  ここは ema ツール自身のリポジトリです。init は不要です。');
    return 0;
  }

  const existed = existsSync(target);
  await mkdir(target, { recursive: true });
  console.log(`  ${existed ? '既存' : '作成'}: ${target}`);

  const provisioned = await provisionAssets(target);
  console.log(`  assets: ${provisioned === 'provisioned' ? '供給しました' : 'スキップ'}（${join(target, 'assets')}）`);

  if (withTemplate) {
    if (await hasAdr(target)) {
      console.log('  0000 種まき: スキップ（既に ADR があります）');
    } else {
      const seeds = await seedTemplate(target);
      console.log(`  0000 種まき: ${seeds.map((s) => basename(s)).join(', ') || 'なし'}`);
    }
  }

  console.log('');
  console.log('  次の一手: ema new "<最初の決定>" <slug>  →  ema lint  →  ema view');
  return 0;
}

// 直接起動された場合のみ実行（ema 経由では import されるだけ）。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = (await run(process.argv.slice(2))) ?? 0;
}

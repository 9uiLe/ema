#!/usr/bin/env node
// new — 次番号の ADR 正本（.md）をテンプレから生成する（CLI 層）
//
// 流暢性の罠を断つには「固定スロット＋反証スロット」が毎回そろっている必要がある。
// 手コピーは採番ミス・スロット欠落（ユーザエラー）の温床なので、採番と
// テンプレ展開を自動化する（運用操作性=最少ステップ／ユーザエラー防止性）。
// 既存ファイルがあれば上書きせず中止する（Norman 2013 の強制機能）。外部依存ゼロ。
//
// 統一 CLI（推奨）:
//   ema new "<タイトル>" [slug]
//   ema new "キャッシュ層の導入" cache-layer   → adr/0004-cache-layer.md
// 直接起動（互換）:
//   node src/commands/new.mjs "<タイトル>" [slug]
//
// テンプレが満たすスロットは src/commands/lint.mjs の SLOTS と一致させてある。

import { readdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slugify } from '../render.mjs';
import { findAdrDir } from '../paths.mjs';

const ADR_DIR = findAdrDir();

export const help = `ema new — 次番号の ADR 正本をテンプレから生成（外部依存ゼロ）

使い方:
  ema new "<タイトル>" [slug]

引数:
  タイトル          ADR のタイトル（必須・クォートで囲む）
  slug             ファイル名の英小文字スラッグ（省略可。日本語タイトルからは
                   推定できないため、省略時は adr-NNNN を使う旨を通知する）

オプション:
  -h, --help       このヘルプ

生成物:
  adr/NNNN-<slug>.md（status: proposed・固定スロット＋反証スロット入り）
  既存の同名ファイルがあれば上書きせず中止する。`;

// 今日の日付（YYYY-MM-DD）。CLI は実行時刻に依存してよい。
function today() {
  return new Date().toISOString().slice(0, 10);
}

// adr/*.md の先頭番号の最大 +1 を 4 桁ゼロ詰めで返す。
async function nextNumber() {
  const nums = (await readdir(ADR_DIR))
    .map((e) => /^(\d+)-.*\.md$/.exec(e))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : -1) + 1;
  return String(next).padStart(4, '0');
}

function scaffold({ num, title, date }) {
  const safeTitle = title.replace(/"/g, '\\"');
  return `---
adr: ${num}
title: "${safeTitle}"
status: proposed
date: ${date}
deciders: "@9uiLe"
tags: [Process]
maintainer: "@9uiLe"
lead: |
  この ADR が **何を決めるのか** を1〜2文で。読み手が結論の射程を誤解しないよう、
  対象範囲と「決めないこと」を先に言い切る。
---

## Context {#context}

なぜ今この決定が必要か。**出発点**（どの問題・どの痛み）を、観測された事実として書く。
背景を共有しないと、後から読む人は決定の前提を復元できない。

## Decision Drivers {#drivers}

- この決定を左右する制約・力学（性能 / 供給網 / 保守コスト など）。
- 譲れない要件と、トレードオフして良い要件を分ける。

## Considered Options {#options}

| 判断軸 | A 案 | B 案 [*] | C 案 |
|---|---|---|---|
| 軸1 | mid | yes | no |
| 軸2 | no | yes | mid |
| 説明 | … | … | … |

各案を1段落ずつ。**却下した案こそ理由を残す**（後から蒸し返さないため）。

## Decision {#decision}

> [!SUCCESS] 採用：B 案
> 何を採用したか。**決め手**を1文で言い切り、上の比較表のどの軸が支配的だったかを示す。

## Consequences {#consequences}

- **Positive:** 得られるもの。
- **Negative:** 引き受けるコスト・制約。
- **Neutral:** 変わらないこと・別の場所に移った論点。

## 反証：この決定が間違いになるとしたら {#falsification}

> [!WARNING] この決定が間違いになるとしたら、何が原因か
> **観測可能なトリガー**で書く（「気をつける」ではなく、何を見たら見直すか）。
> - トリガー1（例：◯◯が月◯回を超えたら）
> - トリガー2

## References {#references}

- 参照した一次情報・規格・先行 ADR をここに集約する。
`;
}

// 終了コードを返す（0=生成 / 1=既存衝突・タイトル無し / 2=引数エラー）。
export async function run(argv = []) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(help); return 0; }
  const positional = argv.filter((a) => !a.startsWith('-'));
  const title = positional[0];
  if (!title) {
    console.error('タイトルが必要です。  ema new "<タイトル>" [slug]');
    return 1;
  }

  const num = await nextNumber();
  let slug = positional[1];
  if (!slug) {
    const fromTitle = slugify(title);
    if (fromTitle && fromTitle !== 'section') {
      slug = fromTitle;
    } else {
      slug = `adr-${num}`;
      console.warn(`  [note] タイトルから英語スラッグを推定できないため "${slug}" を使います。`);
      console.warn(`         英語ファイル名にしたい場合: ema new "${title}" <slug>`);
    }
  }

  const dest = join(ADR_DIR, `${num}-${slug}.md`);
  if (existsSync(dest)) {
    console.error(`  既に存在します（上書きしません）: ${basename(dest)}`);
    return 1;
  }

  await writeFile(dest, scaffold({ num, title, date: today() }));
  console.log(`  作成: ${dest}（status: proposed・固定スロット＋反証スロット入り）`);
  console.log(`  次の一手: ema lint "${dest}"  →  ema view`);
  return 0;
}

// 直接起動された場合のみ実行（ema 経由では import されるだけ）。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = (await run(process.argv.slice(2))) ?? 0;
}

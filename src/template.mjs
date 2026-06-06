// template — ADR 正本テンプレの単一表現（scaffold ＋ プレースホルダ語彙）
//
// new（生成）と lint（残存検出）が同じテンプレ知識を別々に持つと、雛形を直したとき
// 片方だけ追従して食い違う。テンプレ本文とプレースホルダ語彙をここに一元化し、
// new と lint が共有する（DRY: 知識の単一表現化 / REP: Martin 2017）。
// 既存の lint と gen が src/render.mjs を共有しているのと同じ思想。外部依存ゼロ。

// ADR 正本（.md）の雛形を返す。new が採番・タイトル・日付を渡す。
export function scaffold({ num, title, date }) {
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

// 雛形のまま残ると「半端 ADR」になる目印（テンプレ由来の固有文字列）。
// level: error は反証スロットの空欄（このツールの核なので落とす）、warn は他スロットの空欄。
// 短く一般的な語は誤検出を生むため、テンプレに固有な文字列だけを選ぶ。
export const PLACEHOLDERS = [
  // 反証スロットの未充足（観測可能なトリガーが書かれていない）→ error
  { marker: 'トリガー1', level: 'error', slot: '反証トリガー' },
  { marker: 'トリガー2', level: 'error', slot: '反証トリガー' },
  { marker: '◯◯', level: 'error', slot: '反証トリガー' },
  // 他スロットの未充足 → warn
  { marker: 'この ADR が **何を決めるのか**', level: 'warn', slot: 'lead' },
  { marker: 'なぜ今この決定が必要か', level: 'warn', slot: 'Context' },
  { marker: 'この決定を左右する制約・力学', level: 'warn', slot: 'Decision Drivers' },
  { marker: '軸1', level: 'warn', slot: 'Considered Options' },
  { marker: '各案を1段落ずつ', level: 'warn', slot: 'Considered Options' },
  { marker: '何を採用したか。**決め手**', level: 'warn', slot: 'Decision' },
  { marker: '引き受けるコスト・制約', level: 'warn', slot: 'Consequences' },
  { marker: '参照した一次情報・規格・先行 ADR をここに集約する', level: 'warn', slot: 'References' },
];

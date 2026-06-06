---
adr: 0005
title: "ディレクトリ・命名のモダン化：bin/ + src/ + docs/decisions/、コマンドは ema"
status: accepted
date: 2026-06-06
deciders: "@9uiLe（2026-06-06 承認）"
maintainer: "@9uiLe"
revises: "[ADR-0002](0002-adr-source-format.html) の正本パス `adr/NNNN-slug.md` と [ADR-0004](0004-cli-and-distribution.html) の `tools/` 配置・コマンド `adr` を、名前のみ更新（実体決定は不変）。"
tags: [Process, Tooling, CLI, Naming, Architecture]
lead: |
  ツールとしての**命名とレイアウトをモダンな慣例に揃える**。これは設計判断の変更ではなく、命名の更新である — [ADR-0003](0003-adr-tooling-stack.html)／[ADR-0004](0004-cli-and-distribution.html) が決めた実体（ゼロ依存・`node:test`・薄いディスパッチャ＋サブコマンド・`package.json(bin)`・cwd 上り探索）はそのまま引き継ぐ。変えるのは置き場所と名前だけ：実行を `bin/`、ロジックを `src/`、テストを `test/`、ADR を `docs/decisions/`（MADR 慣例）へ。冗長な `adr-` 接頭辞を外し、CLI コマンドを `ema` にブランド統一する。
---

## Context {#context}

ツール群は機能的には完成しているが、ファイル/ディレクトリ命名が **CLI ツールとしての現代的な慣例から外れていた**：

- 実行エントリ・ロジック・テストが `tools/` に混在し、`bin/` と `src/` の分離がない。
- ファイル名に冗長な `adr-` 接頭辞（`adr-gen.mjs` 等）。ディレクトリで文脈が決まるのに重複。
- ADR の置き場所が `adr/` 直下。公開リポジトリの慣例（ドキュメントは `docs/` 配下、ADR は MADR の `docs/decisions/`）と異なる。
- CLI コマンドが `adr`、パッケージ名が `ema-adr` で、ブランドが割れていた。

[ADR-0004](0004-cli-and-distribution.html) で利用形態が**公開リポジトリ＋複数 PC＋将来チーム**へ移った以上、初見の開発者が構成を即座に把握できること（相互作用性の自己記述性・習得性、ISO/IEC 25010:2023）が効いてくる。これは**命名の問題**であり、ADR-0003/0004 の実体決定とは独立に解ける。

> [!NOTE] これは「決定の変更」ではなく「命名の更新」
> ゼロ依存・`node:test`・薄いディスパッチャ＋サブコマンド・`package.json(bin)` での設置性・cwd 上り探索 — 実体は ADR-0003/0004 のまま不変。本 ADR が変えるのは **置き場所と名前だけ**。よって 0002/0004 を supersede せず `revises`（名前のみ改訂）とする。

## Decision Drivers {#drivers}

- **自己記述性・習得性** — 初見で「実行はどこ／ロジックはどこ／ADR はどこ」が分かるレイアウトか。
- **エコシステム慣例への適合** — Node CLI（`bin/`+`src/`）・ADR（MADR の `docs/decisions/`）の標準に沿うか。
- **冗長性の排除** — ディレクトリで文脈が決まる場所での `adr-` 接頭辞の重複を消す。
- **ブランド一貫性** — コマンド名・パッケージ名・リポジトリ名が揃うか。
- **実体決定の保全** — ADR-0003/0004 のコード資産（seam＋テスト）・規律を壊さずに移せるか。

## Considered Options {#options}

### Option A — bin/ + src/(commands) + docs/decisions/（採用） {#option-a}

実行を `bin/ema.mjs`、ロジックを `src/`（サブコマンドは `src/commands/`）、テストを `test/`、ADR を `docs/decisions/`（デザインシステムは `assets/`）へ。`adr-` 接頭辞を除去。コマンド／パッケージを `ema` に統一。

- **長所**: Node CLI と MADR の両慣例に最も忠実。役割ごとにトップ階層が分かれ自己記述的。冗長な接頭辞が消える。
- **短所**: 移動量が最大。ADR 0000–0004 本文の旧パス表記が歴史的記録として残る（マッピングで吸収）。

### Option B — bin/ + src/(フラット) + docs/adr/ {#option-b}

`src/` をフラットにし、ADR は `docs/adr/`（`system/` 据置）。

- **長所**: 慣例に沿いつつ移動量は中。
- **短所**: 多コマンド CLI では `commands/` の階層がある方が見通しが良い。`docs/adr` より `docs/decisions` の方が MADR 標準。

### Option C — 軽量（接頭辞除去＋bin のみ） {#option-c}

`tools/`→`src/`・接頭辞除去・`bin/` 追加に留め、ADR は `adr/` 据置。

- **長所**: 破壊が最小。
- **短所**: ADR の置き場所が慣例から外れたまま。ブランド統一もしない＝目的（モダン化）の達成が中途半端。

| 判断軸 | A bin+src+docs/decisions [*] | B bin+src+docs/adr | C 軽量 |
|---|---|---|---|
| Node CLI 慣例（bin/src/commands） | yes | mid | mid |
| ADR 慣例（MADR docs/decisions） | yes | mid | no |
| 自己記述性（役割で階層分離） | yes | mid | no |
| 冗長 `adr-` 接頭辞の排除 | yes | yes | yes |
| 破壊・移動量の小ささ | no | mid | yes |

## Decision {#decision}

> [!SUCCESS] 採用：Option A — bin/ + src/(commands) + docs/decisions/、コマンドは ema
> レイアウトを次へ移す（旧→新）：
> - `tools/adr.mjs` → `bin/ema.mjs`（実行エントリ）
> - `tools/adr-{new,gen,lint,view}.mjs` → `src/commands/{new,gen,lint,view}.mjs`
> - `tools/lib/adr-render.mjs` → `src/render.mjs` ／ `tools/lib/adr-paths.mjs` → `src/paths.mjs`
> - `tools/adr-*.test.mjs` → `test/{render,paths}.test.mjs`
> - `tools/adr-format.md` → `docs/format.md`
> - `adr/NNNN-*.md|html` → `docs/decisions/NNNN-*.md|html`
> - `adr/system/` → `docs/decisions/assets/`
> - CLI コマンド `adr` → **`ema`**／パッケージ名 `ema-adr` → **`ema`**（`bin: { ema }`）
>
> 探索マーカーは `adr/` から `docs/decisions/` に更新（`src/paths.mjs`）。生成 HTML のデザインシステム参照は `assets/` に更新（`src/render.mjs`）。ADR-0003/0004 の実体決定は不変なので、それらは supersede せず `revises`。2026-06-06 承認。実装済：全ファイル移動・import 修正・`node --test` 19/19・`ema lint` ERROR 0・`ema gen --check` 一致・viewer（index/ADR/assets すべて 200）・`npm link` で `ema` が PATH 解決を確認。

## Consequences {#consequences}

### Positive {#consequences-positive}

- 初見の開発者が「`bin/`=実行・`src/`=ロジック・`test/`=テスト・`docs/decisions/`=ADR」と即座に把握できる（自己記述性）。
- Node CLI・MADR の両慣例に沿い、公開リポジトリとして読みやすい。
- 冗長な `adr-` 接頭辞が消え、コマンド／パッケージ／リポジトリ名が `ema` に揃った。

### Negative {#consequences-negative}

- ADR 0000–0004 の本文に残る旧パス（`tools/…`）・旧コマンド（`adr …`）は、決定当時の記録として残る。現行対応は本 ADR の旧→新マッピングが正（README にも明記）。
- `npm link` 済みの各 PC は、旧 `adr` を `npm rm -g` し、新 `ema` を貼り直す必要がある。

### Neutral {#consequences-neutral}

- ADR-0002（正本＝制約付き Markdown／HTML は生成）・0003/0004 の**実体決定は不変**。変換ロジックと出力 HTML の中身も不変（参照パスのみ `assets/`）。
- `node src/commands/<cmd>.mjs` の直接起動は後方互換で維持。

## この決定が間違いになるとしたら、何が原因か {#falsification}

> [!WARNING] 前提が崩れたら再検討するトリガー
> 本決定は「慣例に揃えるほど初見の理解が上がる」「`ema` ブランドが定着する」を前提に置く。次が観測されたら見直す：

- **`docs/decisions/` の深さが運用の負担になる場合** — 毎回のパス入力が長すぎて嫌われるなら、ルートに薄いエイリアス（`decisions/` シンボリックリンク等）を足す。*観測指標*: 「パスが長い」不満・タイプミスの頻度。
- **`ema` という名前が衝突・誤解を生む場合** — 他ツール（コマンド `ema`）と PATH で衝突する、または意味が伝わらないとの声が出たら、名前空間化（`@ema/adr`）やコマンド名の再考を行う。*観測指標*: PATH 衝突報告・「何のツールか分からない」反応。
- **`adr-` 接頭辞除去でファイル名が曖昧になる場合** — `gen.mjs`/`new.mjs` 等が他文脈で紛らわしくなったら、ディレクトリ境界の明示やドキュメント補強で対処する。*観測指標*: import 先の取り違えコミット。

## References {#references}

- [ADR-0004](0004-cli-and-distribution.html) — 配布と CLI（本 ADR が命名のみ改訂する直接の上流。実体は不変）。
- [ADR-0003](0003-adr-tooling-stack.html) — 技術スタック（ゼロ依存＋node:test、引き続き有効）。
- [ADR-0002](0002-adr-source-format.html) — 正本＝制約付き Markdown（正本パスのみ本 ADR で更新）。
- `docs/format.md` — 制約付き Markdown の記法仕様（パス更新済み）。
- ISO/IEC 25010:2023 — 相互作用性（自己記述性・習得性）。
- MADR（Markdown Any Decision Records）— ADR を `docs/decisions/` に置く慣例（adr.github.io が推奨する既定ロケーション）。
- Parnas (1972) 情報隠蔽 ／ Martin (2017) 単一責任（`bin/`=入口・`src/commands/`=責務分離の裏付け）。

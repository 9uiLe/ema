---
adr: 0004
title: "ADR ツール群の配布と CLI：公開・チーム前提でも Node を継続し、設置性は package.json で埋める"
status: accepted
date: 2026-06-06
deciders: "@9uiLe（2026-06-06 承認）"
maintainer: "@9uiLe"
tags: [Process, Tooling, CLI, Distribution, Architecture, Quality]
supersedes: "[ADR-0003](0003-adr-tooling-stack.html) — 前提「利用形態は個人・ローカルのみ」を更新。ゼロ依存＋node:test の核は本 ADR が引き継ぐ。"
lead: |
  [ADR-0003](0003-adr-tooling-stack.html) は「利用形態は個人・ローカルのみ」を前提に **ゼロ依存＋node:test** を決めた。その前提が更新された — **GitHub 公開リポジトリを clone してセットアップ／複数 PC 間／将来チーム展開／対象は開発者** になる。これは ADR-0003 自身が書いた撤回トリガー「チーム・公開へ変わる場合」の発火点。だが結論は **言語スタックの変更ではなく Node の継続** になる：要件の核は *配布アーティファクト*（単一バイナリ・npm 公開パッケージ）ではなく **設置性（Installability）** であり、それは `package.json`（依存ゼロのまま）＋`npm link` で埋まる。Rust は過剰、TypeScript は時期尚早。あわせて 3 本に分散していた CLI を単一の `adr` コマンドへ統合し、新規 ADR の雛形生成 `adr new` を足す。
---

## Context {#context}

[ADR-0003](0003-adr-tooling-stack.html) は **利用形態＝個人・ローカルのみ** という前提のもとで、ADR ツール群の技術スタックを「Node 標準のみ・ゼロ依存・`node:test` で試験性確保」と決めた。本 ADR の出発点は、その **前提の更新** である。利用形態を次のように確認し直した：

| 前提（ADR-0003） | 更新後（本 ADR） |
|---|---|
| 個人・ローカルのみ | GitHub 公開リポジトリを clone して使う |
| 1 台で `node tools/...` | 複数 PC 間で使う・将来チームへ展開しうる |
| 配布なし | 配布はするが **セットアップ手順は許容**（単一バイナリ不要） |
| — | 対象ユーザは **開発者**（Node を持っている／持てる） |

これは ADR-0003 の反証スロットに明記したトリガーそのものである：

> **利用形態がチーム・公開へ変わる場合** — 複数人・OS バラつき・HTML を外部公開へ移ると、移植性・供給網・ビルド再現性の重みが上がり…正解に転じうる。（ADR-0003 §falsification）

トリガーが引かれたので、**スタックを引き直すのが規律**である。「分からないまま前提を据え置く」のではなく、明示的に再評価する。

### 「公開アーティファクトとして弱い」の正体は設置性 {#diagnosis}

quality-architecture（ISO/IEC 25010:2023）で再評価すると、重点特性が **保守性中心** から **設置性（Installability, 柔軟性の副特性）＋相互作用性（CLI の使用性）** へ移る。ここで重要な切り分け：ユーザーが欲しいのは *配布アーティファクト*（`brew install` できる単一バイナリ、`npm i -g` できる公開パッケージ）ではなく、**clone してセットアップする開発者向けツール** である。

> [!NOTE] 速度・単一バイナリは「要らない部分」
> このツールは Markdown→HTML 生成＋ローカル閲覧で I/O 律速・人間スケール（ADR 数十本）。性能効率性は重点特性に入らない。ゆえに Rust の主価値（ランタイム不要の単一バイナリ・実行速度）は、今回 **要求に無い**。設置性に効くのは言語ではなく、宣言的なセットアップ機構である。

## Decision Drivers {#drivers}

- **設置性（再現性・クロスプラットフォーム）** — 複数 PC・将来チームで、同じ手順でセットアップでき、OS 差（macOS / Linux / Windows）を吸収できるか。
- **既存資産の保全** — 純粋関数 seam（`tools/lib/adr-render.mjs`）＋`node:test` 16 件という、ADR-0003 で築いた試験性を捨てないか。
- **供給網安全** — 実行時の外部依存（攻撃面）を増やさないか。
- **相互作用性（CLI の使用性）** — 自己記述性（`--help`・一覧）・習得性（1 コマンド）・ユーザエラー防止性（採番ミス・スロット欠落を構造的に封じる）。
- **移行コスト** — 採用に伴う書き直し量。

> [!TIP] 「公開＝言語を変える」ではない
> 公開・チーム展開が必要にする品質は **設置性** で、設置性の正攻法は宣言的依存管理（`package.json`／Twelve-Factor II）。`package.json` は **依存ではなくマニフェスト** なので、`dependencies: {}` のままゼロ依存を保って設置性を足せる。言語スタックの変更は別の問題であり、ここでは要求されていない。

## Considered Options {#options}

### Option A — Node 継続 ＋ package.json(bin) ＋ 統一 CLI（推奨） {#option-a}

Node 標準のみ（ゼロ実行時依存）を維持したまま、`package.json`（`dependencies: {}`・`bin: {adr}`・`scripts`・`engines.node>=20`・`private`）を足す。3 本に分散していた CLI を薄いディスパッチャ `tools/adr.mjs` に統合し、各サブコマンドは `tools/adr-<cmd>.mjs` の `run(argv)` に委譲する。新規 ADR の雛形生成 `adr new` を追加。セットアップは各 PC で一度 `npm link`（PATH に `adr` を生やす。Windows は npm が `.cmd` shim を自動生成）。npm を使わない場合も `node tools/adr.mjs <cmd>` で動く。

- **長所**: 設置性を宣言的に獲得（Twelve-Factor II）。既存資産（seam＋test16件）を**全て保全**。実行時依存ゼロを維持（攻撃面不変）。`bin` の `adr` はグローバル bin に置かれるため、**正本ディレクトリ `adr/` との名前衝突を解消**。`adr new/gen/lint/view/--help` で相互作用性が向上。
- **短所**: `package.json` というマニフェストが増える。グローバル `adr` を repo 外から実行すると `adr/` を cwd 相対で探すため、当面は repo 直下で実行する運用が要る。

### Option B — TypeScript へ移行し npm パッケージとして公開 {#option-b}

`.mjs` を `.ts` に移し、型チェックとビルド（tsc/esbuild）を入れ、npm レジストリ公開も視野に入れる。

- **長所**: 型がチーム貢献者の破壊（特にパーサ）を防ぐ。npm エコシステムと相性が良い。
- **短所**: **ビルド鎖＋開発依存**を新たに抱える（それ自体が供給網面・install 摩擦）。コードは小さく既にテスト済みで、型の便益が今はコストに見合わない。`.mjs→.ts` は後から **漸進導入できる** ため、今やる必要がない。

### Option C — Rust（または Go）で単一バイナリに書き直し {#option-c}

コア（Markdown→HTML・lint・viewer）を Rust で書き直し、GitHub Releases で OS 別バイナリを配布する。

- **長所**: ランタイム不要の単一バイナリで、エンドユーザの設置性が最大。実行速度も最速。
- **短所**: その主価値（バイナリ・速度）は今回 **要求に無い**（開発者向け・セットアップ許容・速度は非重点）。対価は **全面書き直し**で、ADR-0003 の試験済み seam を捨てる。文書ツールの貢献者母数も小さい。要求にない品質のための作り込み＝**過剰設計**。

| 判断軸 | A Node＋package.json [*] | B TypeScript＋npm | C Rust 単一バイナリ |
|---|---|---|---|
| 設置性（公開・複数PC・チーム） | yes | yes | yes |
| その設置性を必要とする audience か | yes | yes | no |
| 既存資産（seam＋test16件）の保全 | yes | mid | no |
| 実行時依存ゼロ（攻撃面） | yes | mid | mid |
| 移行コストの小ささ | yes | mid | no |
| クロスプラットフォーム設置の標準性 | yes | yes | mid |

## Decision {#decision}

> [!SUCCESS] 採用：Option A — Node 継続 ＋ package.json(bin) ＋ 統一 CLI
> ADR ツール群は **Node 標準モジュールのみ（実行時依存ゼロ）** を継続する。設置性は **`package.json`**（`dependencies: {}`・`bin: {adr: "tools/adr.mjs"}`・`scripts`・`engines.node>=20`・`private: true`）で宣言的に獲得し、各 PC のセットアップは `npm link`（冪等・クロスプラットフォーム）とする。npm 非依存のフォールバックとして `node tools/adr.mjs <cmd>` も維持する。
>
> CLI は単一の `adr` コマンドへ統合する：薄いディスパッチャ `tools/adr.mjs` が `new｜gen｜lint｜view｜help` を各 `tools/adr-<cmd>.mjs` の `run(argv)` に委譲し、各スクリプトは直接起動も後方互換で残す。新規 ADR の雛形生成 `adr new "<タイトル>" [slug]` を追加し、採番とテンプレ（固定スロット＋反証スロット）展開を自動化する。
>
> B（TypeScript）に対して A を採る決め手は、**型の便益が今はビルド鎖・開発依存の追加コストに見合わず、しかも後から漸進導入できる** こと。C（Rust）はバイナリ・速度という今回 **要求に無い** 価値のために全面書き直しを払う過剰設計。2026-06-06 承認。実装済：`tools/adr.mjs`・`adr-new.mjs` 追加、3 CLI を `run(argv)` 化（直接起動も互換維持）、`package.json` 追加。`node --test` 16/16・lint ERROR 0・`gen --check` 一致を確認済み。

## Consequences {#consequences}

### Positive {#consequences-positive}

- 公開リポジトリで `git clone && npm link` の一手で `adr` コマンドが各 PC・各 OS にそろう（設置性）。
- `adr --help`／サブコマンド一覧／`adr new` の採番・雛形自動化で、自己記述性・習得性・ユーザエラー防止性が上がる（相互作用性）。
- ADR-0003 の試験性資産（seam＋node:test16 件）を**そのまま保全**。実行時依存ゼロも不変。
- `adr` コマンドと `adr/` ディレクトリの名前衝突が、`bin` shim をグローバルに置くことで構造的に解消。

### Negative {#consequences-negative}

- `package.json` というマニフェストの維持が増える（ただし依存ゼロ）。
- セットアップに `npm link` を使う場合は Node＋npm が各 PC に必要（対象は開発者なので許容）。

> [!NOTE] 実装後記（2026-06-06、同日解消）
> 本 ADR が当初 Negative／未決として挙げた2点を、承認当日に解消した。
> - **repo 外実行**：`adr/` の解決を cwd 相対から **git 的な上り探索**へ変更（`tools/lib/adr-paths.mjs` の `findAdrDir`）。cwd から上に辿って `adr/` を持つ最も近い祖先を対象にし、見つからなければ `npm link` した clone 自身の `adr/` にフォールバックする。これによりリポジトリ内の任意のサブディレクトリ／repo 外のどちらからでも壊れない（回帰テスト `tools/adr-paths.test.mjs`）。
> - **LICENSE**：[MIT](../../LICENSE) を採用（`package.json` の `license: "MIT"`、ルートに `LICENSE`）。ゼロ依存・開発者向け・社内/チーム利用を妨げない最小摩擦の慣例ライセンス。

### Neutral {#consequences-neutral}

- ADR-0002（正本＝制約付き Markdown／HTML は生成）と、流し読み防止の運用（承認は描画に対して行う）は不変。
- 変換ロジック（`lib/adr-render.mjs`）と出力 HTML は不変。viewer・デザインシステム（`adr/system/`）は変更不要。
- `node tools/adr-<cmd>.mjs` の直接起動は後方互換で残る（CI・npm 非依存環境向け）。

## この決定が間違いになるとしたら、何が原因か {#falsification}

> [!WARNING] 前提が崩れたら再検討するトリガー
> 本決定は「対象は開発者でセットアップを許容」「実行は repo 直下」「型は今は不要」を前提に置く。次が観測されたら見直す：

- **非開発者・ノーセットアップ配布が要件になる場合** — Node を持たない層へ「ダウンロードして即実行」で配りたくなったら、ランタイム不要の単一バイナリ（Rust/Go, Option C）が正解に転じうる。*観測指標*: 「Node を入れずに使いたい」要望の発生。
- **チーム貢献でパーサ破壊が頻発する場合** — 複数人がコアに触れて型由来のリグレッションが続くなら、TypeScript 化（Option B、まず開発時のみの型チェック）を検討する。*観測指標*: 型で防げたはずの破壊コミットの頻度。
- **discovery が誤爆する場合** — 上り探索が、意図しない祖先の `adr/`（別リポジトリ等）を掴む運用が出たら、マーカーを `.git` 併用や明示フラグへ精緻化する。*観測指標*: 「別の repo の `adr/` に書かれた」報告（※ cwd 相対で壊れる初期の問題は上り探索＋fallback で解消済み）。
- **公開で外部貢献・配布が本格化する場合** — Issue/PR・バージョニング・LICENSE・CI が必要になったら、npm 公開や release 自動化を別途決める（本 ADR は「clone＋セットアップ」までを範囲とする）。

## Compliance & Monitoring {#compliance}

- **ゼロ実行時依存の維持**：`package.json` の `dependencies` は空に保つ。実行時依存の追加は打診の上、ADR-0003／本 ADR の撤回トリガーに照らして判断する。
- **承認前にテストを通す**：CLI・lib に変更を加えたら `npm test`（＝`node --test`）を緑にしてから承認する。
- **雛形とスロットの同期**：`adr new` のテンプレが満たすスロットは、`tools/adr-lint.mjs` の `SLOTS` と一致させ続ける（生成物が必ず lint を通る状態を保つ）。
- **後方互換の維持**：各 `tools/adr-<cmd>.mjs` は直接起動ガード（`process.argv[1] === fileURLToPath(import.meta.url)`）を保ち、`node tools/adr-<cmd>.mjs` でも動く状態を壊さない。
- **LICENSE**：[MIT](../../LICENSE) を採用済み（`package.json` の `license: "MIT"`）。実行時依存ゼロのため third-party ライセンスの追跡は不要。

## References {#references}

- [ADR-0003 · ADR ツール群の技術スタック](0003-adr-tooling-stack.html) — 本 ADR が supersede する直接の上流。ゼロ依存＋node:test の核はここから引き継ぐ。
- [ADR-0002 · ADR の正本形式](0002-adr-source-format.html) — 正本＝制約付き Markdown／HTML は生成、の決定（不変）。
- [ADR-0000 · テンプレートとレビュー観点](0000-adr-template-and-review-guide.html) — `adr new` の雛形と `adr lint` が機械強制する対象。
- `tools/adr-format.md` — 制約付き Markdown の記法仕様（テスト/ビルド手順を含む）。
- ISO/IEC 25010:2023 — 柔軟性（設置性 Installability）／相互作用性（運用操作性・自己記述性・習得性・ユーザエラー防止性）／保守性（試験性・モジュール性）の品質モデル。
- Wiggins (2012) Twelve-Factor App（Factor II 依存の宣言的管理・隔離 ＝ 設置性の基盤）。
- Parnas (1972) 情報隠蔽 ／ Martin (2017) 単一責任（ディスパッチャを薄く・サブコマンドへ責務分離）／ Fowler (2018) リファクタリング（挙動保存）／ Feathers (2004) テストの継ぎ目（seam の保全）。
- Norman (2013) 強制機能（`adr new` の上書き拒否・採番自動化でユーザエラーを構造的に封じる）／ Nielsen (1993) 習得性。

---
adr: 0001
title: "ローカル ADR ビューア：外部依存ゼロの Node 製ライブリロードサーバ（ブラウザ優先）"
status: accepted
date: 2026-06-06
deciders: "@9uiLe"
follow_up: "[ADR-0002 · ADR の正本形式](0002-adr-source-format.html)（本 ADR が前提とした「HTML 正本のまま」を再検討。viewer の決定は有効、形式の前提のみ移譲）"
tags: [Tooling, DX, Node, ZeroDependency, Documentation]
lead: |
  公開していない HTML 正本の ADR を、ローカルで快適に閲覧・編集するための表示ツールを定める。ターミナル描画ではなく **ブラウザ表示を正** とし、実装は **Node 標準モジュールのみ（npm 依存ゼロ）** の静的サーバ＋ Server-Sent Events ライブリロード＋一覧自動生成とする。保存形式は HTML 正本のまま変えない。
---

## Context {#context}

本リポジトリの ADR は **HTML を正本** として書かれている。これは「Markdown の散文はスラスラ読めてしまい、*処理流暢性*（読みやすさ）を *理解* と取り違えたまま承認し、後から『なんか違う』となる」問題への対処として、構造の明示・読む際の摩擦・知識への紐付けを与える HTML を選んだ経緯による（検討の全文は `adr-tooling-handoff.md`）。

一方 ADR は **Web サイトとして公開していない** ため、ローカルでしか参照できず読みづらい。「ターミナル上で HTML をレンダリングするツールを自作する」案から出発したが、整理の結果 **欲しいのは表示手段であって保存形式の変更ではない** と確定した。本 ADR はその **表示レイヤー** の設計判断を記録する。

設計の前提となる環境制約（実測）：

- 利用可能なランタイムは **`node` v25.2.1** と **`python3` 3.9.6** のみ。
- `bun` / `entr` / `fswatch` / `w3m` / `pandoc` / `glow` は **いずれも未インストール**。
- ADR HTML は `system/tokens.css` ・ `system/components.css` ・ `system/components.js` を **相対参照** し、ADR 間も相対リンクで繋がる。
- デザインシステムは **CSS だけで意味を表現** している箇所がある。例：比較表の採否マークは `<span class="cmp-mark cmp-mark--yes"></span>` という **中身が空の要素** で、チェック/バツは CSS 描画。プレーンテキスト抽出では **意味が完全に失われる**。

## Decision Drivers {#drivers}

- **設置性 / 可搬性（ISO/IEC 25010:2023 §可搬性）** — `git clone` 直後、追加インストールなしで動くこと。引き継ぎ資料が重視した「ポータビリティ・ゼロセットアップ」。
- **サプライチェーン安全性** — 依存パッケージを増やさない。npm 依存ゼロなら侵害面・監査コストがゼロ。
- **デザインシステムの意味の保全** — CSS だけで表現される比較表マーク・チャート・レイアウトを欠落させない。これは ADR 品質（流し読み防止）の本体に直結する。
- **編集→確認ループの速さ** — ADR を直しながら見るので、保存即反映（ライブリロード）が要る。
- **相対参照の解決** — `system/*` と ADR 間リンクが `file://` でなく HTTP 配信下で正しく解決すること。
- **一覧性** — ADR が増えても入口（index）から辿れること。

## Considered Options {#options}

### Option A — ターミナル描画（`w3m` / `pandoc + glow` / `bun` の ANSI 化） {#option-a}

HTML をターミナル上で ANSI レンダリングし、開発フロー中はブラウザに切り替えず参照する案。当初やりたかった方向。

- **長所**: 端末から離れずに読める。CI/SSH 越しでも見える。
- **短所**: このデザインシステムでは **意味が壊れる**。空要素＋ CSS で描く比較表マーク（`cmp-mark`）、donut/bar/line チャート、matrix、decision-tree、callout の色分けはいずれもテキスト抽出で消える。さらに必要なツール（`w3m`/`pandoc`/`glow`）が **未インストール＝導入が前提** になり、ドライバ「設置性」「サプライチェーン」に反する。

### Option B — 外部依存ゼロの Node 静的サーバ＋ SSE ライブリロード＋一覧自動生成（推奨） {#option-b}

Node 標準モジュール（`node:http` / `node:fs` / `node:child_process`）だけで小さなローカルサーバを書く。`adr/` を静的配信し、`/` で ADR 一覧を HTML から抽出して自動生成、`fs.watch` の変更を **Server-Sent Events** で配信して編集中ライブリロード、macOS では起動時に `open` でブラウザを開く。

```bash
# 追加インストール一切なし
node tools/adr-view.mjs                 # ./adr を :4173 で配信しブラウザを開く
node tools/adr-view.mjs adr --port 8080 # 配信元とポートを指定
node tools/adr-view.mjs --no-open       # CI / リモート（ブラウザを開かない）
```

ライブリロードは WebSocket ライブラリを使わず SSE で実装し、配信する HTML の `</body>` 直前に購読スクリプトを注入する：

```javascript
// サーバ: 変更検知を全クライアントへ配信
watch(ROOT, { recursive: true }, debounce(() => {
  for (const res of clients) res.write('data: reload\n\n');
}, 80));

// 注入される購読側（自動再接続つき）
new EventSource('/__livereload')
  .onmessage = (e) => { if (e.data === 'reload') location.reload(); };
```

- **長所**: 追加依存ゼロ（サプライチェーン面ゼロ）。HTTP 配信なので相対参照・ADR 間リンク・デザインシステムが **本来の見た目のまま** 解決する。SSE はブラウザ標準で外部ライブラリ不要。一覧自動生成で入口が要らない。`node` さえあれば OS を問わず動く。
- **短所**: 自前コードを保守対象として持つ（約 300 行）。ブラウザを開ける環境が前提。HTML パースは正規表現ベースで、frontmatter の書式が大きく変わると一覧抽出がずれうる。

### Option C — `python3 -m http.server` {#option-c}

標準で入っている Python の簡易サーバで `adr/` を配信するだけの最小案。

- **長所**: コードを一切書かない。相対参照は解決する。
- **短所**: **ライブリロードがない**（毎回手動リロード）。一覧の自動生成もない。ドライバ「編集→確認ループの速さ」「一覧性」を満たさない。

### Option D — 既成ツールを導入（`vite` / `browser-sync` / `serve` 等） {#option-d}

ライブリロード付き開発サーバを npm から入れて使う案。

- **長所**: ライブリロード・一覧・最適化が出来合いで揃う。実装保守が不要。
- **短所**: ADR を **見るためだけに** node_modules と推移的依存を抱える。ユーザーが明示した **サプライチェーンリスク** と「設置性」に正面から反する。単に HTML を配信して reload するだけの用途に対して明らかに過剰。

| 判断軸 | A ターミナル描画 | B Node ゼロ依存 [*] | C python http.server | D 既成ツール導入 |
|---|---|---|---|---|
| 設置性（追加インストール不要） | no | yes | yes | no |
| サプライチェーン安全性 | mid | yes | yes | no |
| デザインシステムの意味の保全 | no | yes | yes | yes |
| 編集中ライブリロード | mid | yes | no | yes |
| 一覧自動生成 | no | yes | no | mid |
| 保守コスト（自前コード量） | yes | mid | yes | yes |

## Decision {#decision}

> [!SUCCESS] 採用：Option B（外部依存ゼロの Node 静的サーバ）
> `tools/adr-view.mjs` を Node 標準モジュールのみで実装する。責務は 4 つ：(1) `adr/` の静的配信（相対参照・デザインシステムをそのまま解決）、(2) `/` での一覧自動生成（各 HTML の `<title>`・Status バッジ・日付を抽出）、(3) `fs.watch` ＋ SSE による編集中ライブリロード、(4) macOS でのブラウザ自動オープン。
>
> **ブラウザ表示を正** とし、ターミナル描画（Option A）は採らない。理由は単純で、この ADR 群の意味の一部は **CSS でしか描かれておらず**、テキスト抽出では比較表・チャート・レイアウトが落ちるため。**保存形式は HTML 正本のまま** 変えない（表示の問題を理由に保存形式を決めない、という引き継ぎ資料の原則に従う）。依存を増やさないことで、ユーザーが明示したサプライチェーンリスクと「設置性」を両立する。

## Consequences {#consequences}

### Positive {#consequences-positive}

- `node tools/adr-view.mjs` の 1 コマンドで、追加インストールなしに一覧→ ADR →ライブリロードが動く。
- npm 依存ゼロのため監査・更新・侵害対応のコストが発生しない。
- ADR が **本来の見た目**（比較表マーク・チャート・色分け callout）で読め、流し読み防止というデザイン意図が機能する。
- ツールは `adr/` の中身に無依存（純粋な静的配信＋抽出）なので、ADR 追加・改名に追従し、別プロジェクトの `docs/adr/` にもそのまま流用できる。

### Negative {#consequences-negative}

- 約 300 行の自前サーバを保守対象として持つ。
- 一覧抽出は正規表現ベース。frontmatter の HTML 構造（`<title>` や `status-*` バッジ）を大きく変えると追従改修が要る。
- ブラウザを開けない文脈（純 CLI / CI ログ）では恩恵が薄い（`--no-open` で配信のみは可能）。

### Neutral {#consequences-neutral}

- ライブリロードは WebSocket ではなく SSE。単方向通知で十分なため依存を増やさない選択。
- 既存 ADR HTML は外部 CDN（Google Fonts・Prism）を参照したまま。オフライン強化が必要になれば vendored 資産への移行は別途検討（後述）。
- ツールは `system/` や ADR 本文を一切書き換えない。読み取り専用。

## この決定が間違いになるとしたら、何が原因か {#falsification}

> [!WARNING] 前提が崩れたら再検討するトリガー
> 本決定は「人間がローカルのブラウザで ADR を読む」ことを暗黙の前提に置いている。次のいずれかが真になったら、この決定は最適でなくなる：

- **参照の主戦場がブラウザでなくなる場合** — ADR を CI ログや SSH 越しの端末で読むのが主になれば、ブラウザ優先は誤り。その時はターミナル描画、または **プレーンテキストでも意味が落ちない保存形式**（AsciiDoc 等）が必要になる。*観測指標*: 「端末から見たい」という要望が実際に複数回出るか。
- **読み手の主体が AI エージェントに移る場合** — ADR を AI が繰り返し読む比重が高いなら、効くのは表示ツールではなく **機械可読な保存形式**。表示レイヤーへの投資より保存形式の見直しが優先になる（→ [ADR-0002](0002-adr-source-format.html) でこの論点を決着）。
- **共有が主要要件になる場合** — チームで「URL を送って見せたい」が主目的になれば、ローカルサーバではなく **公開ホスティング**（静的サイト化）が正解。本ツールはあくまで個人のローカル開発フロー向け。
- **オフライン完全動作が必須になる場合** — 外部 CDN（フォント・Prism）に依存したままなので、オフラインで崩れる。必須要件化したら **アセットの vendored 同梱** への移行が要る。
- **表示要件が重くなる場合** — 全文検索・タグ絞り込み・グラフ描画など機能が増え続けるなら、自前 300 行では割に合わず、その時点で初めて Option D（既成ツール）の導入コストが正当化されうる。

## Compliance & Monitoring {#compliance}

- **依存ゼロの維持**: `tools/adr-view.mjs` は `node:*` 以外を import しないことをレビュー観点にする（`package.json` / `node_modules` を増やさない）。
- **読み取り専用の担保**: ツールが `adr/` 配下へ書き込まないこと（配信・監視・抽出のみ）。
- **トラバーサル防御**: 配信パスは配信ルート外へ出ないこと（解決後パスがルート配下である検証を保持）。
- **一覧抽出の追従**: ADR の frontmatter 構造（`<title>`・`status-*` バッジ）を変更したら、一覧が正しく出るか起動して確認する。

## 確定事項 {#resolved}

### ライブリロードの方式 {#resolved-reload}

**SSE（Server-Sent Events）** を採用。通知はサーバ→ブラウザの単方向で十分なため、WebSocket ライブラリを足す理由がない。ブラウザ標準の `EventSource` だけで実装でき、依存ゼロの原則と整合する。再接続は購読側で `onerror` から自動化する。

### 一覧の生成方法 {#resolved-index}

物理 `index.html` があればそれを優先し、なければ `adr/*.html` を走査して **動的生成** する。抽出は `<title>`（番号・タイトル）、最初の `status-*` バッジ（Status）、frontmatter の Date 欄（日付）。一覧はデザインシステム（`system/tokens.css` ・ `components.css`）を読み込み、本文 ADR と同じ見た目に揃える。

### 配置とインターフェース {#resolved-location}

ツールは `tools/adr-view.mjs` に置く（ADR の中身と分離）。既定の配信元は `./adr`（なければ `.`）、既定ポートは **4173**（使用中なら +1 して再試行）、`--no-open` / `--port` / `--host` を受ける。

## References {#references}

- `adr-tooling-handoff.md` — 本 ADR の出発点。HTML 正本維持・表示レイヤーで解く・流し読み防止という結論の全文。
- `tools/adr-view.mjs` — 本決定の実装。
- [ISO/IEC 25010:2023 — Systems and software engineering — SQuaRE — Product quality model](https://www.iso.org/standard/78176.html) — 「設置性 / 可搬性」「保守性」の根拠。
- [MDN Web Docs — Server-sent events / EventSource](https://developer.mozilla.org/docs/Web/API/Server-sent_events) — ライブリロードの単方向通知方式。
- tech-docs プラグイン `create-adr` スキル — 本 ADR が準拠した MADR + デザインシステム規約。

---
adr: 0006
title: "新規リポ導入体験の安全化: init とフォールバック誤配置の防止"
status: accepted
date: 2026-06-06
deciders: "@9uiLe"
tags: [Process]
maintainer: "@9uiLe"
lead: |
  新規リポで `ema new` がツール自身のリポジトリへ無通知でフォールバック書き込みする事故を断つため、
  フォールバックを既定エラー化（明示フラグでのみ許可）し、導入を `ema init` に集約する。
  ここで決めるのは「書き込み先解決の安全側既定」と「導入フローの所在」であり、
  HTML の配布形態（外部 assets か インライン同梱か）の最終確定は Open Question に残す。
---

## Context {#context}

ema は「ADR を流し読みさせない」ことを価値の中心に置く。にもかかわらず、初見ユーザが
最初の 5 分で踏む地雷が入口にある。`src/paths.mjs` の `findAdrDir()` は cwd から祖先へ
`docs/decisions/` を探索し、見つからなければ「このツール自身が属するリポジトリの
`docs/decisions/`」へ **無通知でフォールバック** する（コメント「2. 見つからなければ…
フォールバックする」のとおり）。

結果、`docs/decisions/` を持たない別リポで `ema new` を叩くと、ema 自身のメタ ADR
（0000–0005）に混じって 0006 が採番される誤配置が、エラーも警告もなく成立する。観測された痛み:

- 他リポの ADR が ema リポジトリに混入しうる（しかもサイレント＝流し読みでは気づけない）。
- 新規リポへの導入が手作業（`mkdir docs/decisions` ＋ `assets/` の手コピー）に依存している。
- `ema gen` は HTML を吐くが、`render.mjs` が参照する `assets/{tokens,components}.css` /
  `components.js` を供給も検証もしないため、assets を手で置くまで無スタイル HTML になる。
- `ema new --help` の生成物パスが `adr/NNNN-<slug>.md` と古く、実体 `docs/decisions/` と食い違う。
- 空ディレクトリ初回が `0000` 採番になる（`nextNumber()` の `(-1)+1`）が、ema 慣例では 0000 はテンプレ。
- `lint` は見出しの有無のみ検査し、テンプレのプレースホルダ残存（`軸1` 等）は素通りする。

これらはすべて ISO/IEC 25010:2023 の **相互作用性**（特にユーザエラー防止性・自己記述性）と
**機能適合性**（誤配置＝機能正確性、導入欠落＝機能完全性）の問題である。

## Decision Drivers {#drivers}

- **譲れない**: 外部依存ゼロ（`package.json` `dependencies: {}`・Node 標準のみ・`engines.node >=20`）。
  追加機能も fs/path/url 等の stdlib だけで実装する。
- **譲れない**: 正本=Markdown / 表示=HTML の分離（ADR-0002）と rc 規約（0=成功/1=失敗/2=使い方誤り）を壊さない。
- **譲れない**: 「流し読みを防ぐ」思想との一貫性。サイレントな誤りを warn に緩めない。
- **トレードオフ可**: 後方互換（フォールバックに依存した既存操作は停止しうる）。
- **トレードオフ可**: HTML の単体可搬性（外部 assets 参照を維持するか、インライン同梱にするか）。

## Considered Options {#options}

主決定は「フォールバック発火時の振る舞い」。

| 判断軸 | 現状維持（無通知） | warn のみ | 既定エラー＋フラグ [*] |
|---|---|---|---|
| ユーザエラー防止性 | なし | 弱い（流し読みで見逃す） | 強い（強制機能で封鎖） |
| 機能正確性（誤配置） | 混入する | 混入しうる | 防げる |
| 後方互換 | 完全 | 完全 | 一部停止（フラグで回避可） |
| 思想との整合 | 反する | 反する | 整合 |

- **現状維持**: 却下。サイレント誤配置が最大リスクで、ツールの存在意義と矛盾する。
- **warn のみ**: 却下。警告は流し読みされる前提で設計すべき（このツール自身の主張）。安全側に倒しきれない。
- **既定エラー＋ `--allow-tool-repo`**: 採用。`findAdrDir()` は解決パスに加え「解決理由
  （found-ancestor / fell-back-to-tool-repo / explicit）」を返す純粋関数にし（メカニズムとポリシーの分離・
  情報隠蔽: Parnas 1972）、書き込み系 `new` が意思決定する。フォールバック発火時はエラーで停止し、
  回復手順（`ema init` か `--allow-tool-repo`）を提示する（強制機能: Norman 2013 / Nielsen H5）。

付随して、導入は冪等な `ema init`（`docs/decisions/` ＋ `docs/decisions/assets/` ＋任意の 0000 テンプレ）に
集約する。HTML の assets 供給は次の 2 案を比較した。

| 判断軸 | A: 外部 assets ＋ provision/doctor [*] | B: HTML へインライン同梱 |
|---|---|---|
| 保守性（単一表現） | 高い（バージョン検出可） | 低い（埋め込み重複） |
| 柔軟性/移植性（単体可搬） | 中 | 高い |
| 差分の小ささ | 小さい | 肥大する |
| 既存構成との地続き | 高い（現 `docs/decisions/assets/`） | 作り直し |

A 案を採用（理由は Decision 参照）。B 案は HTML を ema 外へ単体共有する運用が主になった場合に再検討する。

## Decision {#decision}

> [!SUCCESS] 採用：既定エラー化＋ `ema init`、assets は A 案（外部＋provision/doctor）
> フォールバックは既定でエラーにし `--allow-tool-repo` でのみ許可する。**決め手は「サイレント誤配置の
> 防止」を最優先する感度分析**で、比較表の「思想との整合」と「機能正確性」の軸が支配的だった。
> 導入は冪等な `ema init` に集約し、assets はバージョンを刻んで `init`/`gen` が供給、
> `gen --check`（または `ema doctor`）で欠落・バージョン不一致を検出する。

具体的な変更点:

- **P1**: `findAdrDir()` を「解決パス＋解決理由」を返す形に拡張。`new` はフォールバック理由時にエラー停止＋回復手順提示。読み取り系（`view`/`gen`/`lint`）は解決パスと理由を warn 表示（現在地の可視化: ISO 9241-110:2020 自己記述性 / Nielsen H1）。
- **P1**: `ema init`（冪等）。`docs/decisions/` と `docs/decisions/assets/` を作成し assets を配置、任意で `type: guide` の 0000 テンプレをシードして「0000=テンプレ・実決定は 0001 から」を固定。
- **P2**: assets にバージョンを刻み、`gen --check`/`doctor` で「ツール vX に対しローカル assets が古い」を検出（依存の明示宣言: Twelve-Factor Factor II, Wiggins 2012）。
- **P3**: `new`/`gen`/`lint` の help パスを `DECISIONS_REL`（`docs/decisions/`）へ統一。`ema --version`/`-v` を追加（`package.json` を読む・stdlib のみ）。`ema where` と `ema new --dry-run` で「対象ディレクトリ・解決理由・次番号・生成パス」を書く前に提示。
- **P4**: `lint` に事後条件を追加（契約による設計: Meyer 1992）。テンプレ由来文字列（`軸1`/`◯◯`/反証トリガーの雛形等）残存を反証スロットは error・説明系は warn で検出。検出語は `new` の `scaffold()` と単一表現で共有（DRY: Martin 2017。既存の `lint`/`gen` が `render.mjs` を共有する設計と同じ思想）。

## Consequences {#consequences}

- **Positive:** 初見ユーザの「最初の 5 分の地雷」が消える。誤配置は構造的に発生しなくなり、導入は 1 コマンドに収束する。HTML が無スタイルになる事故も解消。lint がプレースホルダ残存を弾けるため半端 ADR を CI で止められる。すべて外部依存ゼロのまま。
- **Negative:** フォールバックに依存した既存操作はエラーで停止する（`--allow-tool-repo` で回避可だが学習コストが発生）。assets のバージョン管理という新しい運用責務が増える。コマンド数が増える（`init`/`where`/`--version`/任意 `doctor`）。
- **Neutral:** 正本=md / 表示=HTML の分離（ADR-0002）と rc 規約は不変。assets の置き場（`docs/decisions/assets/`）も不変。ema 自身が assets を commit する現状の運用は維持される。

## 反証：この決定が間違いになるとしたら {#falsification}

> [!WARNING] この決定が間違いになるとしたら、何が原因か
> **観測可能なトリガー**で書く（何を見たら見直すか）。
> - `--allow-tool-repo` の利用が常態化する、または「既定エラーで止まって困る」報告が複数件出たら → 既定エラーが厳しすぎる。対話 TTY 時のみ確認プロンプト（非 TTY/CI はエラー維持）へ緩める。
> - 「`ema init` が重い／結局手動で `mkdir` した」という報告が複数出たら → init の責務が過大。最小（ディレクトリ作成のみ）と任意拡張（assets/テンプレ）に分割する。
> - HTML を ema 外へ単体共有したい要望が継続的に出たら → assets A 案より B 案（インライン同梱）が正しい。`gen` の埋め込みモードを既定化する。
> - lint のプレースホルダ検出で、正規の本文に検出語が含まれる誤検出（false positive）が頻発したら → 検出語のヒューリスティックが粗すぎる。テンプレ専用マーカー（コメント等）方式へ切り替える。
> - assets バージョン管理の運用コストが、無スタイル事故の防止価値を上回ったら → doctor を廃し、`gen` 実行時に無条件 provision する単純策へ後退する。

## References {#references}

- ADR-0002（正本フォーマット：正本=md / 表示=HTML の分離）— 本リポジトリ `docs/decisions/0002-adr-source-format.md`
- ADR-0004（CLI と配布）— 本リポジトリ `docs/decisions/0004-cli-and-distribution.md`
- ISO/IEC 25010:2023 — *Product quality model*（相互作用性・機能適合性・保守性）. https://www.iso.org/standard/78176.html
- ISO/IEC 25023:2016 — *Measurement of system and software product quality*. https://www.iso.org/standard/35747.html
- ISO 9241-110:2020 — *Interaction principles*（自己記述性・制御可能性）. https://www.iso.org/standard/75258.html
- Nielsen, J. (1994, rev. 2024) — *10 Usability Heuristics for User Interface Design*（H1 可視性 / H5 エラー防止）. https://www.nngroup.com/articles/ten-usability-heuristics/
- Norman, D. (2013) — *The Design of Everyday Things: Revised and Expanded Edition*（強制機能）. ISBN 978-0-465-05065-9.
- Meyer, B. (1992) — "Applying 'Design by Contract.'" *IEEE Computer*, 25(10), 40–51. https://doi.org/10.1109/2.161279
- Parnas, D. L. (1972) — "On the Criteria To Be Used in Decomposing Systems into Modules." *CACM*, 15(12), 1053–1058. https://doi.org/10.1145/361598.361623
- Martin, R. C. (2017) — *Clean Architecture*（SRP / DRY=REP）. ISBN 978-0-13-449416-6.
- Wiggins, A. (2012) — *The Twelve-Factor App*（Factor II：依存の明示宣言）. https://12factor.net/

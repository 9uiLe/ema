---
adr: 0002
title: "ADR の正本形式：AI ネイティブな Markdown を正本とし、人間レビュー用 HTML を生成する"
status: accepted
date: 2026-06-06
deciders: "@9uiLe（2026-06-06 承認）"
revises: "[ADR-0001](0001-local-adr-viewer.html) の前提「保存形式は HTML 正本のまま」（viewer の決定は有効。形式前提のみ本 ADR に移譲）"
tags: [Process, Format, Markdown, AI, Documentation]
lead: |
  読み手が **人間レビュアー** と **AI** の2人いて、最適な形式が逆を向く問題に決着をつける。結論は **「正本」と「表示」の分離** — 正本は AI ネイティブで経済的な **制約付き Markdown**、人間レビュー用の流し読み防止 HTML は **外部依存ゼロのジェネレータで生成** する。流し読みを防ぐ力は HTML という保存形式ではなく「テンプレ規律＋摩擦のある描画」から来る、という `adr-tooling-handoff.md` の結論を実装に落とす。
---

## Context {#context}

この検討の **出発点** は表示ツール（[ADR-0001](0001-local-adr-viewer.html)）ではなく、もっと手前にある：**AI が生成した Markdown ドキュメントが「わかった感じはするが実際には理解できていない」** 状態を生み、その読みやすさ（処理流暢性）に乗って **承認後に『なんか違う』** が起きていた。これを直すために HTML 正本に寄せたが、議論の途中で **「HTML にすると AI の可読性・精度が落ちる」** という対立が挙がっていた。

ADR-0001 はこの対立を決めずに「保存形式は HTML 正本のまま」と **前提として固定** し、表示（人間にどう見せるか）だけを解いた。本 ADR は迂回したその核心 — **そもそも何を正本にするか** — を決める。

### 読み手が2人いて、最適形式が逆を向く {#two-readers}

| 観点 | Markdown 正本 | HTML 正本（ADR-0001 の暗黙前提） |
|---|---|---|
| 人間レビュー品質 | ✗ 流暢に読めて誤承認 | ✓ 構造・摩擦で流し読みを防ぐ |
| AI の可読性・精度 | ✓ 素直に読める/書ける | ✗ 低下する（下記） |

### なぜ HTML が AI の精度を落とすのか（機序） {#why-html-hurts-ai}

抽象論ではなく、ADR-0001 自身の比較表で説明できる。「B はサプライチェーンで優れる」を表すセルは生 HTML ではこうなっている：

```bash
<td class="center is-recommended"><span class="cmp-mark cmp-mark--yes"></span></td>
```

**中身が空** で、✓ は CSS が描いている。人間（ブラウザ）には見えるが、**生 HTML を読む AI には空セルに見える** — クラス名 `cmp-mark--yes` から辛うじて復元するしかなく、ほぼ同型の行が並ぶ中で誤読しやすい。つまり **HTML を人間に効かせている仕掛け（CSS で意味を描く）が、そのまま AI には意味の欠落になる**。加えて本文の実質は全体トークンの 2 割程度で、残りは markup の希薄化ノイズ。diff も汚れて差分レビューが効かない。

> [!NOTE] 公平な限定
> HTML が AI を「読めなくする」わけではない。**散文は AI も普通に読める**。低下が効くのは限定的で (1) CSS で意味を持つ表・図、(2) トークン希薄化、(3) diff 汚染 の 3 点。この前提（特に「生成精度の低下」）は強い断定ではなく **推論** であり、安価に実証可能（Compliance 参照）。

### 鍵となる洞察：流し読み防止は HTML から来ていない {#key-insight}

`adr-tooling-handoff.md` が既に出していた結論：**流し読みを防ぐ力は「HTML という保存形式」ではなく「固定スロット・テンプレ規律」と「摩擦のある描画」から来る**。HTML はそれをたまたま同梱していただけ。だとすれば **正本と表示を分離** でき、対立はトレードオフではなく **消える**。

## Decision Drivers {#drivers}

- **AI 読解精度** — 表の ✓/✗ 等の意味が *テキストに* 載り、希薄化ノイズが少ない。
- **AI 生成精度** — その形式を AI が *書き間違えにくい*（学習コーパスでの普及度）。
- **人間レビュー品質** — *描画後に* 構造・摩擦・知識紐付けが得られる。
- **トークン / diff 経済性** — 文脈予算と差分レビューのしやすさ。
- **ツール/依存の少なさ** — [ADR-0001](0001-local-adr-viewer.html) と同じく、外部依存ゼロ・サプライチェーン安全を優先（ユーザー方針）。
- **移行コスト** — 既存 HTML 群とデザインシステムからの距離。
- **意味の表現力** — 注意ブロック・相互参照・表・（稀に）図。

> [!TIP] 分離が効くと重み付けが変わる
> 「人間レビュー品質」は **描画層（生成 HTML）が担う** ので、正本形式の選定では各案ほぼ互角になる。よって正本は **AI 精度・経済性・依存の少なさ** で選ぶ — ただし「摩擦のある HTML に描画できる」ことを満たす範囲で。

## Considered Options {#options}

### Option A — HTML 正本を維持（現状） {#option-a}

- **長所**: 移行ゼロ。表現力は最大（デザインシステムをそのまま手書き）。
- **短所**: 出発点の問題（AI 精度低下・トークン希薄化・diff 汚染）が **未解決のまま**。AI が二級の読み手に留まる。

### Option B — 制約付き Markdown を正本にし、HTML を生成（推奨） {#option-b}

正本は **テンプレ準拠の制約付き Markdown**（`adr/NNNN-*.md`）。AI も人間もこれを書く。人間レビュー用 HTML は **外部依存ゼロの Node ジェネレータ**（`tools/adr-gen.mjs`）で生成し、[viewer](0001-local-adr-viewer.html) で表示する。注意ブロックや反証スロットは Markdown 上の **規約記法** でマークし、ジェネレータが `callout--*` 等へ展開する。donut/matrix のような稀なリッチ図は **生 HTML のエスケープハッチ** で逃がす。

```bash
# パイプライン（正本 ≠ 表示）
author (AI / 人間)
   │  書く・git 管理・diff はここ（ただし承認はここで *しない*）
   ▼
adr/0002-adr-source-format.md        ← 正本（AI ネイティブ・トークン軽・diff 綺麗）
   │  node tools/adr-gen.mjs          ← 外部依存ゼロ
   ▼
adr/0002-adr-source-format.html      ← 生成（人間は viewer でこれをレビュー・承認）
```

- **長所**: AI の読解/生成ともネイティブで精度最大・トークン最小・diff 綺麗。ジェネレータをゼロ依存で組めるためサプライチェーン方針と整合。人間レビュー品質は描画後に現状と同等。テンプレ規律は正本に対して **lint で機械強制** できる。
- **短所**: ジェネレータと linter を自前で持つ（保守対象が増える）。既存 HTML 群の変換が要る。リッチ図はエスケープハッチで例外化。

### Option C — AsciiDoc を正本にし、HTML を生成 {#option-c}

handoff が「最有力」と挙げた案。注意ブロック・相互参照・include をネイティブに持ち、HTML 変換も標準。

- **長所**: 意味の表現力が高い（admonition / xref がテキストで一級市民）。表もテキストに意味が載る。プレーンで diff 綺麗・トークン軽い。
- **短所**: **AI 生成精度が Markdown より低い**（学習コーパスでの普及度が低く、独自記法で書き損じやすい）。実用的な変換に `asciidoctor`（Ruby）か `asciidoctor.js`（npm 依存）が要り、**ゼロ依存方針に反する**。学習コストも上乗せ。

| 判断軸 | A HTML 正本 | B Markdown 正本＋生成 [*] | C AsciiDoc 正本＋生成 |
|---|---|---|---|
| AI 読解精度（意味がテキストに載る） | no | yes | yes |
| AI 生成精度（書き間違えにくさ） | mid | yes | mid |
| 人間レビュー品質（描画後） | yes | yes | yes |
| トークン / diff 経済性 | no | yes | yes |
| ツール/依存の少なさ（ゼロ依存で組める） | yes | yes | no |
| 既存 HTML からの移行コスト | yes | mid | no |
| 意味の表現力（admonition/xref/表/図） | yes | mid | yes |

## Decision {#decision}

> [!SUCCESS] 採用（提案）：Option B — Markdown 正本 ＋ ゼロ依存ジェネレータで HTML 生成
> ADR の正本を **制約付き Markdown**（`adr/NNNN-*.md`）に移す。AI と人間はこれを書き、git でバージョン管理する。人間レビュー用の流し読み防止 HTML は `tools/adr-gen.mjs`（**Node 標準のみ・外部依存ゼロ**）で生成し、ADR-0001 の [viewer](0001-local-adr-viewer.html) で表示する。
>
> C（AsciiDoc）に対して B を採る決め手は、この検討で炙り出された **2つの実制約** — **AI 生成精度**（Markdown が圧倒的にネイティブ）と **ゼロ依存ツール**（Markdown→HTML は標準 Node だけで書けるが、AsciiDoc は asciidoctor 依存が要る）。意味の表現力で C にわずかに劣るぶんは、**規約記法＋生 HTML エスケープハッチ** で埋める。人間レビュー品質は **描画層が担う** ため、正本を Markdown にしても落ちない。
>
> 2026-06-06 承認。あわせて Open Questions のうち2点が確定した：生成 HTML は **ビルド時生成**（正本 `.md` のみコミット）、既存 ADR は **一括変換** する。

## Consequences {#consequences}

### Positive {#consequences-positive}

- 出発点の問題が解ける：AI が正本をネイティブに読み書きでき、精度低下・トークン希薄化・diff 汚染が消える。
- 人間は描画された ADR を viewer でレビューでき、流し読み防止は維持される。
- テンプレ（[ADR-0000](0000-adr-template-and-review-guide.html)）を正本に対して lint で機械強制できる（反証スロット必須化など）。
- 正本が軽く可搬になり、他プロジェクトへの流用も容易。

### Negative {#consequences-negative}

- **新たに作る必要があるもの**：(1) ゼロ依存の `tools/adr-gen.mjs`（md＋規約記法 → デザインシステム HTML）、(2) テンプレ linter、(3) 既存 ADR の Markdown への変換。
- リッチ図（donut/matrix 等）は規約記法か生 HTML エスケープハッチに寄せる必要があり、純粋な Markdown ではなくなる。
- 生成物（HTML）を成果物としてコミットするか、ビルド時生成にするかの運用判断が要る（確定済：ビルド時生成）。

### Neutral {#consequences-neutral}

- ADR-0001 の viewer はそのまま使える（HTML が手書きか生成かに無依存）。
- デザインシステム（`adr/system/`）は変更不要。ジェネレータの出力ターゲットになるだけ。

## この決定が間違いになるとしたら、何が原因か {#falsification}

> [!WARNING] 前提が崩れたら再検討するトリガー
> 本決定は「Markdown は AI 生成精度が高く、ゼロ依存で HTML 生成でき、人間は生 diff でなく描画をレビューする」を前提に置く。次が真なら最適でなくなる：

- **人間が結局「生 Markdown の diff」で承認してしまう場合** — 描画レビューが習慣化せず PR 上の diff をスキャンして通すなら、**流暢性の罠が Markdown で復活** する。*観測指標*: 承認が viewer ではなく diff 画面で行われていないか。対策が効かなければ HTML 正本へ揺り戻す根拠になる。
- **規約記法＋エスケープハッチが汚くなる場合** — 注意ブロック・図・相互参照の規約が増殖して可読性を損ねるなら、admonition/xref がネイティブな **AsciiDoc（Option C）** が正解に転じる。その時は asciidoctor 依存を受け入れるか判断する。
- **「HTML が AI 精度を落とす」前提が実は弱い場合** — 本 ADR の中心前提は推論。安価な実証（Compliance）で差が小さいと出れば、移行コストに見合わず Option A 維持が妥当になりうる。
- **ジェネレータ/linter の保守コストが見合わない場合** — 自前ツールの維持が ADR 執筆頻度に対して重すぎるなら、既成の静的サイトジェネレータ採用（依存を受け入れる）へ振り直す。

## Compliance & Monitoring {#compliance}

- **承認は描画でする**：ADR の承認は viewer 上の生成 HTML に対して行い、生 Markdown の diff だけで承認しない（最重要の運用規律）。
- **テンプレ lint**：正本 Markdown に固定スロットと反証スロットが揃っているかを機械チェック（[ADR-0000](0000-adr-template-and-review-guide.html) のチェックリストを自動化、`tools/adr-lint.mjs`）。
- **ゼロ依存の維持**：`tools/adr-gen.mjs` は `node:*` 以外を import しない。
- **前提の実証（任意・安価）**：同一 ADR を HTML / Markdown で与え、比較表の「どの案がどの軸で優位か」を読み取らせて正答率を比べる小実験で、「HTML が AI 精度を落とす」を定量化できる。

## 確定事項（旧 Open Questions） {#open}

- **生成 HTML はビルド時生成**（確定）。正本 `.md` のみコミットし、HTML は `tools/adr-gen.mjs` で生成する成果物とする。diff が完全に綺麗になり、正本＝Markdown の原則が徹底される。
- **既存 ADR は一括変換**（確定）。既存 HTML を Markdown 正本へ移し、以後は生成で再現する。リッチ図（donut/matrix 等）は生 HTML エスケープハッチで保持する。
- **規約記法の具体仕様**（確定）— `tools/adr-format.md` に明文化済み。反証スロット・callout・比較表・リッチ図のマーク方法を規定。

## References {#references}

- [ADR-0001 · ローカル ADR ビューア](0001-local-adr-viewer.html) — 本 ADR が前提を引き取る相手。ゼロ依存ジェネレータの設計方針もここに準ずる。
- [ADR-0000 · テンプレートとレビュー観点](0000-adr-template-and-review-guide.html) — lint で強制する対象。
- `adr-tooling-handoff.md` — 「流し読み防止は形式でなく型から来る」「AsciiDoc 最有力」の出典。
- [MADR — Markdown Architectural Decision Records](https://adr.github.io/madr/)

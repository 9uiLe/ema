# ADR 正本フォーマット規約（`ema gen` が解釈する Markdown）

ADR-0002 の決定にもとづき、ADR の**正本は Markdown**（`docs/decisions/NNNN-slug.md`）。
人間レビュー用 HTML は `ema gen` で生成する（外部依存ゼロ）。
このファイルは、その制約付き Markdown の記法仕様であり、**それ自身が `ema gen` の入力として妥当**な例でもある。

## frontmatter

先頭の `---` 〜 `---` に YAML サブセットで書く。

```
---
adr: 0002
title: ADR の正本形式：... （**強調** や `code` 可）
status: accepted          # proposed | accepted | deprecated | superseded | rejected
date: 2026-06-06
deciders: "@9uiLe（2026-06-06 承認）"
tags: [Process, Format, Markdown]
maintainer: "@9uiLe"       # 任意（無ければ deciders から括弧を除いて推定）
revises: "[ADR-0001](0001-...html) の前提..."   # 任意の関連フィールド
follow_up: "..."                                 # 任意
superseded_by: "..."                             # 任意
lead: |
  リード文。**強調**・`code`・[リンク](x.html) を含められる。
---
```

- `tags` はインライン配列 `[a, b, c]`。
- `lead` などの長文は `|` ブロックスカラー（2 スペースインデント）。
- frontmatter 直値内の `**` `code` `[]()` はインライン記法として描画される。

## 本文の記法

| 記法 | 入力 | 生成される HTML |
|---|---|---|
| 見出し | `## 背景 {#context}` | `<h2 id="context">背景</h2>`（`{#id}` 省略時は自動 slug） |
| 段落 | 通常テキスト | `<p>…</p>`（空行区切り） |
| 強調 | `**太字**` `*斜体*` | `<strong>` `<em>` |
| コード | `` `code` `` | `<code>code</code>` |
| リンク | `[文言](url)` | `<a href="url">文言</a>` |
| リスト | `- 項目`（`  - ` で 1 段ネスト） | `<ul><li>…</li></ul>` |
| コードブロック | ` ```bash …``` ` | `<figure class="code-block"><pre><code class="language-bash">` |
| 水平線 | `---`（本文中） | `<hr />` |

## callout（注意ブロック）

GitHub 風 admonition。1 行目の `[!TYPE] 見出し` がタイトル、以降が本文（リスト可）。

```
> [!SUCCESS] 採用：Option B
> 採用理由を **強調** つきで。
> - 長所 1
> - 長所 2
```

| TYPE | クラス | アイコン | 用途 |
|---|---|---|---|
| SUCCESS | `callout--success` | ✓ | Decision の採用 |
| WARNING | `callout--warning` | ! | 反証スロット・トレードオフ警告 |
| DANGER | `callout--danger` | ✕ | 強い注意 |
| TIP | `callout--tip` | ★ | コツ・指針 |
| NOTE / INFO | `callout--note` / `--info` | i | 補足 |

## 比較表（cmp-mark）

通常の pipe table。**ヘッダセルに `[*]` を付けた列が採用列**（`is-recommended`）になる。
セル値が `yes` / `no` / `mid` / `na` の場合は採否マーク（`cmp-mark--*`）に変換、それ以外はテキスト。

```
| 判断軸 | A 案 | B 案 [*] | C 案 |
|---|---|---|---|
| 速度 | yes | yes | no |
| コスト | no | mid | yes |
| 説明 | 普通の文も書ける | … | … |
```

## リッチ図のエスケープハッチ

donut / matrix / decision-tree など Markdown で表現しない要素は、`=html` フェンスで生 HTML をそのまま通す。
行頭が `<div>` `<table>` `<figure>` `<svg>` 等のブロック要素で始まる塊も、空行までそのまま透過する。

````
```=html
<div class="donut-chart">…既存デザインシステムのマークアップ…</div>
```
````

## ビルド

```bash
ema gen            # docs/decisions/*.md をすべて生成
ema gen docs/decisions/0002-adr-source-format.md   # 個別
ema gen --check    # 生成せず不整合のみ検出（CI 用、終了コードで通知）
ema lint           # 固定スロット・反証スロットの充足を検査
npm test           # 変換ロジックのユニットテスト（= node --test・依存ゼロ・node:test）
```

変換ロジックは副作用のない `src/render.mjs` に分離してあり、`test/render.test.mjs` が
これを `node:test`（Node 標準）で検証する。`src/commands/gen.mjs` / `lint.mjs` はこの共有モジュールを使う。

正本 `.md` のみコミットし、`.html` は生成物（ADR-0002 の確定事項）。承認は viewer 上の生成 HTML に対して行う。

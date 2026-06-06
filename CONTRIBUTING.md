# Contributing to ema

`ema` への貢献をありがとうございます。このツールは「**流暢性の罠**」
（AI 生成 Markdown がスラスラ読めることで *理解した気* になり、誤った承認を生む問題）を
断つための ADR ワークフロー CLI です。設計判断の経緯は [`docs/decisions/`](docs/decisions/) を参照してください。

## 設計の核となる制約（変更前に理解してください）

1. **外部依存ゼロ** — Node.js 標準モジュールのみで実装します。
   `dependencies` への追加は原則 PR では受け付けません。依存が必要だと考える場合は、
   **まず Issue で打診**し、ADR で撤回条件付きの判断を記録してから入れます（ADR-0003 / ADR-0004）。
   サプライチェーンのリスクを増やさないための規律です。
2. **正本は Markdown、HTML は生成物** — ADR の正本は `docs/decisions/NNNN-slug.md` で、
   レビュー用 HTML は `ema gen` の生成物です。`.html` はコミットしません（gitignore 済み・ADR-0002）。
   **承認は生 diff ではなく、ビューア上の描画（生成 HTML）に対して行います**。
3. **反証スロット必須** — ADR には「この決定が間違いになるとしたら何が原因か」を
   観測可能なトリガーとして必ず書きます。`ema lint` がこれを検査します（[`docs/format.md`](docs/format.md)）。

## 開発環境のセットアップ

依存インストールは不要です（ゼロ依存）。Node.js >= 20 だけ用意してください。

```bash
git clone git@github.com:9uiLe/ema.git
cd ema
npm link        # `ema` コマンドを PATH に登録（冪等・任意。node bin/ema.mjs でも動く）
```

## 変更前後に必ず通すゲート

CI（`.github/workflows/ci.yml`）と同じ 3 つをローカルでも通してください:

```bash
node --test            # ユニットテスト（node:test・依存ゼロ）
ema lint               # 固定スロット / 反証スロットの充足を検査
ema gen                # 全 .md が例外なく描画できることの確認（生成物は捨ててよい）
```

`ema view` でビューアを起動し、**生成 HTML を実際に目で見て**レビューしてください。

## コードの方針

- 変換ロジックは副作用のない `src/render.mjs`（seam）に置き、`test/render.test.mjs` で検証します。
  CLI 層（`src/commands/*.mjs`）はファイル IO と引数解析だけを担います（試験性のための分離）。
- 振る舞いを変える変更にはテストを追加してください。
- 既存のコードスタイル・命名・コメント密度に合わせてください。

## ADR を伴う変更

アーキテクチャや運用方針に関わる変更は、コードだけでなく **ADR を追加・更新**してください:

```bash
ema new "決定のタイトル"     # 次番号の雛形（固定 + 反証スロット入り）を生成
```

既存決定を覆す場合は `superseded_by` / `supersedes`、名前だけ変える場合は `revises` を使い分けます
（ADR-0005 が例）。

## PR を出すとき

- `node --test` / `ema lint` / `ema gen` がすべて通ること（CI で再検証されます）。
- PR テンプレートのチェックリストを埋めてください。
- `.html` などの生成物をコミットに含めないでください。

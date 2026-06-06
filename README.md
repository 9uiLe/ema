# ema — 流し読みを防ぐ ADR ワークフロー

AI が生成した Markdown は **スラスラ読めてしまう**。その読みやすさ（処理流暢性）を理解と取り違えると、**承認した後で「なんか違う」** が起きる。このリポジトリは、その誤承認を構造的に防ぐための ADR（Architecture Decision Record）ワークフローと、外部依存ゼロの統一 CLI `ema` を提供する。

中心にある運用規律はひとつ：**承認は生 diff ではなく、生成された HTML の描画に対して行う。** 固定スロット・反証スロット・比較表・読む摩擦を備えた HTML を見ながらレビューすることで、流し読みを防ぐ。

- **正本は Markdown**（`docs/decisions/NNNN-slug.md`）。AI ネイティブで書きやすく、git で差分が読める。
- **レビュー用 HTML は生成物**（`ema gen`）。`.md` だけをコミットし、`.html` はビルドで作る。
- **外部依存ゼロ**（Node 標準モジュールのみ）。`package.json` の `dependencies` は空。

> なぜこの形なのかは、リポジトリ自身の ADR が決定として残してある（下記「設計判断」）。

## セットアップ

対象は Node を持つ開発者。各 PC で一度だけ：

```bash
git clone <this-repo> && cd ema
npm link          # PATH に `ema` コマンドを生やす（冪等・Win/macOS/Linux）
```

npm を使いたくなければセットアップ不要で、同じことができる：

```bash
node bin/ema.mjs <command>       # 例: node bin/ema.mjs lint
npm run <script>                 # 例: npm run lint  （new/gen/lint/view/check/test）
```

必要環境: **Node.js >= 20**（`node:test`・recursive `fs.watch` が安定）。

## 使い方

```bash
ema new "キャッシュ層の導入" cache-layer   # 次番号を採番し、固定/反証スロット入り .md を作成
ema lint                                   # 固定スロット・反証スロットの充足を検査
ema gen                                    # docs/decisions/*.md → レビュー用 HTML を生成
ema view                                   # ローカルビューアを起動（ライブリロード）。ここで承認する
ema help                                   # サブコマンド一覧
ema <command> --help                       # 各コマンドの詳細
```

典型的な流れ：

```bash
ema new "決定タイトル" decision-slug             # 雛形を作る
$EDITOR docs/decisions/0005-decision-slug.md     # Context / Options / Decision / 反証 を埋める
ema lint docs/decisions/0005-decision-slug.md    # スロット充足を確認
ema gen && ema view                              # 描画を見ながらレビュー → 承認
```

| コマンド | 役割 |
|---|---|
| `ema new "<title>" [slug]` | 次番号を採番し、テンプレ（固定スロット＋反証スロット）から `.md` を生成。既存は上書きしない |
| `ema gen [files...] [--check]` | Markdown 正本 → デザインシステム HTML。`--check` は生成せず不整合のみ検出（CI 用） |
| `ema lint [files...]` | frontmatter 必須キーと固定/反証スロットの充足を検査（ERROR があれば終了コード 1） |
| `ema view [dir] [--port N] [--no-open]` | `docs/decisions/` を配信＋一覧自動生成＋ライブリロードするローカルビューア |

> 対象 `docs/decisions/` は **git と同じように cwd から上に辿って探す** — リポジトリ内のどのサブディレクトリから `ema` を叩いても、その repo の `docs/decisions/` を見つける。見つからなければ、`npm link` した clone 自身の `docs/decisions/` にフォールバックする。`ema view <dir>` で対象ディレクトリを明示することもできる。

## プロジェクト構成

```
bin/
└── ema.mjs                 # 実行エントリ（薄いディスパッチャ。new|gen|lint|view|help を委譲）
src/
├── commands/
│   ├── new.mjs             # 雛形生成
│   ├── gen.mjs             # 生成
│   ├── lint.mjs            # 検査
│   └── view.mjs            # ビューア
├── render.mjs              # Markdown→HTML の純粋変換ロジック（副作用なしの seam・テスト対象）
└── paths.mjs               # 対象 docs/decisions/ の解決（cwd 上り探索）
test/
├── render.test.mjs         # node:test の回帰テスト（依存ゼロ）
└── paths.test.mjs
docs/
├── decisions/              # ADR 正本(.md) ＋ 生成HTML(.html)
│   ├── 0000-…              # テンプレート＆レビュー観点（lint が機械強制する対象）
│   ├── 0001-…〜0005-…      # 確定した設計判断（下記）
│   └── assets/             # 描画用デザインシステム（tokens.css / components.css 等）
└── format.md               # 制約付き Markdown の記法仕様
package.json                # 依存ゼロのマニフェスト（bin: ema / scripts / engines）
```

CLI（`src/commands/*.mjs`）はファイル IO と引数解析だけを担い、変換ロジックは副作用のない `src/render.mjs` に分離してある。これにより `node:test` で描画の正しさを回帰テストでき、「承認は描画でする」運用の土台が崩れないことを担保する。各 `src/commands/<cmd>.mjs` は `node src/commands/<cmd>.mjs` の直接起動も後方互換で残している。

## 開発

```bash
npm test          # = node --test（依存ゼロのユニットテスト）
npm run check     # = ema gen --check（HTML が正本と一致するか。CI 用）
```

記法を拡張するときは **回帰テストを先に書く**（`test/render.test.mjs`）。実行時依存は追加しない方針（追加は打診の上、ADR の撤回トリガーに照らして判断）。テスト実行は `node --test`（引数なし自動探索）を使う。

## 設計判断（このリポジトリ自身の ADR）

このツール群は、自分の決定を自分のフォーマットで残している（ドッグフーディング）。

| ADR | 内容 |
|---|---|
| [ADR-0000](docs/decisions/0000-adr-template-and-review-guide.md) | ADR テンプレートとレビュー観点（反証スロット必須） |
| [ADR-0001](docs/decisions/0001-local-adr-viewer.md) | ローカル ADR ビューア |
| [ADR-0002](docs/decisions/0002-adr-source-format.md) | 正本形式：AI ネイティブな Markdown を正本とし、HTML を生成する |
| [ADR-0003](docs/decisions/0003-adr-tooling-stack.md) | 技術スタック：ゼロ依存を維持し試験性は `node:test` で確保（→ 0004 が更新） |
| [ADR-0004](docs/decisions/0004-cli-and-distribution.md) | 配布と CLI：公開・チーム前提でも Node を継続し、設置性は `package.json` で埋める |
| [ADR-0005](docs/decisions/0005-modernize-naming-layout.md) | ディレクトリ・命名のモダン化（`bin/`+`src/`+`docs/decisions/`、コマンド `ema`） |

各 ADR には「**この決定が間違いになるとしたら何が原因か**」を観測可能なトリガー付きで明記してある。前提が崩れたら、そのトリガーに従って決定を引き直す。

> ADR 0000–0004 の本文に出てくる旧パス（`tools/…`）・旧コマンド（`adr …`）は、決定当時の記録としてそのまま残している。現行の対応は ADR-0005 の旧→新マッピング表が正。

## ライセンス

[MIT](LICENSE)。

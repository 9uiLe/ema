#!/usr/bin/env node
// new — 次番号の ADR 正本（.md）をテンプレから生成する（CLI 層）
//
// 流暢性の罠を断つには「固定スロット＋反証スロット」が毎回そろっている必要がある。
// 手コピーは採番ミス・スロット欠落（ユーザエラー）の温床なので、採番と
// テンプレ展開を自動化する（運用操作性=最少ステップ／ユーザエラー防止性）。
// 既存ファイルがあれば上書きせず中止する（Norman 2013 の強制機能）。外部依存ゼロ。
//
// 書き込み先は paths.resolveAdrDir() が解決する。祖先に docs/decisions/ が無いと
// ツール自身のリポジトリへ「サイレントに」フォールバックして誤配置する事故を避けるため、
// フォールバック発火時は既定で停止し、回復手順（ema init / --allow-tool-repo）を提示する。
//
// 統一 CLI（推奨）:
//   ema new "<タイトル>" [slug]
//   ema new "キャッシュ層の導入" cache-layer   → docs/decisions/0004-cache-layer.md
// 直接起動（互換）:
//   node src/commands/new.mjs "<タイトル>" [slug]
//
// テンプレと、雛形残存を検出する lint のプレースホルダ語彙は src/template.mjs で単一表現。

import { readdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slugify } from '../render.mjs';
import { resolveAdrDir, describeReason } from '../paths.mjs';
import { scaffold } from '../template.mjs';

export const help = `ema new — 次番号の ADR 正本をテンプレから生成（外部依存ゼロ）

使い方:
  ema new "<タイトル>" [slug] [--dry-run] [--allow-tool-repo]

引数:
  タイトル          ADR のタイトル（必須・クォートで囲む）
  slug             ファイル名の英小文字スラッグ（省略可。日本語タイトルからは
                   推定できないため、省略時は adr-NNNN を使う旨を通知する）

オプション:
  --dry-run        書き込まず「対象ディレクトリ・解決理由・次番号・生成パス」だけ表示
  --allow-tool-repo docs/decisions/ が見つからないとき、ema ツール自身のリポジトリへの
                   書き込みを明示的に許可する（既定はエラーで停止）
  -h, --help       このヘルプ

生成物:
  docs/decisions/NNNN-<slug>.md（status: proposed・固定スロット＋反証スロット入り）
  既存の同名ファイルがあれば上書きせず中止する。`;

// 今日の日付（YYYY-MM-DD）。CLI は実行時刻に依存してよい。
function today() {
  return new Date().toISOString().slice(0, 10);
}

// dir 内の *.md の先頭番号の最大 +1 を 4 桁ゼロ詰めで返す（where と共有: DRY）。
export async function nextNumber(dir) {
  const nums = (await readdir(dir))
    .map((e) => /^(\d+)-.*\.md$/.exec(e))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : -1) + 1;
  return String(next).padStart(4, '0');
}

// タイトルからスラッグを決める（推定できなければ adr-NNNN）。通知は呼び出し側へは出さず内部で warn。
function decideSlug(explicit, title, num) {
  if (explicit) return explicit;
  const fromTitle = slugify(title);
  if (fromTitle && fromTitle !== 'section') return fromTitle;
  const slug = `adr-${num}`;
  console.warn(`  [note] タイトルから英語スラッグを推定できないため "${slug}" を使います。`);
  console.warn(`         英語ファイル名にしたい場合: ema new "${title}" <slug>`);
  return slug;
}

// 終了コードを返す（0=生成 / 1=既存衝突・タイトル無し・フォールバック拒否 / 2=引数エラー）。
export async function run(argv = []) {
  if (argv.includes('-h') || argv.includes('--help')) { console.log(help); return 0; }
  const dryRun = argv.includes('--dry-run');
  const allowToolRepo = argv.includes('--allow-tool-repo');
  const positional = argv.filter((a) => !a.startsWith('-'));
  const title = positional[0];
  if (!title) {
    console.error('タイトルが必要です。  ema new "<タイトル>" [slug]');
    return 1;
  }

  const { dir, reason } = resolveAdrDir();

  // サイレントな誤配置の防止（ユーザエラー防止性 / 強制機能: Norman 2013）。
  if (reason === 'fell-back-to-tool-repo' && !allowToolRepo) {
    console.error(`  docs/decisions/ が見つかりません（cwd: ${process.cwd()}）。`);
    console.error('');
    console.error('  ここで ADR を始めるなら:');
    console.error('      ema init');
    console.error(`  ツール自身のリポジトリ（${dir}）に書くと分かっていて続けるなら:`);
    console.error(`      ema new "${title}"${positional[1] ? ` ${positional[1]}` : ''} --allow-tool-repo`);
    return 1;
  }

  const num = await nextNumber(dir);
  const slug = decideSlug(positional[1], title, num);
  const dest = join(dir, `${num}-${slug}.md`);

  if (dryRun) {
    console.log('  [dry-run] 書き込みは行いません。');
    console.log(`    対象ディレクトリ: ${dir}`);
    console.log(`    解決理由        : ${describeReason(reason)}`);
    console.log(`    次番号          : ${num}`);
    console.log(`    生成パス        : ${dest}`);
    return 0;
  }

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

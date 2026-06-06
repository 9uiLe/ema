// assets — レビュー用 HTML が参照する静的資産（tokens.css / components.* / components/）の供給と整合検査
//
// render.mjs が生成する HTML は assets/tokens.css 等を相対参照する。これらを各リポジトリに
// 供給（provision）しないと無スタイル HTML になり、ツール本体を更新すると複製がドリフトする。
// ここでは「ツール自身が持つ正本 assets（TOOL_ASSETS_DIR）を単一の供給元」とし、供給と
// ドリフト検出を提供する（依存の明示宣言: Twelve-Factor Factor II, Wiggins 2012）。外部依存ゼロ。

import { cp, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { TOOL_REPO_ROOT, DECISIONS_REL } from './paths.mjs';

// HTML からの相対参照に合わせた assets ディレクトリ名（docs/decisions/assets/）。
export const ASSETS_REL = 'assets';

// 供給元＝ツール自身のリポジトリの assets。これを正本として各リポへ配る。
export const TOOL_ASSETS_DIR = join(TOOL_REPO_ROOT, DECISIONS_REL, ASSETS_REL);

// root 配下のファイルを base からの相対パスで再帰列挙する。
async function listFiles(root, base = root) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...await listFiles(p, base));
    else out.push(relative(base, p));
  }
  return out;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// decisionsDir 配下の assets 状態を返す。
//   'self'    … 供給元自身（ツールリポ）なので操作不要
//   'missing' … assets ディレクトリが無い
//   'drift'   … 供給元と内容が一致しない（欠落 or 古い）
//   'ok'      … 供給元と一致
export async function assetsStatus(decisionsDir) {
  const target = join(decisionsDir, ASSETS_REL);
  if (resolve(target) === resolve(TOOL_ASSETS_DIR)) return 'self';
  if (!existsSync(target)) return 'missing';
  const want = await listFiles(TOOL_ASSETS_DIR);
  for (const rel of want) {
    const lp = join(target, rel);
    if (!existsSync(lp)) return 'drift';
    const [a, b] = await Promise.all([readFile(join(TOOL_ASSETS_DIR, rel)), readFile(lp)]);
    if (sha(a) !== sha(b)) return 'drift';
  }
  return 'ok';
}

// decisionsDir に assets を供給する（冪等：再実行しても結果は同じ）。
// 供給元自身には何もしない。戻り値は 'self' | 'provisioned'。
export async function provisionAssets(decisionsDir) {
  const target = join(decisionsDir, ASSETS_REL);
  if (resolve(target) === resolve(TOOL_ASSETS_DIR)) return 'self';
  await cp(TOOL_ASSETS_DIR, target, { recursive: true });
  return 'provisioned';
}

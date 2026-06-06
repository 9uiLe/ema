// paths — 対象 ADR ディレクトリ（docs/decisions/）の解決（CLI 層の共有ユーティリティ）
//
// グローバル `ema`（npm link）を任意の cwd から叩いても壊れないようにする。
// 解決規則は git 的：
//   1. cwd から上に辿り、`docs/decisions/` を持つ最も近い祖先を対象にする
//      （作業中のリポジトリの ADR を操作する＝最も直感的）。
//   2. 見つからなければ、このツール自身が属するリポジトリの `docs/decisions/`
//      （= npm link した clone）にフォールバックする。
//
// fs 参照・cwd 依存があるため純粋変換ロジック（src/render.mjs）とは分け、
// CLI 層の小さなユーティリティとしてここに置く。

import { existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 正本 ADR が置かれるディレクトリの慣例パス（リポジトリルートからの相対）。
export const DECISIONS_REL = join('docs', 'decisions');

// このツール群が属するリポジトリのルート（src/ の 1 つ上）。
export const TOOL_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

// 対象の docs/decisions/ ディレクトリの絶対パスを返す。
// explicit が与えられればそれを優先（`ema view <dir>` 用）。
export function findAdrDir(explicit) {
  if (explicit) return resolve(explicit);
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, DECISIONS_REL);
    if (isDir(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // ファイルシステムのルートに到達
    dir = parent;
  }
  return join(TOOL_REPO_ROOT, DECISIONS_REL);
}

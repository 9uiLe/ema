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

// 対象 docs/decisions/ を「どう解決したか」を添えて返す（メカニズムとポリシーの分離）。
// reason:
//   'explicit'             … 引数で明示指定された（`ema view <dir>` 等）
//   'found-ancestor'       … cwd/祖先に docs/decisions/ を発見した（通常運用）
//   'fell-back-to-tool-repo' … 見つからずツール自身のリポジトリへフォールバックした
// 書き込み系（new）はこの reason を見て「サイレントな誤配置」を防ぐ判断ができる。
// 解決そのものは副作用を持たない純粋関数とし、停止/警告は呼び出し側に委ねる（Parnas 1972）。
export function resolveAdrDir(explicit) {
  if (explicit) return { dir: resolve(explicit), reason: 'explicit' };
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, DECISIONS_REL);
    if (isDir(candidate)) return { dir: candidate, reason: 'found-ancestor' };
    const parent = dirname(dir);
    if (parent === dir) break; // ファイルシステムのルートに到達
    dir = parent;
  }
  return { dir: join(TOOL_REPO_ROOT, DECISIONS_REL), reason: 'fell-back-to-tool-repo' };
}

// 解決理由の人間向け説明（warn / where / dry-run の表示に使う）。
export function describeReason(reason) {
  switch (reason) {
    case 'explicit': return '明示指定';
    case 'found-ancestor': return '作業ディレクトリ（祖先）の docs/decisions/';
    case 'fell-back-to-tool-repo': return '（フォールバック）ema ツール自身のリポジトリ';
    default: return reason;
  }
}

// 対象の docs/decisions/ ディレクトリの絶対パスだけを返す後方互換ラッパ。
// 読み取り系（view/gen/lint）はこれで足りる。
export function findAdrDir(explicit) {
  return resolveAdrDir(explicit).dir;
}

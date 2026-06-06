// paths のユニットテスト — node:test（Node 標準）で外部依存ゼロ。
//
// グローバル `ema` を任意の cwd から叩いても対象 docs/decisions/ を見つけられること、
// 明示パスが優先されることを固定する（repo 外実行の回帰）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { findAdrDir, resolveAdrDir, describeReason, TOOL_REPO_ROOT, DECISIONS_REL } from '../src/paths.mjs';

test('findAdrDir: 明示パスは絶対化して優先する', () => {
  assert.equal(findAdrDir('some/where/decisions'), resolve('some/where/decisions'));
});

test('findAdrDir: 明示なしでも絶対パスの docs/decisions/ を返す', () => {
  const dir = findAdrDir();
  assert.ok(isAbsolute(dir));
  assert.match(dir, /[\\/]decisions$/);
});

test('TOOL_REPO_ROOT: ツールリポジトリのルートで、docs/decisions/ を実在ディレクトリとして持つ', () => {
  const decisions = join(TOOL_REPO_ROOT, DECISIONS_REL);
  assert.ok(existsSync(decisions) && statSync(decisions).isDirectory());
});

test('resolveAdrDir: 明示指定は reason=explicit、dir は絶対化', () => {
  const r = resolveAdrDir('a/b/decisions');
  assert.equal(r.reason, 'explicit');
  assert.equal(r.dir, resolve('a/b/decisions'));
});

test('findAdrDir は resolveAdrDir().dir に一致する（後方互換ラッパ）', () => {
  assert.equal(findAdrDir('a/b/decisions'), resolveAdrDir('a/b/decisions').dir);
});

test('describeReason: 既知の理由を人間向け文言に変換する', () => {
  assert.match(describeReason('fell-back-to-tool-repo'), /フォールバック/);
  assert.equal(describeReason('unknown'), 'unknown');
});

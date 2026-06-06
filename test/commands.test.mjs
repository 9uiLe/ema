// commands のユニット/統合テスト — node:test（Node 標準）で外部依存ゼロ。
//
// 0006（新規リポ導入体験の安全化）で入れた振る舞いを回帰として固定する:
//   - フォールバック時に new が「停止し、何も書かない」（サイレント誤配置の防止）
//   - new --dry-run は書き込まない
//   - init は冪等で assets と 0000 ガイドを供給する
//   - lint がテンプレ雛形の残存（プレースホルダ）を検出する
//   - template/PLACEHOLDERS が単一表現で同期している（DRY）
//   - assets の供給/ドリフト検出

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run as runInit } from '../src/commands/init.mjs';
import { run as runNew } from '../src/commands/new.mjs';
import { run as runLint } from '../src/commands/lint.mjs';
import { scaffold, PLACEHOLDERS } from '../src/template.mjs';
import { resolveAdrDir, TOOL_REPO_ROOT, DECISIONS_REL } from '../src/paths.mjs';
import { assetsStatus, provisionAssets, ASSETS_REL } from '../src/assets.mjs';

// 一時ディレクトリを cwd にして fn を実行し、必ず後始末する。
async function inTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ema-test-'));
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn(dir);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

// console を黙らせて fn を実行（テスト出力をクリーンに保つ）。
async function quiet(fn) {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  try { return await fn(); } finally { Object.assign(console, { log, error, warn }); }
}

const mds = (dir) => readdirSync(dir).filter((e) => /^\d{4}-.*\.md$/.test(e));

test('resolveAdrDir: docs/decisions/ が無い cwd では reason=fell-back-to-tool-repo', async () => {
  await inTmp(() => {
    const r = resolveAdrDir();
    assert.equal(r.reason, 'fell-back-to-tool-repo');
    assert.equal(r.dir, join(TOOL_REPO_ROOT, DECISIONS_REL));
  });
});

test('new: フォールバック時は停止し（rc=1）、一切書き込まない', async () => {
  await inTmp(async (dir) => {
    const rc = await quiet(() => runNew(['テスト決定', 'test']));
    assert.equal(rc, 1);
    assert.ok(!existsSync(join(dir, 'docs')), 'cwd に何も作られていないこと');
  });
});

test('init: 冪等で docs/decisions・assets・0000 ガイドを供給する', async () => {
  await inTmp(async (dir) => {
    const rc1 = await quiet(() => runInit([]));
    const rc2 = await quiet(() => runInit([])); // 2 回目も成功（冪等）
    assert.equal(rc1, 0);
    assert.equal(rc2, 0);
    const decisions = join(dir, DECISIONS_REL);
    assert.ok(existsSync(join(decisions, ASSETS_REL, 'tokens.css')), 'assets が供給されている');
    assert.ok(readdirSync(decisions).some((e) => /^0000-.*\.md$/.test(e)), '0000 ガイドが種まきされている');
    assert.equal(await assetsStatus(decisions), 'ok');
  });
});

test('new: init 済みリポでは 0000 を避けて 0001 から採番する', async () => {
  await inTmp(async (dir) => {
    await quiet(() => runInit([]));
    const rc = await quiet(() => runNew(['最初の決定', 'first']));
    assert.equal(rc, 0);
    assert.ok(existsSync(join(dir, DECISIONS_REL, '0001-first.md')));
  });
});

test('new --dry-run: 書き込まずに rc=0 を返す', async () => {
  await inTmp(async (dir) => {
    await quiet(() => runInit([]));
    const before = mds(join(dir, DECISIONS_REL)).length;
    const rc = await quiet(() => runNew(['予定', 'planned', '--dry-run']));
    assert.equal(rc, 0);
    assert.equal(mds(join(dir, DECISIONS_REL)).length, before, 'ファイル数が増えていない');
  });
});

test('lint: 未充足テンプレ（scaffold そのまま）は ERROR で落ちる', async () => {
  await inTmp(async (dir) => {
    const f = join(dir, '0001-raw.md');
    writeFileSync(f, scaffold({ num: '0001', title: '生テンプレ', date: '2026-01-01' }));
    const rc = await quiet(() => runLint([f]));
    assert.equal(rc, 1);
  });
});

test('lint: 実際に充足済みの 0006 はクリーン（コード内言及を誤検出しない）', async () => {
  const f = join(TOOL_REPO_ROOT, DECISIONS_REL, '0006-onboarding-safety.md');
  const rc = await quiet(() => runLint([f]));
  assert.equal(rc, 0);
});

test('template: すべての PLACEHOLDERS マーカーが scaffold 出力に存在する（DRY 同期）', () => {
  const body = scaffold({ num: '0001', title: 't', date: '2026-01-01' });
  for (const ph of PLACEHOLDERS) {
    assert.ok(body.includes(ph.marker), `scaffold にマーカーが無い: ${ph.marker}`);
  }
});

test('assets: ツールリポ自身は self、供給後は ok、改竄で drift、欠落で missing', async () => {
  // 供給元自身
  assert.equal(await assetsStatus(join(TOOL_REPO_ROOT, DECISIONS_REL)), 'self');
  await inTmp(async (dir) => {
    const decisions = join(dir, DECISIONS_REL);
    assert.equal(await assetsStatus(decisions), 'missing');
    await provisionAssets(decisions);
    assert.equal(await assetsStatus(decisions), 'ok');
    appendFileSync(join(decisions, ASSETS_REL, 'tokens.css'), '/* tamper */');
    assert.equal(await assetsStatus(decisions), 'drift');
  });
});

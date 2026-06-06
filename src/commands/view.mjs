#!/usr/bin/env node
// view — ローカル ADR ビューア
//
// HTML で書かれた ADR を、ブラウザで快適に閲覧・編集するための
// 外部依存ゼロ（Node 標準モジュールのみ）のローカルサーバ。
//
//   - docs/decisions/ を静的配信（相対参照の system/*.css・components.js・ADR 間リンクがそのまま解決する）
//   - / で ADR 一覧（index）を自動生成（タイトル・Status・日付・タグを HTML から抽出）
//   - fs.watch + Server-Sent Events で編集中ライブリロード
//   - macOS では起動時にブラウザを自動オープン
//
// 設計判断の根拠は docs/decisions/0001-local-adr-viewer.html を参照。
//
// 統一 CLI（推奨）:
//   ema view                 # ADR を :4173 で配信しブラウザを開く
//   ema view --port 8080
//   ema view --no-open       # CI / リモート向け
// 直接起動（互換）:
//   node src/commands/view.mjs [dir] [--port N] [--no-open] [--host H]

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, extname, resolve, sep, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esc, STATUS_LABEL } from '../render.mjs';
import { findAdrDir } from '../paths.mjs';

// ── 状態（run() がコマンドライン引数から設定する） ───────────
// 配信元 ROOT と起動オプションはモジュールレベルに保持し、
// リクエストハンドラ・index 生成・watch から参照する。
let opts = { dir: null, port: 4173, open: true, host: '127.0.0.1' };
let ROOT = findAdrDir();

// ── MIME ─────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

// ── ライブリロード ───────────────────────────────────────────
const clients = new Set(); // 接続中の SSE レスポンス
const LIVERELOAD_SNIPPET = `
<script>
(function () {
  if (window.__adrLiveReload) return;
  window.__adrLiveReload = true;
  function connect() {
    var es = new EventSource('/__livereload');
    es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
    es.onerror = function () { es.close(); setTimeout(connect, 1000); };
  }
  connect();
})();
</script>`;

function broadcastReload() {
  for (const res of clients) {
    try { res.write('data: reload\n\n'); } catch { /* 切断済み */ }
  }
}

// fs.watch をデバウンスして reload を配信（run() から ROOT 確定後に呼ぶ）
let watchTimer = null;
function startWatch() {
  try {
    watch(ROOT, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(broadcastReload, 80);
    });
  } catch (err) {
    console.warn(`[warn] ファイル監視を開始できませんでした（ライブリロード無効）: ${err.message}`);
  }
}

// ── HTML ヘルパ（esc は src/render.mjs と共有） ──────────
// 末尾の </body> 直前にライブリロードスクリプトを差し込む
function injectLiveReload(html) {
  const i = html.lastIndexOf('</body>');
  if (i === -1) return html + LIVERELOAD_SNIPPET;
  return html.slice(0, i) + LIVERELOAD_SNIPPET + html.slice(i);
}

// ── ADR メタ抽出（index 生成用） ─────────────────────────────
function match1(re, s, fallback = '') {
  const m = re.exec(s);
  return m ? m[1].trim() : fallback;
}

function parseAdrMeta(file, html) {
  // <title>ADR-0006 · 本文…</title>
  const rawTitle = match1(/<title>([\s\S]*?)<\/title>/i, html, basename(file));
  const parts = rawTitle.split(' · ');
  const numLabel = parts.length > 1 ? parts.shift().trim() : '';
  const title = parts.join(' · ').trim() || rawTitle;
  // 番号: タイトル優先、なければファイル名先頭の数字
  const num = match1(/ADR[-\s]?(\d+)/i, numLabel || rawTitle)
    || match1(/^(\d+)/, basename(file));
  // Status: 最初の status-* バッジ
  const status = match1(/class="badge\s+status-([a-z]+)"/i, html);
  // 日付: adr-frontmatter の Date 欄を優先、なければ本文中の最初の日付
  const date = match1(/Date<\/span>\s*<span[^>]*>\s*(\d{4}-\d{2}-\d{2})/i, html)
    || match1(/(\d{4}-\d{2}-\d{2})/, html);
  return { file: basename(file), num, title, status, date };
}

async function collectAdrs() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const metas = [];
  for (const e of entries) {
    if (!e.isFile() || extname(e.name) !== '.html') continue;
    if (e.name === 'index.html') continue;
    try {
      const html = await readFile(join(ROOT, e.name), 'utf8');
      metas.push(parseAdrMeta(e.name, html));
    } catch { /* 読めないものはスキップ */ }
  }
  // 番号 → ファイル名の順でソート
  metas.sort((a, b) =>
    (a.num || '').padStart(6, '0').localeCompare((b.num || '').padStart(6, '0'))
    || a.file.localeCompare(b.file));
  return metas;
}

function renderIndex(metas) {
  const rows = metas.map((m) => {
    const statusPill = m.status
      ? `<span class="badge status-${esc(m.status)}">${esc(STATUS_LABEL[m.status] || m.status)}</span>`
      : '';
    const num = m.num ? `<span class="idx-num">ADR-${esc(m.num)}</span>` : '';
    const date = m.date ? `<span class="idx-date mono">${esc(m.date)}</span>` : '';
    return `      <a class="idx-row" href="${esc(m.file)}">
        <span class="idx-main">${num}<span class="idx-title">${esc(m.title)}</span></span>
        <span class="idx-meta">${statusPill}${date}</span>
      </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ADR Index · ${metas.length} records</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="assets/tokens.css" />
<link rel="stylesheet" href="assets/components.css" />
<style>
  body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); margin: 0; }
  .idx-wrap { max-width: var(--content-max, 1000px); margin: 0 auto; padding: var(--sp-10, 48px) var(--sp-8, 32px) var(--sp-16, 96px); }
  .idx-eyebrow { font-size: var(--fs-xs); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-muted); font-weight: var(--fw-medium); margin: 0 0 var(--sp-3, 12px); }
  .idx-h1 { font-size: var(--fs-3xl); font-weight: var(--fw-semibold); letter-spacing: var(--tracking-tight); margin: 0 0 var(--sp-2, 8px); }
  .idx-sub { color: var(--color-text-secondary); font-size: var(--fs-md); margin: 0 0 var(--sp-8, 32px); }
  .idx-list { display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; background: var(--color-bg-elevated); }
  .idx-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4, 16px); padding: var(--sp-4, 16px) var(--sp-5, 20px); text-decoration: none; color: inherit; border-top: 1px solid var(--color-border-subtle); transition: background var(--ease-out, .15s); }
  .idx-row:first-child { border-top: none; }
  .idx-row:hover { background: var(--color-bg-subtle); }
  .idx-main { display: flex; align-items: baseline; gap: var(--sp-3, 12px); min-width: 0; }
  .idx-num { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--color-text-faint); font-weight: var(--fw-medium); flex: none; }
  .idx-title { font-size: var(--fs-md); font-weight: var(--fw-medium); overflow: hidden; text-overflow: ellipsis; }
  .idx-meta { display: flex; align-items: center; gap: var(--sp-3, 12px); flex: none; }
  .idx-date { font-size: var(--fs-xs); color: var(--color-text-muted); }
  .idx-empty { padding: var(--sp-8, 32px); text-align: center; color: var(--color-text-muted); }
</style>
</head>
<body>
  <div class="idx-wrap">
    <p class="idx-eyebrow">Engineering Docs / ADRs</p>
    <h1 class="idx-h1">Architecture Decision Records</h1>
    <p class="idx-sub">${metas.length} 件 · <span class="mono">${esc(basename(ROOT))}/</span> · ライブリロード有効</p>
    <div class="idx-list">
${rows || '      <div class="idx-empty">ADR がまだありません</div>'}
    </div>
  </div>
</body>
</html>`;
}

// ── パス解決（ディレクトリトラバーサル対策） ─────────────────
function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = resolve(ROOT, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  // ROOT の外に出るパスは拒否
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

// ── リクエストハンドラ ───────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = req.url || '/';

  // ライブリロード用 SSE
  if (url === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // index 自動生成
  if (url === '/' || url.split('?')[0] === '/index.html') {
    // 物理 index.html があればそれを優先、なければ動的生成
    const physical = join(ROOT, 'index.html');
    if (existsSync(physical)) {
      const html = await readFile(physical, 'utf8');
      return sendHtml(res, html);
    }
    const metas = await collectAdrs();
    return sendHtml(res, renderIndex(metas));
  }

  // 静的ファイル
  const target = safeResolve(url);
  if (!target) { res.writeHead(403); return res.end('403 Forbidden'); }

  try {
    const st = await stat(target);
    if (st.isDirectory()) { res.writeHead(403); return res.end('403 Forbidden'); }
    const ext = extname(target).toLowerCase();
    if (ext === '.html') {
      const html = await readFile(target, 'utf8');
      return sendHtml(res, html);
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:3rem">
      <h1>404</h1><p><code>${esc(url)}</code> は見つかりません。
      <a href="/">← ADR 一覧へ</a></p>${LIVERELOAD_SNIPPET}`);
  }
});

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': MIME['.html'] });
  res.end(injectLiveReload(html));
}

// ── 起動（ポート衝突時は +1 して再試行） ─────────────────────
function listen(port, attemptsLeft = 10) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`[warn] :${port} は使用中。:${port + 1} を試します`);
      setTimeout(() => listen(port + 1, attemptsLeft - 1), 0);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.listen(port, opts.host, () => {
    const urlStr = `http://${opts.host}:${port}/`;
    console.log(`\n  ema view\n  ─────────────────────────────────`);
    console.log(`  配信元 : ${ROOT}`);
    console.log(`  URL    : ${urlStr}`);
    console.log(`  停止   : Ctrl+C\n`);
    if (opts.open) openBrowser(urlStr);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch { /* 開けなくても致命的ではない */ }
}

export const help = `ema view — ローカル ADR ビューア（外部依存ゼロ）

使い方:
  ema view [dir] [options]

引数:
  dir              配信する ADR ディレクトリ（既定: adr があればそれ、なければ .）

オプション:
  --port N         ポート番号（既定: 4173、使用中なら +1 して再試行）
  --host H         バインドするホスト（既定: 127.0.0.1）
  --no-open        起動時にブラウザを開かない
  -h, --help       このヘルプ`;

function printHelp() { console.log(help); }

// サーバを起動する（長時間稼働するため通常は解決しない）。
// 引数エラー時のみ終了コード（2）を返して即座に戻る。
export async function run(argv = []) {
  opts = { dir: null, port: 4173, open: true, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') opts.open = false;
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '-h' || a === '--help') { printHelp(); return 0; }
    else if (!a.startsWith('-')) opts.dir = a;
    else { console.error(`unknown option: ${a}`); return 2; }
  }

  // ディレクトリ既定値: 引数 > cwd から上り探索した docs/decisions/ > ツールリポジトリの docs/decisions/
  ROOT = findAdrDir(opts.dir);
  if (!existsSync(ROOT)) {
    console.error(`ADR ディレクトリが見つかりません: ${ROOT}`);
    return 1;
  }

  startWatch();
  listen(opts.port);
  // サーバが稼働し続けるため、ここでは解決しない Promise を返す。
  return new Promise(() => {});
}

// 直接起動された場合のみ実行（ema 経由では import されるだけ）。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = (await run(process.argv.slice(2))) ?? 0;
}

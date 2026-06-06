// render — ADR 正本 Markdown → デザインシステム HTML の純粋変換ロジック
//
// 副作用なし（ファイル IO・引数解析を含まない）。CLI 層（src/commands/gen.mjs）と
// テスト（test/render.test.mjs）の双方から import される「継ぎ目（seam）」。
// 外部依存ゼロ（Node 標準のみ）。規約記法の仕様は docs/format.md を参照。

// ── HTML エスケープ ──────────────────────────────────────────
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── Status ラベル ────────────────────────────────────────────
export const STATUS_LABEL = {
  proposed: 'Proposed', accepted: 'Accepted', deprecated: 'Deprecated',
  superseded: 'Superseded', rejected: 'Rejected',
};
export const STATUS_VALID = Object.keys(STATUS_LABEL);

// ── インライン記法（**bold** *italic* `code` [t](u)） ────────
// コードスパンは esc・装飾の適用前に私用面センチネル N へ退避する。
// 私用面文字は通常の ADR 本文に現れないため、裸の数字 " 3 " 等との誤マッチを起こさない。
export function inline(src) {
  if (src == null) return '';
  const codes = [];
  let s = String(src).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `${codes.length - 1}`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/(\d+)/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  return s;
}

// 見出し等から HTML タグを抜いたプレーン文字列（<title> 用）
export const plain = (src) => String(src ?? '')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

// ── frontmatter（YAML サブセット） ──────────────────────────
export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: text };
  const fmRaw = text.slice(3, end).replace(/^\n/, '');
  const body = text.slice(end + 4).replace(/^\n/, '');
  const meta = {};
  const lines = fmRaw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val === '|' || val === '>') {
      // ブロックスカラー（インデントされた後続行を連結）
      const buf = [];
      while (i + 1 < lines.length && (/^\s{2,}/.test(lines[i + 1]) || lines[i + 1] === '')) {
        buf.push(lines[++i].replace(/^\s{2}/, ''));
      }
      meta[key] = buf.join(val === '|' ? '\n' : ' ').trim();
    } else if (/^\[.*\]$/.test(val.trim())) {
      meta[key] = val.trim().slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
    } else {
      meta[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body };
}

// ── ブロック解析 ─────────────────────────────────────────────
const CALLOUT = {
  SUCCESS: { cls: 'success', icon: '✓' },
  WARNING: { cls: 'warning', icon: '!' },
  DANGER: { cls: 'danger', icon: '✕' },
  NOTE: { cls: 'note', icon: 'i' },
  INFO: { cls: 'info', icon: 'i' },
  TIP: { cls: 'tip', icon: '★' },
};
const MARK = { yes: 'yes', no: 'no', mid: 'mid', na: 'na' };

export function renderBlocks(body) {
  const lines = body.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) { i++; continue; }

    // フェンスコード ``` lang
    let m = /^```(\S*)\s*$/.exec(line);
    if (m) {
      const lang = m[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // 閉じる ```
      const code = buf.join('\n');
      if (lang === '=html') {
        out.push(code); // 生 HTML パススルー（リッチ図エスケープハッチ）
      } else {
        out.push(`<figure class="code-block">\n<pre><code class="language-${lang || 'text'}">${esc(code)}</code></pre>\n</figure>`);
      }
      continue;
    }

    // 生 HTML ブロック（行頭が < で既知ブロック要素）
    if (/^<(div|table|figure|section|aside|ul|ol|p|h[1-6]|hr|svg|details)\b/.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '') buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }

    // 見出し  ## Title {#id}
    m = /^(#{2,4})\s+(.*?)(?:\s+\{#([\w-]+)\})?\s*$/.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2];
      const id = m[3] || slugify(text);
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // 水平線
    if (/^---+\s*$/.test(line)) { out.push('<hr />'); i++; continue; }

    // callout  > [!TYPE] Title  /  引用ブロック
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(renderCallout(buf));
      continue;
    }

    // テーブル（| を含み、次行が区切り）
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]+$/.test(lines[i + 1])) {
      const tbl = [];
      while (i < lines.length && lines[i].includes('|')) tbl.push(lines[i++]);
      out.push(renderTable(tbl));
      continue;
    }

    // リスト  - item（1段ネスト対応）
    if (/^(\s*)[-*]\s+/.test(line)) {
      const { html, next } = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // 段落（空行まで連結）
    const buf = [];
    while (i < lines.length && lines[i].trim() !== ''
      && !/^(#{2,4}\s|>\s?|```|---+\s*$|<(div|table|figure|section|aside|ul|ol|p|h[1-6]|hr|svg|details)\b)/.test(lines[i])
      && !/^(\s*)[-*]\s+/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n\n');
}

export function slugify(text) {
  const t = plain(text).toLowerCase()
    .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return t || 'section';
}

function renderList(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = /^(\s*)[-*]\s+(.*)$/.exec(lines[i]);
    if (!m) {
      if (lines[i].trim() === '') break;
      // リスト項目の継続行
      if (items.length && /^\s+\S/.test(lines[i])) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue; }
      break;
    }
    items.push({ indent: m[1].length, text: m[2] });
    i++;
  }
  // 1 段ネスト
  let html = '<ul>\n';
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.indent > 0) continue; // 子は親側で処理
    const children = [];
    let j = k + 1;
    while (j < items.length && items[j].indent > 0) { children.push(items[j]); j++; }
    if (children.length) {
      html += `<li>${inline(it.text)}\n<ul>\n${children.map((c) => `<li>${inline(c.text)}</li>`).join('\n')}\n</ul>\n</li>\n`;
      k = j - 1;
    } else {
      html += `<li>${inline(it.text)}</li>\n`;
    }
  }
  html += '</ul>';
  return { html, next: i };
}

function renderCallout(buf) {
  const first = buf[0] ?? '';
  const m = /^\[!(\w+)\]\s*(.*)$/.exec(first);
  if (!m) {
    // ただの引用 → note 扱い
    return `<blockquote>${inline(buf.join(' '))}</blockquote>`;
  }
  const type = CALLOUT[m[1].toUpperCase()] || CALLOUT.NOTE;
  const title = m[2].trim();
  const rest = buf.slice(1);
  // 本文とリストを分離して描画
  const bodyHtml = renderBlocks(rest.join('\n'));
  const titleHtml = title ? `<p class="callout-title">${inline(title)}</p>\n` : '';
  return `<div class="callout callout--${type.cls}">
  <span class="callout-icon">${type.icon}</span>
  <div class="callout-body">
${titleHtml}${bodyHtml}
  </div>
</div>`;
}

function splitRow(row) {
  return row.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
    .split('|').map((c) => c.trim());
}

export function renderTable(tbl) {
  const header = splitRow(tbl[0]);
  const rows = tbl.slice(2).map(splitRow); // [1] は区切り
  // 推奨列の検出：ヘッダセルに [*] マーカー
  const recCol = header.findIndex((h) => /\[\*\]/.test(h));
  const cell = (text, col, isHead) => {
    const rec = col === recCol ? ' is-recommended' : '';
    // [*] は推奨列マーカー。ヘッダからのみ除去する（本文セルでは `[*]` を
    // 含むコードスパン等を壊さないようリテラル扱い）。
    const t = isHead ? text.replace(/\[\*\]/g, '').trim() : text.trim();
    if (isHead) {
      const cls = [col > 0 ? 'center' : '', col === recCol ? 'is-recommended' : ''].filter(Boolean).join(' ');
      return cls ? `<th class="${cls}">${inline(t)}</th>` : `<th>${inline(t)}</th>`;
    }
    if (MARK[t]) {
      return `<td class="center${rec}"><span class="cmp-mark cmp-mark--${MARK[t]}"></span></td>`;
    }
    const cls = [col > 0 ? 'center' : '', col === recCol ? 'is-recommended' : ''].filter(Boolean).join(' ');
    return cls ? `<td class="${cls}">${inline(t)}</td>` : `<td>${inline(t)}</td>`;
  };
  const thead = `<thead>\n<tr>${header.map((h, c) => cell(h, c, true)).join('')}</tr>\n</thead>`;
  const tbody = `<tbody>\n${rows.map((r) =>
    `<tr>${r.map((c, ci) => cell(c, ci, false)).join('')}</tr>`).join('\n')}\n</tbody>`;
  return `<div class="table-wrap">\n<table class="table">\n${thead}\n${tbody}\n</table>\n</div>`;
}

// ── frontmatter → ページ ─────────────────────────────────────
function frontmatterFields(meta) {
  const f = [];
  f.push(field('ADR', `<span class="adr-frontmatter__value mono">${esc(meta.adr ?? '')}</span>`));
  const st = String(meta.status || 'proposed').toLowerCase();
  f.push(field('Status', `<span class="adr-frontmatter__value"><span class="badge status-${st}">${STATUS_LABEL[st] || st}</span></span>`));
  f.push(field('Date', `<span class="adr-frontmatter__value mono">${esc(meta.date ?? '')}</span>`));
  if (meta.deciders) f.push(field('Deciders', `<span class="adr-frontmatter__value">${inline(meta.deciders)}</span>`));
  // 任意の関連フィールド
  for (const [key, label] of [['revises', 'Revises'], ['follow_up', 'Follow-up'], ['superseded_by', 'Superseded by']]) {
    if (meta[key]) f.push(field(label, `<span class="adr-frontmatter__value">${inline(meta[key])}</span>`));
  }
  const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []);
  if (tags.length) {
    f.push(`      <div class="adr-frontmatter__field adr-frontmatter__field--tags">
        <span class="adr-frontmatter__key">Tags</span>
        <span class="adr-frontmatter__value">
${tags.map((t) => `          <span class="badge badge--no-dot">${esc(t)}</span>`).join('\n')}
        </span>
      </div>`);
  }
  return f.join('\n');
}
const field = (key, valueSpan) => `      <div class="adr-frontmatter__field">
        <span class="adr-frontmatter__key">${esc(key)}</span>
        ${valueSpan}
      </div>`;

const stripParen = (s) => s ? String(s).replace(/[（(].*?[）)]/g, '').trim() : '';

export function buildPage(meta, contentHtml) {
  const num = meta.adr ? `ADR-${meta.adr}` : 'ADR';
  const titlePlain = plain(meta.title || '');
  const maintainer = meta.maintainer || stripParen(meta.deciders) || '';
  const footer = (meta.date || maintainer) ? `
    <hr />
    <p class="muted" style="font-size:var(--fs-sm)">
      ${meta.date ? `Last updated: <span class="mono">${esc(meta.date)}</span>` : ''}${meta.date && maintainer ? ' ·\n      ' : ''}${maintainer ? `Maintainer: <span class="mono">${esc(maintainer)}</span>` : ''}
    </p>` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(num)} · ${esc(titlePlain)}</title>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />

<link rel="stylesheet" href="assets/tokens.css" />
<link rel="stylesheet" href="assets/components.css" />

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markdown.min.js"></script>

<style>
  .doc-header { max-width: 1200px; margin: 0 auto; padding: var(--sp-10) var(--sp-8) var(--sp-4); }
  .doc-header__breadcrumb { display: flex; gap: var(--sp-2); align-items: center; font-size: var(--fs-xs); color: var(--color-text-muted); letter-spacing: var(--tracking-caps); text-transform: uppercase; font-weight: var(--fw-medium); margin-bottom: var(--sp-3); }
  .doc-header__breadcrumb a { color: inherit; }
  .doc-header__breadcrumb span { opacity: 0.4; }
  .doc-header h1 { font-size: var(--fs-3xl); font-weight: var(--fw-semibold); letter-spacing: var(--tracking-tight); line-height: 1.15; margin: 0 0 var(--sp-3); }
  .doc-header h1 .num { font-family: var(--font-mono); color: var(--color-text-faint); font-weight: var(--fw-medium); margin-right: var(--sp-3); }
  .doc-header .lead { max-width: none; font-size: var(--fs-lg); line-height: 1.7; }
  .adr-frontmatter__field--tags { grid-column: 1 / -1; }
  .adr-frontmatter__field--tags .adr-frontmatter__value { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
</style>
</head>
<body>

<header class="doc-header">
  <div class="doc-header__breadcrumb">
    <a href="index.html">Engineering Docs</a>
    <span>/</span>
    <a href="index.html">ADRs</a>
    <span>/</span>
    <span style="opacity:1;color:var(--color-text-secondary)">${esc(meta.adr ?? '')}</span>
  </div>
  <h1><span class="num">${esc(num)}</span>${inline(meta.title || '')}</h1>
  ${meta.lead ? `<p class="lead">${inline(meta.lead)}</p>` : ''}
</header>

<div class="doc-shell">
  <aside class="doc-toc" id="toc">
    <p class="doc-toc-label">On this page</p>
  </aside>

  <main class="doc-main prose" id="content">

    <div class="adr-frontmatter">
${frontmatterFields(meta)}
    </div>

${contentHtml}
${footer}
  </main>
</div>

<script src="assets/components.js"></script>
<script>
  window.addEventListener('load', function () {
    DocsADR.initAll({ toc: { container: '#toc', content: '#content', selector: 'h2, h3' } });
  });
</script>
</body>
</html>
`;
}

// ── 1 ファイル変換 ───────────────────────────────────────────
export function mdToHtml(text) {
  const { meta, body } = parseFrontmatter(text);
  const content = renderBlocks(body);
  return buildPage(meta, content);
}

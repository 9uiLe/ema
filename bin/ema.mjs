#!/usr/bin/env node
// ema — ADR ワークフローの統一 CLI（ディスパッチャ）
//
// 流暢性の罠を断つ ADR ワークフローを、1つのコマンドから操作する入口。
// 各サブコマンドの実体は src/commands/<cmd>.mjs に置き（情報隠蔽: Parnas 1972 / SRP: Martin 2017）、
// このファイルは「どのサブコマンドに渡すか」と「自己記述（help）」だけを担う薄い層。
// 変換ロジックは src/render.mjs（node:test で被覆）。外部依存ゼロ。
//
// 使い方:
//   ema <command> [args...]
//   ema help            # サブコマンド一覧
//   ema <command> -h    # 各コマンドのヘルプ
//
// 直接起動: node bin/ema.mjs <command> [args...]

import { run as runNew } from '../src/commands/new.mjs';
import { run as runGen } from '../src/commands/gen.mjs';
import { run as runLint } from '../src/commands/lint.mjs';
import { run as runView } from '../src/commands/view.mjs';

// サブコマンド表（順序＝help 表示順）。
const COMMANDS = [
  { name: 'new', run: runNew, summary: '次番号の ADR をテンプレから作成（採番＋固定/反証スロット）' },
  { name: 'gen', run: runGen, summary: 'Markdown 正本 → レビュー用 HTML を生成（--check で CI 検証）' },
  { name: 'lint', run: runLint, summary: '固定スロット・反証スロットの充足を検査' },
  { name: 'view', run: runView, summary: 'ローカルビューアを起動（ライブリロード／承認はここで行う）' },
];

function usage() {
  const rows = COMMANDS.map((c) => `  ${c.name.padEnd(7)}${c.summary}`).join('\n');
  return `ema — ADR ワークフローの統一 CLI（外部依存ゼロ）

使い方:
  ema <command> [args...]

コマンド:
${rows}
  help   このヘルプ

例:
  ema new "キャッシュ層の導入" cache-layer
  ema lint
  ema gen --check
  ema view

各コマンドの詳細:  ema <command> --help`;
}

// 終了コードを返す（0=成功 / 1=コマンド失敗 / 2=使い方の誤り）。
async function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    // help <command> なら当該コマンドのヘルプに委譲。
    const sub = rest[0] && COMMANDS.find((c) => c.name === rest[0]);
    if (sub) return (await sub.run(['--help'])) ?? 0;
    console.log(usage());
    return 0;
  }

  const entry = COMMANDS.find((c) => c.name === cmd);
  if (!entry) {
    console.error(`不明なコマンド: ${cmd}\n`);
    console.error(usage());
    return 2;
  }
  return (await entry.run(rest)) ?? 0;
}

process.exitCode = (await main(process.argv.slice(2))) ?? 0;

#!/usr/bin/env node
/**
 * CLI entry point.
 *
 *   aether                 interactive terminal UI
 *   aether --auto          auto-play (no keyboard needed)
 *   aether --plain         same UI, but printed without the alternate screen
 *   aether --frames 4      render 4 frames and exit (layout preview / CI)
 *   aether --headless      plain-text end-to-end report (screen recording)
 *   aether --help
 */
import { TuiApp } from './tui/app.js';
import { runHeadless } from './demo.js';
import { style } from './tui/ansi.js';

interface Args {
  auto: boolean;
  plain: boolean;
  headless: boolean;
  frames?: number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { auto: false, plain: false, headless: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-a':
      case '--auto':
        args.auto = true;
        break;
      case '-p':
      case '--plain':
        args.plain = true;
        break;
      case '--headless':
      case '--demo':
        args.headless = true;
        break;
      case '-f':
      case '--frames': {
        const next = Number(argv[++i]);
        args.frames = Number.isFinite(next) && next > 0 ? Math.floor(next) : 3;
        break;
      }
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

const HELP = `
${style.bold}${style.cyan}AetherHarness / DSH-Orchestrator${style.reset}
Multi-agent self-healing orchestration & trustworthy scheduling — terminal UI.

${style.bold}Usage${style.reset}
  node dist/src/cli.js [options]

${style.bold}Options${style.reset}
  (none)          interactive TUI (alternate screen)
  -a, --auto      auto-play: run every task, auto-resolve the escalation card
  -p, --plain     render the UI without the alternate screen (pipe-friendly)
  -f, --frames N  render N frames to stdout and exit (layout preview)
      --headless  plain-text end-to-end report (same engine, no TUI)
  -h, --help      this message

${style.bold}Keys${style.reset}
  ↑ / ↓           move in a list
  ⏎               run the selected task
  a               run all tasks concurrently (scheduler contention + escalation)
  ← / →           switch between runs
  e               focus the escalation card
  b / esc         back to the task menu
  q               quit
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  if (args.headless) {
    process.exit(await runHeadless());
    return;
  }

  const app = new TuiApp({ auto: args.auto, plain: args.plain, frames: args.frames });
  await app.start();
}

main().catch(err => {
  process.stderr.write(`\nstartup failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});

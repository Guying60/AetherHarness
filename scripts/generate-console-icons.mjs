#!/usr/bin/env node
/**
 * Regenerate `src/web/icons.ts` from a Framelink Figma export.
 *
 * The console design ships one SVG per icon node. This script normalises the
 * monochrome ones to `currentColor` (so nav/active states recolour via CSS) and
 * keeps the decorative "chip" icons byte-identical to the design (they carry
 * their own background rect + palette).
 *
 *   node scripts/generate-console-icons.mjs <assets-dir> <out-file>
 *
 * Every edit is deterministic: re-running against the same export is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [assets, out] = process.argv.slice(2);
if (!assets || !out) {
  console.error('usage: node scripts/generate-console-icons.mjs <assets-dir> <out-file>');
  process.exit(1);
}

/** node id -> [icon name, mode].  mode "mono" recolours via currentColor. */
const MAP = {
  '9:444': ['navWorkbench', 'mono'],
  '9:449': ['navRuns', 'mono'],
  '9:454': ['navAgents', 'mono'],
  '9:459': ['navTeams', 'mono'],
  '9:464': ['navWorkflows', 'mono'],
  '9:469': ['navDelivery', 'mono'],
  '9:474': ['navSettings', 'mono'],
  '9:19': ['refresh', 'mono'],
  '9:24': ['play', 'mono'],
  '9:412': ['chevronRight', 'mono'],
  '9:432': ['signOut', 'mono'],
  '9:55': ['chevronDown', 'mono'],
  '9:51': ['selectCaret', 'mono'],
  '9:79': ['send', 'mono'],
  '9:93': ['arrowRight', 'mono'],
  '9:45': ['branch', 'mono'],
  '9:65': ['flag', 'mono'],
  '9:230': ['queue', 'mono'],
  '9:241': ['trendUp', 'mono'],
  '9:253': ['gauge', 'mono'],
  '9:401': ['playSmall', 'mono'],
  '9:31': ['repoChip', 'raw'],
  '9:391': ['terminalChip', 'raw'],
  '9:423': ['avatarChip', 'raw'],
  '9:428': ['gearChip', 'raw']
};

const normalise = svg => {
  // Drop intrinsic size so CSS controls it; keep the viewBox for aspect ratio.
  let out = svg
    .replace(/<svg([^>]*?)width="[^"]*"/, '<svg$1')
    .replace(/(<svg[^>]*?)height="[^"]*"/, '$1')
    .replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  if (!/\sclass="/.test(out.slice(0, out.indexOf('>')))) {
    out = out.replace('<svg', '<svg class="ico"');
  }
  return out;
};

const mono = svg =>
  normalise(svg)
    .replace(/(fill|stroke)="#[0-9A-Fa-f]{3,8}"/g, '$1="currentColor"')
    .replace(/\sfill="none"/g, ' fill="none"');

const parts = [];
for (const [nodeId, [name, mode]] of Object.entries(MAP)) {
  const file = join(assets, `icon_${nodeId.replace(':', '_')}.svg`);
  const svg = readFileSync(file, 'utf8').trim();
  parts.push(`  /** Figma node ${nodeId} */\n  ${name}: ${quote(mode === 'mono' ? mono(svg) : normalise(svg))},`);
}

function quote(value) {
  // Single-quoted TS string keeps the SVG free of escaping.
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '')}'`;
}

const body = `/**
 * Console icon set — GENERATED FILE, do not edit by hand.
 *
 * Source: Figma export (framelink) node ids listed per icon.
 * Regenerate: node scripts/generate-console-icons.mjs <assets-dir> src/web/icons.ts
 *
 * Monochrome icons are normalised to \`currentColor\` so a single asset serves
 * both the idle (#64748b) and active (#4338ca) nav states. Decorative chips keep
 * their own background rect and palette.
 */

export const ICONS = {
${parts.join('\n')}
} as const;

export type IconName = keyof typeof ICONS;

/** Inline <span> wrapper; icons are 1em and inherit the surrounding colour. */
export function icon(name: IconName, extraClass = ''): string {
  return '<span class="ico-wrap' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true">' + ICONS[name] + '</span>';
}
`;

writeFileSync(out, body, 'utf8');
console.log(`wrote ${out} (${body.length} bytes, ${Object.keys(MAP).length} icons)`);

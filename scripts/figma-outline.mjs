#!/usr/bin/env node
/**
 * Condense a Framelink Figma export into a readable layout outline.
 *
 *   node scripts/figma-outline.mjs <design-dir> [--max-depth=N]
 *
 * Writes `<design-dir>/outline.txt`: one line per node with the numbers that
 * matter when translating to CSS (box, flex mode, padding, gap, fill, radius,
 * shadow) and, for text nodes, the typography. Structural FRAMEs are labelled
 * by their Figma layer name, which is what makes the hierarchy navigable.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/figma-outline.mjs <design-dir> [--max-depth=N]');
  process.exit(1);
}
const maxDepth = Number((process.argv.find(a => a.startsWith('--max-depth=')) ?? '').split('=')[1]) || 99;
const file = readdirSync(dir).find(f => f.endsWith('.json'));
if (!file) throw new Error(`no *.json export in ${dir}`);
const exported = JSON.parse(readFileSync(join(dir, file), 'utf8'));
const rootKey = Object.keys(exported.nodes)[0];
const doc = exported.nodes[rootKey].document;
const assets = exported.framelinkExport.assets ?? {};

const hex = c => c
  ? '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  : '';
const paint = list => !list?.length ? '' : list
  .filter(p => p.visible !== false)
  .map(p => p.type === 'SOLID' ? hex(p.color) + (p.opacity !== undefined && p.opacity < 1 ? '@' + p.opacity : '')
    : p.type?.startsWith('GRADIENT') ? 'grad[' + (p.gradientStops ?? []).map(s => hex(s.color)).join('>') + ']'
      : p.type === 'IMAGE' ? 'img' : p.type)
  .join('|');

const lines = [];
const walk = (node, depth) => {
  const box = node.absoluteBoundingBox ?? {};
  let line = '  '.repeat(depth) + `${node.type}${node.id} "${node.name}" ` +
    `[${Math.round(box.x ?? 0)},${Math.round(box.y ?? 0)} ${Math.round(box.width ?? 0)}×${Math.round(box.height ?? 0)}]`;
  const fill = paint(node.fills);
  if (fill) line += ` bg=${fill}`;
  const stroke = paint(node.strokes);
  if (stroke) line += ` line=${stroke}/${node.strokeWeight ?? 1}`;
  if (node.cornerRadius !== undefined) line += ` r=${node.cornerRadius}`;
  if (node.layoutMode) line += ` flex=${node.layoutMode}${node.itemSpacing ? ' gap=' + Math.round(node.itemSpacing) : ''}`;
  const pad = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map(v => Math.round(v ?? 0));
  if (pad.some(v => v)) line += ` pad=${pad.join(',')}`;
  if (node.opacity !== undefined && node.opacity < 1) line += ` op=${node.opacity}`;
  const effects = (node.effects ?? []).filter(e => e.visible !== false);
  if (effects.length) line += ' fx=' + effects.map(e => `${e.type.replace(/_SHADOW|_BLUR/g, '').toLowerCase()}:${e.radius ?? 0}`).join(',');
  if (node.type === 'TEXT') {
    const s = node.style ?? {};
    line += ` TEXT("${String(node.characters ?? '').replace(/\s+/g, ' ') }") ${s.fontWeight ?? ''}/${s.fontSize ?? ''}px` +
      (s.lineHeightPx ? ` lh=${Math.round(s.lineHeightPx)}` : '') +
      (s.letterSpacing ? ` ls=${s.letterSpacing.toFixed(2)}` : '') +
      ` color=${hex(s.fills?.[0]?.color)}`;
  }
  if (assets[node.id]) line += ` ASSET=${assets[node.id].svg ?? assets[node.id].image ?? ''}`;
  lines.push(line);
  if (depth >= maxDepth) return;
  for (const child of node.children ?? []) walk(child, depth + 1);
};

lines.push(`FRAME ${rootKey} "${doc.name}" ${Math.round(doc.absoluteBoundingBox.width)}×${Math.round(doc.absoluteBoundingBox.height)}`);
walk(doc, 0);
const out = join(dir, 'outline.txt');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${out} (${lines.length} nodes)`);

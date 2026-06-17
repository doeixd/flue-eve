import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const contentDir = join(dir, 'content/docs');
const publicDir = join(dir, 'public');
const outPath = join(publicDir, 'llms.txt');

function walk(dirPath) {
  const entries = [];
  for (const name of readdirSync(dirPath)) {
    const full = join(dirPath, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walk(full));
    } else if (name.endsWith('.mdx')) {
      entries.push(full);
    }
  }
  return entries;
}

const files = walk(contentDir);
const lines = [];

lines.push('# flue-eve Documentation');
lines.push('');
lines.push(`> Total: ${files.length} pages`);
lines.push('');

for (const file of files) {
  const rel = relative(contentDir, file);
  const url = '/docs/' + rel.replace(/\\/g, '/').replace(/\.mdx$/, '');
  const content = readFileSync(file, 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const title = frontmatter
    ? frontmatter[1].match(/title:\s*(.+)/)?.[1]?.trim() ?? rel
    : rel;
  const desc = frontmatter
    ? frontmatter[1].match(/description:\s*(.+)/)?.[1]?.trim() ?? ''
    : '';

  lines.push(`## ${title}`);
  if (desc) lines.push(`> ${desc}`);
  lines.push(`URL: ${url}`);
  lines.push('');
}

writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log(`Generated ${outPath} (${files.length} pages)`);

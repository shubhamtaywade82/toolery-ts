// scripts/pack-check.mjs — assert the npm tarball actually contains the runtime files.
//
// Why: `npm pack --dry-run` exits 0 even when `dist/` is missing (it happily
// packs a 6-file tarball with no bin), so a plain `npm pack --dry-run` smoke
// test cannot catch broken builds. This script parses the JSON manifest and
// fails loudly on missing artifacts.
//
// Usage:
//   node scripts/pack-check.mjs                    # CI-safe: dist + license/docs required
//   node scripts/pack-check.mjs --require-upstream # additionally require the synced
//                                                  # 143-scenario vendor suite (prepublishOnly)
import { execFileSync } from 'node:child_process';

const requireUpstream = process.argv.includes('--require-upstream');

const required = [
  'dist/cli.js',   // bin entry (package.json "bin")
  'dist/index.js', // main entry (package.json "main")
  'dist/index.d.ts',
  'LICENSE',
  'README.md',
];

const upstreamRequired = ['vendor/toolery-upstream/manifest.json'];

let files;
try {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  files = JSON.parse(output)[0].files.map((f) => f.path);
} catch (error) {
  console.error(`pack:check failed — could not run 'npm pack --dry-run --json': ${error.message}`);
  process.exit(1);
}

const mustHave = requireUpstream ? [...required, ...upstreamRequired] : required;
const missing = mustHave.filter((f) => !files.includes(f));

if (missing.length > 0) {
  console.error('pack:check FAILED — tarball is missing required files:');
  for (const f of missing) console.error(`  - ${f}`);
  console.error('A stale or absent build is the usual cause. Try: rm -rf dist *.tsbuildinfo && npm run build');
  if (requireUpstream) console.error('--require-upstream: run npm run sync:upstream before publishing.');
  process.exit(1);
}

const upstreamCount = files.filter((f) => f.startsWith('vendor/toolery-upstream/') && f.endsWith('.yaml')).length;
console.log(`pack:check OK — ${files.length} files; bin + main entries present${requireUpstream ? `; upstream suite: ${upstreamCount} YAML files + manifest` : `; vendor YAMLs present: ${upstreamCount} (not required in this mode)`}.`);

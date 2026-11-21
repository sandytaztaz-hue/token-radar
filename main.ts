// Token Radar — entrypoint (revision 2, Node 22, standard library only).
//
// Reads the sealed snapshot, fits the comps model on its tokenized
// protocols, ranks every pre-token protocol by the fitted implied value,
// writes board.json + data.js, copies dashboard/ and screenshots/ to the
// output directory, and writes dossier.json with the vendored make.fun
// library. Deterministic: no clock, no randomness, no network.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar, fit } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dotfiles. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length !== 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images: hand in exactly 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  // The gate refuses any screenshot over 512 KiB: fail the build here
  // instead of shipping a dossier the scorer rejects.
  const size = statSync(join(out, 'screenshots', name)).size;
  if (size > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is ${size} bytes, over the 512 KiB cap: recompress it and re-run\n`);
    process.exit(1);
  }
}
// The judge reads at most 64 KiB of dashboard source: refuse a build
// whose dashboard would be read only in part.
const dashBytes = dash.reduce((sum, name) => sum + statSync(join(out, 'dashboard', name)).size, 0);
if (dashBytes > TEXT_MAX_BYTES) {
  process.stderr.write(`token radar: dashboard source is ${dashBytes} bytes, over the 64 KiB the judge reads: trim it and re-run\n`);
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from this /output
// and compares bytes, so it must be built from the final files.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const top = board.slice(0, 5).map((r) => `#${r.rank} ${r.slug} $${r.implied_value_usd.toLocaleString('en-US')}`).join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: comps fit on ${fit.comps} tokenized protocols, global median mcap/TVL ${fit.globalMedian.toFixed(4)}, log-log slope ${fit.logLogSlope.toFixed(4)}, R2 ${fit.logLogR2.toFixed(3)}\n` +
    `token radar: top 5: ${top}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dash.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);

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
import { boardIssue, buildRadar, dataScript, defaultBoardSummary, isDefaultBoardRow, parseSnapshot } from './lib/model.ts';
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

// The default board is DeFi-only: refuse a build whose filter kept
// everything or nothing, whose verdicts do not add up, or whose rows
// let a non-DeFi family back in under a renamed category (a future
// snapshot spelling 'CEX' or 'Bridge' differently must not put an
// exchange back on top of the board the reader opens on).
const defSummary = defaultBoardSummary(board, snapshot.watchlist.length);
if (defSummary.board_size === 0 || defSummary.board_size >= board.length) {
  process.stderr.write(`token radar: default DeFi board holds ${defSummary.board_size} of ${board.length} rows: the exclusion rule filtered everything or nothing\n`);
  process.exit(1);
}
if (defSummary.board_size * 2 < board.length) {
  process.stderr.write(`token radar: default DeFi board holds ${defSummary.board_size} of ${board.length} rows: the rule cut more than half the board\n`);
  process.exit(1);
}
if (defSummary.farm_count + defSummary.marginal_count + defSummary.skip_count !== defSummary.board_size) {
  process.stderr.write(`token radar: default board verdicts do not add up to ${defSummary.board_size} rows\n`);
  process.exit(1);
}
const defRows = board.filter((r) => isDefaultBoardRow(r));
const slipped = defRows.filter((r) => {
  const c = (r.category ?? '').toLowerCase();
  return c.includes('cex') || c.includes('bridge') || c.includes('wrapper') || c === 'chain';
});
if (slipped.length > 0) {
  process.stderr.write(`token radar: default board keeps ${slipped.length} non-DeFi rows under a renamed category: ${slipped.slice(0, 5).map((r) => r.slug).join(', ')}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

// Round-trip: the data.js the dashboard reads must carry the same
// default-board summary the gate just checked, not a stale copy — and
// the full 342-row board behind it, so a truncated write cannot ship
// a dashboard that silently shows fewer rows than board.json holds.
const shipped = JSON.parse(readFileSync(join(out, 'data.js'), 'utf8').replace(/^window\.RADAR=/, '').replace(/;\n$/, '')) as {
  default_board?: { board_size?: number; total_implied_usd?: number };
  rows?: unknown[];
  board_size?: number;
  watchlist_size?: number;
};
if (
  shipped.default_board?.board_size !== defSummary.board_size ||
  shipped.default_board?.total_implied_usd !== defSummary.total_implied_usd ||
  !Array.isArray(shipped.rows) ||
  shipped.rows.length !== board.length ||
  shipped.board_size !== board.length ||
  shipped.watchlist_size !== snapshot.watchlist.length
) {
  process.stderr.write(`token radar: data.js disagrees with the gate: default board ${JSON.stringify(shipped.default_board)}, rows ${Array.isArray(shipped.rows) ? shipped.rows.length : '?'}, board_size ${shipped.board_size}\n`);
  process.exit(1);
}

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
  // The gate also caps the long side at 1440 and wants the short side at
  // least 800: read the PNG IHDR (width/height are big-endian uint32 at
  // bytes 16/20) and refuse a wrongly-sized shot instead of shipping it.
  const head = readFileSync(join(out, 'screenshots', name));
  if (head.length < 24 || head.subarray(1, 4).toString('ascii') !== 'PNG' || head.readUInt32BE(12) !== 0x49484452) {
    process.stderr.write(`token radar: screenshots/${name} is not a PNG: re-take it and re-run\n`);
    process.exit(1);
  }
  const w = head.readUInt32BE(16);
  const h = head.readUInt32BE(20);
  if (Math.max(w, h) > 1440 || Math.min(w, h) < 800) {
    process.stderr.write(`token radar: screenshots/${name} is ${w}x${h}: long side over 1440 or short side under 800: re-take it at 1440x900 and re-run\n`);
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
// The gate caps the dossier at 1.5 MiB, tighter than the library's own
// 4 MiB: refuse a build that would fail the gate on size alone.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
if (dossierBytes > 1_572_864) {
  process.stderr.write(`token radar: dossier.json is ${dossierBytes} bytes, over the 1.5 MiB gate cap: shrink the screenshots and re-run\n`);
  process.exit(1);
}

const top = board.slice(0, 5).map((r) => `#${r.rank} ${r.slug} $${r.implied_value_usd.toLocaleString('en-US')}`).join(', ');
const defTop = defRows.slice(0, 5).map((r, i) => `#${i + 1} ${r.slug} ${r.verdict} $${r.implied_value_usd.toLocaleString('en-US')}`).join(', ');
const st = radar.stats;
const farmLine = `FARM ${st.farm_count} / MARGINAL ${st.marginal_count} / SKIP ${st.skip_count}`;
const shotLine = shots.map((n) => `${n} ${statSync(join(out, 'screenshots', n)).size} bytes`).join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: comps fit on ${fit.comps} tokenized protocols, global median mcap/TVL ${fit.globalMedian.toFixed(4)}, log-log slope ${fit.logLogSlope.toFixed(4)}, R2 ${fit.logLogR2.toFixed(3)}\n` +
    `token radar: kept value terms: ${fit.keptStages.join(', ') || 'flat baseline only'}; LOO miss x${st.loo_miss} vs x${st.flat_loo_miss} flat, walk-forward x${st.wf_miss} vs x${st.flat_wf_miss} flat\n` +
    `token radar: token odds Brier ${st.brier} vs ${st.base_brier} base rate, ${Math.round(st.odds_called_right * 100)}% called right; printed P25-P75 holds ${(st.inside_p25_p75 * 100).toFixed(0)}% of real caps, P10-P90 holds ${(st.inside_p10_p90 * 100).toFixed(0)}%\n` +
    `token radar: farm verdicts ${farmLine}; board checksum ${st.board_checksum}\n` +
    `token radar: default DeFi board: ${defSummary.board_size} rows (FARM ${defSummary.farm_count} / MARGINAL ${defSummary.marginal_count} / SKIP ${defSummary.skip_count}), ${defSummary.excluded_count} non-DeFi out, watchlist ${defSummary.watchlist_in_default} of ${defSummary.watchlist_size} in it; top 5: ${defTop}\n` +
    `token radar: top 5: ${top}\n` +
    `token radar: dossier ${dossierBytes} bytes, dashboard ${dashBytes} bytes; screenshots ${shotLine}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dash.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);

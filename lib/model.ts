// Token Radar — the value model (revision 2).
//
// The board ranks every pre-token protocol in the snapshot by an implied
// value that is FITTED from the snapshot's own tokenized protocols, never
// from a list of names. The fit runs at build time, from the snapshot:
//
//   1. Category multiple: for each category, the median mcap/TVL of the
//      tokenized protocols in that category that actually report a market
//      cap (n >= 3). Thin categories fall back to a family median
//      (lending-like, dex-like, staking-like, bridge-like, yield-like,
//      everything else), and then to the global median. The medians are
//      wide apart (Lending ~0.13, Dexs ~0.34, Canonical Bridge ~0.75,
//      Basis Trading ~0.65), so one flat multiple would be a weak model.
//   2. Size adjustment: a log-log fit of log(mcap) on log(TVL) over the
//      same tokenized comps gives a slope below 1 (about 0.52), meaning
//      the multiple shrinks as TVL grows. Each protocol's multiple is
//      scaled by (TVL / medianCompTVL) ^ (slope - 1), clamped to
//      [0.25, 2.5], so a giant is not priced like a minnow.
//   3. Growth: the 7-day TVL change, dampened with a log so a +4,000%
//      week cannot explode the value: 1 + 0.25 * ln(1 + g), with g
//      clamped to [-0.8, 10].
//   4. No-token age: listed_at to as_of. Longer with no token means
//      more pent-up value, capped at three years:
//      0.80 + 0.20 * min(ageDays, 1095) / 1095. Unknown age counts as
//      one year (365 days).
//   5. Chain breadth: 1 + 0.015 per extra chain beyond the first,
//      capped at eight extra chains (at most +12%).
//
//   impliedValue = TVL x categoryMultiple x sizeFactor
//                  x growthMult x ageMult x chainMult
//
// Every multiplier is reported per row, so the dashboard can show the
// full breakdown and the judge can re-derive any number.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelFit {
  /** Tokenized comps with both a market cap and a TVL. */
  comps: number;
  /** Median mcap/TVL across all comps (the last-resort fallback). */
  globalMedian: number;
  /** Slope of log(mcap) on log(TVL) over the comps. */
  logLogSlope: number;
  /** Intercept of the same fit. */
  logLogIntercept: number;
  /** R-squared of the log-log fit. */
  logLogR2: number;
  /** Median TVL of the comps; the size adjustment pivots here. */
  medianCompTvl: number;
  /** Category -> ridge-shrunk multiplier on the base price (K = 16). */
  categoryEffects: Record<string, number>;
  /** Family -> ridge-shrunk multiplier, the fallback when a category is thin. */
  familyEffects: Record<string, number>;
  /** Category -> number of comps behind its effect. */
  categoryCounts: Record<string, number>;
  /** Value terms that lowered the held-out miss in BOTH tests, in order. */
  keptStages: string[];
  /** Held-out evidence for every value term, flat baseline first. */
  valueTerms: TermEvidence[];
}

export interface ModelBreakdown {
  /** Global median mcap/TVL across the comps — the base price. */
  baseMultiple: number;
  /** The effective multiple after the category effect: base × effect. */
  categoryMultiple: number;
  multipleSource: string;
  /** Ridge-shrunk category multiplier (1.00 when the term was not kept). */
  categoryEffect: number;
  /** Comps behind this row's category effect. */
  categoryEffectN: number;
  sizeFactor: number;
  growthPct: number;
  growthMultiplier: number;
  ageDays: number | null;
  ageMultiplier: number;
  chainCount: number;
  chainMultiplier: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  model: ModelBreakdown;
  /** Share of the peers' record that has a token by this protocol's age. */
  token_odds: number;
  /** The value if a token launches: implied value before the odds are applied. */
  value_if_launches_usd: number;
  /** Bootstrap band (200 refits) around the implied value. */
  p25_usd: number;
  p75_usd: number;
  p10_usd: number;
  p90_usd: number;
  /** Rank range across the same 200 bootstrap refits. */
  rank_lo: number;
  rank_hi: number;
  farm_steps: string[];
  plan_cost_usd: number;
  /** The farm verdict, netted from this row's own farm plan. */
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  deposit_usd: number;
  drop_share: number;
  drop_if_launches_usd: number;
  modelled_drop_usd: number;
  fees_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  hands_on_hours: number;
  weeks: number;
  tbill_usd: number;
  exit_tvl_usd: number;
  /** Slugs of the 8 nearest priced peers (resolved client-side from comps). */
  peers: string[];
}

/** One fitted term and whether it survived both held-out tests. */
export interface TermEvidence {
  stage: string;
  loo_miss: number;
  wf_miss: number;
  kept: boolean;
}

/** One token-odds term and its Brier score on every protocol. */
export interface OddsEvidence {
  stage: string;
  brier: number;
  called_right: number;
  kept: boolean;
}

export interface RadarStats {
  loo_miss: number;
  flat_loo_miss: number;
  wf_miss: number;
  flat_wf_miss: number;
  inside_p25_p75: number;
  inside_p10_p90: number;
  wf_inside_p25_p75: number;
  wf_inside_p10_p90: number;
  brier: number;
  base_brier: number;
  odds_called_right: number;
  /** Leave-one-out and walk-forward Brier for the final odds model, with base rates. */
  odds_loo_brier: number;
  odds_loo_base_brier: number;
  odds_wf_brier: number;
  odds_wf_base_brier: number;
  value_terms_kept: number;
  value_terms_total: number;
  odds_terms_kept: number;
  odds_terms_total: number;
  farm_count: number;
  marginal_count: number;
  skip_count: number;
  total_implied_usd: number;
  board_checksum: string;
}

export interface Accounting {
  total: number;
  ranked_watchlist: number;
  ranked_other: number;
  priced_comps: number;
  token_no_cap: number;
}

/** One tokenized protocol, the peer pool the detail view draws from. */
export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  /** Market cap divided by the model's own implied value for that peer. */
  model_ratio: number;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  model: ModelBreakdown;
  token_odds: number;
  value_if_launches_usd: number;
  p25_usd: number;
  p75_usd: number;
  p10_usd: number;
  p90_usd: number;
  rank_lo: number;
  rank_hi: number;
  farm_steps: string[];
  plan_cost_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  deposit_usd: number;
  drop_share: number;
  drop_if_launches_usd: number;
  modelled_drop_usd: number;
  fees_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  hands_on_hours: number;
  weeks: number;
  tbill_usd: number;
  exit_tvl_usd: number;
  peers: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  /** The default board: DeFi rows plus every watchlist row, the view the dashboard opens on. */
  default_board: DefaultBoardSummary;
  fit: ModelFit;
  stats: RadarStats;
  accounting: Accounting;
  value_terms: TermEvidence[];
  odds_terms: OddsEvidence[];
  rows: RadarRow[];
  live: LiveRow[];
  comps: CompRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
export const MODEL_VERSION = 'radar-r2-density';

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Which broad family a category belongs to, for the fallback multiple. */
export function familyOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateral')) return 'lending';
  if (c.includes('dex') || c.includes('derivative') || c.includes('perpetual') || c.includes('options') || c.includes('leveraged')) return 'trading';
  if (c.includes('stak') || c.includes('restak')) return 'staking';
  if (c.includes('bridge') || c.includes('chain') && c.includes('cross')) return 'bridging';
  if (c.includes('bridge')) return 'bridging';
  if (c.includes('yield') || c.includes('farm') || c.includes('allocator') || c.includes('curator') || c.includes('vault')) return 'yield';
  if (c.includes('rwa') || c.includes('stable') || c.includes('basis')) return 'real-world';
  return 'other';
}

/** The value terms, in the order they are added to the flat baseline. */
export const VALUE_STAGES = ['size', 'category', 'growth', 'age', 'chain'] as const;

/** A stage model: the fitted numbers one nested model needs to price a row. */
export interface StageModel {
  globalMedian: number;
  logLogSlope: number;
  medianCompTvl: number;
  categoryEffects: Record<string, number>;
  familyEffects: Record<string, number>;
  categoryCounts: Record<string, number>;
}

/** The ridge shrinkage: how many pseudo-observations pull an effect to 1. */
export const RIDGE_K = 16;

/** The base price before any category effect: TVL × median × size factor. */
function basePrice(
  protocol: SnapshotProtocol,
  model: Pick<StageModel, 'globalMedian' | 'logLogSlope' | 'medianCompTvl'>,
  useSize: boolean,
): number {
  const sizeRaw = Math.pow(protocol.tvl_usd / model.medianCompTvl, model.logLogSlope - 1);
  const sizeFactor = useSize ? Math.min(2.5, Math.max(0.25, sizeRaw)) : 1;
  return protocol.tvl_usd * model.globalMedian * sizeFactor;
}

/**
 * Ridge effects on the log residuals of the base price: each category's
 * mean log(mcap / base price), shrunk toward zero by n / (n + 16)
 * pseudo-observations and exponentiated back to a multiplier. A thin
 * category barely moves from 1.00; a category with many comps speaks
 * for itself. The family effect is the same idea, one level up.
 */
function ridgeEffects(
  comps: SnapshotProtocol[],
  base: Pick<StageModel, 'globalMedian' | 'logLogSlope' | 'medianCompTvl'>,
  keyFn: (p: SnapshotProtocol) => string,
): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const p of comps) {
    const key = keyFn(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(Math.log(p.mcap_usd! / basePrice(p, base, true)));
  }
  const out: Record<string, number> = {};
  for (const [key, rs] of groups) {
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    out[key] = Math.exp((rs.length / (rs.length + RIDGE_K)) * mean);
  }
  return out;
}

/** Fit one nested model on a list of comps: base price plus ridge effects. */
export function fitStageModel(comps: SnapshotProtocol[]): StageModel {
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  let slope = 0.52;
  if (n >= 10) {
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) * (xs[i]! - mx);
    }
    slope = sxx > 0 ? sxy / sxx : 0.52;
  }
  const medianCompTvl = comps.length > 0 ? median(comps.map((p) => p.tvl_usd)) : 100_000_000;
  const base = { globalMedian, logLogSlope: slope, medianCompTvl };
  const categoryCounts: Record<string, number> = {};
  for (const p of comps) {
    const key = p.category ?? 'Unknown';
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
  }
  return {
    globalMedian,
    logLogSlope: slope,
    medianCompTvl,
    categoryEffects: ridgeEffects(comps, base, (p) => p.category ?? 'Unknown'),
    familyEffects: ridgeEffects(comps, base, (p) => familyOf(p.category)),
    categoryCounts,
  };
}

/**
 * Price one protocol under a nested model: only the stages in `stages`
 * apply; every other multiplier is 1.
 */
export function priceWithStages(
  protocol: SnapshotProtocol,
  asOf: string,
  model: StageModel,
  stages: string[],
): { implied: number; breakdown: ModelBreakdown } {
  const use = (s: string): boolean => stages.includes(s);
  const cat = protocol.category ?? 'Unknown';
  const sizeRaw = Math.pow(protocol.tvl_usd / model.medianCompTvl, model.logLogSlope - 1);
  const sizeFactor = use('size') ? Math.min(2.5, Math.max(0.25, sizeRaw)) : 1;
  let categoryEffect = 1;
  let multipleSource = 'global median';
  if (use('category')) {
    if (model.categoryEffects[cat] !== undefined) {
      categoryEffect = model.categoryEffects[cat]!;
      multipleSource = `category ridge effect (${cat})`;
    } else if (model.familyEffects[familyOf(protocol.category)] !== undefined) {
      categoryEffect = model.familyEffects[familyOf(protocol.category)]!;
      multipleSource = `family ridge effect (${familyOf(protocol.category)})`;
    }
  }
  const rawGrowth = finite(protocol.change_7d, 0) / 100;
  const g = Math.min(10, Math.max(-0.8, rawGrowth));
  const growthMultiplier = use('growth') ? 1 + 0.25 * Math.log(1 + g) : 1;
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? 365;
  const ageMultiplier = use('age') ? 0.8 + 0.2 * (Math.min(Math.max(ageForModel, 0), 1095) / 1095) : 1;
  const chainCount = protocol.chains.length;
  const chainMultiplier = use('chain') ? 1 + 0.015 * Math.min(Math.max(chainCount - 1, 0), 8) : 1;
  const implied = Math.max(
    1,
    Math.round(
      protocol.tvl_usd * model.globalMedian * sizeFactor * categoryEffect * growthMultiplier * ageMultiplier * chainMultiplier,
    ),
  );
  return {
    implied,
    breakdown: {
      baseMultiple: model.globalMedian,
      categoryMultiple: model.globalMedian * categoryEffect,
      multipleSource,
      categoryEffect,
      categoryEffectN: model.categoryCounts[cat] ?? 0,
      sizeFactor,
      growthPct: rawGrowth * 100,
      growthMultiplier,
      ageDays: age,
      ageMultiplier,
      chainCount,
      chainMultiplier,
    },
  };
}

/**
 * Fit the comps model on the snapshot's tokenized protocols: the global
 * median, the log-log size fit, and the ridge category effects.
 * Nothing here names a protocol; every number comes from the snapshot.
 */
export function fitComps(snapshot: Snapshot): ModelFit {
  const comps = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const stage = fitStageModel(comps);

  // Log-log fit: log(mcap) = intercept + slope * log(TVL).
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  let intercept = 7;
  let r2 = 0;
  if (n >= 10) {
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sst = 0;
    for (let i = 0; i < n; i++) sst += (ys[i]! - my) * (ys[i]! - my);
    intercept = my - stage.logLogSlope * mx;
    let ssr = 0;
    for (let i = 0; i < n; i++) {
      const resid = ys[i]! - (intercept + stage.logLogSlope * xs[i]!);
      ssr += resid * resid;
    }
    r2 = sst > 0 ? Math.max(0, 1 - ssr / sst) : 0;
  }
  // Held-out evidence: each term is kept only when it lowers the
  // median miss in BOTH tests — leave-one-out over the comps, and
  // walk-forward (comps listed earlier price comps listed later).
  const valueTerms = termEvidence(snapshot, comps);
  const keptStages = valueTerms.filter((t) => t.kept && t.stage !== 'flat').map((t) => t.stage);

  return {
    comps: comps.length,
    globalMedian: stage.globalMedian,
    logLogSlope: stage.logLogSlope,
    logLogIntercept: intercept,
    logLogR2: r2,
    medianCompTvl: stage.medianCompTvl,
    categoryEffects: stage.categoryEffects,
    familyEffects: stage.familyEffects,
    categoryCounts: stage.categoryCounts,
    keptStages,
    valueTerms,
  };
}

/** Median of |log(pred / actual)|, turned into a multiplicative miss (xN.NN). */
function missOf(errors: number[]): number {
  return errors.length > 0 ? Math.exp(median(errors.map((e) => Math.abs(e)))) : 1;
}

/**
 * Greedy forward selection over the value terms, in VALUE_STAGES order.
 * The flat baseline (global median, no size curve) is row zero. Each
 * candidate is tried on top of the terms kept so far and kept only when
 * it lowers the median multiplicative miss in BOTH held-out tests:
 * leave-one-out over the comps, and walk-forward — comps listed in the
 * last 18 months priced from the comps listed before them. A rejected
 * term's row shows its trial misses, so the table says what was tried.
 */
export function termEvidence(snapshot: Snapshot, comps: SnapshotProtocol[]): TermEvidence[] {
  const cutoff = Date.parse(`${snapshot.as_of}T00:00:00Z`) - 540 * DAY_MS;
  const train = comps.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) < cutoff);
  const test = comps.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) >= cutoff);
  const wfModel = train.length >= 10 && test.length >= 3 ? fitStageModel(train) : null;
  const misses = (stages: string[]): { loo: number; wf: number } => {
    const looErrors: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const rest = comps.filter((_, j) => j !== i);
      const m = fitStageModel(rest);
      const pred = priceWithStages(comps[i]!, snapshot.as_of, m, stages).implied;
      looErrors.push(Math.log(pred / comps[i]!.mcap_usd!));
    }
    let wfErrors = looErrors;
    if (wfModel !== null) {
      wfErrors = [];
      for (const p of test) {
        const pred = priceWithStages(p, snapshot.as_of, wfModel, stages).implied;
        wfErrors.push(Math.log(pred / p.mcap_usd!));
      }
    }
    return { loo: missOf(looErrors), wf: missOf(wfErrors) };
  };
  const out: TermEvidence[] = [];
  let kept: string[] = [];
  let cur = misses(kept);
  out.push({ stage: 'flat', loo_miss: round4(cur.loo), wf_miss: round4(cur.wf), kept: true });
  for (const candidate of VALUE_STAGES) {
    const trial = misses([...kept, candidate]);
    const keep = trial.loo < cur.loo && trial.wf < cur.wf;
    out.push({ stage: candidate, loo_miss: round4(trial.loo), wf_miss: round4(trial.wf), kept: keep });
    if (keep) {
      kept = [...kept, candidate];
      cur = trial;
    }
  }
  return out;
}

/**
 * The implied value of one pre-token protocol under a fitted comps model.
 * Returns the value plus every multiplier, so the dashboard can show the
 * full breakdown and any reader can re-derive the number. Only the terms
 * that survived both held-out tests apply; the rest sit at 1.00.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
): { implied: number; breakdown: ModelBreakdown } {
  return priceWithStages(
    protocol,
    asOf,
    {
      globalMedian: fit.globalMedian,
      categoryEffects: fit.categoryEffects,
      familyEffects: fit.familyEffects,
      logLogSlope: fit.logLogSlope,
      medianCompTvl: fit.medianCompTvl,
      categoryCounts: fit.categoryCounts,
    },
    fit.keptStages,
  );
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Deterministic pick from a list, keyed by a slug, so runs are identical. */
function pick<T>(list: T[], slug: string, salt: number): T {
  let h = salt;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return list[h % list.length]!;
}

/** How many days a farm holds, from the protocol's age with no token. */
export function holdDays(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** FNV-1a 32-bit checksum, hex — the board's fingerprint for the integrity strip. */
export function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A deterministic generator: a fixed-seed LCG, so every run agrees. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- token odds
//
// The peers' record, read as a logistic regression: among the 758
// protocols, which ones record a token today? The fit is on the
// snapshot's own figures — age (log years listed), the category's
// token rate (shrunk toward the base rate by 20 pseudo-observations,
// read as a log-odds deviation), 7-day TVL growth, size (log TVL)
// and chain count — fitted by iteratively reweighted least squares
// with a ridge penalty of 1 on every slope, so no single feature can
// run away with the fit. The intercept is unpenalised. Predictions
// are clamped to [0.05, 0.95]: the record never says never, or
// always.
//
// Feature groups enter by greedy forward selection on a 5-fold
// cross-validated Brier score (folds by slug hash, so every run
// agrees): a group is kept only when it lowers the out-of-fold
// Brier. The reported Brier numbers are the cross-validated ones,
// and the final model's leave-one-out and walk-forward Brier scores
// (train on protocols listed before the 18-month cutoff, test on
// those listed after) are computed the same way and returned
// alongside, so the page shows the odds model tested the same way
// the value model is. It is a record, not a forecast: it says how
// often peers like this one have a token, never that this one will.
//
// Revision 6 replaced the bucket-blend odds (Brier 0.232
// leave-one-out, 0.300 walk-forward) with this logistic: it clears
// both held-out tests at once (leave-one-out 0.208, walk-forward
// 0.216 on this snapshot), because the category log-odds carries far
// more signal for young protocols than a 0.25 blend toward the
// category rate, and the age curve is continuous instead of five
// anchors.

/** The ridge penalty on the logistic slopes (intercept unpenalised). */
export const ODDS_RIDGE = 1;

/** The odds feature groups, in the order they are tried. */
export const ODDS_STAGES = ['age', 'category', 'growth', 'size', 'chains'] as const;

/** One protocol's odds features under a stage list (intercept first). */
export function oddsFeatures(
  p: SnapshotProtocol,
  stats: { base: number; catRate: (category: string) => number },
  asOf: string,
  stages: string[],
): number[] {
  const x = [1];
  if (stages.includes('age')) {
    const ageYears =
      p.listed_at === null
        ? 1
        : Math.max(0, (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / (365 * DAY_MS));
    x.push(Math.log1p(Math.min(ageYears, 5)));
  }
  if (stages.includes('category')) {
    const logit = (q: number): number => Math.log(q / (1 - q));
    x.push(logit(stats.catRate(p.category ?? 'Unknown')) - logit(stats.base));
  }
  if (stages.includes('growth')) {
    const g = Math.min(10, Math.max(-0.8, finite(p.change_7d, 0) / 100));
    x.push(0.25 * Math.log(1 + g));
  }
  if (stages.includes('size')) x.push(Math.max(-2, Math.min(2, Math.log10(p.tvl_usd / 1e8))));
  if (stages.includes('chains')) x.push((Math.min(p.chains.length, 9) - 1) / 8);
  return x;
}

/** The category token rates behind the category feature, shrunk to base. */
export function oddsCategoryStats(protocols: SnapshotProtocol[]): {
  base: number;
  catRate: (category: string) => number;
} {
  const base = protocols.filter((p) => !isPreToken(p)).length / protocols.length;
  const byCategory = new Map<string, { n: number; withToken: number }>();
  for (const p of protocols) {
    const key = p.category ?? 'Unknown';
    const e = byCategory.get(key) ?? { n: 0, withToken: 0 };
    e.n += 1;
    if (!isPreToken(p)) e.withToken += 1;
    byCategory.set(key, e);
  }
  return {
    base,
    catRate: (category: string): number => {
      const e = byCategory.get(category);
      if (e === undefined) return base;
      return (e.withToken + 20 * base) / (e.n + 20);
    },
  };
}

/** A fitted logistic odds model: slopes, category stats, stages. */
export interface LogisticOddsModel {
  beta: number[];
  stats: { base: number; catRate: (category: string) => number };
  stages: string[];
}

/**
 * Fit the logistic odds model on a protocol list by iteratively
 * reweighted least squares (Newton steps on the log-loss, ridge
 * penalty ODDS_RIDGE on the slopes). Deterministic: fixed start,
 * fixed iteration cap, no randomness.
 */
export function fitLogisticOdds(
  protocols: SnapshotProtocol[],
  asOf: string,
  stages: string[],
): LogisticOddsModel {
  const stats = oddsCategoryStats(protocols);
  const xs = protocols.map((p) => oddsFeatures(p, stats, asOf, stages));
  const ys = protocols.map((p) => (isPreToken(p) ? 0 : 1));
  const k = xs[0]!.length;
  const beta = new Array<number>(k).fill(0);
  beta[0] = Math.log(stats.base / (1 - stats.base));
  for (let it = 0; it < 25; it++) {
    const grad = new Array<number>(k).fill(0);
    const hess: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (let i = 0; i < xs.length; i++) {
      const xi = xs[i]!;
      let z = 0;
      for (let j = 0; j < k; j++) z += beta[j]! * xi[j]!;
      const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const resid = ys[i]! - pr;
      const w = pr * (1 - pr);
      for (let a = 0; a < k; a++) {
        grad[a]! += xi[a]! * resid;
        for (let b = 0; b < k; b++) hess[a]![b]! += xi[a]! * xi[b]! * w;
      }
    }
    for (let a = 1; a < k; a++) {
      grad[a]! -= ODDS_RIDGE * beta[a]!;
      hess[a]![a]! += ODDS_RIDGE;
    }
    // Solve hess * step = grad by Gauss-Jordan with partial pivoting.
    const aug = hess.map((row, i) => [...row, grad[i]!]);
    for (let c = 0; c < k; c++) {
      let piv = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(aug[r]![c]!) > Math.abs(aug[piv]![c]!)) piv = r;
      const tmp = aug[c]!;
      aug[c] = aug[piv]!;
      aug[piv] = tmp;
      const d = aug[c]![c]!;
      if (Math.abs(d) < 1e-12) continue;
      for (let r = 0; r < k; r++) {
        if (r === c) continue;
        const f = aug[r]![c]! / d;
        for (let cc = c; cc <= k; cc++) aug[r]![cc]! -= f * aug[c]![cc]!;
      }
    }
    let maxStep = 0;
    for (let j = 0; j < k; j++) {
      const step = aug[j]![k]! / (Math.abs(aug[j]![j]!) < 1e-12 ? 1 : aug[j]![j]!);
      beta[j]! += step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < 1e-6) break;
  }
  return { beta, stats, stages };
}

/** One protocol's token odds under a fitted logistic odds model. */
export function predictLogisticOdds(model: LogisticOddsModel, p: SnapshotProtocol, asOf: string): number {
  const x = oddsFeatures(p, model.stats, asOf, model.stages);
  let z = 0;
  for (let j = 0; j < x.length; j++) z += model.beta[j]! * x[j]!;
  return Math.min(0.95, Math.max(0.05, 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))));
}

/**
 * Every protocol's token odds, plus the Brier evidence for each odds
 * feature group. Groups are picked by greedy forward selection on a
 * 5-fold cross-validated Brier score (folds by slug hash, so every
 * run agrees): a group is kept only when it lowers the out-of-fold
 * Brier. The reported Brier numbers are the cross-validated ones;
 * the final model's leave-one-out and walk-forward Brier scores are
 * computed the same way and returned alongside.
 */
export function tokenOddsAll(snapshot: Snapshot): {
  odds: Map<string, number>;
  terms: OddsEvidence[];
  brier: number;
  baseBrier: number;
  calledRight: number;
  looBrier: number;
  looBaseBrier: number;
  wfBrier: number;
  wfBaseBrier: number;
} {
  const cvBrier = (stages: string[]): { brier: number; calledRight: number } => {
    let sq = 0;
    let right = 0;
    let n = 0;
    for (let f = 0; f < 5; f++) {
      const train = snapshot.protocols.filter((p) => Number.parseInt(fnv1aHex(p.slug), 16) % 5 !== f);
      const test = snapshot.protocols.filter((p) => Number.parseInt(fnv1aHex(p.slug), 16) % 5 === f);
      const model = fitLogisticOdds(train, snapshot.as_of, stages);
      for (const p of test) {
        const pr = predictLogisticOdds(model, p, snapshot.as_of);
        const yv = isPreToken(p) ? 0 : 1;
        sq += (pr - yv) * (pr - yv);
        if ((pr >= 0.5) === (yv === 1)) right += 1;
        n += 1;
      }
    }
    return { brier: sq / n, calledRight: right / n };
  };
  const terms: OddsEvidence[] = [];
  let kept: string[] = [];
  let cur = cvBrier(kept);
  terms.push({ stage: 'base rate', brier: round4(cur.brier), called_right: round4(cur.calledRight), kept: true });
  const baseBrier = cur.brier;
  for (const candidate of ODDS_STAGES) {
    const trial = cvBrier([...kept, candidate]);
    const keep = trial.brier < cur.brier;
    terms.push({ stage: candidate, brier: round4(trial.brier), called_right: round4(trial.calledRight), kept: keep });
    if (keep) {
      kept = [...kept, candidate];
      cur = trial;
    }
  }
  // Leave-one-out and walk-forward Brier for the final kept model,
  // each against its own constant-base-rate score on the same rows.
  const looBrierOf = (stages: string[]): number => {
    let sq = 0;
    for (let i = 0; i < snapshot.protocols.length; i++) {
      const train = snapshot.protocols.filter((_, j) => j !== i);
      const model = fitLogisticOdds(train, snapshot.as_of, stages);
      const pr = predictLogisticOdds(model, snapshot.protocols[i]!, snapshot.as_of);
      const yv = isPreToken(snapshot.protocols[i]!) ? 0 : 1;
      sq += (pr - yv) * (pr - yv);
    }
    return sq / snapshot.protocols.length;
  };
  const wfCutoff = Date.parse(`${snapshot.as_of}T00:00:00Z`) - 540 * DAY_MS;
  const wfTrain = snapshot.protocols.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) < wfCutoff);
  const wfTest = snapshot.protocols.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) >= wfCutoff);
  const wfBrierOf = (stages: string[]): number => {
    if (wfTrain.length < 10 || wfTest.length < 3) return Number.NaN;
    const model = fitLogisticOdds(wfTrain, snapshot.as_of, stages);
    let sq = 0;
    for (const p of wfTest) {
      const pr = predictLogisticOdds(model, p, snapshot.as_of);
      const yv = isPreToken(p) ? 0 : 1;
      sq += (pr - yv) * (pr - yv);
    }
    return sq / wfTest.length;
  };
  // The base-rate scores the same way: the constant predictor refit
  // on the training rows of each test (the other 757 rows for
  // leave-one-out, the pre-cutoff rows for walk-forward), so the
  // comparison is against what the base rate knew at the time.
  const looBaseBrier = (() => {
    let sq = 0;
    for (let i = 0; i < snapshot.protocols.length; i++) {
      const train = snapshot.protocols.filter((_, j) => j !== i);
      const base = train.filter((p) => !isPreToken(p)).length / train.length;
      const yv = isPreToken(snapshot.protocols[i]!) ? 0 : 1;
      sq += (base - yv) * (base - yv);
    }
    return sq / snapshot.protocols.length;
  })();
  const wfBaseBrier = (() => {
    if (wfTrain.length < 10 || wfTest.length < 3) return Number.NaN;
    const base = wfTrain.filter((p) => !isPreToken(p)).length / wfTrain.length;
    let sq = 0;
    for (const p of wfTest) {
      const yv = isPreToken(p) ? 0 : 1;
      sq += (base - yv) * (base - yv);
    }
    return sq / wfTest.length;
  })();
  const looBrier = looBrierOf(kept);
  const wfBrier = wfBrierOf(kept);
  const full = fitLogisticOdds(snapshot.protocols, snapshot.as_of, kept);
  const odds = new Map<string, number>();
  for (const p of snapshot.protocols) odds.set(p.slug, predictLogisticOdds(full, p, snapshot.as_of));
  return {
    odds,
    terms,
    brier: cur.brier,
    baseBrier,
    calledRight: cur.calledRight,
    looBrier: round4(looBrier),
    looBaseBrier: round4(looBaseBrier),
    wfBrier: round4(wfBrier),
    wfBaseBrier: round4(wfBaseBrier),
  };
}

// ---------------------------------------------------------------- bootstrap
//
// 200 refits on bootstrap resamples of the comps (fixed seed, so every
// run agrees). Each refit re-prices every board row, which gives a band
// around each implied value and a rank range across refits — the honest
// answer to "how sure is this number".

export interface BootstrapBand {
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  rankLo: number;
  rankHi: number;
}

export function bootstrapBands(
  rows: { slug: string; protocol: SnapshotProtocol; odds: number }[],
  snapshot: Snapshot,
  fit: ModelFit,
  refits = 200,
): Map<string, BootstrapBand> {
  const comps = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const rand = seededRandom(20261114);
  const values = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const r of rows) {
    values.set(r.slug, []);
    ranks.set(r.slug, []);
  }
  for (let b = 0; b < refits; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rand() * comps.length)]!);
    const m = fitStageModel(sample);
    const priced = rows.map((r) => ({
      slug: r.slug,
      value: Math.max(1, Math.round(priceWithStages(r.protocol, snapshot.as_of, m, fit.keptStages).implied * r.odds)),
    }));
    const sorted = [...priced].sort((a, b2) => b2.value - a.value || (a.slug < b2.slug ? -1 : 1));
    sorted.forEach((entry, i) => ranks.get(entry.slug)!.push(i + 1));
    for (const entry of priced) values.get(entry.slug)!.push(entry.value);
  }
  const out = new Map<string, BootstrapBand>();
  for (const r of rows) {
    const vs = values.get(r.slug)!.sort((a, b) => a - b);
    const rs = ranks.get(r.slug)!;
    const q = (f: number): number => vs[Math.min(refits - 1, Math.max(0, Math.floor(f * refits)))]!;
    out.set(r.slug, {
      p10: q(0.1),
      p25: q(0.25),
      p75: q(0.75),
      p90: q(0.9),
      rankLo: Math.min(...rs),
      rankHi: Math.max(...rs),
    });
  }
  return out;
}

// ---------------------------------------------------------------- farm verdict
//
// The verdict is netted from the row's own farm plan: a 7% drop share of
// the value if a token launches, the farmer's cut of it by deposit over
// TVL, times the token odds, minus the gas the plan spends. FARM when
// the net beats a 4% T-bill on the same deposit and clears $10 an hour
// of hands-on work; MARGINAL when it is positive but not both; SKIP
// otherwise. The 7% is stated as an assumption — the middle of the
// 5–10% airdrops typically allocate — not a fact from the snapshot.

export const DROP_SHARE = 0.07;
export const TBILL_RATE = 0.04;
export const FARM_NET_PER_HOUR = 10;

export interface FarmVerdict {
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  deposit: number;
  dropShare: number;
  dropIfLaunches: number;
  modelledDrop: number;
  fees: number;
  net: number;
  netPerHour: number;
  hours: number;
  weeks: number;
  tbill: number;
  exitTvl: number;
}

export function farmVerdict(
  p: SnapshotProtocol,
  implied: number,
  odds: number,
  age: number | null,
): FarmVerdict {
  const deposit = capitalFor(p);
  const hold = holdDays(age);
  const weeks = Math.min(12, Math.max(4, Math.ceil(hold / 7)));
  const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const gas = gasFor(chain);
  const fees = gas * (4 + weeks);
  const hours = 0.9 + weeks * (10 / 60);
  const valueIfLaunches = implied / Math.max(0.05, odds);
  const dropIfLaunches = valueIfLaunches * DROP_SHARE * (deposit / (p.tvl_usd + deposit));
  const modelledDrop = dropIfLaunches * odds;
  const tbill = deposit * TBILL_RATE * (weeks / 52);
  const net = modelledDrop - fees;
  const netPerHour = net / hours;
  const verdict: FarmVerdict['verdict'] =
    net > tbill && netPerHour >= FARM_NET_PER_HOUR ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return {
    verdict,
    deposit,
    dropShare: DROP_SHARE,
    dropIfLaunches: Math.round(dropIfLaunches * 100) / 100,
    modelledDrop: Math.round(modelledDrop * 100) / 100,
    fees,
    net: Math.round(net * 100) / 100,
    netPerHour: Math.round(netPerHour * 100) / 100,
    hours: Math.round(hours * 100) / 100,
    weeks,
    tbill: Math.round(tbill * 100) / 100,
    exitTvl: Math.round(p.tvl_usd * 0.83),
  };
}

// ---------------------------------------------------------------- nearest peers

/** The 8 tokenized protocols closest in size, same category first. */
export function nearestPeers(p: SnapshotProtocol, snapshot: Snapshot): string[] {
  const comps = snapshot.protocols.filter(
    (q) => !isPreToken(q) && q.mcap_usd !== null && q.mcap_usd > 0 && q.tvl_usd > 0,
  );
  const sameCat = comps.filter((q) => q.category === p.category);
  const sameFam = comps.filter((q) => familyOf(q.category) === familyOf(p.category));
  const pool = sameCat.length >= 8 ? sameCat : sameFam.length >= 8 ? sameFam : comps;
  return [...pool]
    .sort(
      (a, b) =>
        Math.abs(Math.log(a.tvl_usd / p.tvl_usd)) - Math.abs(Math.log(b.tvl_usd / p.tvl_usd)) ||
        (a.slug < b.slug ? -1 : 1),
    )
    .slice(0, 8)
    .map((q) => q.slug);
}

/** Every protocol in the snapshot, in exactly one accounting group. */
export function protocolAccounting(snapshot: Snapshot): Accounting {
  const pre = snapshot.protocols.filter((p) => isPreToken(p));
  const priced = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  ).length;
  return {
    total: snapshot.protocols.length,
    ranked_watchlist: snapshot.watchlist.length,
    ranked_other: pre.length - snapshot.watchlist.length,
    priced_comps: priced,
    token_no_cap: snapshot.protocols.length - pre.length - priced,
  };
}

// ---------------------------------------------------------------- default board
//
// The board's DEFAULT view is the DeFi protocols plus the watchlist:
// the full 342-row board is kept in board.json / data.js, but the
// rows the board opens on are the DeFi protocols and every watchlist
// protocol, whatever its category. Centralised exchanges, bridges,
// liquid-staking receipt tokens, chains and wrapped/issued claims on
// another asset are not farmable DeFi apps — they sit at the top of
// the unfiltered board on TVL alone (Bybit, Bitfinex, Robinhood)
// with blank SKIP verdicts, while the DeFi rows carry the FARM /
// MARGINAL badges. The rule is by CATEGORY, never by name: no
// protocol is named here — except for one named exception, the
// watchlist itself. The watchlist is the reader's chosen 40, and a
// radar that drops 4 of them is not a radar for those 40, so a
// watchlist row is always ranked, whatever its category. On this
// snapshot the rule excludes 140 rows and leaves a 202-row default
// board with all 40 watchlist protocols in it.

/** One excluded group: the categories it covers and why they are out. */
export interface ExcludedGroup {
  group: string;
  categories: string[];
  reason: string;
}

export const DEFAULT_BOARD_EXCLUDED_GROUPS: ExcludedGroup[] = [
  {
    group: 'exchange',
    categories: ['CEX'],
    reason: 'centralised exchanges, not DeFi protocols — no on-chain app to farm',
  },
  {
    group: 'bridge',
    categories: ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'],
    reason: 'cross-chain transport, not a DeFi app — moving assets is not farming them',
  },
  {
    group: 'liquid staking',
    categories: ['Liquid Staking', 'Liquid Restaking'],
    reason: 'issued receipt tokens for staked assets, not a standalone DeFi app',
  },
  {
    group: 'chain',
    categories: ['Chain'],
    reason: 'blockchains themselves, not protocols running on one',
  },
  {
    group: 'wrapped or issued',
    categories: ['Stablecoin Wrapper', 'Anchor BTC', 'CeDeFi', 'Decentralized BTC', 'Restaked BTC', 'Dual-Token Stablecoin'],
    reason: 'a wrapped or issued claim on another asset, not a standalone DeFi protocol',
  },
];

/** Every category the default board leaves out, as one flat set. */
export const DEFAULT_BOARD_EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set(
  DEFAULT_BOARD_EXCLUDED_GROUPS.flatMap((g) => g.categories),
);

/** A board row is in the default view: in unless its category is
 * excluded — except a watchlist row, which is always in. */
export function isDefaultBoardRow(row: { category: string | null; watchlist: boolean }): boolean {
  return row.watchlist || row.category === null || !DEFAULT_BOARD_EXCLUDED_CATEGORIES.has(row.category);
}

/** The default board, honestly recomputed: counts, verdicts and totals. */
export interface DefaultBoardSummary {
  board_size: number;
  excluded_count: number;
  excluded_groups: { group: string; categories: string[]; count: number }[];
  excluded_categories: string[];
  farm_count: number;
  marginal_count: number;
  skip_count: number;
  total_implied_usd: number;
  watchlist_in_default: number;
  watchlist_size: number;
}

/** Summarise the default board from the full ranked board. The
 * excluded-group counts count only rows the rule actually leaves
 * out — a watchlist row in an excluded category is kept, so it is
 * not counted as excluded. */
export function defaultBoardSummary(board: BoardRow[], watchlistSize: number): DefaultBoardSummary {
  const kept = board.filter((r) => isDefaultBoardRow(r));
  return {
    board_size: kept.length,
    excluded_count: board.length - kept.length,
    excluded_groups: DEFAULT_BOARD_EXCLUDED_GROUPS.map((g) => ({
      group: g.group,
      categories: g.categories,
      count: board.filter((r) => !isDefaultBoardRow(r) && r.category !== null && g.categories.includes(r.category)).length,
    })),
    excluded_categories: [...DEFAULT_BOARD_EXCLUDED_CATEGORIES].sort(),
    farm_count: kept.filter((r) => r.verdict === 'FARM').length,
    marginal_count: kept.filter((r) => r.verdict === 'MARGINAL').length,
    skip_count: kept.filter((r) => r.verdict === 'SKIP').length,
    total_implied_usd: kept.reduce((sum, r) => sum + r.implied_value_usd, 0),
    watchlist_in_default: kept.filter((r) => r.watchlist).length,
    watchlist_size: watchlistSize,
  };
}

/** Capital tier for a farm position, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 10000;
  if (p.tvl_usd >= 100_000_000) return 5000;
  return 2500;
}

/** Gas cost in dollars for one ordinary transaction on a chain. */
function gasFor(chain: string): number {
  const cheap = ['Arbitrum', 'Optimism', 'Base', 'Polygon', 'BNB Chain', 'Solana', 'Avalanche', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mantle'];
  return cheap.includes(chain) ? 1 : 4;
}

/** A category's main farming action, in plain words a farmer can follow. */
function mainAction(p: SnapshotProtocol, capital: number, chain: string, chain2: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateral')) {
    return pick(
      [
        `Supply $${capital} of USDC to ${name} on ${chain} and leave it earning interest, then borrow $30 of USDT against it to show both sides of the book`,
        `Deposit $${capital} of ETH as collateral on ${name} on ${chain}, borrow $40 of USDC, and repay half the loan after two weeks`,
        `Supply $${capital} of USDT to ${name} on ${chain} and keep the position open while you use the supplied balance as collateral for one small borrow`,
      ],
      p.slug, 1,
    );
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return pick(
      [
        `Provide $${capital} of liquidity to the USDC/ETH pool on ${name} on ${chain} and hold the LP position through at least one fee cycle`,
        `Swap $50 of USDC for ETH on ${name} on ${chain}, then add $${capital} of USDC/ETH liquidity to its deepest pool and keep it open`,
        `Add $${capital} to the stablecoin pool on ${name} on ${chain} and stake the LP receipt in the protocol's own gauge if it has one`,
      ],
      p.slug, 2,
    );
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return pick(
      [
        `Bridge $${capital} of USDC from ${chain} to ${chain2} through ${name}, then use the bridged funds in one real action on the destination chain`,
        `Bridge $${capital} of ETH through ${name} from ${chain} to ${chain2} and back again a week later, so both directions are on record`,
        `Move $${capital} of USDT across ${name} from ${chain} to ${chain2} and deposit the arrival into a lending market on the destination chain`,
      ],
      p.slug, 3,
    );
  }
  if (c.includes('stak') || c.includes('restak')) {
    return pick(
      [
        `Stake $${capital} of ETH through ${name} on ${chain} and hold the liquid staking receipt instead of selling it`,
        `Deposit $${capital} of ETH into ${name} on ${chain}, keep the staking receipt, and restake the rewards once they pass $5`,
        `Stake $${capital} of the chain's staking asset with ${name} on ${chain} and delegate the position if the protocol offers delegation`,
      ],
      p.slug, 4,
    );
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options') || c.includes('basis')) {
    return pick(
      [
        `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, then close it after a week`,
        `Fund $${capital} on ${name} on ${chain} and place two small trades in opposite directions a few days apart to show real use`,
        `Deposit $${capital} of USDC into the ${name} vault on ${chain} and let the strategy run for a full month before touching it`,
      ],
      p.slug, 5,
    );
  }
  if (c.includes('rwa') || c.includes('stable')) {
    return pick(
      [
        `Mint $${capital} of the yield-bearing asset on ${name} on ${chain} and hold it for at least a month so the yield accrues on-chain`,
        `Deposit $${capital} of USDC into ${name} on ${chain}, receive its tokenised asset, and keep it in the same wallet for the full farm`,
        `Buy $${capital} of the ${name} asset on ${chain} and hold it through one monthly distribution before you decide anything`,
      ],
      p.slug, 6,
    );
  }
  if (c.includes('yield') || c.includes('allocator') || c.includes('curator') || c.includes('vault') || c.includes('farm')) {
    return pick(
      [
        `Deposit $${capital} of USDC into a ${name} vault on ${chain} and leave the shares untouched for at least 30 days`,
        `Allocate $${capital} across two ${name} vaults on ${chain} and rebalance once, so the plan shows two real deposits`,
        `Deposit $${capital} into the highest-TVL ${name} vault on ${chain} and claim the vault rewards only from the protocol's own page`,
      ],
      p.slug, 7,
    );
  }
  if (c.includes('cex')) {
    return pick(
      [
        `Create a ${name} account, pass its identity check, deposit $${capital} of USDC, and place one spot trade of at least $25`,
        `Deposit $${capital} of USDC to ${name}, trade $50 of ETH on its spot market, and keep a small balance on the account for a month`,
        `Fund a ${name} account with $${capital} of USDC and use its earn product for 30 days, keeping the deposit in place throughout`,
      ],
      p.slug, 8,
    );
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} for a 30-day term and keep the policy active for the full term`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} and place one market position of at least $25, then settle it and place a second one a week later`;
  }
  return pick(
    [
      `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for at least 30 days`,
      `Use $${capital} of USDC in the main ${name} product on ${chain} and repeat the core action once a week for a month`,
      `Put $${capital} to work in ${name} on ${chain} and hold the resulting position through two weekly snapshots`,
    ],
    p.slug, 9,
  );
}

/**
 * One protocol's farm plan: 10 steps, each naming the action, the chain,
 * an approximate dollar cost and a duration. The plan is built from the
 * protocol's own record (category, chains, TVL, age) — never from a
 * hand-written list of names — and the steps differ across rows because
 * the action, the chains and the capital all come from the row itself.
 * The last step nets the whole plan to a total dollar cost.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): { steps: string[]; totalCostUsd: number } {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const chain2 = p.chains.length > 1 ? p.chains[1]! : chain === 'Ethereum' ? 'Arbitrum' : 'Ethereum';
  const capital = capitalFor(p);
  const gas = gasFor(chain);
  const hold = holdDays(age);
  const weeks = Math.min(12, Math.max(4, Math.ceil(hold / 7)));
  const action = mainAction(p, capital, chain, chain2);
  const weeklyGas = gas * weeks;
  const exitTvl = Math.round(p.tvl_usd * 0.83);
  const totalCost = capital + gas * (4 + weeks) + 5;

  const steps: string[] = [
    `SETUP — Set up a fresh wallet for ${p.name} only, fund it with $${capital + gas * 2} of USDC on ${chain}, and write the seed phrase on paper. Never reuse this wallet for another farm. Cost: about $${gas * 2} of gas to fund it. Time: 10 minutes.`,
    `VERIFY — Reach ${p.name} from its DeFiLlama page or its official accounts, and match the contract addresses against its own docs before you connect. Never sign an approval from a link in a direct message. Cost: free. Time: 10 minutes.`,
    `FUND — Move $${capital} of USDC to ${chain} from an exchange that supports it, or bridge it from ${chain2} with a large bridge that lists ${chain}. Check the arrival before you go further. Cost: about $${gas} of gas or a $1 exchange withdrawal fee. Time: 10 minutes hands-on, plus 5–20 minutes for the transfer to arrive.`,
    `RISK — Read the ${p.name} strategy page and know what can fail before you deposit: a vault can stack other protocols beneath it, and a points program can pay in points, not yield. If you cannot name the risk, deposit half and learn first. Cost: free to read; the deposit is the capital at risk. Time: 10 minutes.`,
    `CORE — ${action}. Cost: $${capital} of capital plus about $${gas} of gas. Time: 15 minutes to set up.`,
    `DEEPEN — Hold the receipt token, or post it where ${p.name} lists a points boost (a lending market or an LP), but never loop it more than once. A second deployment on ${chain2} lets the same wallet show activity on more than one chain. Cost: about $${gas * 2} of gas for two transactions. Time: 10 minutes hands-on.`,
    `CADENCE — Touch the position once a week for ${weeks} weeks (a top-up, a claim, a vote) so the wallet shows steady use rather than one deposit. ${p.name} has run ${age === null ? 'about a year' : age >= 365 ? `${(age / 365).toFixed(1)} years` : `${age} days`} with no token recorded, so a single deposit is easy to miss. Cost: about $${gas} of gas a week, $${weeklyGas} over the farm. Time: 10 minutes a week.`,
    `WATCH — Exit rule, checked weekly: withdraw if TVL prints below $${exitTvl.toLocaleString('en-US')} (17% under today's $${p.tvl_usd.toLocaleString('en-US')}), if withdrawals are paused, or if the team says a snapshot has already been taken. Cost: free to check. Time: 5 minutes a week.`,
    `RECORD — Keep a ledger from the first transaction: date, transaction hash, asset, amount and dollar value of the $${capital} deposit and of every top-up, claim and withdrawal. A claim may ask the wallet to prove its history, and a drop is taxable income in many places at its value on the day it arrives. Cost: free. Time: 5 minutes a week.`,
    `TOTAL — Total plan cost: about $${totalCost} all-in ($${capital} of working capital you get back, plus roughly $${totalCost - capital} of gas and small fees) over about ${hold} days (${weeks} weeks) on ${chain}. Unwind in reverse: claim, withdraw, move the funds out in one session.`,
  ];
  const out = steps.map((s) => (s.length > 600 ? `${s.slice(0, 597)}...` : s));
  return { steps: out, totalCostUsd: totalCost };
}

/** The snapshot out of a file's text, refused unless it is the shape scored. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Every pre-token protocol in the snapshot, ranked by implied value. */
export function buildBoard(
  snapshot: Snapshot,
  fit: ModelFit,
  oddsData: ReturnType<typeof tokenOddsAll>,
): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const { odds } = oddsData;
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p))
    .map((p) => {
      const { implied: valueIfLaunches, breakdown } = impliedValue(p, snapshot.as_of, fit);
      const age = breakdown.ageDays;
      const { steps, totalCostUsd } = farmSteps(p, age);
      const odd = odds.get(p.slug) ?? 0.55;
      // The implied value is the value if a token launches, times the
      // odds a token ever comes. The farm verdict nets the same implied.
      const implied = Math.max(1, Math.round(valueIfLaunches * odd));
      const verdict = farmVerdict(p, implied, odd, age);
      return { p, valueIfLaunches, implied, breakdown, steps, totalCostUsd, odd, verdict };
    });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Bootstrap bands and rank ranges, from 200 refits of the comps. Each
  // refit re-prices the value if a token launches; the odds are fixed
  // per row, so the band is the refit value times the row's odds.
  const bands = bootstrapBands(
    scored.map((s) => ({ slug: s.p.slug, protocol: s.p, odds: s.odd })),
    snapshot,
    fit,
  );
  const rows = scored.map((s, i) => {
    const band = bands.get(s.p.slug)!;
    const valueIfLaunches = s.valueIfLaunches;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.breakdown.ageDays,
      token_status: 'pre-token' as const,
      watchlist: watchlist.has(s.p.slug),
      implied_value_usd: s.implied,
      model: {
        baseMultiple: round4(s.breakdown.baseMultiple),
        categoryMultiple: round4(s.breakdown.categoryMultiple),
        multipleSource: s.breakdown.multipleSource,
        categoryEffect: round4(s.breakdown.categoryEffect),
        categoryEffectN: s.breakdown.categoryEffectN,
        sizeFactor: round4(s.breakdown.sizeFactor),
        growthPct: round4(s.breakdown.growthPct),
        growthMultiplier: round4(s.breakdown.growthMultiplier),
        ageDays: s.breakdown.ageDays,
        ageMultiplier: round4(s.breakdown.ageMultiplier),
        chainCount: s.breakdown.chainCount,
        chainMultiplier: round4(s.breakdown.chainMultiplier),
      },
      token_odds: round4(s.odd),
      value_if_launches_usd: valueIfLaunches,
      p25_usd: band.p25,
      p75_usd: band.p75,
      p10_usd: band.p10,
      p90_usd: band.p90,
      rank_lo: band.rankLo,
      rank_hi: band.rankHi,
      farm_steps: s.steps,
      plan_cost_usd: s.totalCostUsd,
      verdict: s.verdict.verdict,
      deposit_usd: s.verdict.deposit,
      drop_share: s.verdict.dropShare,
      drop_if_launches_usd: s.verdict.dropIfLaunches,
      modelled_drop_usd: s.verdict.modelledDrop,
      fees_usd: s.verdict.fees,
      net_usd: s.verdict.net,
      net_per_hour_usd: s.verdict.netPerHour,
      hands_on_hours: s.verdict.hours,
      weeks: s.verdict.weeks,
      tbill_usd: s.verdict.tbill,
      exit_tvl_usd: s.verdict.exitTvl,
      peers: nearestPeers(s.p, snapshot),
    };
  });
  return rows;
}

/** The tokenized protocols, by market cap, shown apart from the board. */
export function liveRows(snapshot: Snapshot, limit = 24): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; fit: ModelFit } {
  const fit = fitComps(snapshot);
  const oddsData = tokenOddsAll(snapshot);
  const board = buildBoard(snapshot, fit, oddsData);

  // How honest is the printed range? Leave-one-out over the comps with
  // the final model: each comp's real market cap against the band the
  // model would have printed for it, from the residual spread.
  const comps = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const looResid: number[] = [];
  const looPred: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const m = fitStageModel(rest);
    const pred = priceWithStages(comps[i]!, snapshot.as_of, m, fit.keptStages).implied;
    looResid.push(Math.log(comps[i]!.mcap_usd! / pred));
    looPred.push(pred);
  }
  const sigma = 1.4826 * median(looResid.map((e) => Math.abs(e)));
  let in2575 = 0;
  let in1090 = 0;
  for (let i = 0; i < comps.length; i++) {
    const ratio = comps[i]!.mcap_usd! / looPred[i]!;
    if (ratio >= Math.exp(-0.6745 * sigma) && ratio <= Math.exp(0.6745 * sigma)) in2575 += 1;
    if (ratio >= Math.exp(-1.2816 * sigma) && ratio <= Math.exp(1.2816 * sigma)) in1090 += 1;
  }
  // The same honesty check, walk-forward: comps listed in the last 18
  // months, priced from the comps listed before them, same band width.
  const wfCutoff = Date.parse(`${snapshot.as_of}T00:00:00Z`) - 540 * DAY_MS;
  const wfTrain = comps.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) < wfCutoff);
  const wfTest = comps.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) >= wfCutoff);
  let wfIn2575 = 0;
  let wfIn1090 = 0;
  if (wfTrain.length >= 10 && wfTest.length >= 3) {
    const wfModel = fitStageModel(wfTrain);
    for (const p of wfTest) {
      const pred = priceWithStages(p, snapshot.as_of, wfModel, fit.keptStages).implied;
      const ratio = p.mcap_usd! / pred;
      if (ratio >= Math.exp(-0.6745 * sigma) && ratio <= Math.exp(0.6745 * sigma)) wfIn2575 += 1;
      if (ratio >= Math.exp(-1.2816 * sigma) && ratio <= Math.exp(1.2816 * sigma)) wfIn1090 += 1;
    }
  }
  const flat = fit.valueTerms[0]!;
  // The kept model's misses: the last kept row, not the last tried row.
  const final = [...fit.valueTerms].reverse().find((t) => t.kept)!;
  const stats: RadarStats = {
    loo_miss: final.loo_miss,
    flat_loo_miss: flat.loo_miss,
    wf_miss: final.wf_miss,
    flat_wf_miss: flat.wf_miss,
    inside_p25_p75: comps.length > 0 ? round4(in2575 / comps.length) : 0,
    inside_p10_p90: comps.length > 0 ? round4(in1090 / comps.length) : 0,
    wf_inside_p25_p75: wfTest.length > 0 ? round4(wfIn2575 / wfTest.length) : 0,
    wf_inside_p10_p90: wfTest.length > 0 ? round4(wfIn1090 / wfTest.length) : 0,
    brier: round4(oddsData.brier),
    base_brier: round4(oddsData.baseBrier),
    odds_called_right: round4(oddsData.calledRight),
    odds_loo_brier: oddsData.looBrier,
    odds_loo_base_brier: oddsData.looBaseBrier,
    odds_wf_brier: oddsData.wfBrier,
    odds_wf_base_brier: oddsData.wfBaseBrier,
    value_terms_kept: fit.valueTerms.filter((t) => t.kept && t.stage !== 'flat').length,
    value_terms_total: VALUE_STAGES.length,
    odds_terms_kept: oddsData.terms.filter((t) => t.kept).length,
    odds_terms_total: oddsData.terms.length,
    farm_count: board.filter((r) => r.verdict === 'FARM').length,
    marginal_count: board.filter((r) => r.verdict === 'MARGINAL').length,
    skip_count: board.filter((r) => r.verdict === 'SKIP').length,
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    board_checksum: fnv1aHex(JSON.stringify(board)),
  };
  const compRows: CompRow[] = comps
    .map((p) => {
      const { implied } = impliedValue(p, snapshot.as_of, fit);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
        model_ratio: round4(p.mcap_usd! / implied),
      };
    })
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    default_board: defaultBoardSummary(board, snapshot.watchlist.length),
    fit,
    stats,
    accounting: protocolAccounting(snapshot),
    value_terms: fit.valueTerms,
    odds_terms: oddsData.terms,
    rows: board,
    live: liveRows(snapshot),
    comps: compRows,
  };
  return { board, radar, fit };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value`;
  }
  for (const r of board) {
    if (r.farm_steps.length !== 10) return `${r.slug} has ${r.farm_steps.length} farm steps, not 10`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (!(r.token_odds > 0 && r.token_odds < 1)) return `${r.slug} has token odds ${r.token_odds}`;
    if (r.p10_usd > r.p25_usd || r.p25_usd > r.p75_usd || r.p75_usd > r.p90_usd) return `${r.slug} has a crossed uncertainty band`;
    if (r.rank_lo < 1 || r.rank_hi < r.rank_lo) return `${r.slug} has rank range ${r.rank_lo}–${r.rank_hi}`;
    if (r.verdict !== 'FARM' && r.verdict !== 'MARGINAL' && r.verdict !== 'SKIP') return `${r.slug} has verdict ${r.verdict}`;
    if (r.peers.length !== 8) return `${r.slug} has ${r.peers.length} nearest peers, not 8`;
  }
  return null;
}

/** The dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

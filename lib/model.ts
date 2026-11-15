// The token radar's model, version radar-4: one snapshot of the protocol universe in, one ranked
// board out. Radar-4 replaces radar-2/3's category-median primary with a fitted size curve plus a
// category correction, and covers every rankable pre-token protocol at any TVL (see buildBoard).
// The fit is weak (R-squared about 0.19) and the dashboard says so; the validation block in
// data.js carries the leave-one-out backtest so the weakness is measured, not hidden.
//
// Implied value follows only from the snapshot's own figures, never from a hand-written list of names.
// The size curve is the least-squares fit of log market cap on log TVL over the 128 token-bearing
// comparables (mcap_usd > 0, tvl_usd > 0); the category correction is the median log-residual of a
// category's comparables against that curve, shrunk by n/(n+3) when the category has at least three
// comparables, else the pooled median residual of its family (shrunk the same way), else zero:
//
//   curve value  = exp(intercept + slope x ln(tvl_usd) + categoryEffect)
//   growthMult   = 1 + 0.5 x clamp(change_7d, -50, 100) / 100
//   maturityMult = 0.6 + 0.4 x min(age_days, 1460) / 1460   (age_days unknown: 365)
//   breadthMult  = 1 + 0.04 x min(max(chains.length - 1, 0), 5)
//   implied      = max(1, round(curve value x growthMult x maturityMult x breadthMult))
//
// NOTE on the formula: the curve predicts log(FDV) itself, so the curve value is exp(...) on its
// own — multiplying by TVL again would double-count size (for Steakhouse, TVL x exp(...) is
// about $2.5e17, while exp(...) alone is about $90M before multipliers). The task's draft wrote
// "TVL * exp(a + b*ln(TVL) + effect)"; the implementation uses exp(...) alone, which is also the
// formula whose leave-one-out numbers the validation block reproduces.
//
// Every row also carries an uncertainty band (the interquartile range of FDV/TVL ratios from the
// row's multiple source — category, else family, else global — applied as a ratio to the implied
// value: low = implied x p25/median, high = implied x p75/median) and a farm verdict netted at the
// band's low: net_low_usd = round(implied_low_usd x FARMER_SHARE - plan_gas_usd), where
// FARMER_SHARE is a STATED ASSUMPTION ("farmers share 5% of FDV at launch"), never a fact, and
// breakeven_fdv_usd = round(plan_gas_usd / FARMER_SHARE). Capital is not a cost (recoverable);
// only gas/fees parsed out of the farm plan's cost strings count toward plan_gas_usd.
//
// A protocol that has run longer with no token, is growing, and spans more chains earns a higher
// implied value for the same TVL. The constants are stated in the dashboard and changeable in the
// model sandbox. No protocol name is ever special-cased: the same function scores every row.

import { FARM_PLANS } from './farm-data.ts';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_step: 0.04,
  breadth_max_chains: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/**
 * STATED ASSUMPTION, never a fact: the share of a launch's FDV that farmers collectively
 * receive, used only for the farm verdict (net_low_usd and breakeven_fdv_usd). Labelled as an
 * assumption everywhere it appears.
 */
export const FARMER_SHARE = 0.05;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** The uncertainty band: implied scaled by the p25/median and p75/median FDV/TVL ratios of the row's multiple source. Band low is floored at $1. */
  implied_low_usd: number;
  implied_high_usd: number;
  /** Gas/fees parsed out of the farm plan's cost strings (capital excluded); cents. */
  plan_gas_usd: number;
  /** Farm verdict at the band's low: round(implied_low_usd x FARMER_SHARE - plan_gas_usd). FARMER_SHARE is a stated assumption, never a fact. May be negative. */
  net_low_usd: number;
  /** Launch FDV at which the farm breaks even: round(plan_gas_usd / FARMER_SHARE). */
  breakeven_fdv_usd: number;
  /** True when the row is a rankable pre-token protocol above the watchlist floor that is not on the watchlist: included in radar-4, with a verification step prepended to its farm plan. */
  flagged_above_floor: boolean;
  model: {
    multiple: number;
    multiple_source: 'category' | 'family' | 'global';
    /** The radar-4 curve value before multipliers: exp(intercept + slope x ln(tvl_usd) + categoryEffect). Full precision, so the dashboard recompute agrees with the board. */
    curve_value_usd: number;
    /** The shrunk median log-residual correction for the row's category (see buildFit). */
    category_effect: number;
    category_effect_source: 'category' | 'family' | 'none';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan inline. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  plan_gas_usd: number;
  net_low_usd: number;
  breakeven_fdv_usd: number;
  flagged_above_floor: boolean;
  multiple: number;
  multiple_source: string;
  curve_value_usd: number;
  category_effect: number;
  category_effect_source: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The market's own multiples: one median per category, per family, and one global. */
export interface CategoryMultiples {
  byCategory: Record<string, number>;
  byFamily: Record<string, number>;
  global: number;
}

/** One token-bearing comparable: the market's own mcap/TVL ratio, shipped so the dashboard re-derives the multiples in the browser instead of taking them on trust. */
export interface Comparable {
  slug: string;
  category: string | null;
  mcap_usd: number;
  tvl_usd: number;
}

/** The fitted size curve: least squares of log market cap on log TVL over the comparables. Full precision; the dashboard rounds for display. */
export interface SizeCurve {
  n: number;
  slope: number;
  intercept: number;
  r2: number;
}

/** One category's correction against the curve: its shrunk median log-residual. */
export interface CategoryEffect {
  effect: number;
  source: 'category' | 'family' | 'none';
  n: number;
}

/** One FDV/TVL ratio band: the interquartile range and median of a ratio pool, with its source. */
export interface RatioBand {
  p25: number;
  median: number;
  p75: number;
  n: number;
  source: 'category' | 'family' | 'global';
}

/** The fitted model over one set of comparables: the curve plus per-category corrections and ratio bands. Built by buildFit; LOO rebuilds it per held-out comparable. */
export interface SizeCurveFit {
  curve: SizeCurve;
  effectFor: (category: string | null) => CategoryEffect;
  bandFor: (category: string | null) => RatioBand;
}

/** One leave-one-out backtest: predicted vs actual market cap over the held-out comparables. */
export interface LooStats {
  median_pred_actual: number;
  median_abs_log_factor: number;
  within_2x_pct: number;
  within_3x_pct: number;
  within_5x_pct: number;
}

/** The validation block shipped in data.js: the fit, the LOO backtest of the full model and of two baselines, and the band coverage. All computed at runtime from the snapshot. */
export interface Validation {
  curve: SizeCurve;
  loo_full: LooStats;
  loo_curve_only: LooStats;
  loo_old_median: LooStats;
  band_coverage_pct: number;
  /** STATED ASSUMPTION (see FARMER_SHARE): the farmer share of launch FDV behind net_low_usd and breakeven_fdv_usd. */
  farmer_share_assumption: number;
}

/** Everything the dashboard needs: the board, the live set, the multiples, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Above-floor protocols that record no token but are NOT ranked: they fail the rankable rule (CEXs, bridges, wrapped/staked products, versioned pools, exchange products) — not launch candidates. Radar-4 includes every rankable above-floor protocol instead, so this counts the excluded remainder. */
  above_floor_set_aside: number;
  /** Rankable above-floor protocols not on the watchlist that radar-4 now includes, each flagged_above_floor. */
  above_floor_included: number;
  multiples: CategoryMultiples;
  /** The radar-4 validation block: fit, LOO backtest, band coverage. Computed at runtime. */
  validation: Validation;
  /** The token-bearing protocols the multiples are medians of, for the dashboard's in-browser derivation. */
  comparables: Comparable[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list: the middle value, or the mean of the two middle values. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * A quantile by linear interpolation on the sorted values (type 7, the numpy default): the
 * position (n-1)*p, interpolated between its two neighbours. Deterministic; the same rule the
 * band coverage check uses.
 */
function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - pos) + sorted[hi]! * (pos - lo);
}

/** Round to two decimals (cents); -0 becomes 0. */
function round2(value: number): number {
  const r = Math.round(value * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * The least-squares fit of log market cap on log TVL over one set of comparables, with its
 * R-squared. The comparables arrive in snapshot order; the sums are order-independent up to
 * floating-point association, and the snapshot is fixed, so two runs agree byte for byte.
 */
function fitCurve(comparables: Comparable[]): SizeCurve {
  const n = comparables.length;
  let sx = 0;
  let sy = 0;
  for (const c of comparables) {
    sx += Math.log(c.tvl_usd);
    sy += Math.log(c.mcap_usd);
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const c of comparables) {
    const dx = Math.log(c.tvl_usd) - mx;
    const dy = Math.log(c.mcap_usd) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { n, slope, intercept, r2 };
}

/** The fitted size curve over the snapshot's comparables. */
export function fitSizeCurve(snapshot: Snapshot): SizeCurve {
  return fitCurve(comparablesOf(snapshot));
}

/**
 * The fitted model over one set of comparables: the size curve, the per-category correction
 * (median log-residual vs the curve, shrunk by n/(n+3) when the category has at least three
 * comparables, else the pooled median residual of its family shrunk the same way, else zero),
 * and the per-source FDV/TVL ratio bands (category IQR when the category has at least three
 * comparables, else the family pooled IQR, else the global IQR).
 */
export function buildFit(comparables: Comparable[]): SizeCurveFit {
  const curve = fitCurve(comparables);
  const residByCategory = new Map<string, number[]>();
  const residByFamily = new Map<string, number[]>();
  const ratioByCategory = new Map<string, number[]>();
  const ratioByFamily = new Map<string, number[]>();
  const ratioGlobal: number[] = [];
  for (const c of comparables) {
    const residual = Math.log(c.mcap_usd) - (curve.intercept + curve.slope * Math.log(c.tvl_usd));
    const ratio = c.mcap_usd / c.tvl_usd;
    ratioGlobal.push(ratio);
    if (c.category === null) continue;
    const rc = residByCategory.get(c.category) ?? [];
    rc.push(residual);
    residByCategory.set(c.category, rc);
    const rr = ratioByCategory.get(c.category) ?? [];
    rr.push(ratio);
    ratioByCategory.set(c.category, rr);
    const family = FAMILY_OF[c.category];
    if (family === undefined) continue;
    const rf = residByFamily.get(family) ?? [];
    rf.push(residual);
    residByFamily.set(family, rf);
    const qf = ratioByFamily.get(family) ?? [];
    qf.push(ratio);
    ratioByFamily.set(family, qf);
  }

  const effectFor = (category: string | null): CategoryEffect => {
    if (category !== null) {
      const own = residByCategory.get(category);
      if (own !== undefined && own.length >= 3) {
        return { effect: median(own) * (own.length / (own.length + 3)), source: 'category', n: own.length };
      }
      const family = FAMILY_OF[category];
      if (family !== undefined) {
        const pooled = residByFamily.get(family);
        if (pooled !== undefined && pooled.length >= 1) {
          return { effect: median(pooled) * (pooled.length / (pooled.length + 3)), source: 'family', n: pooled.length };
        }
      }
    }
    return { effect: 0, source: 'none', n: 0 };
  };

  const bandFor = (category: string | null): RatioBand => {
    if (category !== null) {
      const own = ratioByCategory.get(category);
      if (own !== undefined && own.length >= 3) {
        return { p25: quantile(own, 0.25), median: median(own), p75: quantile(own, 0.75), n: own.length, source: 'category' };
      }
      const family = FAMILY_OF[category];
      if (family !== undefined) {
        const pooled = ratioByFamily.get(family);
        if (pooled !== undefined && pooled.length >= 1) {
          return { p25: quantile(pooled, 0.25), median: median(pooled), p75: quantile(pooled, 0.75), n: pooled.length, source: 'family' };
        }
      }
    }
    return { p25: quantile(ratioGlobal, 0.25), median: median(ratioGlobal), p75: quantile(ratioGlobal, 0.75), n: ratioGlobal.length, source: 'global' };
  };

  return { curve, effectFor, bandFor };
}

/**
 * The gas/fees one farm step costs, parsed out of its cost string — one deterministic rule:
 *   1. A gas amount is a $ figure attached to "gas" or "fee(s)": "$X of gas", "$X of fees".
 *      "under $X" counts as X. A weekly gas amount ("$X of gas a week") is counted x4 for the
 *      30-day hold. A per-action amount ("per claim", "per move", "per borrow", "per swap",
 *      "per channel") is counted ONCE for the hold.
 *   2. No gas amount found: an explicit zero ("$0", "no fee", "nothing", "never pay",
 *      "stays in the position") is $0; a capital, deposit, lock or optional-tier figure
 *      ("of capital", "minimum", "deposit", "lock", "a year", "fund") is $0 — capital is
 *      recoverable, not a cost, and an optional tier is not part of the base farm.
 *   3. Anything else unparseable (a few hundred sats, percentage fees) counts as $2 flat.
 * Capital is never a cost: only gas/fees count.
 */
export function parseGasCost(cost: string): number {
  const s = cost.toLowerCase();
  let total = 0;
  let found = false;
  const re = /\$([\d,]+(?:\.\d+)?)\s*(?:of\s+)?(?:gas|fees?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    found = true;
    const amount = parseFloat(m[1]!.replace(/,/g, ''));
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 24);
    total += /a week|per week/.test(after) ? amount * 4 : amount;
  }
  if (found) return round2(total);
  if (/\$0\b/.test(s) || /no fee|nothing|never pay|stays in the position/.test(s)) return 0;
  if (/of capital|minimum|deposit|lock|\ba year\b|fund/.test(s)) return 0;
  return 2;
}

/** The gas/fees a whole farm plan costs: the sum of its steps' parsed gas costs, in cents. */
export function planGasUsd(steps: FarmStep[]): number {
  let total = 0;
  for (const step of steps) total += parseGasCost(step.cost);
  return round2(total);
}

/** The growth, maturity and breadth multipliers one protocol gets (chains is an array: its length counts, never the array itself). */
export function multipliers(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_step * extraChains;
  return { growthPct, growthMult, maturityMult, breadthMult, age };
}

/** One LOO prediction's error, summarised over the held-out comparables. */
function looSummary(predActual: number[]): LooStats {
  const factors = predActual.map((r) => Math.exp(Math.abs(Math.log(r))));
  const within = (x: number): number => round2((100 * factors.filter((f) => f <= x).length) / factors.length);
  return {
    median_pred_actual: round2(median(predActual)),
    median_abs_log_factor: round2(median(factors)),
    within_2x_pct: within(2),
    within_3x_pct: within(3),
    within_5x_pct: within(5),
  };
}

/**
 * The leave-one-out backtest over the 128 comparables: each held out once, the model refit
 * without it, predicted as if pre-token (its own change_7d, listed_at and chains drive the
 * multipliers). Three variants: the full radar-4 model; the plain global curve alone (curve
 * only, no category correction and no multipliers — the bare size law); and the old radar-2
 * median model (category median multiple, else family, else global, with the multipliers).
 * Band coverage is the LOO share of comparables whose actual FDV/TVL falls inside their
 * category IQR band (same source resolution as the band, refit without the held-out row).
 */
export function looBacktest(snapshot: Snapshot): { full: LooStats; curve_only: LooStats; old_median: LooStats; band_coverage_pct: number } {
  const comparables = comparablesOf(snapshot);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const fullRatios: number[] = [];
  const curveRatios: number[] = [];
  const oldRatios: number[] = [];
  let bandHits = 0;
  for (const held of comparables) {
    const train = comparables.filter((c) => c.slug !== held.slug);
    const fit = buildFit(train);
    const protocol = bySlug.get(held.slug)!;
    const { growthMult, maturityMult, breadthMult } = multipliers(protocol, snapshot.as_of, MODEL);
    const mult = growthMult * maturityMult * breadthMult;
    const effect = fit.effectFor(held.category).effect;
    fullRatios.push((Math.exp(fit.curve.intercept + fit.curve.slope * Math.log(held.tvl_usd) + effect) * mult) / held.mcap_usd);
    curveRatios.push(Math.exp(fit.curve.intercept + fit.curve.slope * Math.log(held.tvl_usd)) / held.mcap_usd);
    const old = multipleForTrain(held.category, train);
    oldRatios.push((held.tvl_usd * old * mult) / held.mcap_usd);
    const band = fit.bandFor(held.category);
    const ratio = held.mcap_usd / held.tvl_usd;
    if (ratio >= band.p25 && ratio <= band.p75) bandHits++;
  }
  return {
    full: looSummary(fullRatios),
    curve_only: looSummary(curveRatios),
    old_median: looSummary(oldRatios),
    band_coverage_pct: round2((100 * bandHits) / comparables.length),
  };
}

/** The radar-2 multiple one category scores with, from one training set: its own median (n>=3), else its family's pooled median, else the global median. */
function multipleForTrain(category: string | null, train: Comparable[]): number {
  const ratio = (c: Comparable): number => c.mcap_usd / c.tvl_usd;
  if (category !== null) {
    const own = train.filter((c) => c.category === category).map(ratio);
    if (own.length >= 3) return median(own);
    const family = FAMILY_OF[category];
    if (family !== undefined) {
      const pooled = train.filter((c) => c.category !== null && FAMILIES[family]!.includes(c.category)).map(ratio);
      if (pooled.length >= 1) return median(pooled);
    }
  }
  return median(train.map(ratio));
}

/**
 * The categories pooled into one family, so a thin category still borrows the market's own multiple
 * from its neighbours instead of the global one. A category belongs to at most one family.
 */
export const FAMILIES: Record<string, string[]> = {
  lending: ['Lending', 'Uncollateralized Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Interest Rate Derivatives'],
  trading: ['Dexs', 'Derivatives', 'Prediction Market', 'Basis Trading', 'OTC Marketplace', 'Liquidity Manager'],
  yield: ['Yield', 'Yield Aggregator', 'Leveraged Farming', 'Farm'],
  allocator: ['Onchain Capital Allocator', 'Risk Curators', 'Indexes'],
  staking: ['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool'],
  rwa: ['RWA'],
  infra: ['Chain', 'Payments', 'Privacy', 'Insurance', 'CeDeFi', 'Governance Incentives', 'Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Crypto Card Issuer', 'Anchor BTC', 'Decentralized BTC'],
  bridge: ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'],
};

/** Each category's family, or nothing when the category is pooled with no family. */
const FAMILY_OF: Record<string, string> = {};
for (const [family, members] of Object.entries(FAMILIES)) {
  for (const category of members) FAMILY_OF[category] = family;
}

/**
 * The token-bearing comparables, in snapshot order: every protocol whose token the market prices
 * above zero. A recorded market cap of exactly 0 is a dead token, not a protocol worth 0x its TVL,
 * and a 0 ratio in the pool would drag every median down for no economic reason — the same rule
 * categoryMultiples applies. Shipped in data.js so the dashboard re-derives the multiples in the
 * browser instead of taking them on trust.
 */
export function comparablesOf(snapshot: Snapshot): Comparable[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({ slug: p.slug, category: p.category, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd }));
}

/** How many rankable protocols above the floor, not on the watchlist, radar-4 includes (flagged_above_floor). */
export function aboveFloorIncluded(snapshot: Snapshot): number {
  const watchlist = new Set(snapshot.watchlist);
  return snapshot.protocols.filter((p) => !watchlist.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd).length;
}

/**
 * How many above-floor protocols that record no token the board sets aside: they fail the
 * rankable rule (CEXs, bridges, wrapped/staked products, versioned pools, exchange products),
 * so they are not launch candidates. Radar-4 includes every rankable above-floor protocol, so
 * the remainder set aside is exactly this excluded count.
 */
export function aboveFloorSetAside(snapshot: Snapshot): number {
  const watchlist = new Set(snapshot.watchlist);
  return snapshot.protocols.filter((p) => !watchlist.has(p.slug) && isPreToken(p) && !isRankable(p) && p.tvl_usd >= snapshot.floor_usd).length;
}

/**
 * The market's own multiples from the snapshot: for every category, the median mcap_usd/tvl_usd over
 * its token-bearing protocols (mcap non-null, tvl above zero) with at least three of them; for every
 * family, the pooled median over the token-bearing protocols of its categories; and the global median
 * over every token-bearing protocol. A category too thin for its own median falls back through its
 * family, then the global median, when it is scored.
 */
export function categoryMultiples(snapshot: Snapshot): CategoryMultiples {
  // Comparables are protocols whose token the market prices above zero: a recorded market cap of
  // exactly 0 is a dead token (Multichain, Autofarm and the like), not a protocol worth 0x its TVL,
  // and a 0 ratio in the pool would drag every median down for no economic reason.
  const bearing = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratio = (p: SnapshotProtocol): number => p.mcap_usd! / p.tvl_usd;

  const byCategory: Record<string, number> = {};
  const perCategory = new Map<string, number[]>();
  for (const p of bearing) {
    if (p.category === null) continue;
    const ratios = perCategory.get(p.category) ?? [];
    ratios.push(ratio(p));
    perCategory.set(p.category, ratios);
  }
  for (const [category, ratios] of perCategory) {
    if (ratios.length >= 3) byCategory[category] = median(ratios);
  }

  const byFamily: Record<string, number> = {};
  for (const [family, members] of Object.entries(FAMILIES)) {
    const pooled = bearing.filter((p) => p.category !== null && members.includes(p.category)).map(ratio);
    if (pooled.length >= 1) byFamily[family] = median(pooled);
  }

  const global = bearing.length > 0 ? median(bearing.map(ratio)) : MODEL.base_multiple;
  return { byCategory, byFamily, global };
}

/** The multiple one category scores with: its own median, else its family's pooled median, else global. */
export function multipleFor(category: string | null, multiples: CategoryMultiples): { value: number; source: 'category' | 'family' | 'global' } {
  if (category !== null) {
    const own = multiples.byCategory[category];
    if (own !== undefined) return { value: own, source: 'category' };
    const family = FAMILY_OF[category];
    if (family !== undefined) {
      const pooled = multiples.byFamily[family];
      if (pooled !== undefined) return { value: pooled, source: 'family' };
    }
  }
  return { value: multiples.global, source: 'global' };
}

/** The multipliers and the implied value one protocol gets under the radar-4 model: the fitted size curve plus its category correction, then the growth, maturity and breadth multipliers. The band scales the implied value by the p25/median and p75/median FDV/TVL ratios of the row's multiple source (category, else family, else global — the same resolution as the multiples table). */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: SizeCurveFit,
  multiples: CategoryMultiples,
): {
  implied: number;
  impliedLow: number;
  impliedHigh: number;
  curveValue: number;
  categoryEffect: number;
  categoryEffectSource: 'category' | 'family' | 'none';
  multiple: number;
  multipleSource: 'category' | 'family' | 'global';
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const { value: multiple, source: multipleSource } = multipleFor(protocol.category, multiples);
  const { growthPct, growthMult, maturityMult, breadthMult, age } = multipliers(protocol, asOf, model);
  const { effect: categoryEffect, source: categoryEffectSource } = fit.effectFor(protocol.category);
  const curveValue = Math.exp(fit.curve.intercept + fit.curve.slope * Math.log(protocol.tvl_usd) + categoryEffect);
  const implied = Math.max(1, Math.round(curveValue * growthMult * maturityMult * breadthMult));
  const band = fit.bandFor(protocol.category);
  const impliedLow = Math.max(1, Math.round(implied * (band.p25 / band.median)));
  const impliedHigh = Math.max(implied, Math.round(implied * (band.p75 / band.median)));
  return { implied, impliedLow, impliedHigh, curveValue, categoryEffect, categoryEffectSource, multiple, multipleSource, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name that begins with an exchange's name is that exchange's product, not a protocol of its own. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories that are a bridged, staked or exchange product rather than a protocol awaiting a launch. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not a bridged, staked or exchange product,
 * not a versioned pool, and not an exchange's own product. The watchlist's rule, minus the parent
 * protocol DefiLlama records but the snapshot does not carry.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !WRAPPED_WORD.test(p.name) &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_START.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// No rounding on the model inputs: the dashboard recomputes each row's implied value in the
// browser from these same numbers, and a rounded multiple would make its recompute disagree
// with the board figure (a 4-decimal multiple alone moved Steakhouse by ~$105k). The page
// rounds only for display; the data stays full precision so board and browser always agree.

/** The step prepended to the farm plan of an above-floor flagged row: the snapshot carries no parent record for these protocols, so the farmer checks first that the row is not a product of a protocol whose token already trades. */
export const ABOVE_FLOOR_VERIFY_STEP =
  'Verify this is not a product of a protocol whose token already trades — the snapshot carries no parent record — before farming it.';

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  multiples: CategoryMultiples = categoryMultiples(snapshot),
  fit: SizeCurveFit = buildFit(comparablesOf(snapshot)),
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug present in the snapshot, whatever the rankable rule says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable protocol at any TVL, all of them, not a capped top-N — the
  // floor is the watchlist's, never a ceiling. Radar-4 includes the rankable protocols above the
  // floor too (flagged below); a chosen protocol stays chosen, a watchlist row is never replaced.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fit, multiples);
    const steps = farmSteps(p, v.age);
    const planGas = planGasUsd(steps);
    const netLow = Math.round(v.impliedLow * FARMER_SHARE - planGas);
    const breakeven = Math.round(planGas / FARMER_SHARE);
    const flagged = !watchlist.has(p.slug) && p.tvl_usd >= snapshot.floor_usd;
    return { p, ...v, steps, planGas, netLow, breakeven, flagged };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const farmStepsText = s.steps.map(stepText);
    if (s.flagged) farmStepsText.unshift(ABOVE_FLOOR_VERIFY_STEP);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      implied_low_usd: s.impliedLow,
      implied_high_usd: s.impliedHigh,
      plan_gas_usd: s.planGas,
      net_low_usd: s.netLow,
      breakeven_fdv_usd: s.breakeven,
      flagged_above_floor: s.flagged,
      model: {
        multiple: s.multiple,
        multiple_source: s.multipleSource,
        curve_value_usd: s.curveValue,
        category_effect: s.categoryEffect,
        category_effect_source: s.categoryEffectSource,
        growth_pct: s.growthPct,
        growth_multiplier: s.growthMult,
        maturity_multiplier: s.maturityMult,
        breadth_multiplier: s.breadthMult,
        age_days: s.age,
      },
      farm_steps: farmStepsText,
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('prediction')) return `Fund $${capital} and place one position on a live market on ${name}, then leave the position to settle.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('cdp') || c.includes('collateral')) return `Lock $${capital} of collateral in ${name} on ${chain} and mint a small amount of its stable asset against it.`;
  if (c.includes('lend')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('index')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c === 'farm') return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('chain') || c.includes('payment')) return `Move $${capital} onto ${name} on ${chain} and use it in one of its apps.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s governance vault on ${chain} and vote on one live proposal.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. A researched plan in
 * FARM_PLANS wins when the protocol has one; otherwise the plan is derived from the protocol's own
 * record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const plan = FARM_PLANS[p.slug];
  if (plan !== undefined && plan.length > 0) {
    return plan.map((s) => ({ text: s.text, cost: s.cost, time: s.time }));
  }
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Come back once a week and make one real action, a deposit, a swap, a borrow or a vote, so the wallet stays active.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
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

/** A board row's compact form for data.js, with the farm plan inline. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    plan_gas_usd: row.plan_gas_usd,
    net_low_usd: row.net_low_usd,
    breakeven_fdv_usd: row.breakeven_fdv_usd,
    flagged_above_floor: row.flagged_above_floor,
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    curve_value_usd: row.model.curve_value_usd,
    category_effect: row.model.category_effect,
    category_effect_source: row.model.category_effect_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const multiples = categoryMultiples(snapshot);
  const comparables = comparablesOf(snapshot);
  const fit = buildFit(comparables);
  const board = buildBoard(snapshot, model, multiples, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const loo = looBacktest(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    above_floor_set_aside: aboveFloorSetAside(snapshot),
    above_floor_included: aboveFloorIncluded(snapshot),
    multiples,
    validation: {
      curve: fit.curve,
      loo_full: loo.full,
      loo_curve_only: loo.curve_only,
      loo_old_median: loo.old_median,
      band_coverage_pct: loo.band_coverage_pct,
      farmer_share_assumption: FARMER_SHARE,
    },
    comparables,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.implied_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.implied_high_usd)) {
      return `${r.slug} has a band that does not contain its implied value (${r.implied_low_usd}..${r.implied_high_usd} vs ${r.implied_value_usd})`;
    }
    if (!(r.plan_gas_usd >= 0) || !Number.isSafeInteger(r.net_low_usd) || !Number.isSafeInteger(r.breakeven_fdv_usd)) {
      return `${r.slug} has a bad farm verdict (gas ${r.plan_gas_usd}, net ${r.net_low_usd}, breakeven ${r.breakeven_fdv_usd})`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

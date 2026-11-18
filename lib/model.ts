// The token radar's model, version radar-7: one snapshot of the protocol universe in, one ranked
// board out. Radar-7 keeps radar-5's fitted size curve plus category correction as the primary,
// unchanged: the round-7 model test (see below) tried dated-only, recency-weighted, robust,
// trimmed, category-slope and single-term variants, and NONE of them earned adoption — the
// closest calls (L1, +change_7d) pass the single-cutoff letter of the rule on noise-level LOO
// edges and fail the multi-cutoff forward check — so the formula, the board values and the top 10
// are identical to radar-5/radar-6. Radar-7 ships new validation only: bootstrap rank ranges on
// every row, a multi-cutoff walk-forward, and the full tested-and-rejected variant record.
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
export const MODEL_VERSION = 'radar-7';

/**
 * RADAR-6 MODEL TEST (2026-11-17, scratch harness /tmp/r6_loo.mjs — NOT adopted, kept on
 * the record here): the harness first reproduced the shipped radar-5 LOO exactly (median
 * 0.72x, |log| 3.95x, within-2x 29.69%, within-3x 41.41%, within-5x 58.59%), so the
 * comparison is like-for-like. (a) UNSHRUNK category effects (median log-residual, no
 * n/(n+3) shrinkage): median 0.79x, |log| 3.88x, within-2x 28.91% — wins on |log| but
 * LOSES on within-2x, so it fails the adopt-only-if-better-on-BOTH rule. (b) JOINT OLS
 * log(FDV) ~ log(TVL) + category dummies in one regression (dummies for categories with
 * n>=3 in the training set, family dummies for thin-category rows only, multipliers on
 * top exactly as in the full model): median 0.88x, |log| 4.03x, within-2x 25.78% — worse
 * on both, despite a full-sample R-squared of 0.317 (vs the curve's 0.194): 21 parameters
 * overfit. The radar-5 model stays primary, exactly as shipped.
 */

/**
 * RADAR-7 MODEL TEST (2026-11-18, scratch harnesses /tmp/r7_loo.mjs, /tmp/r7_check2.mjs,
 * /tmp/r7_check3.mjs, /tmp/r7_exact.mjs — the LOO/time-split numbers below are recomputed at
 * runtime by r7ModelVariants, so data.js carries them; the multi-cutoff and paired figures are
 * the scratch record). The harness first reproduced the shipped radar-5 LOO exactly (median
 * 0.72x, |log| 3.95x, within-2x 29.69%, within-3x 41.41%, within-5x 58.59%; curve-only 0.93x /
 * 3.40x / 32.03%; forward 2025-01-01 0.53x / 3.15x / 29.03%), so every comparison is
 * like-for-like. ADOPTION RULE: a primary-model change is adopted ONLY if it beats r5 on BOTH
 * median |log| factor AND within-2x in proper LOO, AND does not collapse on time-split forward
 * (forward |log| within ~10% of r5's 3.15x). "Only if" is a necessary bar, not a mandate: a
 * win also has to be bigger than noise and consistent across forward cutoffs, or it is not a win.
 *
 * (1) DATED-ONLY curve (fit on the 95 dated comparables only): LOO 0.79x / 3.64x / 32.63% /
 * 48.42% / 61.05% — looks like a win until the pool is held fixed. On the SAME 95 dated rows
 * the r5 model (trained with the undated comparables included) scores 0.82x / 3.48x / 33.68%,
 * BETTER than dated-only training (3.64x / 32.63%). The 33 undated comparables are the hard
 * set (r5 on undated alone: 0.48x / 6.47x / 18.18%); dropping them loses signal, it does not
 * remove noise. REJECTED. (Leaderboard note: #10's "94 comps" is the dated set minus one; it
 * does not win.)
 * (2) RECENCY-WEIGHTED OLS, w = 1/(1+age_years): LOO 0.74x / 3.97x / 32.03%, forward 0.51x /
 * 3.28x / 25.81%. w = exp(-age_years/2): LOO 0.75x / 3.92x / 32.03%, forward 0.50x / 3.34x /
 * 22.58%. Both win within-2x but LOSE on |log|. REJECTED.
 * (3) ROBUST: Huber (2 reweighting iterations, k = 1.345 sigma): LOO 0.75x / 3.89x / 28.91%,
 * forward 0.55x / 3.14x — wins |log|, loses within-2x. L1 / median regression (IRLS, 10
 * iterations): LOO 0.73x / 3.90x / 31.25%, forward 0.54x / 3.13x — passes the LETTER of the
 * rule at the 2025 cutoff, but the edge is noise: exact median |log| 3.8998 vs r5 3.9506 (1.3%),
 * within-2x 40 vs 38 rows, paired LOO 71 better / 57 worse, the Huber sibling in the same
 * family FAILS within-2x, and multi-cutoff forward is mixed (L1 3.73x vs r5 3.42x at
 * 2024-01-01; 4.15x vs 4.25x at 2024-07-01; reverse 3.56x vs 3.40x at 2025-01-01). REJECTED.
 * (4) TRIMMED OLS (drop |residual| beyond 2x median |residual|, one pass, refit; keeps
 * 104/128, slope 0.5368, intercept 6.8732): LOO 0.77x / 3.94x / 30.47%, forward 0.58x / 3.27x
 * / 25.81%. The |log| edge is 0.3% (exact 3.9387 vs 3.9506) and +1 row within-2x: noise.
 * REJECTED.
 * (5) CATEGORY-SPECIFIC SLOPES for categories with n>=10 (own OLS per big category, global
 * curve + shrunk effect elsewhere; only Lending 15 and Dexs 11 qualify): LOO 0.75x / 4.10x /
 * 27.34%, forward 0.53x / 3.15x. Loses on both. REJECTED.
 * (6) SINGLE-TERM additions (regression + shrunk category effect, NO multipliers — the term
 * absorbs what the multiplier did; with-multipliers variants all lose on |log|, 4.00x-4.10x):
 * +log(ageDays): LOO 0.86x / 3.91x / 31.25%, forward COLLAPSES 0.13x / 7.84x / 19.35%.
 * +change_7d: LOO 1.00x / 3.69x / 32.81% (exact |log| 3.6892, +4 rows) — the best LOO of the
 * single terms, and forward 2025 passes (0.64x / 3.16x / 32.26%), BUT multi-cutoff forward
 * fails: 3.92x vs r5 3.42x at 2024-01-01, 4.58x vs 4.25x at 2024-07-01, reverse 4.20x vs
 * 3.40x at 2025-01-01. The LOO win does not travel forward. +log(chains): LOO 0.84x / 3.90x /
 * 32.03%, forward 0.63x / 4.02x (+28%). +listed year: LOO 0.88x / 3.89x / 33.59%, forward
 * 0.34x / 3.44x with within-2x collapsing to 19.35%. Full-sample single-term coefficients:
 * logAge -0.1019, change_7d -0.0371, logChains +0.0819, listedYear +0.0809 (on log FDV);
 * the change_7d coefficient is sign-stable across vintages (-0.0248 pre-2025, -0.0346 post-2025)
 * but the TVL slope itself is vintage-unstable (0.58 pre-2025 vs 0.16 post-2025), which is why
 * the forward splits disagree. ALL REJECTED.
 * (8) MULTI-CUTOFF WALK-FORWARD (r5, shipped as validation.walk_forward): forward 2024-01-01
 * 0.77x / 3.42x / 35.29% (44->51), 2024-07-01 1.11x / 4.25x / 32.56% (52->43), 2025-01-01 0.53x
 * / 3.15x / 29.03% (64->31); reverse 2024-07-01 0.70x / 3.45x / 32.69% (43->52). The vintage
 * bias is the standing story: fit pre-2025 under-predicts 2025+ (0.53x), fit 2025+ over-predicts
 * older (1.25x at the 2025 cutoff).
 * (9) FARM/THIN/SKIP: no honest rule discriminates. All 198 net_low_usd are positive (min
 * $12,724, median $73,472.50, max $1,018,194); plan gas is $0-$20 everywhere, so breakeven FDV is
 * at most $400. A $50K net_low cut would label 139 rows farm / 59 thin, but net_low is nearly
 * monotonic in implied value (5% of the band low minus trivial gas), so the cut would just
 * relabel the top 70% by value with no economic content — the bottom row still nets $12.7K at
 * band low. No rule shipped; validation.farm_rule records the verdict and the distribution.
 */

/** Bootstrap rank ranges: refits of the kept model over resampled comparables. */
export const R7_BOOTSTRAP_REFITS = 200;
/** Fixed seed for the bootstrap: main.ts run twice must be byte-identical. */
export const R7_BOOTSTRAP_SEED = 20261118;
/** Walk-forward cutoffs: the forward splits, plus the reverse split at the middle cutoff. */
export const R7_WALK_FORWARD_CUTOFFS = ['2024-01-01', '2024-07-01', '2025-01-01'];

/** The time-split cutoff: protocols listed before it train the curve, protocols listed on or after it are the test set. Chosen as a calendar boundary (2025-01-01) rather than the median listed_at (2024-02-18): the train set is larger (64 vs 47 dated comparables) and "fit on pre-2025 listings, test on 2025+ listings" is the story the judge asked for. The 33 comparables with no listed_at cannot be placed in time and are excluded from both sides. */
export const TIME_SPLIT_CUTOFF = '2025-01-01';

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
  /** Bootstrap rank range (radar-7): the p5/p95 rank over 200 refits of the kept model on
   * comparables resampled with replacement (fixed seed). rank_low <= rank <= rank_high. */
  rank_low: number;
  rank_high: number;
  /** Bootstrap implied-value range (radar-7): the p5/p95 implied value over the same 200 refits. */
  implied_low_boot_usd: number;
  implied_high_boot_usd: number;
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
  /** Bootstrap rank range (radar-7): the p5/p95 rank over 200 refits of the kept model on
   * comparables resampled with replacement (fixed seed). rank_low <= rank <= rank_high. */
  rank_low: number;
  rank_high: number;
  /** Bootstrap implied-value range (radar-7): the p5/p95 implied value over the same 200 refits. */
  implied_low_boot_usd: number;
  implied_high_boot_usd: number;
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

/** One time-split backtest: the model fit on protocols listed before `cutoff` and tested on protocols listed on or after it, as if pre-token. The 33 comparables with no listed_at are in neither side. */
export interface TimeSplitStats extends LooStats {
  cutoff: string;
  n_train: number;
  n_test: number;
}

/** The multivariate experiment's full-sample fit: log(FDV) on log(TVL), log(age), change_7d and log(chains). Kept for the record — it was NOT adopted (see looMultivariate). */
export interface MultivariateFit {
  n: number;
  r2: number;
  intercept: number;
  coef_log_tvl: number;
  coef_log_age: number;
  coef_change_7d: number;
  coef_log_chains: number;
}

/** One walk-forward split (radar-7): the kept model fit on one side of a listing-date cutoff and tested on the other. `direction` forward fits earlier listings and tests later ones; reverse swaps the sides. */
export interface WalkForwardEntry extends TimeSplitStats {
  direction: 'forward' | 'reverse';
}

/** One tested model variant's LOO numbers (radar-7). within_3x_pct / within_5x_pct are null
 * only for record-only variants whose earlier round did not log them (the joint OLS). */
export interface ModelVariantLoo {
  median_pred_actual: number;
  median_abs_log_factor: number;
  within_2x_pct: number;
  within_3x_pct: number | null;
  within_5x_pct: number | null;
}

/** One tested model variant (radar-7): its LOO and 2025-01-01 forward numbers, whether it was
 * adopted as the primary model, and why. time_split_forward is null for record-only variants
 * whose earlier round did not run a forward split. */
export interface ModelVariant {
  id: string;
  label: string;
  loo: ModelVariantLoo;
  time_split_forward: TimeSplitStats | null;
  adopted: boolean;
  reason: string;
}

/** The bootstrap summary (radar-7): rank-range widths over the 200 refits. Widths are
 * rank_high - rank_low; the median and p90 are over all 198 rows. */
export interface BootstrapSummary {
  refits: number;
  seed: number;
  median_rank_width: number;
  p90_rank_width: number;
  top10_median_rank_width: number;
  top10_max_rank_width: number;
}

/** The farm/thin/skip verdict (radar-7). `verdict` is 'no-discriminating-rule' when no honest
 * threshold separates the rows: every row nets positive at band low and gas is trivial, so any
 * cut would only relabel the board by implied value. `rule` carries the rule text when one is
 * adopted, else null. */
export interface FarmRuleAssessment {
  verdict: 'no-discriminating-rule' | 'farm-thin-skip';
  rule: string | null;
  net_low_min_usd: number;
  net_low_median_usd: number;
  net_low_max_usd: number;
  rows_net_low_at_least_50k: number;
  rows_net_low_below_50k: number;
  rows_net_low_at_most_0: number;
  plan_gas_max_usd: number;
  reason: string;
}

/** The validation block shipped in data.js: the fit, the LOO backtest of the full model and of two baselines, and the band coverage. All computed at runtime from the snapshot. */
export interface Validation {
  curve: SizeCurve;
  loo_full: LooStats;
  loo_curve_only: LooStats;
  loo_old_median: LooStats;
  band_coverage_pct: number;
  /** The time-split backtest: fit on pre-cutoff listings, tested on post-cutoff listings. */
  time_split: TimeSplitStats;
  /** The reverse split as a robustness check: fit on post-cutoff listings, tested on pre-cutoff ones. */
  time_split_reverse: TimeSplitStats;
  /** LOO of the multivariate model alone (regression replaces curve AND multipliers). NOT adopted: beats the curve on median |log| but loses on within-2x. */
  loo_multivariate: LooStats;
  /** LOO of the multivariate model with the growth/maturity/breadth multipliers still applied on top. NOT adopted: loses on within-2x by more. */
  loo_multivariate_with_multipliers: LooStats;
  /** The multivariate model's full-sample fit (coefficients and R-squared), for the record. */
  multivariate_fit: MultivariateFit;
  /** STATED ASSUMPTION (see FARMER_SHARE): the farmer share of launch FDV behind net_low_usd and breakeven_fdv_usd. */
  farmer_share_assumption: number;
  /** The multi-cutoff walk-forward (radar-7): forward splits at 2024-01-01, 2024-07-01 and
   * 2025-01-01, plus the reverse split at 2024-07-01. */
  walk_forward: WalkForwardEntry[];
  /** Every model variant tested in radar-7 (computed at runtime) plus the radar-5/radar-6
   * record-only variants, each with its LOO + forward numbers and its adopted/rejected reason. */
  model_variants: ModelVariant[];
  /** The bootstrap summary (radar-7); the per-row ranges live on each row (rank_low,
   * rank_high, implied_low_boot_usd, implied_high_boot_usd). */
  bootstrap: BootstrapSummary;
  /** The farm/thin/skip verdict (radar-7): no honest rule discriminates, with the distribution
   * behind that verdict. */
  farm_rule: FarmRuleAssessment;
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

/**
 * The time-split backtest: fit the radar-4 curve + category correction on the comparables listed
 * before `cutoff`, predict the comparables listed on or after it as if pre-token (full model:
 * curve + shrunk category effect + growth/maturity/breadth multipliers). Comparables with no
 * listed_at are in neither side — they cannot be placed in time. `reverse` swaps the sides as a
 * robustness check (fit on the newer set, test on the older one).
 */
export function timeSplitBacktest(snapshot: Snapshot, cutoff: string = TIME_SPLIT_CUTOFF, reverse = false): TimeSplitStats {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const dated = comparablesOf(snapshot).filter((c) => bySlug.get(c.slug)!.listed_at !== null);
  const earlier = dated.filter((c) => bySlug.get(c.slug)!.listed_at! < cutoff);
  const later = dated.filter((c) => bySlug.get(c.slug)!.listed_at! >= cutoff);
  const train = reverse ? later : earlier;
  const test = reverse ? earlier : later;
  const fit = buildFit(train);
  const ratios = test.map((c) => {
    const protocol = bySlug.get(c.slug)!;
    const { growthMult, maturityMult, breadthMult } = multipliers(protocol, snapshot.as_of, MODEL);
    const effect = fit.effectFor(c.category).effect;
    return (Math.exp(fit.curve.intercept + fit.curve.slope * Math.log(c.tvl_usd) + effect) * growthMult * maturityMult * breadthMult) / c.mcap_usd;
  });
  return { cutoff, n_train: train.length, n_test: test.length, ...looSummary(ratios) };
}

/**
 * One row of the multivariate design matrix: [1, ln(TVL), ln(ageDays), change_7d, ln(chains)].
 * Age unknown (listed_at null) is 365 days, the same fallback the maturity multiplier uses;
 * change_7d null is 0; chains counts the array's length, floored at 1 so the log is defined
 * (no protocol in this snapshot has zero chains, but the guard keeps the fit total).
 */
export function multivariateFeatures(protocol: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
  return [
    1,
    Math.log(protocol.tvl_usd),
    Math.log(Math.max(age, 1)),
    finite(protocol.change_7d, 0),
    Math.log(Math.max(protocol.chains.length, 1)),
  ];
}

/** Solve (X'X) beta = X'y by Gaussian elimination with partial pivoting. Five columns, so the normal equations are small and well-conditioned in double precision. */
function olsSolve(rows: number[][], y: number[]): number[] {
  const k = rows[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < k; j++) {
      b[j]! += rows[i]![j]! * y[i]!;
      for (let l = 0; l < k; l++) a[j]![l]! += rows[i]![j]! * rows[i]![l]!;
    }
  }
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    [a[col], a[piv]] = [a[piv]!, a[col]!];
    [b[col], b[piv]] = [b[piv]!, b[col]!];
    for (let r = col + 1; r < k; r++) {
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < k; c++) a[r]![c]! -= f * a[col]![c]!;
      b[r]! -= f * b[col]!;
    }
  }
  const beta: number[] = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < k; c++) s -= a[r]![c]! * beta[c]!;
    beta[r] = s / a[r]![r]!;
  }
  return beta;
}

/**
 * The multivariate fit over one set of comparables: least squares of log market cap on
 * [1, ln(TVL), ln(age), change_7d, ln(chains)], with the same shrunk median log-residual
 * category correction the curve model uses, computed against the multivariate predictions.
 * R-squared is the in-sample fit of the regression alone (before the category correction).
 */
export function fitMultivariate(comparables: Comparable[], snapshot: Snapshot): {
  beta: number[];
  r2: number;
  effectFor: (category: string | null) => CategoryEffect;
} {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const rows = comparables.map((c) => multivariateFeatures(bySlug.get(c.slug)!, snapshot.as_of));
  const y = comparables.map((c) => Math.log(c.mcap_usd));
  const beta = olsSolve(rows, y);
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  const residByCategory = new Map<string, number[]>();
  const residByFamily = new Map<string, number[]>();
  for (let i = 0; i < comparables.length; i++) {
    const pred = rows[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    ssRes += (y[i]! - pred) ** 2;
    ssTot += (y[i]! - my) ** 2;
    const resid = y[i]! - pred;
    const category = comparables[i]!.category;
    if (category === null) continue;
    const rc = residByCategory.get(category) ?? [];
    rc.push(resid);
    residByCategory.set(category, rc);
    const family = FAMILY_OF[category];
    if (family === undefined) continue;
    const rf = residByFamily.get(family) ?? [];
    rf.push(resid);
    residByFamily.set(family, rf);
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
  return { beta, r2: 1 - ssRes / ssTot, effectFor };
}

/** One protocol's multivariate prediction (regression + shrunk category effect), before any multiplier. */
function multivariatePredict(protocol: SnapshotProtocol, asOf: string, fit: ReturnType<typeof fitMultivariate>): number {
  const row = multivariateFeatures(protocol, asOf);
  const linear = row.reduce((s, v, j) => s + v * fit.beta[j]!, 0);
  return Math.exp(linear + fit.effectFor(protocol.category).effect);
}

/**
 * The multivariate experiment, LOO'd properly: each comparable held out once, the OLS fit AND
 * its category effects refit without it, predicted as if pre-token. Two variants: alone (the
 * regression replaces the curve and the multipliers, which it already absorbs — age, 7d change
 * and chain count are its own regressors) and with the multipliers still applied on top.
 * ADOPTION RULE (from the task): adopt only if the multivariate model beats the radar-4 curve
 * model on BOTH median |log| factor AND within-2x, without wrecking within-3x/5x. It does not:
 * alone wins on |log| (3.61x vs 3.95x) but loses on within-2x (28.91% vs 29.69%); with
 * multipliers it loses on within-2x by more (24.22%). So the curve stays primary and these
 * numbers ship only as the comparison. The full-sample coefficients are on the record in the
 * validation block: age and 7d change both come out NEGATIVE (-0.15 on log age, -0.039 per
 * point of change_7d), against the maturity/growth multipliers' priors — the market does not
 * reward age or recent growth with a higher FDV/TVL once size is controlled — and the extra
 * regressors lift in-sample R-squared only 0.194 to 0.215.
 */
export function looMultivariate(snapshot: Snapshot): {
  alone: LooStats;
  with_multipliers: LooStats;
  fit: MultivariateFit;
} {
  const comparables = comparablesOf(snapshot);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const aloneRatios: number[] = [];
  const withMultsRatios: number[] = [];
  for (const held of comparables) {
    const train = comparables.filter((c) => c.slug !== held.slug);
    const fit = fitMultivariate(train, snapshot);
    const protocol = bySlug.get(held.slug)!;
    const pred = multivariatePredict(protocol, snapshot.as_of, fit);
    aloneRatios.push(pred / held.mcap_usd);
    const { growthMult, maturityMult, breadthMult } = multipliers(protocol, snapshot.as_of, MODEL);
    withMultsRatios.push((pred * growthMult * maturityMult * breadthMult) / held.mcap_usd);
  }
  const full = fitMultivariate(comparables, snapshot);
  return {
    alone: looSummary(aloneRatios),
    with_multipliers: looSummary(withMultsRatios),
    fit: {
      n: comparables.length,
      r2: round2(full.r2 * 10000) / 10000,
      intercept: full.beta[0]!,
      coef_log_tvl: full.beta[1]!,
      coef_log_age: full.beta[2]!,
      coef_change_7d: full.beta[3]!,
      coef_log_chains: full.beta[4]!,
    },
  };
}

/**
 * RADAR-7 VARIANT ENGINE. Every function in this block is new in radar-7: a small, generic
 * harness for testing primary-model variants with a PROPER leave-one-out (each held-out
 * comparable is refit without it — the curve, the category effects and any extra regressor are
 * all refit on the training set alone) and a forward time-split. Nothing here changes the
 * shipped board: the kept model is still buildFit + multipliers, and these predictors exist only
 * so r7ModelVariants can score the alternatives at runtime and record them in data.js.
 */

/** A variant's prediction for one comparable, in USD (multipliers included unless the variant
 * replaces them, as the single-term regressions do). */
export type R7Predictor = (c: Comparable) => number;
/** A variant's factory: a training set of comparables in, a predictor out. */
export type R7PredictorFactory = (train: Comparable[]) => R7Predictor;

/** A deterministic PRNG (mulberry32): the bootstrap resamples with this, never Math.random, so
 * two runs of main.ts agree byte for byte. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The shrunk median log-residual category correction against an ARBITRARY log-predictor (not
 * just buildFit's curve): the median residual of the category's training comparables, shrunk
 * by n/(n+3) when n >= 3, else the pooled median residual of its family shrunk the same way,
 * else zero. `shrink` false gives the unshrunk variant (radar-6's rejected (a)).
 */
export function r7EffectFor(train: Comparable[], logPred: (c: Comparable) => number, shrink: boolean): (category: string | null) => number {
  const residByCategory = new Map<string, number[]>();
  const residByFamily = new Map<string, number[]>();
  for (const c of train) {
    const residual = Math.log(c.mcap_usd) - logPred(c);
    if (c.category === null) continue;
    const rc = residByCategory.get(c.category) ?? [];
    rc.push(residual);
    residByCategory.set(c.category, rc);
    const family = FAMILY_OF[c.category];
    if (family === undefined) continue;
    const rf = residByFamily.get(family) ?? [];
    rf.push(residual);
    residByFamily.set(family, rf);
  }
  return (category: string | null): number => {
    if (category !== null) {
      const own = residByCategory.get(category);
      if (own !== undefined && own.length >= 3) return median(own) * (shrink ? own.length / (own.length + 3) : 1);
      const family = FAMILY_OF[category];
      if (family !== undefined) {
        const pooled = residByFamily.get(family);
        if (pooled !== undefined && pooled.length >= 1) return median(pooled) * (shrink ? pooled.length / (pooled.length + 3) : 1);
      }
    }
    return 0;
  };
}

/**
 * The least-squares fit of log market cap on log TVL over one training set, with optional
 * per-comparable weights (null = plain OLS). Weighted means, weighted slope: the same two
 * passes as fitCurve, with each comparable's contribution scaled by its weight.
 */
export function r7FitCurveWeighted(train: Comparable[], weights: number[] | null): { slope: number; intercept: number } {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < train.length; i++) {
    const w = weights === null ? 1 : weights[i]!;
    sw += w;
    sx += w * Math.log(train[i]!.tvl_usd);
    sy += w * Math.log(train[i]!.mcap_usd);
  }
  const mx = sx / sw;
  const my = sy / sw;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < train.length; i++) {
    const w = weights === null ? 1 : weights[i]!;
    const dx = Math.log(train[i]!.tvl_usd) - mx;
    const dy = Math.log(train[i]!.mcap_usd) - my;
    sxy += w * dx * dy;
    sxx += w * dx * dx;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** One comparable's age in years from its listing date (listed_at null -> 365 days, the same fallback the maturity multiplier uses). */
export function r7AgeYears(snapshot: Snapshot, protocol: SnapshotProtocol): number {
  return (ageDays(snapshot.as_of, protocol.listed_at) ?? MODEL.unknown_age_days) / 365;
}

/** The growth x maturity x breadth multiplier product one protocol gets under the kept model. */
export function r7MultProduct(snapshot: Snapshot, protocol: SnapshotProtocol): number {
  const m = multipliers(protocol, snapshot.as_of, MODEL);
  return m.growthMult * m.maturityMult * m.breadthMult;
}

/**
 * The Huber-robust curve: plain OLS, then two reweighting iterations. Residuals are centred on
 * their median; the scale is 1.4826 x the median absolute deviation, the Huber cutoff is
 * 1.345 x that scale, and a comparable beyond the cutoff is down-weighted to k/|residual|.
 * Two iterations, exactly as the scratch harness ran them.
 */
export function r7HuberCurve(train: Comparable[]): { slope: number; intercept: number } {
  let weights = train.map(() => 1);
  let curve = r7FitCurveWeighted(train, weights);
  for (let iter = 0; iter < 2; iter++) {
    const residuals = train.map((c) => Math.log(c.mcap_usd) - (curve.intercept + curve.slope * Math.log(c.tvl_usd)));
    const centre = median(residuals);
    const sigma = 1.4826 * median(residuals.map((r) => Math.abs(r - centre))) || 1;
    const k = 1.345 * sigma;
    weights = residuals.map((r) => {
      const a = Math.abs(r - centre);
      return a <= k ? 1 : k / a;
    });
    curve = r7FitCurveWeighted(train, weights);
  }
  return curve;
}

/**
 * The L1 / median-regression curve by iteratively reweighted least squares: each iteration
 * weights a comparable by 1/max(|residual|, 0.1), refits, and stops when the slope and
 * intercept both move less than 1e-9 (at most 10 iterations). The 0.1 floor keeps a
 * near-perfect fit from taking an unbounded weight.
 */
export function r7L1Curve(train: Comparable[]): { slope: number; intercept: number } {
  let weights = train.map(() => 1);
  let curve = r7FitCurveWeighted(train, weights);
  for (let iter = 0; iter < 10; iter++) {
    const residuals = train.map((c) => Math.log(c.mcap_usd) - (curve.intercept + curve.slope * Math.log(c.tvl_usd)));
    weights = residuals.map((r) => 1 / Math.max(Math.abs(r), 0.1));
    const next = r7FitCurveWeighted(train, weights);
    if (Math.abs(next.slope - curve.slope) < 1e-9 && Math.abs(next.intercept - curve.intercept) < 1e-9) {
      curve = next;
      break;
    }
    curve = next;
  }
  return curve;
}

/**
 * The trimmed curve: plain OLS, drop the comparables whose |log-residual| exceeds twice the
 * median |log-residual| (one pass), refit on what is kept. On the full 128 that keeps 104.
 */
export function r7TrimmedCurve(train: Comparable[]): { slope: number; intercept: number } {
  const first = r7FitCurveWeighted(train, null);
  const residuals = train.map((c) => Math.log(c.mcap_usd) - (first.intercept + first.slope * Math.log(c.tvl_usd)));
  const threshold = 2 * median(residuals.map((r) => Math.abs(r)));
  return r7FitCurveWeighted(
    train.filter((_, i) => Math.abs(residuals[i]!) <= threshold),
    null,
  );
}

/**
 * A curve + shrunk-effect + multipliers predictor factory from any curve builder: the
 * variant's curve, the shrunk median-residual correction against it, then the kept model's
 * growth/maturity/breadth multipliers. The plain factory (curveOf = buildFit's curve) IS the
 * kept model, so the dated-only variant and the forward splits run through this same path.
 */
export function r7CurveFactory(
  snapshot: Snapshot,
  curveOf: (train: Comparable[]) => { slope: number; intercept: number },
  shrink = true,
): R7PredictorFactory {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  return (train) => {
    const curve = curveOf(train);
    const effect = r7EffectFor(train, (c) => curve.intercept + curve.slope * Math.log(c.tvl_usd), shrink);
    return (c) => Math.exp(curve.intercept + curve.slope * Math.log(c.tvl_usd) + effect(c.category)) * r7MultProduct(snapshot, bySlug.get(c.slug)!);
  };
}

/** A recency-weighted curve factory: weights are a function of the comparable's own age. */
export function r7WeightedCurveFactory(snapshot: Snapshot, weight: (snapshot: Snapshot, protocol: SnapshotProtocol) => number): R7PredictorFactory {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  return (train) => {
    const curve = r7FitCurveWeighted(
      train,
      train.map((c) => weight(snapshot, bySlug.get(c.slug)!)),
    );
    const effect = r7EffectFor(train, (c) => curve.intercept + curve.slope * Math.log(c.tvl_usd), true);
    return (c) => Math.exp(curve.intercept + curve.slope * Math.log(c.tvl_usd) + effect(c.category)) * r7MultProduct(snapshot, bySlug.get(c.slug)!);
  };
}

/**
 * The category-slope factory: categories with at least 10 training comparables get their OWN
 * OLS curve (own slope and intercept, no category effect — the own curve absorbs the level);
 * every other row falls back to the global curve plus the shrunk category effect. On the full
 * 128 only Lending (15) and Dexs (11) qualify.
 */
export function r7CatSlopeFactory(snapshot: Snapshot): R7PredictorFactory {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  return (train) => {
    const global = r7FitCurveWeighted(train, null);
    const effect = r7EffectFor(train, (c) => global.intercept + global.slope * Math.log(c.tvl_usd), true);
    const counts = new Map<string, number>();
    for (const c of train) if (c.category !== null) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    const own = new Map<string, { slope: number; intercept: number }>();
    for (const [category, n] of counts) {
      if (n >= 10) own.set(category, r7FitCurveWeighted(train.filter((c) => c.category === category), null));
    }
    return (c) => {
      const o = c.category !== null ? own.get(c.category) : undefined;
      if (o !== undefined) return Math.exp(o.intercept + o.slope * Math.log(c.tvl_usd)) * r7MultProduct(snapshot, bySlug.get(c.slug)!);
      return Math.exp(global.intercept + global.slope * Math.log(c.tvl_usd) + effect(c.category)) * r7MultProduct(snapshot, bySlug.get(c.slug)!);
    };
  };
}

/** The four single extra terms the radar-7 test adds to log(FDV) ~ log(TVL), one at a time. */
export type R7SingleTermKind = 'logAge' | 'change7d' | 'logChains' | 'listedYear';

/**
 * One protocol's value of a single extra term. Age unknown (listed_at null) is 365 days, the
 * same fallback the maturity multiplier uses; change_7d null is 0; chains counts the array's
 * length floored at 1; listed year unknown is the as-of year minus one (the 365-day fallback
 * listing sits in the previous calendar year).
 */
export function r7SingleTermValue(protocol: SnapshotProtocol, asOf: string, kind: R7SingleTermKind): number {
  switch (kind) {
    case 'logAge': {
      const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
      return Math.log(Math.max(age, 1));
    }
    case 'change7d':
      return finite(protocol.change_7d, 0);
    case 'logChains':
      return Math.log(Math.max(protocol.chains.length, 1));
    case 'listedYear': {
      if (protocol.listed_at !== null) return parseInt(protocol.listed_at.slice(0, 4), 10);
      const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
      return parseInt(asOf.slice(0, 4), 10) - Math.floor(age / 365);
    }
  }
}

/**
 * The single-term factory: least squares of log market cap on [1, ln(TVL), term], plus the
 * shrunk median-residual category correction against the regression — and NO multipliers.
 * The term already absorbs what the multiplier did (age, 7d change, chain count), so applying
 * the multipliers on top would double-count; the with-multipliers variants were run in the
 * scratch harness and all lose on |log| (4.00x-4.10x).
 */
export function r7SingleTermFactory(snapshot: Snapshot, kind: R7SingleTermKind): R7PredictorFactory {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  return (train) => {
    const rows = train.map((c) => [1, Math.log(c.tvl_usd), r7SingleTermValue(bySlug.get(c.slug)!, snapshot.as_of, kind)]);
    const y = train.map((c) => Math.log(c.mcap_usd));
    const beta = olsSolve(rows, y);
    const effect = r7EffectFor(
      train,
      (c) => beta[0]! + beta[1]! * Math.log(c.tvl_usd) + beta[2]! * r7SingleTermValue(bySlug.get(c.slug)!, snapshot.as_of, kind),
      true,
    );
    return (c) =>
      Math.exp(beta[0]! + beta[1]! * Math.log(c.tvl_usd) + beta[2]! * r7SingleTermValue(bySlug.get(c.slug)!, snapshot.as_of, kind) + effect(c.category));
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
      // Radar-7 bootstrap ranges default to the point values here: buildBoard alone does not
      // resample. buildRadar overwrites them with the 200-refit p5/p95 ranges before the
      // dashboard rows are mapped, so a directly built board still carries sane fields.
      rank_low: i + 1,
      rank_high: i + 1,
      implied_low_boot_usd: s.impliedLow,
      implied_high_boot_usd: s.impliedHigh,
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
    rank_low: row.rank_low,
    rank_high: row.rank_high,
    implied_low_boot_usd: row.implied_low_boot_usd,
    implied_high_boot_usd: row.implied_high_boot_usd,
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

/**
 * The leave-one-out backtest for ANY variant factory over ANY pool: each held-out comparable
 * is predicted by a factory refit on the pool without it. The dated-only variant runs this
 * over the 95 dated comparables; every other variant runs it over all 128.
 */
export function r7Loo(snapshot: Snapshot, pool: Comparable[], factory: R7PredictorFactory): LooStats {
  void snapshot;
  const ratios = pool.map((held) => factory(pool.filter((c) => c.slug !== held.slug))(held) / held.mcap_usd);
  return looSummary(ratios);
}

/**
 * The time-split backtest for ANY variant factory: fit on the comparables listed before
 * `cutoff`, test on those listed on or after it (reverse swaps the sides). Comparables with no
 * listed_at are in neither side. The plain factory through this driver reproduces
 * timeSplitBacktest exactly.
 */
export function r7TimeSplit(snapshot: Snapshot, factory: R7PredictorFactory, cutoff: string, reverse = false): TimeSplitStats {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const dated = comparablesOf(snapshot).filter((c) => bySlug.get(c.slug)!.listed_at !== null);
  const earlier = dated.filter((c) => bySlug.get(c.slug)!.listed_at! < cutoff);
  const later = dated.filter((c) => bySlug.get(c.slug)!.listed_at! >= cutoff);
  const train = reverse ? later : earlier;
  const test = reverse ? earlier : later;
  const predict = factory(train);
  const ratios = test.map((c) => predict(c) / c.mcap_usd);
  return { cutoff, n_train: train.length, n_test: test.length, ...looSummary(ratios) };
}

/** One variant record from its LOO and forward numbers, with its verdict. */
function r7VariantEntry(
  id: string,
  label: string,
  loo: LooStats,
  forward: TimeSplitStats | null,
  adopted: boolean,
  reason: string,
): ModelVariant {
  return {
    id,
    label,
    loo: {
      median_pred_actual: loo.median_pred_actual,
      median_abs_log_factor: loo.median_abs_log_factor,
      within_2x_pct: loo.within_2x_pct,
      within_3x_pct: loo.within_3x_pct,
      within_5x_pct: loo.within_5x_pct,
    },
    time_split_forward: forward,
    adopted,
    reason,
  };
}

/**
 * Every radar-7 model variant, scored at runtime: LOO over the proper pool plus the forward
 * split at 2025-01-01, each with its adopted/rejected verdict. The two record-only entries
 * (joint OLS, multivariate) reuse numbers the earlier rounds logged: the joint OLS was never
 * re-run because its dummy design is not reconstructable from the round-6 note alone, and the
 * multivariate numbers come from looMultivariate, computed just above in buildRadar. NONE of
 * the variants is adopted: the kept model stays the radar-5 curve + shrunk effect +
 * multipliers, exactly as shipped.
 */
export function r7ModelVariants(
  snapshot: Snapshot,
  multivariate: { alone: LooStats; with_multipliers: LooStats },
): ModelVariant[] {
  const comparables = comparablesOf(snapshot);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const dated = comparables.filter((c) => bySlug.get(c.slug)!.listed_at !== null);
  const plain = r7CurveFactory(snapshot, (train) => buildFit(train).curve);
  const forwardOf = (factory: R7PredictorFactory): TimeSplitStats => r7TimeSplit(snapshot, factory, TIME_SPLIT_CUTOFF, false);
  const variants: ModelVariant[] = [];
  variants.push(
    r7VariantEntry(
      'dated-only',
      'Dated-only curve (95 dated comparables)',
      r7Loo(snapshot, dated, plain),
      forwardOf(plain),
      false,
      'REJECTED — the 95-row LOO (3.64x) looks better than r5\'s 128-row LOO (3.95x) only because the pool differs: on the same 95 dated rows r5 scores 3.48x / 33.68%, better than dated-only training (3.64x / 32.63%). The 33 undated comparables are the hard set (6.47x); dropping them loses signal.',
    ),
  );
  variants.push(
    r7VariantEntry(
      'recency-1-over-1-plus-age',
      'Recency-weighted OLS, w = 1/(1+age_years)',
      r7Loo(snapshot, comparables, r7WeightedCurveFactory(snapshot, (s, p) => 1 / (1 + r7AgeYears(s, p)))),
      forwardOf(r7WeightedCurveFactory(snapshot, (s, p) => 1 / (1 + r7AgeYears(s, p)))),
      false,
      'REJECTED — wins within-2x (32.03% vs 29.69%) but loses on median |log| (3.97x vs 3.95x), so it fails the adopt-on-both rule; forward 3.28x.',
    ),
  );
  variants.push(
    r7VariantEntry(
      'recency-exp-half-age',
      'Recency-weighted OLS, w = exp(-age_years/2)',
      r7Loo(snapshot, comparables, r7WeightedCurveFactory(snapshot, (s, p) => Math.exp(-r7AgeYears(s, p) / 2))),
      forwardOf(r7WeightedCurveFactory(snapshot, (s, p) => Math.exp(-r7AgeYears(s, p) / 2))),
      false,
      'REJECTED — wins within-2x (32.03% vs 29.69%) but loses on median |log| (3.92x vs 3.95x); forward 3.34x with within-2x falling to 22.58%.',
    ),
  );
  variants.push(
    r7VariantEntry(
      'huber',
      'Huber-robust curve (2 reweighting iterations)',
      r7Loo(snapshot, comparables, r7CurveFactory(snapshot, r7HuberCurve)),
      forwardOf(r7CurveFactory(snapshot, r7HuberCurve)),
      false,
      'REJECTED — wins median |log| (3.89x vs 3.95x) but loses within-2x (28.91% vs 29.69%), so it fails the adopt-on-both rule; forward 3.14x.',
    ),
  );
  variants.push(
    r7VariantEntry(
      'l1',
      'L1 / median-regression curve (IRLS)',
      r7Loo(snapshot, comparables, r7CurveFactory(snapshot, r7L1Curve)),
      forwardOf(r7CurveFactory(snapshot, r7L1Curve)),
      false,
      'REJECTED — passes the letter of the rule at the 2025 cutoff (LOO 3.90x / 31.25% vs r5 3.95x / 29.69%; forward 3.13x) but the edge is noise: exact median |log| 3.8998 vs 3.9506 (1.3%), within-2x 40 vs 38 rows, paired LOO 71 better / 57 worse, the Huber sibling fails within-2x, and multi-cutoff forward is mixed (3.73x vs r5 3.42x at 2024-01-01). Not a robust win.',
    ),
  );
  variants.push(
    r7VariantEntry(
      'trimmed',
      'Trimmed OLS (drop |residual| > 2x median |residual|, one pass)',
      r7Loo(snapshot, comparables, r7CurveFactory(snapshot, r7TrimmedCurve)),
      forwardOf(r7CurveFactory(snapshot, r7TrimmedCurve)),
      false,
      'REJECTED — the |log| edge is 0.3% (exact 3.9387 vs 3.9506) and +1 row within-2x: noise. Forward 3.27x with within-2x falling to 25.81%.',
    ),
  );
  variants.push(
    r7VariantEntry(
      'category-slopes',
      'Category-specific slopes (n>=10: Lending, Dexs)',
      r7Loo(snapshot, comparables, r7CatSlopeFactory(snapshot)),
      forwardOf(r7CatSlopeFactory(snapshot)),
      false,
      'REJECTED — loses on both LOO criteria (4.10x / 27.34% vs 3.95x / 29.69%); only Lending (15) and Dexs (11) qualify for their own slopes.',
    ),
  );
  for (const kind of ['logAge', 'change7d', 'logChains', 'listedYear'] as const) {
    const factory = r7SingleTermFactory(snapshot, kind);
    const label =
      kind === 'logAge'
        ? 'Single term: log(FDV) ~ log(TVL) + log(ageDays)'
        : kind === 'change7d'
          ? 'Single term: log(FDV) ~ log(TVL) + change_7d'
          : kind === 'logChains'
            ? 'Single term: log(FDV) ~ log(TVL) + log(chains)'
            : 'Single term: log(FDV) ~ log(TVL) + listed year';
    const reason =
      kind === 'logAge'
        ? 'REJECTED — LOO passes both (3.91x / 31.25%) but forward COLLAPSES to 7.84x / 19.35% within-2x: the age term does not travel forward in time.'
        : kind === 'change7d'
          ? 'REJECTED — best LOO of the single terms (3.69x / 32.81%, exact |log| 3.6892, +4 rows) and forward 2025 passes (3.16x / 32.26%), but multi-cutoff forward fails: 3.92x vs r5 3.42x at 2024-01-01, 4.58x vs 4.25x at 2024-07-01, reverse 4.20x vs 3.40x at 2025-01-01. The LOO win does not travel forward.'
          : kind === 'logChains'
            ? 'REJECTED — LOO passes both (3.90x / 32.03%) but forward |log| rises to 4.02x (+28% vs r5 3.15x) with within-2x falling to 25.81%.'
            : 'REJECTED — LOO passes both (3.89x / 33.59%) but forward within-2x collapses to 19.35% (3.44x): a vintage proxy, not a predictor.';
    variants.push(r7VariantEntry(`single-${kind}`, label, r7Loo(snapshot, comparables, factory), forwardOf(factory), false, reason));
  }
  variants.push(
    r7VariantEntry(
      'unshrunk-effects',
      'Unshrunk category effects (radar-6 record, recomputed)',
      r7Loo(snapshot, comparables, r7CurveFactory(snapshot, (train) => buildFit(train).curve, false)),
      forwardOf(r7CurveFactory(snapshot, (train) => buildFit(train).curve, false)),
      false,
      'REJECTED (radar-6) — wins on median |log| (3.88x) but loses on within-2x (28.91% vs 29.69%), so it fails the adopt-on-both rule.',
    ),
  );
  variants.push({
    id: 'joint-ols-dummies',
    label: 'Joint OLS log(FDV) ~ log(TVL) + category dummies (radar-6 record)',
    loo: { median_pred_actual: 0.88, median_abs_log_factor: 4.03, within_2x_pct: 25.78, within_3x_pct: null, within_5x_pct: null },
    time_split_forward: null,
    adopted: false,
    reason:
      'REJECTED (radar-6) — worse on both LOO criteria (4.03x / 25.78%) despite a full-sample R-squared of 0.317 vs the curve\'s 0.194: 21 parameters overfit. Record-only: within-3x/5x and the forward split were not logged in round 6.',
  });
  variants.push(
    r7VariantEntry(
      'multivariate-alone',
      'Multivariate log(FDV) ~ log(TVL) + log(age) + change_7d + log(chains), alone (radar-5/6 record)',
      multivariate.alone,
      null,
      false,
      'REJECTED (radar-5/6) — wins on median |log| (3.61x) but loses on within-2x (28.91% vs 29.69%); collapses out of time (7.55x forward).',
    ),
  );
  variants.push(
    r7VariantEntry(
      'multivariate-with-multipliers',
      'Multivariate with growth/maturity/breadth multipliers on top (radar-5/6 record)',
      multivariate.with_multipliers,
      null,
      false,
      'REJECTED (radar-5/6) — loses on within-2x by more (24.22% vs 29.69%): the multipliers double-count what the regression already absorbs.',
    ),
  );
  return variants;
}

/**
 * The bootstrap rank ranges (radar-7): resample the 128 comparables WITH replacement 200
 * times (mulberry32, fixed seed R7_BOOTSTRAP_SEED), refit the kept curve + effects (+ the
 * multipliers, exactly as the board scores), recompute every board row's implied value and
 * rank, and store per row the p5/p95 rank and the p5/p95 implied value. This is evidence
 * about the kept model, not a model change: it ships regardless of adoption. Ranks sort by
 * implied value descending with the slug as the tiebreak, exactly as buildBoard sorts.
 */
export function r7BootstrapRankRanges(
  snapshot: Snapshot,
  board: BoardRow[],
): Map<string, { rank_low: number; rank_high: number; implied_low_boot_usd: number; implied_high_boot_usd: number }> {
  const comparables = comparablesOf(snapshot);
  const multiples = categoryMultiples(snapshot);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const ranks = new Map<string, number[]>();
  const implieds = new Map<string, number[]>();
  for (const row of board) {
    ranks.set(row.slug, []);
    implieds.set(row.slug, []);
  }
  const rand = mulberry32(R7_BOOTSTRAP_SEED);
  for (let b = 0; b < R7_BOOTSTRAP_REFITS; b++) {
    const sample: Comparable[] = [];
    for (let i = 0; i < comparables.length; i++) sample.push(comparables[Math.floor(rand() * comparables.length)]!);
    const fit = buildFit(sample);
    const scored = board.map((row) => ({
      slug: row.slug,
      implied: impliedValue(bySlug.get(row.slug)!, snapshot.as_of, MODEL, fit, multiples).implied,
    }));
    scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => {
      ranks.get(s.slug)!.push(i + 1);
      implieds.get(s.slug)!.push(s.implied);
    });
  }
  const out = new Map<string, { rank_low: number; rank_high: number; implied_low_boot_usd: number; implied_high_boot_usd: number }>();
  for (const row of board) {
    out.set(row.slug, {
      rank_low: Math.round(quantile(ranks.get(row.slug)!, 0.05)),
      rank_high: Math.round(quantile(ranks.get(row.slug)!, 0.95)),
      implied_low_boot_usd: Math.round(quantile(implieds.get(row.slug)!, 0.05)),
      implied_high_boot_usd: Math.round(quantile(implieds.get(row.slug)!, 0.95)),
    });
  }
  return out;
}

/** The bootstrap summary over the per-row ranges: median and p90 rank width, and the top-10 widths. */
export function r7BootstrapSummary(
  board: BoardRow[],
  ranges: Map<string, { rank_low: number; rank_high: number; implied_low_boot_usd: number; implied_high_boot_usd: number }>,
): BootstrapSummary {
  const widths = board.map((r) => ranges.get(r.slug)!.rank_high - ranges.get(r.slug)!.rank_low);
  const top10 = board.slice(0, 10).map((r) => ranges.get(r.slug)!.rank_high - ranges.get(r.slug)!.rank_low);
  return {
    refits: R7_BOOTSTRAP_REFITS,
    seed: R7_BOOTSTRAP_SEED,
    median_rank_width: round2(median(widths)),
    p90_rank_width: round2(quantile(widths, 0.9)),
    top10_median_rank_width: round2(median(top10)),
    top10_max_rank_width: Math.max(...top10),
  };
}

/**
 * The multi-cutoff walk-forward (radar-7): forward splits at 2024-01-01, 2024-07-01 and
 * 2025-01-01 (fit strictly earlier listings, test strictly later ones), plus the reverse split
 * at 2024-07-01. Each entry reuses timeSplitBacktest, so the 2025-01-01 forward entry
 * reproduces validation.time_split exactly.
 */
export function r7WalkForward(snapshot: Snapshot): WalkForwardEntry[] {
  const out: WalkForwardEntry[] = [];
  for (const cutoff of R7_WALK_FORWARD_CUTOFFS) {
    const s = timeSplitBacktest(snapshot, cutoff, false);
    out.push({ ...s, direction: 'forward' });
  }
  const reverse = timeSplitBacktest(snapshot, '2024-07-01', true);
  out.push({ ...reverse, direction: 'reverse' });
  return out;
}

/**
 * The farm/thin/skip verdict (radar-7): examine the distribution of net_low_usd and
 * plan_gas_usd across the board and only adopt a rule if it honestly discriminates. It does
 * not: every row nets positive at band low (min $12,724) and gas is $0-$20 everywhere, so any
 * net_low threshold would only relabel the board by implied value. No rule is invented; the
 * verdict and the distribution ship instead.
 */
export function r7FarmRuleAssessment(board: BoardRow[]): FarmRuleAssessment {
  const nets = board.map((r) => r.net_low_usd).sort((a, b) => a - b);
  const gasMax = Math.max(...board.map((r) => r.plan_gas_usd));
  return {
    verdict: 'no-discriminating-rule',
    rule: null,
    net_low_min_usd: nets[0]!,
    net_low_median_usd: median(nets),
    net_low_max_usd: nets[nets.length - 1]!,
    rows_net_low_at_least_50k: nets.filter((v) => v >= 50000).length,
    rows_net_low_below_50k: nets.filter((v) => v < 50000).length,
    rows_net_low_at_most_0: nets.filter((v) => v <= 0).length,
    plan_gas_max_usd: gasMax,
    reason:
      'No honest farm/thin/skip rule discriminates: all 198 net_low_usd are positive (min $12,724, median $73,472.50, max $1,018,194) and plan gas is $0-$20 everywhere (breakeven FDV at most $400), so every row clears any plausible gas-based bar by orders of magnitude. A $50K net_low cut would label 139 rows farm / 59 thin, but net_low is nearly monotonic in implied value (5% of the band low minus trivial gas), so the cut would only relabel the top 70% by value with no economic content — the bottom row still nets $12,724 at band low.',
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
  const multi = looMultivariate(snapshot);
  // Radar-7 validation only: the kept model is untouched, so the board values are the radar-5
  // ones; the bootstrap ranges are attached to the board rows before the dashboard rows are
  // mapped, so board.json and data.js carry the same per-row ranges.
  const ranges = r7BootstrapRankRanges(snapshot, board);
  for (const row of board) {
    const range = ranges.get(row.slug)!;
    row.rank_low = range.rank_low;
    row.rank_high = range.rank_high;
    row.implied_low_boot_usd = range.implied_low_boot_usd;
    row.implied_high_boot_usd = range.implied_high_boot_usd;
  }
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
      time_split: timeSplitBacktest(snapshot),
      time_split_reverse: timeSplitBacktest(snapshot, TIME_SPLIT_CUTOFF, true),
      loo_multivariate: multi.alone,
      loo_multivariate_with_multipliers: multi.with_multipliers,
      multivariate_fit: multi.fit,
      farmer_share_assumption: FARMER_SHARE,
      walk_forward: r7WalkForward(snapshot),
      model_variants: r7ModelVariants(snapshot, multi),
      bootstrap: r7BootstrapSummary(board, ranges),
      farm_rule: r7FarmRuleAssessment(board),
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

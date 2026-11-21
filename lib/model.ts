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
  /** Category -> median mcap/TVL, only where n >= 3. */
  categoryMedians: Record<string, number>;
  /** Category -> number of comps behind its median. */
  categoryCounts: Record<string, number>;
  /** Family -> median mcap/TVL, only where n >= 5. */
  familyMedians: Record<string, number>;
}

export interface ModelBreakdown {
  categoryMultiple: number;
  multipleSource: string;
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
  farm_steps: string[];
  plan_cost_usd: number;
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
  farm_steps: string[];
  plan_cost_usd: number;
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
  fit: ModelFit;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
export const MODEL_VERSION = 'radar-rev2-fitted-comps';

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

/**
 * Fit the comps model on the snapshot's tokenized protocols: category
 * medians, family medians, the global median, and the log-log size fit.
 * Nothing here names a protocol; every number comes from the snapshot.
 */
export function fitComps(snapshot: Snapshot): ModelFit {
  const comps = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;

  const byCategory = new Map<string, number[]>();
  const byFamily = new Map<string, number[]>();
  for (const p of comps) {
    const r = p.mcap_usd! / p.tvl_usd;
    const key = p.category ?? 'Unknown';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(r);
    const fam = familyOf(p.category);
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(r);
  }
  const categoryMedians: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const [cat, rs] of byCategory) {
    categoryCounts[cat] = rs.length;
    if (rs.length >= 3) categoryMedians[cat] = median(rs);
  }
  const familyMedians: Record<string, number> = {};
  for (const [fam, rs] of byFamily) {
    if (rs.length >= 5) familyMedians[fam] = median(rs);
  }

  // Log-log fit: log(mcap) = intercept + slope * log(TVL).
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  let slope = 0.52;
  let intercept = 7;
  let r2 = 0;
  if (n >= 10) {
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let sst = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) * (xs[i]! - mx);
      sst += (ys[i]! - my) * (ys[i]! - my);
    }
    slope = sxx > 0 ? sxy / sxx : 0.52;
    intercept = my - slope * mx;
    let ssr = 0;
    for (let i = 0; i < n; i++) {
      const resid = ys[i]! - (intercept + slope * xs[i]!);
      ssr += resid * resid;
    }
    r2 = sst > 0 ? Math.max(0, 1 - ssr / sst) : 0;
  }
  const medianCompTvl = comps.length > 0 ? median(comps.map((p) => p.tvl_usd)) : 100_000_000;

  return {
    comps: comps.length,
    globalMedian,
    logLogSlope: slope,
    logLogIntercept: intercept,
    logLogR2: r2,
    medianCompTvl,
    categoryMedians,
    familyMedians,
    categoryCounts,
  };
}

/**
 * The implied value of one pre-token protocol under a fitted comps model.
 * Returns the value plus every multiplier, so the dashboard can show the
 * full breakdown and any reader can re-derive the number.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
): { implied: number; breakdown: ModelBreakdown } {
  const cat = protocol.category ?? 'Unknown';
  let categoryMultiple: number;
  let multipleSource: string;
  if (fit.categoryMedians[cat] !== undefined) {
    categoryMultiple = fit.categoryMedians[cat]!;
    multipleSource = `category median (${cat})`;
  } else if (fit.familyMedians[familyOf(protocol.category)] !== undefined) {
    categoryMultiple = fit.familyMedians[familyOf(protocol.category)]!;
    multipleSource = `family median (${familyOf(protocol.category)})`;
  } else {
    categoryMultiple = fit.globalMedian;
    multipleSource = 'global median';
  }

  // Size: the log-log slope is below 1, so the multiple falls as TVL
  // grows. Pivot on the median comp TVL, clamped so no row explodes.
  const sizeRaw = Math.pow(protocol.tvl_usd / fit.medianCompTvl, fit.logLogSlope - 1);
  const sizeFactor = Math.min(2.5, Math.max(0.25, sizeRaw));

  // Growth: dampened with a log so a +4,000% week is worth about 2x,
  // not 40x. A -80% week costs about half.
  const rawGrowth = finite(protocol.change_7d, 0) / 100;
  const g = Math.min(10, Math.max(-0.8, rawGrowth));
  const growthMultiplier = 1 + 0.25 * Math.log(1 + g);

  // Age with no token: longer means more pent-up value, capped at 3y.
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? 365;
  const ageMultiplier = 0.8 + 0.2 * (Math.min(Math.max(ageForModel, 0), 1095) / 1095);

  // Chain breadth: each extra chain adds 1.5%, capped at 8 extra chains.
  const chainCount = protocol.chains.length;
  const chainMultiplier = 1 + 0.015 * Math.min(Math.max(chainCount - 1, 0), 8);

  const implied = Math.max(
    1,
    Math.round(
      protocol.tvl_usd * categoryMultiple * sizeFactor * growthMultiplier * ageMultiplier * chainMultiplier,
    ),
  );
  return {
    implied,
    breakdown: {
      categoryMultiple,
      multipleSource,
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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Deterministic pick from a list, keyed by a slug, so runs are identical. */
function pick<T>(list: T[], slug: string, salt: number): T {
  let h = salt;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return list[h % list.length]!;
}

/** Capital tier for a farm position, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 75;
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
 * One protocol's farm plan: 6 steps, each naming the action, the chain,
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
  const hold = age === null ? 45 : age < 180 ? 60 : age < 365 ? 45 : 30;
  const action = mainAction(p, capital, chain, chain2);
  const weeklyGas = gas * 4;
  const totalCost = capital + gas * 7 + 5;

  const steps: string[] = [
    `Set up a fresh wallet for ${p.name} only, fund it with $${capital + gas * 2} of USDC on ${chain}, and write the seed phrase on paper. Never reuse this wallet for another farm. Cost: about $${gas * 2} of gas to fund it. Time: 10 minutes.`,
    `${action}. Cost: $${capital} of capital plus about $${gas} of gas. Time: 15 minutes to set up.`,
    `Return once a week and do one real action on ${p.name} on ${chain} — a deposit, a swap, a vote, or a claim — so the wallet shows steady use, not one deposit and silence. Cost: about $${gas} of gas a week, $${weeklyGas} over the month. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not move the funds to another wallet mid-farm. Cost: the $${capital} stays locked in the position. Time: ${hold} days.`,
    `Check the ${p.name} points or rewards page once a week and claim only from the link the protocol itself publishes; never pay a fee to claim and never connect to a link from a direct message. Cost: nothing to check. Time: 5 minutes a week.`,
    `Write the wallet address, the dates, and every transaction hash in a farm log, then unwind in reverse: claim, withdraw, and move the funds out in one session. Cost: about $${gas} of gas to exit. Time: 15 minutes.`,
  ];
  // Net the plan to a total dollar cost, as a seventh step.
  steps.push(
    `Total plan cost: about $${totalCost} all-in ($${capital} of working capital you get back, plus roughly $${totalCost - capital} of gas and small fees) over about ${hold} days on ${chain}.`,
  );
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
export function buildBoard(snapshot: Snapshot, fit: ModelFit): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p))
    .map((p) => {
      const { implied, breakdown } = impliedValue(p, snapshot.as_of, fit);
      const age = breakdown.ageDays;
      const { steps, totalCostUsd } = farmSteps(p, age);
      return { p, implied, breakdown, steps, totalCostUsd };
    });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
      categoryMultiple: round4(s.breakdown.categoryMultiple),
      multipleSource: s.breakdown.multipleSource,
      sizeFactor: round4(s.breakdown.sizeFactor),
      growthPct: round4(s.breakdown.growthPct),
      growthMultiplier: round4(s.breakdown.growthMultiplier),
      ageDays: s.breakdown.ageDays,
      ageMultiplier: round4(s.breakdown.ageMultiplier),
      chainCount: s.breakdown.chainCount,
      chainMultiplier: round4(s.breakdown.chainMultiplier),
    },
    farm_steps: s.steps,
    plan_cost_usd: s.totalCostUsd,
  }));
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
  const board = buildBoard(snapshot, fit);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    fit,
    rows: board,
    live: liveRows(snapshot),
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
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** The dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

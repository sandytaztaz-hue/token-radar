# Token Radar

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Which protocols without a token are worth the most? Token Radar ranks **all 342 pre-token protocols** in the snapshot by an implied value — the value if a token launches, times the odds a token ever comes — and gives each one a concrete, costed farm plan with a FARM / MARGINAL / SKIP verdict.

## How the value is priced

The value is fitted from the snapshot's own tokenized protocols — never from a list of names. The base price is the median market-cap-per-dollar-of-TVL across the 128 protocols that trade ($0.21); a log-log fit of market cap on TVL (slope ≈ 0.52) scales the price down as TVL grows. Each category gets a ridge effect — its average log miss against the base price, shrunk toward no effect by 16 pseudo-observations, so a thin category barely moves the price. Every term was tried against two held-out tests (leave-one-out, and walk-forward: protocols listed earlier pricing those listed later) and kept only when it lowered the miss in both: the size curve and the category effect survived (leave-one-out miss ×3.21 vs ×5.07 flat); 7-day growth, no-token age and chain breadth did not, so they are not in the price — age and growth feed the token odds instead.

Token odds come from the peers' record: the share of protocols listed at least as long ago that record a token today, blended toward the category's token share and the 7-day-growth bucket's rate. The terms were picked by 5-fold cross-validated Brier score (0.232 vs 0.248 for the base rate). A 200-refit bootstrap puts a P25–P75 and P10–P90 band around every implied value; the printed P25–P75 holds 50% of real market caps held out, P10–P90 holds 77%.

The farm verdict is netted from the row's own plan: a 7% drop share of the value if a token launches, the farmer's cut by deposit over TVL, times the token odds, minus the gas the plan spends. FARM when the net beats a 4% T-bill on the same deposit and clears $10 an hour of hands-on work. The model lives in `lib/model.ts` in the functions `impliedValue`, `tokenOddsAll` and `farmVerdict`, and every row carries the full breakdown so the dashboard can show how each number was built.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22, standard library only, no network. It writes `out/board.json` (342 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Run it twice and the outputs are byte-identical.

## The dashboard

Open `out/dashboard/index.html`. Sortable and filterable 11-column table (rank, protocol, TVL, 7-day growth, no-token age, token odds, value if it launches, implied value, P25–P75 band, farm verdict, net per hour), a 6-stat strip, a protocol-accounting strip with integrity checks, an out-of-sample evidence panel, and a detail view for every protocol with the implied-value breakdown, the farm verdict with a net-by-share grid and benchmarks, the 10-step farm plan and the 8 nearest priced peers — plus a separate list of the protocols that already have a token, shown at their market values.

Comp: [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01)

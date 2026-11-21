# Token Radar

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Which protocols without a token are worth the most? Token Radar ranks **all 342 pre-token protocols** in the snapshot by an implied value — the value if a token launches, times the odds a token ever comes — and gives each one a concrete, costed farm plan with a FARM / MARGINAL / SKIP verdict. The board opens on a **DeFi-only default view of 198 protocols** (see below); the full 342-row board is one click away, and every number in the default view is recomputed from the DeFi rows, never carried over from the full board.

## How the value is priced

The value is fitted from the snapshot's own tokenized protocols — never from a list of names. The base price is the median market-cap-per-dollar-of-TVL across the 128 protocols that trade ($0.21); a log-log fit of market cap on TVL (slope ≈ 0.52) scales the price down as TVL grows. Each category gets a ridge effect — its average log miss against the base price, shrunk toward no effect by 16 pseudo-observations, so a thin category barely moves the price. Every term was tried against two held-out tests (leave-one-out, and walk-forward: protocols listed earlier pricing those listed later) and kept only when it lowered the miss in both: the size curve and the category effect survived (leave-one-out miss ×3.21 vs ×5.07 flat); 7-day growth, no-token age and chain breadth did not, so they are not in the price — age and growth feed the token odds instead.

Token odds come from the peers' record: the share of protocols listed at least as long ago that record a token today, blended toward the category's token share and the 7-day-growth bucket's rate. The terms were picked by 5-fold cross-validated Brier score (0.232 vs 0.248 for the base rate). A 200-refit bootstrap puts a P25–P75 and P10–P90 band around every implied value; the printed P25–P75 holds 50% of real market caps held out, P10–P90 holds 77%.

The farm verdict is netted from the row's own plan: a 7% drop share of the value if a token launches, the farmer's cut by deposit over TVL, times the token odds, minus the gas the plan spends. FARM when the net beats a 4% T-bill on the same deposit and clears $10 an hour of hands-on work. The model lives in `lib/model.ts` in the functions `impliedValue`, `tokenOddsAll` and `farmVerdict`, and every row carries the full breakdown so the dashboard can show how each number was built.

## Default board: DeFi only

The unfiltered board is topped by centralised exchanges, bridges and wrapped assets on TVL alone — Bybit, Bitfinex, Robinhood — with blank SKIP verdicts, because there is no on-chain app to farm. The default board view is therefore DeFi-only: 198 rows. The rule is by **category, never by name** (no protocol is named anywhere in it), defined in `lib/model.ts` as `DEFAULT_BOARD_EXCLUDED_GROUPS` and summarised into `data.js` as `default_board`:

| Out group | Categories | Rows | Why |
| --- | --- | --- | --- |
| exchange | CEX | 42 | centralised exchanges, not DeFi protocols — no on-chain app to farm |
| bridge | Bridge, Canonical Bridge, Cross Chain Bridge | 44 | cross-chain transport, not a DeFi app |
| liquid staking | Liquid Staking, Liquid Restaking | 41 | issued receipt tokens for staked assets, not a standalone DeFi app |
| chain | Chain | 5 | blockchains themselves, not protocols running on one |
| wrapped or issued | Stablecoin Wrapper, Anchor BTC, CeDeFi, Decentralized BTC, Restaked BTC, Dual-Token Stablecoin | 12 | a wrapped or issued claim on another asset, not a standalone DeFi protocol |

144 rows out, 198 in — the same shape as the top-ranked board's own "Out:" groups (exchange 42, bridge 43, liquid staking 41, chain 5, wrapped or issued 14; ours differs by one bridge row and two wrapped rows, because this snapshot carries one Cross Chain Bridge row and two fewer wrapped rows). The default board's own numbers: FARM 26, MARGINAL 40, SKIP 132, totalling $1,138,074,587 of implied value. Its top rows are Steakhouse Financial (MARGINAL, $86.6M), Sentora Curator (SKIP, $73.6M), Gauntlet (MARGINAL, $44.2M), Veda (SKIP, $39.4M) and USDD (SKIP, $29.0M).

Nothing is deleted: `board.json` and `data.js` still hold all 342 rows, the Protocol Accounting strip still reconciles to all 758 snapshot protocols (198 DeFi ranked + 144 non-DeFi out + 128 priced comps + 288 no usable cap), and the stats strip prints the DeFi board's real counts ("26 of 198", not the old "35 of 342"). The watchlist still holds all 40 rows — 36 sit inside the DeFi board and the other 4 (Hive Protocol, Doppler Finance, Saturn, Noble) are reached through the watchlist filter, which bypasses the DeFi scope. `main.ts` gates the build on the filter: it refuses a default board that kept everything or nothing, cut more than half the board, has verdicts that do not add up, or lets a renamed CEX/bridge/wrapper category back in.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22, standard library only, no network. It writes `out/board.json` (342 rows), `out/data.js` (342 rows plus the `default_board` summary for the 198-row DeFi view), `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Run it twice and the outputs are byte-identical.

## The dashboard

Open `out/dashboard/index.html`. Sortable and filterable 11-column table (rank, protocol, TVL, 7-day growth, no-token age, token odds, value if it launches, implied value, P25–P75 band, farm verdict, net per hour), a 6-stat strip, a protocol-accounting strip with integrity checks, an out-of-sample evidence panel, and a detail view for every protocol with the implied-value breakdown, the farm verdict with a net-by-share grid and benchmarks, the 10-step farm plan and the 8 nearest priced peers — plus a separate list of the protocols that already have a token, shown at their market values. The board opens on the DeFi-only default view (ranks 1–198); the Board control switches to all 342 pre-token protocols, and the watchlist filter shows all 40 watchlist rows.

Comp: [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01)

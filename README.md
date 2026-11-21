# Token Radar

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Which protocols without a token are worth the most? Token Radar ranks **all 342 pre-token protocols** in the snapshot by an implied value — the value if a token launches, times the odds a token ever comes — and gives each one a concrete, costed farm plan with a FARM / MARGINAL / SKIP verdict. The board is the full board: every pre-token protocol is ranked, all 40 watchlist protocols are ranked, and every number is computed from the full 342 rows. There is no filtered view and no protocol is left unranked.

## How the value is priced

The value is fitted from the snapshot's own tokenized protocols — never from a list of names. The base price is the median market-cap-per-dollar-of-TVL across the 128 protocols that trade ($0.21 at the $32.6M TVL pivot); a log-log fit of market cap on TVL (slope ≈ 0.52) scales the price down as TVL grows, but the size factor never falls below a quarter of base. Each category gets an effect — its average log miss against the base price, shrunk toward no effect by 16 pseudo-observations, so a thin category barely moves the price; effects run ×0.66–×1.49. Every term was tried against two held-out tests (leave-one-out, and walk-forward: protocols listed earlier pricing those listed later) and kept only when it lowered the miss in both: the size curve and the category effect survived (leave-one-out miss ×3.26 vs ×5.07 flat; walk-forward ×3.20 vs ×5.28 flat); 7-day growth, no-token age and chain breadth did not, so they are not in the price — age, growth, size and chain count feed the token odds instead.

Token odds come from the peers' record, read as a logistic regression on age, category, growth, size and chain count, fitted by iteratively reweighted least squares with a ridge penalty of 1 on the slopes, on all 758 snapshot protocols. The feature groups were picked by 5-fold cross-validated Brier score (0.208 vs 0.248 for the base rate); the final model scores 0.207 leave-one-out and 0.235 walk-forward, against 0.248 and 0.299 for the base rate, and calls 67% of protocols right against 55% for the base rate. A 200-refit bootstrap puts a P25–P75 and P10–P90 band around every implied value; the printed P25–P75 holds 50% of real market caps held out (56% walk-forward), P10–P90 holds 80% (78% walk-forward).

The farm verdict is netted from the row's own plan: a 7% drop share of the implied value, the farmer's cut by deposit over TVL, minus the gas the plan spends. FARM when the net is at least $25 and at least $15 an hour of hands-on work; MARGINAL for any positive net; anything else is SKIP. The plan deposit is sized to the protocol — $2,500 below $100M TVL, $5,000 below $1B, $10,000 above it — and gas is $1 a transaction on the cheap chains, $4 elsewhere. The model lives in `main.ts`, and every row carries the full breakdown so the dashboard can show how each number was built.

## The board

342 rows, $4,845,843,516 of implied value: FARM 14, MARGINAL 57, SKIP 271. The board is topped by centralised exchanges, bridges and wrapped assets on TVL alone — Bybit ($676M), Bitfinex ($543M), Bitget ($313M) — all SKIP, because there is no on-chain app to farm. The farmable rows are the small Dexs: SyncSwap is the top FARM by net per hour ($70 net, $40 an hour). The watchlist holds all 40 rows, including Hive Protocol (#51), Doppler Finance (#118), Saturn (#234) and Noble (#113), all SKIP. The ledger reconciles to all 758 snapshot protocols: 342 ranked pre-token + 128 already record a token + 288 recorded but no usable cap. Board checksum `963b9783` = `board.json`.

## Run it

```sh
node main.ts --input <path to snapshot.json> --output out
```

Node 22, standard library only, no network. It writes `out/board.json` (342 rows), `out/data.js` (342 rows plus the model and evidence tables), `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Run it twice and the outputs are byte-identical. The build gates itself: the board must cover all 40 watchlist rows, hold exactly the pre-token count, have verdicts that add up to the board size, and tie the ledger out (342 + 128 + 288 = 758); `data.js` must round-trip `board.json`; the dossier must stay under 1.5 MiB, the dashboard under 64 KiB, and the three screenshots exactly 1440×900 and under 512 KiB each.

## The dashboard

Open `out/dashboard/index.html`. Sortable and filterable 11-column table (rank, protocol, TVL, 7-day growth, no-token age, token odds, value if it launches, implied value, P25–P75 band, farm verdict, net per hour), a 6-stat strip, a protocol-accounting strip with integrity checks, an out-of-sample evidence panel, and a detail view for every protocol with the implied-value breakdown, the farm verdict with a net-by-share grid and benchmarks, the 10-step farm plan and the 8 nearest priced peers — plus a separate list of the protocols that already have a token, shown at their market values. The board opens on all 342 rows; the tabs filter to Farm, Marginal, Skip, Watchlist and Early, the deposit, drop-share and horizon controls recompute every net live, and the verdict badge never moves.

Comp: [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01)

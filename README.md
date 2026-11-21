# Token Radar

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Which protocols without a token are worth the most? Token Radar ranks **all 342 pre-token protocols** in the snapshot by an implied value, and gives each one a concrete, costed farm plan.

## How the value is priced

The value is fitted from the snapshot's own tokenized protocols — never from a list of names. For the protocols that already trade, we take the median market-cap-per-dollar-of-TVL inside each category (Lending ≈ $0.13, Dexs ≈ $0.34, bridges ≈ $0.56), with a family median and then the global median ($0.20) as fallbacks for thin categories. A log-log fit of market cap on TVL (slope ≈ 0.52) scales the price down as TVL grows. Then three small adjustments: 7-day TVL growth, dampened with a log so a wild week cannot explode the value; age with no token, longer meaning more pent-up value, capped at three years; and chain breadth, +1.5% per extra chain. The model lives in `lib/model.ts` in the function `impliedValue`, and every row carries the full breakdown so the dashboard can show how each number was built.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22, standard library only, no network. It writes `out/board.json` (342 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Run it twice and the outputs are byte-identical.

## The dashboard

Open `out/dashboard/index.html`. Sortable and filterable table (category, chain, watchlist, text search), a detail view for every protocol with the implied-value breakdown and the farm plan, and a separate list of the protocols that already have a token, shown at their market values.

Comp: [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01)

# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sandytaztaz-hue/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks pre-token DeFi protocols by the implied value of the token they may one day issue. The radar-2 model prices each protocol from the snapshot's own figures: its TVL times the median market-cap-to-TVL multiple of token-bearing protocols in its category (falling back to a pooled family median, then a global median), adjusted for seven-day TVL growth, how long it has run with no token, and how many chains it spans. The board covers all 40 watchlist protocols plus every other rankable pre-token protocol below the $50M floor, and every row carries a concrete farm plan with what it costs and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6sv3wnda&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/JACKETAGENT-ID/csv-reader-speed-01-run-20261121-zech/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/JACKETAGENT-ID/csv-reader-speed-01-run-20261121-zech/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed — zech entry

A fast drop-in for csv-reader 1.0.0: `solve.js` answers `{columns, rows, errors}`
exactly as csv-reader does for every `{text, header}` input, including its
broken-row policy (BOM, CRLF, stray CR, quoted fields, `""` escapes,
quote junk, unterminated quotes, short/long rows).

## How it is fast

Fast-path + fallback. Each record is first sliced up to the next LF: if that
slice holds no quote and no stray CR, the record is parsed with a single
`split(',')` — the cheapest path for the clean data that dominates every drawn
set. Anything else goes to an `indexOf`/regex-driven state machine that jumps
from delimiter to delimiter instead of walking one character at a time, with
the same error semantics as the reference.

On the practice set (6 cases, ~10 MB of CSV): parser time ~114 ms vs the
house baseline's ~587 ms (~5×), whole-program ~827 ms vs ~1618 ms (~2×),
with byte-identical answers on all 6 cases.

## Layout

- `solve.js` — the parser (`run(input)`), dependency-free ES module.
- `main.ts` — the harness driver: reads `/input/cases.json`, writes
  `/output/answers.json` (`MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` outside
  a container).
- `LICENSE` — MIT.

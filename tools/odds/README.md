# Drive odds builder

Builds `server/src/game/odds/drive_odds.json`: how often an NFL drive ends in points (`p_score`) or a touchdown (`p_td`), by starting field position and clock state. The football game reads it via `server/src/game/odds.ts` (`getOdds`, `driveOddsProp`).

## Run

```
py -3 tools/odds/build_drive_odds.py
```

Python stdlib only (no pip). Downloads `play_by_play_{2015..2025}.csv.gz` from the nflverse-data `pbp` release into `tools/odds/.cache/` (gitignored, a few hundred MB; existing files are skipped), streams them, and writes the JSON. It prints the checks and exits non-zero if any fails: `p_score` non-increasing with distance (<= 0.02 wobble), `p_td <= p_score`, bands 1-99 covered once per clock state.

Teammates with pip can fetch the same data with `nflreadpy` (`nflreadpy.load_pbp(range(2015, 2026))`) instead; the reduction rules below are what matter.

All 11 seasons (2015-2025) were available; none missing. Verification stays on (Windows cert store via `ssl.create_default_context()`).

## What it does

- One row per drive (`game_id`, `fixed_drive`): the first scrimmage play (`pass`, `run`, `punt`, `field_goal`, `qb_kneel`, `qb_spike`; kickoffs, `no_play`, `extra_point`, empty and two-point attempts skipped) gives `yardline_100`, `half_seconds_remaining`, `fixed_drive_result`.
- Dropped: drives with no scrimmage play (591), missing/invalid fields (0), end-of-half kneel drives (2879). **Drives used: 64,085** (of 67,555 seen).
- `scored` = `Touchdown` or `Field goal`; `td` = `Touchdown`. Results seen: Punt 24918, Touchdown 14731, Field goal 9962, Turnover 6895, End of half 4981, Turnover on downs 3259, Missed field goal 1788, Opp touchdown 832, Safety 172, empty 17.
- Buckets: 10-yard bands of `yardline_100` x `normal` / `two-minute` (`half_seconds_remaining < 120`). Buckets with n < 200 merge into the same-clock neighbour until all are >= 200. Score difference is ignored.

## Bucket table

```
key                         n  p_score   p_td
1-10|normal               358    0.922  0.737
11-20|normal              646    0.890  0.537
21-30|normal             1011    0.831  0.465
31-40|normal             1373    0.723  0.374
41-50|normal             2174    0.581  0.334
51-60|normal             4252    0.492  0.296
61-70|normal             9782    0.421  0.255
71-80|normal            25892    0.355  0.221
81-90|normal             8794    0.288  0.181
91-99|normal             4103    0.250  0.159
1-40|two-minute           352    0.713  0.312
41-50|two-minute          297    0.424  0.165
51-60|two-minute          567    0.358  0.136
61-70|two-minute          984    0.303  0.100
71-80|two-minute         2384    0.251  0.083
81-90|two-minute          720    0.182  0.058
91-99|two-minute          396    0.116  0.061
```

## Source and license

nflverse play-by-play data, https://github.com/nflverse/nflverse-data (releases tag `pbp`), licensed CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Attribution: "nflverse (nflfastR) play-by-play data". Only derived aggregate statistics are committed, not the raw data.

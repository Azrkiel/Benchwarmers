#!/usr/bin/env python3
"""Build server/src/game/odds/drive_odds.json from nflverse play-by-play (2015-2025).

Stdlib only. Run: py -3 tools/odds/build_drive_odds.py
"""
import csv
import gzip
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "server", "src", "game", "odds", "drive_odds.json"))
URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{year}.csv.gz"
YEARS = range(2015, 2026)
MIN_N = 200
TWO_MIN = 120
WOBBLE = 0.02
SCRIMMAGE = {"pass", "run", "punt", "field_goal", "qb_kneel", "qb_spike"}
SCORED = {"Touchdown", "Field goal"}
TD = "Touchdown"
END_HALF = "End of half"


def ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.load_default_certs()
    return ctx


def download(year):
    path = os.path.join(CACHE, f"play_by_play_{year}.csv.gz")
    if os.path.exists(path):
        print(f"[cache] {year}")
        return path
    url = URL.format(year=year)
    part = path + ".part"
    print(f"[download] {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "build_drive_odds/1.0"})
        with urllib.request.urlopen(req, context=ssl_ctx(), timeout=120) as r, open(part, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
    except urllib.error.HTTPError as e:
        if os.path.exists(part):
            os.remove(part)
        if e.code == 404:
            print(f"[note] {year}: 404, skipping")
            return None
        raise
    os.replace(part, path)
    return path


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def main():
    os.makedirs(CACHE, exist_ok=True)
    drives = {}  # (game_id, fixed_drive) -> dict
    play_types = Counter()
    results = Counter()
    kneel_drives = set()
    result_by_drive = {}
    for year in YEARS:
        path = download(year)
        if not path:
            continue
        with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                gid, fd = row.get("game_id"), row.get("fixed_drive")
                if not gid or not fd:
                    continue
                key = (gid, fd)
                res = row.get("fixed_drive_result") or ""
                if key not in result_by_drive:
                    result_by_drive[key] = res
                    results[res or "<empty>"] += 1
                if row.get("qb_kneel") in ("1", "1.0"):
                    kneel_drives.add(key)
                pt = row.get("play_type") or ""
                play_types[pt or "<empty>"] += 1
                if key in drives or pt not in SCRIMMAGE:
                    continue
                if row.get("two_point_attempt") in ("1", "1.0"):
                    continue
                drives[key] = {
                    "yl": num(row.get("yardline_100")),
                    "hsr": num(row.get("half_seconds_remaining")),
                    "res": res,
                }

    print("\nDistinct play_type values (all rows):")
    for k, v in play_types.most_common():
        print(f"  {k!r}: {v}")
    print("\nDistinct fixed_drive_result values (one per drive):")
    for k, v in results.most_common():
        print(f"  {k!r}: {v}")

    total_keys = len(result_by_drive)
    no_scrimmage = total_keys - len(drives)
    missing = kneel = 0
    used = []
    for key, d in drives.items():
        if d["yl"] is None or d["hsr"] is None or not d["res"]:
            missing += 1
            continue
        if key in kneel_drives and d["res"] == END_HALF:
            kneel += 1
            continue
        if not (1 <= d["yl"] <= 99):
            missing += 1
            continue
        used.append(d)
    print(f"\nDrive keys seen: {total_keys}")
    print(f"Dropped, no scrimmage play: {no_scrimmage}")
    print(f"Dropped, missing/invalid fields: {missing}")
    print(f"Dropped, end-of-half kneel: {kneel}")
    print(f"Total drives used: {len(used)}")

    # Buckets
    bands = [(1, 10)] + [(lo, lo + 9) for lo in range(11, 91, 10)] + [(91, 99)]
    out = {}
    for clock in ("normal", "two-minute"):
        stats = [[lo, hi, 0, 0, 0] for lo, hi in bands]  # lo, hi, n, scored, td
        for d in used:
            c = "two-minute" if d["hsr"] < TWO_MIN else "normal"
            if c != clock:
                continue
            yl = int(d["yl"]) if d["yl"] == int(d["yl"]) else int(d["yl"]) + 1
            for s in stats:
                if s[0] <= yl <= s[1]:
                    s[2] += 1
                    s[3] += d["res"] in SCORED
                    s[4] += d["res"] == TD
                    break
        while len(stats) > 1:
            small = [i for i, s in enumerate(stats) if s[2] < MIN_N]
            if not small:
                break
            # merge the smallest into its smaller neighbour
            i = min(small, key=lambda j: stats[j][2])
            nbrs = [j for j in (i - 1, i + 1) if 0 <= j < len(stats)]
            j = min(nbrs, key=lambda k: stats[k][2])
            a, b = min(i, j), max(i, j)
            m = [stats[a][0], stats[b][1]] + [stats[a][k] + stats[b][k] for k in (2, 3, 4)]
            stats[a:b + 1] = [m]
        for lo, hi, n, sc, td in stats:
            out[f"{lo}-{hi}|{clock}"] = {
                "p_score": round(sc / n, 3) if n else 0.0,
                "p_td": round(td / n, 3) if n else 0.0,
                "n": n,
            }

    def sk(k):
        rng, clock = k.split("|")
        return (clock, int(rng.split("-")[0]))

    out = {k: out[k] for k in sorted(out, key=sk)}

    print("\nBucket table:")
    print(f"{'key':<22}{'n':>7}{'p_score':>9}{'p_td':>7}")
    for k, v in out.items():
        print(f"{k:<22}{v['n']:>7}{v['p_score']:>9.3f}{v['p_td']:>7.3f}")

    # Sanity checks
    fails = []
    for clock in ("normal", "two-minute"):
        ks = [k for k in out if k.endswith("|" + clock)]
        covered = []
        prev = None
        for k in ks:
            lo, hi = map(int, k.split("|")[0].split("-"))
            covered += range(lo, hi + 1)
            v = out[k]
            if v["p_td"] > v["p_score"]:
                fails.append(f"{k}: p_td {v['p_td']} > p_score {v['p_score']}")
            if v["n"] < MIN_N:
                fails.append(f"{k}: n {v['n']} < {MIN_N}")
            if prev is not None and v["p_score"] > prev[1] + WOBBLE:
                fails.append(f"{clock}: p_score rises {prev[0]} {prev[1]} -> {k} {v['p_score']}")
            prev = (k, v["p_score"])
        if sorted(covered) != list(range(1, 100)):
            fails.append(f"{clock}: bands do not cover 1-99 exactly once")
    if fails:
        print("\nSANITY CHECKS FAILED:")
        for f_ in fails:
            print("  " + f_)
        sys.exit(1)
    print("\nSanity checks passed (monotone within 0.02, p_td <= p_score, full coverage).")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()

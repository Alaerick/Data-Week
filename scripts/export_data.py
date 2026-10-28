"""Export small JSON files for the "Finding 1.5" site from basketball.db.

Run from the project root:  python scripts/export_data.py
Writes to docs/data/, which GitHub Pages serves alongside docs/index.html.
"""
import json
import pathlib
import sqlite3

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = ROOT / "basketball.db"
OUT = ROOT / "docs" / "data"

# Pre-2014 seasons have only 10-1,184 team-games and are left out entirely.
MIN_SEASON = 2014
# Teams need at least this many games in a season to count, so a handful of
# games can't produce an extreme ratio.
MIN_GAMES = 20
TOP_N = 10
# Ratio bands used for the "does balance win?" and "did teams adjust?" views.
BANDS = [0, 1.3, 1.4, 1.5, 1.6, 1.7, 9]
BAND_LABELS = ["< 1.3", "1.3–1.4", "1.4–1.5", "1.5–1.6", "1.6–1.7", "> 1.7"]


def round_floats(obj, digits=4):
    if isinstance(obj, float):
        return round(obj, digits)
    if isinstance(obj, dict):
        return {k: round_floats(v, digits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(v, digits) for v in obj]
    return obj


def write(name, payload):
    path = OUT / name
    path.write_text(json.dumps(round_floats(payload), separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.1f} KB)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)

    teams = pd.read_sql(
        """
        SELECT season, team_id,
               MAX(team_display_name) AS name,
               MAX(team_abbreviation) AS abbr,
               MAX(team_color) AS color,
               COUNT(*) AS games,
               AVG(team_winner) AS win_pct,
               SUM(field_goals_made - three_point_field_goals_made) AS m2,
               SUM(field_goals_attempted - three_point_field_goals_attempted) AS a2,
               SUM(three_point_field_goals_made) AS m3,
               SUM(three_point_field_goals_attempted) AS a3
        FROM team_box
        WHERE season >= ?
        GROUP BY season, team_id
        HAVING COUNT(*) >= ?
        """,
        db,
        params=(MIN_SEASON, MIN_GAMES),
    )
    db.close()

    teams["p2"] = teams.m2 / teams.a2
    teams["p3"] = teams.m3 / teams.a3
    teams["ratio"] = teams.p2 / teams.p3
    teams["share3"] = teams.a3 / (teams.a2 + teams.a3)
    teams["band"] = pd.cut(teams.ratio, BANDS, labels=BAND_LABELS)
    # Top 10 by win% each season (ties broken by more games played).
    teams["top10"] = False
    for season, group in teams.groupby("season"):
        top = group.sort_values(["win_pct", "games"], ascending=False).head(TOP_N).index
        teams.loc[top, "top10"] = True

    # --- league.json: one row per season ------------------------------------
    league = []
    for season, g in teams.groupby("season"):
        top = g[g.top10]
        p2, p3 = g.m2.sum() / g.a2.sum(), g.m3.sum() / g.a3.sum()
        tp2, tp3 = top.m2.sum() / top.a2.sum(), top.m3.sum() / top.a3.sum()
        league.append({
            "season": int(season),
            "teams": int(len(g)),
            "p2": p2,
            "p3": p3,
            "ratio": p2 / p3,
            "median_ratio": float(g.ratio.median()),
            "pps2": 2 * p2,
            "pps3": 3 * p3,
            "share3": g.a3.sum() / (g.a2.sum() + g.a3.sum()),
            "pct_threes_better": float((g.ratio < 1.5).mean()),
            "top10_ratio": tp2 / tp3,
            "q1_ratio": float(g.ratio.quantile(0.25)),
            "q3_ratio": float(g.ratio.quantile(0.75)),
        })
    write("league.json", league)

    # --- teams.json: one row per team-season, for the scatter --------------
    rows = teams.sort_values(["season", "name"])
    write("teams.json", [
        {
            "season": int(r.season),
            "id": int(r.team_id),
            "name": r.name,
            "abbr": r.abbr,
            "color": f"#{r.color}" if isinstance(r.color, str) and r.color else None,
            "games": int(r.games),
            "win_pct": float(r.win_pct),
            "p2": float(r.p2),
            "p3": float(r.p3),
            "share3": float(r.share3),
            "top10": bool(r.top10),
        }
        for r in rows.itertuples()
    ])

    # --- adjustment.json: did teams move toward their better shot? ---------
    # Pair each team-season with the same team's next season and measure the
    # change in 3-point share of attempts. Ratio > 1.5 means twos were the
    # better shot for that team, so a "rational" team would shoot fewer threes.
    nxt = teams[["season", "team_id", "share3"]].assign(season=lambda d: d.season - 1)
    pairs = teams.merge(nxt, on=["season", "team_id"], suffixes=("", "_next"))
    pairs["change"] = pairs.share3_next - pairs.share3
    adjustment = (
        pairs.groupby("band", observed=False)["change"]
        .agg(["size", "mean"])
        .reset_index()
    )
    write("adjustment.json", [
        {"band": str(r.band), "n": int(r.size), "change_pp": float(r.mean) * 100}
        for r in adjustment.itertuples()
    ])

    # --- winpct.json: win% by ratio band, 2026 and 2017-2026 pooled --------
    # 2017+ only for the pooled view: earlier seasons cover ~66 teams.
    def band_wins(df):
        g = df.groupby("band", observed=False)["win_pct"].agg(["size", "mean"]).reset_index()
        return [{"band": str(r.band), "n": int(r.size), "win_pct": float(r.mean)} for r in g.itertuples()]

    latest = int(teams.season.max())
    write("winpct.json", {
        "latest_season": latest,
        "latest": band_wins(teams[teams.season == latest]),
        "pooled": band_wins(teams[teams.season >= 2017]),
    })


if __name__ == "__main__":
    main()

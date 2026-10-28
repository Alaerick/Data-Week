import sqlite3

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

# Palette (dataviz skill reference palette, light mode)
BLUE = "#2a78d6"     # 2-point series
ORANGE = "#eb6834"   # 3-point series
AQUA = "#1baf7a"     # derived league-average ratio series
YELLOW = "#eda100"   # top-10 teams ratio series
INK = "#0b0b0b"
INK_SECONDARY = "#52514e"
INK_MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
SURFACE = "#fcfcfb"

# Pre-2014 seasons have as few as 10-1,184 team-games (vs 3,000-12,000+ from
# 2014 on) and produce noisy, non-representative averages, so they're
# excluded from this chart.
MIN_SEASON = 2014

# "Top 10" = the 10 teams with the best win% each season (min. 20 games
# played, to screen out teams with too short a season to rank meaningfully).
MIN_GAMES_TO_RANK = 20
TOP_N = 10

data = sqlite3.connect("basketball.db")
cursor = data.cursor()

cursor.execute(
    """
    SELECT season,
           AVG(three_point_field_goals_attempted) AS avg_3pa,
           AVG(three_point_field_goals_made) AS avg_3pm,
           AVG(three_point_field_goal_pct) AS three_pt_pct,
           AVG(field_goals_attempted - three_point_field_goals_attempted) AS avg_2pa,
           AVG(field_goals_made - three_point_field_goals_made) AS avg_2pm,
           AVG((field_goals_made - three_point_field_goals_made) * 100.0 /
               NULLIF(field_goals_attempted - three_point_field_goals_attempted, 0)) AS two_pt_pct
    FROM team_box
    WHERE season >= ?
    GROUP BY season
    ORDER BY season;
    """,
    (MIN_SEASON,),
)

(seasons, avg_3pa, avg_3pm, three_pt_pct,
 avg_2pa, avg_2pm, two_pt_pct) = zip(*cursor.fetchall())

league_ratio = [two / three for two, three in zip(two_pt_pct, three_pt_pct)]
# Percentage-point change from the first season, so the two accuracy lines
# -- which sit ~13 points apart in absolute level -- become directly
# comparable on one axis instead of reading as flat.
two_pt_change = [v - two_pt_pct[0] for v in two_pt_pct]
three_pt_change = [v - three_pt_pct[0] for v in three_pt_pct]

# Each season's 10 best teams by win% (pooled makes/attempts across all of
# their games), for comparison against the league average -- the theory
# being that the best teams should already shoot close to the 1.5
# indifference point.
top10_ratio = []
for season in seasons:
    cursor.execute(
        """
        SELECT team_id
        FROM team_box
        WHERE season = ?
        GROUP BY team_id
        HAVING COUNT(*) >= ?
        ORDER BY AVG(team_winner) DESC
        LIMIT ?;
        """,
        (season, MIN_GAMES_TO_RANK, TOP_N),
    )
    top_team_ids = [row[0] for row in cursor.fetchall()]

    cursor.execute(
        f"""
        SELECT SUM(field_goals_made - three_point_field_goals_made) * 100.0 /
                   SUM(field_goals_attempted - three_point_field_goals_attempted),
               SUM(three_point_field_goals_made) * 100.0 /
                   SUM(three_point_field_goals_attempted)
        FROM team_box
        WHERE season = ? AND team_id IN ({",".join("?" * len(top_team_ids))});
        """,
        (season, *top_team_ids),
    )
    two_pct, three_pct = cursor.fetchone()
    top10_ratio.append(two_pct / three_pct)

data.close()


def style_axes(ax):
    ax.set_facecolor(SURFACE)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(AXIS)
    ax.spines["bottom"].set_color(AXIS)
    ax.tick_params(colors=INK_SECONDARY, labelsize=9)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_xticks(seasons)


fig, (ax_vol, ax_chg, ax_ratio) = plt.subplots(
    3, 1, figsize=(10.5, 12), sharex=True,
    gridspec_kw={"height_ratios": [1.3, 1, 1.3]},
)
fig.patch.set_facecolor(SURFACE)
fig.suptitle(
    f"The 3-point shift in NCAA women's basketball ({MIN_SEASON}–{seasons[-1]})",
    color=INK, fontsize=14, fontweight="bold", x=0.065, ha="left",
)

# --- Panel 1: attempts & makes, both shot types -------------------------
ax_vol.plot(seasons, avg_2pa, color=BLUE, linewidth=2, linestyle="--",
            marker="o", markersize=4, label="2-pt attempts/game")
ax_vol.plot(seasons, avg_2pm, color=BLUE, linewidth=2,
            marker="o", markersize=4, label="2-pt makes/game")
ax_vol.plot(seasons, avg_3pa, color=ORANGE, linewidth=2, linestyle="--",
            marker="o", markersize=4, label="3-pt attempts/game")
ax_vol.plot(seasons, avg_3pm, color=ORANGE, linewidth=2,
            marker="o", markersize=4, label="3-pt makes/game")
ax_vol.set_ylabel("Per team-game", color=INK_SECONDARY)
ax_vol.set_title("Shot volume: attempts vs. makes", color=INK, loc="left", fontsize=11)

# Two separate legends: color identifies shot type (2-pt / 3-pt), line
# style identifies attempted vs. made -- keeps the dashed/solid distinction
# from getting lost inside a single four-line key.
type_legend = ax_vol.legend(
    handles=[
        Line2D([0], [0], color=BLUE, linewidth=2, label="2-point"),
        Line2D([0], [0], color=ORANGE, linewidth=2, label="3-point"),
    ],
    title="Shot type", alignment="left",
    frameon=False, labelcolor=INK_SECONDARY, loc="upper left",
    bbox_to_anchor=(1.01, 1.0), borderaxespad=0, fontsize=9,
)
type_legend.get_title().set_color(INK_SECONDARY)
ax_vol.add_artist(type_legend)
ax_vol.legend(
    handles=[
        Line2D([0], [0], color=INK_SECONDARY, linewidth=2, linestyle="-", label="Made"),
        Line2D([0], [0], color=INK_SECONDARY, linewidth=2, linestyle="--", dashes=(4, 2), label="Attempted"),
    ],
    title="Line style", alignment="left",
    frameon=False, labelcolor=INK_SECONDARY, loc="upper left",
    bbox_to_anchor=(1.01, 0.64), borderaxespad=0, fontsize=9, handlelength=2.8,
).get_title().set_color(INK_SECONDARY)
style_axes(ax_vol)

# --- Panel 2: accuracy change from 2014 baseline -------------------------
ax_chg.axhline(0, color=INK_MUTED, linewidth=1)
ax_chg.plot(seasons, two_pt_change, color=BLUE, linewidth=2, marker="o", markersize=4, label="2P% change")
ax_chg.plot(seasons, three_pt_change, color=ORANGE, linewidth=2, marker="o", markersize=4, label="3P% change")
ax_chg.set_ylabel("Pct-point change\nsince 2014", color=INK_SECONDARY)
ax_chg.set_title("Accuracy change from the 2014 baseline", color=INK, loc="left", fontsize=11)
ax_chg.legend(frameon=False, labelcolor=INK_SECONDARY, loc="upper left", fontsize=9)
style_axes(ax_chg)

# --- Panel 3: accuracy ratio, league average vs. top-10 teams -----------
ax_ratio.axhline(1.5, color=INK_MUTED, linewidth=1.2, linestyle="--")
ax_ratio.text(
    seasons[0], 1.493, "1.5 = true indifference point (3pt worth 1.5× a 2pt)",
    color=INK_MUTED, fontsize=8.5, va="top",
)
ax_ratio.plot(seasons, league_ratio, color=AQUA, linewidth=2, marker="o", markersize=4, label="D-I average")
ax_ratio.plot(seasons, top10_ratio, color=YELLOW, linewidth=2, marker="D", markersize=6,
              linestyle=":", label="Top 10 teams (by win %)")
ax_ratio.set_ylabel("2P% ÷ 3P% ratio", color=INK_SECONDARY)
ax_ratio.set_title("Accuracy ratio 2p%/3p%: NCAA average vs. top-10 teams", color=INK, loc="left", fontsize=11)
ax_ratio.set_xlabel("Season", color=INK_SECONDARY)
ax_ratio.legend(frameon=False, labelcolor=INK_SECONDARY, loc="lower right", fontsize=9)
style_axes(ax_ratio)

fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig("2pt_3pt_relation.png", dpi=150, facecolor=SURFACE, bbox_inches="tight")

print("Wrote 2pt_3pt_relation.png")

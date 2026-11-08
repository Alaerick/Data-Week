# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the judges of the Big Ten Academic Alliance (BTAA) Love Data Week 2026 Data Viz Championship, student category. They reach the entry from the competition gallery (title, screenshot, short description, author and university), open the github.io link, and score it against the other student entries that used the same NCAA women's basketball dataset.

Other visitors (gallery browsers, basketball fans, students) are welcome but secondary; they are not the audience the work is tuned for.

## Product Purpose

A data story about NCAA Division I women's basketball, 2014–2026: how teams shifted their mix of two- and three-point shots until the league's accuracy ratio (2-point accuracy ÷ 3-point accuracy) closed in on the 1.5 break-even point, where both shots are worth the same points per attempt.

Success means placing in the 2026 student championship.

## Positioning

Every entry works from the same dataset, so the difference has to come from the idea. This entry's mechanism is a single, testable concept: a three is worth 1.5 twos, so the ratio of the two accuracies says which shot is better, and the league can be watched converging on that line season by season. The analysis is also candid about what the data cannot show (coverage changes, the limits of the 1.5 rule).

## Operating Context

- Judges see the entry first as a gallery card: a screenshot, a 3–5 sentence description, and author/university. The screenshot and description need to be ready before submission.
- The site is a single scrolling page opened in a desktop or phone browser from the gallery link.
- Past winners (2025 gallery) ranged from static images to Tableau, Power BI, Shiny, Streamlit and github.io sites; multi-view interactive pieces with a clear claim-style title were common among strong entries.

## Capabilities and Constraints

- Current implementation: a static page in `docs/` (HTML, CSS, D3 7.9.0 from a CDN) published with GitHub Pages from `Alaerick/Data-Week`, folder `/docs`, at https://alaerick.github.io/Data-Week/.
- Data pipeline: `scripts/export_data.py` reads the local `basketball.db` (built from the competition's CSV/parquet files) and writes small JSON files to `docs/data/`. The 7 GB database and raw files are git-ignored and never published.
- Analysis rules in use: seasons 2014–2026; a team-season counts with at least 20 games; accuracies are total makes ÷ total attempts; "top 10" is the ten best win percentages per season.
- Known data limit: 2014–2016 cover only about 66 teams per season versus 348+ from 2017, so early seasons must be marked as limited wherever they appear.
- Terminology: "2-point accuracy", "3-point accuracy", "accuracy ratio", "break-even".
- Undecided: submission deadline, any specific competition rules, and any required accessibility standard were not specified.

## Brand Commitments

- Title: "Closing In on 1.5". Byline: Rong Yang, Purdue University.
- The author writes the page's prose. Ask before rewording, correcting or removing their sentences; adding labels, captions or accessibility text is fine.

## Evidence on Hand

- Competition dataset: `NCAA Women's Basketball Data Files 2026/` (games, team_box, game_box, play_by_play, rankings, teams) and the local `basketball.db`.
- Derived data published with the site: `docs/data/league.json`, `docs/data/teams.json`, `docs/data/winpct.json`.
- Earlier exploration: `plot_2pt_3pt_relation.py`, `2pt_3pt_relation.png`, `season_2pt_3pt_summary.csv`.
- No testimonials, awards, press or external endorsements exist; do not invent any. Every number shown must come from the dataset.

## Product Principles

1. One idea, proven step by step: every section either explains the 1.5 break-even, shows the league moving toward it, or tests whether it pays off.
2. Honest before impressive: coverage gaps, small samples and the limits of the 1.5 rule are stated where they matter, never hidden to make a chart look stronger.
3. Judges first: a judge should grasp the claim within the first screen and be able to verify it from the charts and methods.
4. The data is the only source: no figures, comparisons or claims that the competition dataset cannot support.
5. The author's voice stays the author's.

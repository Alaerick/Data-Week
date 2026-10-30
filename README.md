# How NCAA teams improved over time

A Love Data Week 2026 data viz entry about how NCAA Division I women's basketball has
converged on the break-even point between twos and threes (2P% ÷ 3P% = 1.5).

## Layout

- `scripts/export_data.py` reads `basketball.db` and writes small JSON files to `docs/data/`.
- `docs/` is the static site (HTML + D3), served by GitHub Pages.
- `plot_2pt_3pt_relation.py` is the earlier exploratory matplotlib chart.

## Rebuild the data

```bash
python scripts/export_data.py
```

## Preview locally

```bash
python -m http.server 8000 --directory docs
```

Then open http://localhost:8000.


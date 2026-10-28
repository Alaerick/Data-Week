/* global d3 */
const BREAK_EVEN = 1.5;
const COVERAGE_BREAK = 2017; // ~66 teams/season before, 348+ from here on

const fmtPct = d3.format(".1%");
const fmtPct0 = d3.format(".0%");
const fmt2 = d3.format(".2f");
const fmt3 = d3.format(".3f");

const [league, teams, adjustment, winpct] = await Promise.all(
  ["league", "teams", "adjustment", "winpct"].map((n) => d3.json(`data/${n}.json`)),
);
const first = league[0];
const last = league.at(-1);
const teamsBySeason = d3.group(teams, (d) => d.season);
const teamsById = d3.group(teams, (d) => d.id);

// ---------------------------------------------------------------- helpers --

const tooltip = d3.select("#tooltip");
function showTip(event, html) {
  tooltip.html(html).classed("show", true);
  const { innerWidth: w } = window;
  const box = tooltip.node().getBoundingClientRect();
  const x = Math.min(event.clientX + 14, w - box.width - 8);
  const y = event.clientY - box.height - 12 < 0 ? event.clientY + 16 : event.clientY - box.height - 12;
  tooltip.style("left", `${x}px`).style("top", `${y}px`);
}
const hideTip = () => tooltip.classed("show", false);
const tipRow = (label, value, cls = "") => `<div class="t-row"><span class="${cls}">${label}</span><b>${value}</b></div>`;

// Calls draw(el, width) now and again whenever the container's width changes.
function responsive(selector, draw) {
  const el = document.querySelector(selector);
  let width = 0;
  new ResizeObserver(() => {
    if (el.clientWidth !== width) {
      width = el.clientWidth;
      draw(el, width);
    }
  }).observe(el);
  return () => width && draw(el, width);
}

function coverageMarker(svg, x, top, bottom, showLabel = true) {
  const cx = (x(COVERAGE_BREAK - 1) + x(COVERAGE_BREAK)) / 2;
  svg.append("line").attr("class", "coverage-line").attr("x1", cx).attr("x2", cx).attr("y1", top).attr("y2", bottom);
  if (showLabel) {
    svg.append("text").attr("class", "coverage-label").attr("x", cx + 4).attr("y", top + 10).text("more teams in data →");
  }
}

// Season line chart with optional reference line, shaded band and hover readout.
function lineChart(el, width, { series, yFormat, height = 280, ref, band, compact = false }) {
  const m = { t: 14, r: 12, b: 28, l: compact ? 40 : 46 };
  const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", height);
  const x = d3.scaleLinear().domain(d3.extent(league, (d) => d.season)).range([m.l, width - m.r]);
  const values = series.flatMap((s) => league.map((d) => d[s.key]));
  if (band) values.push(...league.map((d) => d[band.lo]), ...league.map((d) => d[band.hi]));
  if (ref) values.push(ref.value);
  const y = d3.scaleLinear().domain(d3.extent(values)).nice().range([height - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(compact ? 4 : 5).tickSize(-(width - m.l - m.r)).tickFormat(yFormat));
  const tickEvery = width < 420 ? 4 : width < 640 ? 2 : 1;
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`)
    .call(d3.axisBottom(x).tickValues(league.map((d) => d.season).filter((s, i) => i % tickEvery === 0)).tickFormat(d3.format("d")));
  coverageMarker(svg, x, m.t, height - m.b, !compact);

  if (band) {
    svg.append("path").datum(league).attr("fill", band.color).attr("opacity", 0.14)
      .attr("d", d3.area().x((d) => x(d.season)).y0((d) => y(d[band.lo])).y1((d) => y(d[band.hi])));
  }
  if (ref) {
    svg.append("line").attr("class", "ref-line").attr("x1", m.l).attr("x2", width - m.r).attr("y1", y(ref.value)).attr("y2", y(ref.value));
    svg.append("text").attr("class", "ref-label").attr("x", width - m.r).attr("y", y(ref.value) - 6).attr("text-anchor", "end").text(ref.label);
  }
  for (const s of series) {
    svg.append("path").datum(league).attr("fill", "none").style("stroke", s.color).attr("stroke-width", 2.5)
      .attr("stroke-dasharray", s.dash ?? null)
      .attr("d", d3.line().x((d) => x(d.season)).y((d) => y(d[s.key])));
    svg.append("g").selectAll("circle").data(league).join("circle")
      .attr("cx", (d) => x(d.season)).attr("cy", (d) => y(d[s.key])).attr("r", compact ? 2.5 : 3.5).style("fill", s.color);
  }

  const rule = svg.append("line").attr("class", "hover-rule").attr("y1", m.t).attr("y2", height - m.b).style("opacity", 0);
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", width - m.l - m.r).attr("height", height - m.t - m.b)
    .attr("fill", "transparent")
    .on("pointermove", (event) => {
      const season = Math.round(x.invert(d3.pointer(event)[0]));
      const d = league.find((r) => r.season === season);
      if (!d) return;
      rule.attr("x1", x(season)).attr("x2", x(season)).style("opacity", 1);
      showTip(event, `<div class="t-title">${season} · ${d.teams} teams</div>` +
        series.map((s) => tipRow(s.label, (s.tipFormat ?? yFormat)(d[s.key]))).join(""));
    })
    .on("pointerleave", () => { rule.style("opacity", 0); hideTip(); });
}

// Vertical bars measured from a baseline (0 or 50%), one per ratio band.
function bandBars(el, width, { data, value, format, baseline = 0, color, height = 260, yLabel, tip }) {
  // Extra top margin keeps the y label and break-even labels clear of the bars.
  const m = { t: 40, r: 12, b: 44, l: 52 };
  const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", height);
  const x = d3.scaleBand().domain(data.map((d) => d.band)).range([m.l, width - m.r]).padding(0.25);
  const ext = d3.extent([baseline, ...data.map(value)]);
  const pad = (ext[1] - ext[0]) * 0.12;
  const y = d3.scaleLinear().domain([Math.min(ext[0], baseline) - (ext[0] < baseline ? pad : 0), ext[1] + pad]).nice().range([height - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(width - m.l - m.r)).tickFormat(format));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`).call(d3.axisBottom(x).tickSize(0))
    .call((g) => g.select(".domain").remove());
  svg.append("text").attr("x", (m.l + width - m.r) / 2).attr("y", height - 6).attr("text-anchor", "middle")
    .text("Team's 2P% ÷ 3P% ratio");
  if (yLabel) svg.append("text").attr("x", m.l).attr("y", m.t - 26).text(yLabel);
  svg.append("line").attr("stroke", "var(--ink-2)").attr("x1", m.l).attr("x2", width - m.r).attr("y1", y(baseline)).attr("y2", y(baseline));

  // Break-even divider between the 1.4–1.5 and 1.5–1.6 bands.
  const bands = x.domain();
  const i = bands.findIndex((b) => b.startsWith("1.5"));
  if (i > 0) {
    const bx = x(bands[i]) - (x.step() * x.paddingInner()) / 2;
    svg.append("line").attr("class", "ref-line").attr("x1", bx).attr("x2", bx).attr("y1", m.t - 16).attr("y2", height - m.b);
    svg.append("text").attr("class", "ref-label").attr("x", bx - 6).attr("y", m.t - 6).attr("text-anchor", "end").text("threes better ←");
    svg.append("text").attr("class", "ref-label").attr("x", bx + 6).attr("y", m.t - 6).text("→ twos better");
  }

  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", (d) => x(d.band)).attr("width", x.bandwidth())
    .attr("y", (d) => Math.min(y(value(d)), y(baseline)))
    .attr("height", (d) => Math.abs(y(value(d)) - y(baseline)))
    .attr("rx", 3).style("fill", color)
    .on("pointermove", (event, d) => showTip(event, tip(d)))
    .on("pointerleave", hideTip);
  svg.append("g").selectAll("text").data(data).join("text")
    .attr("x", (d) => x(d.band) + x.bandwidth() / 2)
    .attr("y", (d) => (value(d) >= baseline ? y(value(d)) - 6 : y(value(d)) + 14))
    .attr("text-anchor", "middle").style("font-weight", 600).style("fill", "var(--ink)")
    .text((d) => format(value(d)));
}
const bandColor = (d) => (d.band.startsWith("<") || d.band.startsWith("1.3") || d.band.startsWith("1.4") ? "var(--three)" : "var(--two)");

// ------------------------------------------------------------------- hero --

d3.select("#hero-lede").html(
  `In ${first.season}, a three-pointer was worth <b class="three">${fmt3(first.pps3)}</b> points per shot ` +
  `and a two was worth <b class="two">${fmt3(first.pps2)}</b>. In ${last.season}: ` +
  `<b class="three">${fmt3(last.pps3)}</b> vs <b class="two">${fmt3(last.pps2)}</b>.`,
);
d3.select("#hero-stats").selectAll("div").data([
  { label: "D-I 2P% ÷ 3P%", from: first.ratio, to: last.ratio, f: fmt2 },
  { label: "Extra points per 3 (vs. a 2)", from: first.pps3 - first.pps2, to: last.pps3 - last.pps2, f: (v) => `+${fmt3(v)}` },
  { label: "Shots that are threes", from: first.share3, to: last.share3, f: fmtPct0 },
  { label: "Teams for whom threes were the better shot", from: first.pct_threes_better, to: last.pct_threes_better, f: fmtPct0 },
]).join("div").attr("class", "stat").html((d) =>
  `<div class="label">${d.label}</div><div class="value">${d.f(d.to)}</div><div class="from">${d.f(d.from)} in ${first.season}</div>`);

// -------------------------------------------------------------- explainer --

const p2Input = document.getElementById("p2");
const p3Input = document.getElementById("p3");
p2Input.value = last.p2;
p3Input.value = last.p3;
function updateExplainer() {
  const p2 = +p2Input.value;
  const p3 = +p3Input.value;
  const pps2 = 2 * p2;
  const pps3 = 3 * p3;
  d3.select("#p2-out").text(fmtPct(p2));
  d3.select("#p3-out").text(fmtPct(p3));
  d3.select("#pps2").text(fmt2(pps2));
  d3.select("#pps3").text(fmt2(pps3));
  d3.select("#pps2-bar").style("width", `${(pps2 / 1.5) * 100}%`);
  d3.select("#pps3-bar").style("width", `${(pps3 / 1.5) * 100}%`);
  const per100 = Math.abs(pps3 - pps2) * 100;
  const ratio = p2 / p3;
  let verdict;
  if (per100 < 1) verdict = "Close to even: it barely matters which shot you take.";
  else if (pps3 > pps2) verdict = `Threes are better by ${per100.toFixed(0)} points per 100 shots.`;
  else verdict = `Twos are better by ${per100.toFixed(0)} points per 100 shots.`;
  d3.select("#verdict").html(
    `Ratio ${fmt2(ratio)}. ${verdict} <span style="font-weight:400;color:var(--ink-2)">Break-even 3P% at this 2P%: ${fmtPct(p2 / BREAK_EVEN)}.</span>`,
  );
}
p2Input.addEventListener("input", updateExplainer);
p3Input.addEventListener("input", updateExplainer);
updateExplainer();

// ----------------------------------------------------------- convergence --

responsive("#ratio-chart", (el, w) => lineChart(el, w, {
  series: [
    { key: "ratio", label: "All D-I", color: "var(--league)" },
    { key: "top10_ratio", label: "Top 10", color: "var(--top)", dash: "6 4" },
  ],
  band: { lo: "q1_ratio", hi: "q3_ratio", color: "var(--league)" },
  ref: { value: BREAK_EVEN, label: "1.5 = break-even" },
  yFormat: fmt2,
}));
responsive("#pps-chart", (el, w) => lineChart(el, w, {
  series: [
    { key: "pps2", label: "Per 2-pt shot", color: "var(--two)" },
    { key: "pps3", label: "Per 3-pt shot", color: "var(--three)" },
  ],
  height: 240,
  yFormat: fmt2,
}));

// ------------------------------------------------------------- mechanism --

responsive("#share-chart", (el, w) => lineChart(el, w, {
  series: [{ key: "share3", label: "Threes", color: "var(--ink-2)" }], yFormat: fmtPct0, height: 200, compact: true,
}));
responsive("#p3-chart", (el, w) => lineChart(el, w, {
  series: [{ key: "p3", label: "3P%", color: "var(--three)" }], yFormat: fmtPct0, height: 200, compact: true,
  tipFormat: fmtPct,
}));
responsive("#p2-chart", (el, w) => lineChart(el, w, {
  series: [{ key: "p2", label: "2P%", color: "var(--two)" }], yFormat: fmtPct0, height: 200, compact: true,
}));

// ------------------------------------------------------------ adjustment --

responsive("#adjust-chart", (el, w) => bandBars(el, w, {
  data: adjustment,
  value: (d) => d.change_pp,
  format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pts`,
  color: bandColor,
  yLabel: "Change in 3-pt share of shots, next season",
  tip: (d) => `<div class="t-title">Ratio ${d.band}</div>${tipRow("Team-seasons", d.n)}${tipRow("Avg. change", `${d.change_pp.toFixed(2)} pts`)}`,
}));

// ------------------------------------------------------------------- wins --

let winSet = "latest";
d3.select("#wins-latest").text(String(winpct.latest_season));
const drawWins = responsive("#wins-chart", (el, w) => bandBars(el, w, {
  data: winpct[winSet],
  value: (d) => d.win_pct,
  baseline: 0.5,
  format: fmtPct0,
  color: bandColor,
  yLabel: "Average win %",
  tip: (d) => `<div class="t-title">Ratio ${d.band}</div>${tipRow("Team-seasons", d.n)}${tipRow("Win %", fmtPct(d.win_pct))}`,
}));
d3.selectAll(".toggle button").on("click", function () {
  winSet = this.dataset.set;
  d3.selectAll(".toggle button").classed("on", false);
  d3.select(this).classed("on", true);
  drawWins();
});

// ------------------------------------------------------------------ next --

d3.select("#next-text").html(
  `The ten best teams were already at <b>${fmt2(last.top10_ratio)}</b> in ${last.season}, just past 1.5. ` +
  `For them, a two is now worth slightly more than a three. If the rest of the league keeps following the top ` +
  `teams, the next adjustment may run the other way: more shots at the rim, and fewer, better threes.`,
);

// --------------------------------------------------------------- scatter --

const seasons = league.map((d) => d.season);
const seasonInput = document.getElementById("season");
seasonInput.min = seasons[0];
seasonInput.max = last.season;
seasonInput.step = 1;
seasonInput.value = last.season;
const state = { season: last.season, query: "", rings: true };

d3.select("#team-names").selectAll("option")
  .data(Array.from(new Set(teams.map((d) => d.name))).sort())
  .join("option").attr("value", (d) => d);

const pad = (lo, hi, f = 0.04) => [lo - (hi - lo) * f, hi + (hi - lo) * f];
const xDomain = pad(d3.quantile(teams, 0.002, (d) => d.p3), d3.quantile(teams, 0.998, (d) => d.p3));
const yDomain = pad(d3.quantile(teams, 0.002, (d) => d.p2), d3.quantile(teams, 0.998, (d) => d.p2));
let sx;
let sy;
let scatterSvg;

function drawScatter(el, width) {
  const height = Math.max(360, Math.min(560, width * 0.62));
  const m = { t: 16, r: 16, b: 44, l: 52 };
  scatterSvg = d3.select(el).html("").append("svg").attr("width", width).attr("height", height);
  sx = d3.scaleLinear().domain(xDomain).range([m.l, width - m.r]).clamp(true);
  sy = d3.scaleLinear().domain(yDomain).range([height - m.b, m.t]).clamp(true);
  const svg = scatterSvg;

  // Regions split by the break-even line 2P% = 1.5 × 3P%.
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const linePts = [[x0, BREAK_EVEN * x0], [x1, BREAK_EVEN * x1]];
  const poly = (pts) => pts.map(([a, b]) => [sx(a), sy(Math.max(y0, Math.min(y1, b)))]);
  svg.append("path").attr("class", "region-two").attr("d", d3.line()(poly([...linePts, [x1, y1], [x0, y1]])));
  svg.append("path").attr("class", "region-three").attr("d", d3.line()(poly([...linePts, [x1, y0], [x0, y0]])));

  svg.append("text").attr("class", "year-label").attr("x", width - m.r - 8).attr("y", height - m.b - 12).attr("text-anchor", "end");

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(sy).ticks(6).tickSize(-(width - m.l - m.r)).tickFormat(fmtPct0));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`)
    .call(d3.axisBottom(sx).ticks(width < 500 ? 5 : 8).tickFormat(fmtPct0));
  svg.append("text").attr("x", (m.l + width - m.r) / 2).attr("y", height - 6).attr("text-anchor", "middle").text("3-point %");
  svg.append("text").attr("x", m.l).attr("y", m.t - 4).text("2-point %");

  svg.append("line").attr("class", "ref-line")
    .attr("x1", sx(x0)).attr("y1", sy(BREAK_EVEN * x0)).attr("x2", sx(x1)).attr("y2", sy(BREAK_EVEN * x1));
  svg.append("text").attr("class", "region-label").style("fill", "var(--two)")
    .attr("x", m.l + 10).attr("y", m.t + 16).text("Twos are the better shot");
  svg.append("text").attr("class", "region-label").style("fill", "var(--three)")
    .attr("x", width - m.r - 10).attr("y", height - m.b - 96).attr("text-anchor", "end").text("Threes are the better shot");

  svg.append("g").attr("class", "trail-layer");
  svg.append("g").attr("class", "dots");
  svg.append("path").attr("class", "league-mark");
  updateScatter(false);
}

function updateScatter(animate = true) {
  if (!scatterSvg) return;
  const svg = scatterSvg;
  const data = teamsBySeason.get(state.season) ?? [];
  const q = state.query.trim().toLowerCase();
  const isMatch = (d) => q && d.name.toLowerCase().includes(q);
  const anyMatch = q && data.some(isMatch);
  const t = svg.transition().duration(animate ? 700 : 0).ease(d3.easeCubicInOut);

  svg.select(".year-label").text(state.season);
  svg.select(".dots").selectAll("circle")
    .data(data, (d) => d.id)
    .join(
      (enter) => enter.append("circle").attr("r", 0).attr("cx", (d) => sx(d.p3)).attr("cy", (d) => sy(d.p2)),
      (update) => update,
      (exit) => exit.transition(t).attr("r", 0).remove(),
    )
    .attr("class", (d) => `dot${state.rings && d.top10 ? " top" : ""}${isMatch(d) ? " match" : anyMatch ? " dim" : ""}`)
    .on("pointermove", (event, d) => showTip(event,
      `<div class="t-title">${d.name}${d.top10 ? " ★" : ""}</div>` +
      tipRow("Season", d.season) +
      tipRow("2-point %", fmtPct(d.p2), "two") +
      tipRow("3-point %", fmtPct(d.p3), "three") +
      tipRow("Ratio", fmt2(d.p2 / d.p3)) +
      tipRow("Threes share", fmtPct0(d.share3)) +
      tipRow("Win %", `${fmtPct0(d.win_pct)} (${d.games} g)`)))
    .on("pointerleave", hideTip)
    .transition(t)
    .attr("cx", (d) => sx(d.p3)).attr("cy", (d) => sy(d.p2))
    .attr("r", (d) => (isMatch(d) ? 6.5 : 4.5));
  svg.select(".dots").selectAll("circle.match").raise();

  const lg = league.find((d) => d.season === state.season);
  const sym = d3.symbol(d3.symbolDiamond, 180);
  svg.select(".league-mark").transition(t).attr("transform", `translate(${sx(lg.p3)},${sy(lg.p2)})`).attr("d", sym());

  // Trail across all seasons when the search matches exactly one team.
  const matchedIds = new Set(teams.filter(isMatch).map((d) => d.id));
  const trail = matchedIds.size === 1 ? teamsById.get([...matchedIds][0]) : [];
  const layer = svg.select(".trail-layer");
  layer.selectAll("path").data(trail.length > 1 ? [trail] : []).join("path").attr("class", "trail")
    .attr("d", d3.line().x((d) => sx(d.p3)).y((d) => sy(d.p2)));
  layer.selectAll("text").data(trail).join("text").attr("class", "trail-label")
    .attr("x", (d) => sx(d.p3) + 6).attr("y", (d) => sy(d.p2) - 6)
    .text((d) => `'${String(d.season).slice(2)}`);

  const below = data.filter((d) => d.p2 / d.p3 < BREAK_EVEN).length;
  d3.select("#season-out").text(state.season);
  d3.select("#scatter-caption").html(
    `${state.season}: <b>${data.length}</b> teams, <b>${fmtPct0(below / data.length)}</b> below the line, so threes were their better shot. ` +
    `<span style="color:var(--league)">◆</span> marks the D-I average (ratio ${fmt2(lg.ratio)}).`,
  );
}

responsive("#scatter", drawScatter);

let timer = null;
const playBtn = document.getElementById("play");
function stop() {
  clearInterval(timer);
  timer = null;
  playBtn.textContent = "▶ Play";
}
playBtn.addEventListener("click", () => {
  if (timer) return stop();
  if (state.season >= last.season) state.season = seasons[0] - 1;
  playBtn.textContent = "❚❚ Pause";
  const step = () => {
    state.season += 1;
    seasonInput.value = state.season;
    updateScatter();
    if (state.season >= last.season) stop();
  };
  step();
  timer = setInterval(step, 1100);
});
seasonInput.addEventListener("input", () => {
  stop();
  state.season = +seasonInput.value;
  updateScatter();
});
document.getElementById("team-search").addEventListener("input", (e) => {
  state.query = e.target.value;
  updateScatter(false);
});
document.getElementById("top10").addEventListener("change", (e) => {
  state.rings = e.target.checked;
  updateScatter(false);
});

/* global d3 */
const BREAK_EVEN = 1.5;
const COVERAGE_BREAK = 2017; // ~66 teams/season before, 348+ from here on

const fmtPct = d3.format(".1%");
const fmtPct0 = d3.format(".0%");
const fmt2 = d3.format(".2f");

let league;
let teams;
let winpct;
try {
  [league, teams, winpct] = await Promise.all(
    ["league", "teams", "winpct"].map((n) => d3.json(`data/${n}.json`)),
  );
} catch (err) {
  // Without data every chart would render blank; say so instead.
  d3.select("main").insert("p", ":first-child").attr("class", "load-error")
    .text("The chart data could not be loaded. Check your connection and reload the page.");
  throw err;
}
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
// A tap shows the tooltip (pointerdown) and keeps it until the next tap elsewhere
// or a scroll, because touch fires pointerleave as soon as the finger lifts.
const hideTip = (event) => {
  if (event?.pointerType !== "touch") tooltip.classed("show", false);
};
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest?.(".chart")) tooltip.classed("show", false);
});
window.addEventListener("scroll", () => tooltip.classed("show", false), { passive: true });
const tipRow = (label, value, cls = "") => `<div class="t-row"><span class="${cls}">${label}</span><b>${value}</b></div>`;

// Calls draw(el, width) now and again whenever the container's width changes.
function responsive(selector, draw) {
  const el = document.querySelector(selector);
  let width = 0;
  const redrawIfResized = () => {
    if (el.clientWidth && el.clientWidth !== width) {
      width = el.clientWidth;
      draw(el, width);
    }
  };
  // Draw right away; ResizeObserver callbacks wait for the next paint, which
  // can be delayed indefinitely in a background tab.
  redrawIfResized();
  new ResizeObserver(redrawIfResized).observe(el);
  return () => width && draw(el, width);
}

function coverageMarker(svg, x, top, bottom, label) {
  const cx = (x(COVERAGE_BREAK - 1) + x(COVERAGE_BREAK)) / 2;
  svg.append("line").attr("class", "coverage-line").attr("x1", cx).attr("x2", cx).attr("y1", top).attr("y2", bottom);
  svg.append("text").attr("class", "coverage-label").attr("x", cx + 4).attr("y", top + 10).text(label);
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
  coverageMarker(svg, x, m.t, height - m.b, compact ? "more teams →" : "more teams in data →");

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
    .on("pointermove pointerdown", (event) => {
      const season = Math.round(x.invert(d3.pointer(event)[0]));
      const d = league.find((r) => r.season === season);
      if (!d) return;
      rule.attr("x1", x(season)).attr("x2", x(season)).style("opacity", 1);
      showTip(event, `<div class="t-title">${season} · ${d.teams} teams</div>` +
        series.map((s) => tipRow(s.label, (s.tipFormat ?? yFormat)(d[s.key]))).join(""));
    })
    .on("pointerleave", (event) => { rule.style("opacity", 0); hideTip(event); });
}

// -------------------------------------------------------------- explainer --

const p2Input = document.getElementById("p2");
const p3Input = document.getElementById("p3");
p2Input.value = last.p2;
p3Input.value = last.p3;

// Points per shot against 3-pt accuracy: the three line rises (3 × 3P%), the two
// line is flat (2 × 2P%), and they cross at the break-even 3P% = 2P% ÷ 1.5.
const P3_RANGE = [+p3Input.min, +p3Input.max];
const PPS_RANGE = [0.6, 1.35];
let explainer = null;
function drawExplainerChart(el, width) {
  const height = width < 500 ? 220 : 260;
  const m = { t: 14, r: 16, b: 40, l: 44 };
  const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", height);
  const x = d3.scaleLinear().domain(P3_RANGE).range([m.l, width - m.r]);
  const y = d3.scaleLinear().domain(PPS_RANGE).range([height - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(width - m.l - m.r)).tickFormat(fmt2));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`)
    .call(d3.axisBottom(x).ticks(width < 500 ? 5 : 6).tickFormat(fmtPct0));
  svg.append("text").attr("x", (m.l + width - m.r) / 2).attr("y", height - 6).attr("text-anchor", "middle")
    .text("3-point accuracy");
  svg.append("text").attr("x", m.l).attr("y", m.t - 2).attr("dy", "-0.2em").text("Points per shot");

  const gap = svg.append("line").attr("stroke-width", 6).attr("stroke-linecap", "round").style("opacity", 0.35);
  // Dotted neutral line for the value of a three; orange marks the current 3-pt accuracy.
  svg.append("line").style("stroke", "var(--ink)").attr("stroke-width", 3.5)
    .attr("stroke-dasharray", "0.1 7").attr("stroke-linecap", "round")
    .attr("x1", x(P3_RANGE[0])).attr("y1", y(3 * P3_RANGE[0])).attr("x2", x(P3_RANGE[1])).attr("y2", y(3 * P3_RANGE[1]));
  svg.append("text").attr("class", "region-label").style("fill", "var(--ink)")
    .attr("x", x(0.42) + 8).attr("y", y(3 * 0.42) + 20).text("Per 3-pt shot");
  const two = svg.append("line").style("stroke", "var(--two)").attr("stroke-width", 2.5)
    .attr("x1", x(P3_RANGE[0])).attr("x2", x(P3_RANGE[1]));
  const twoLabel = svg.append("text").attr("class", "region-label").style("fill", "var(--two)").attr("x", m.l + 6);
  const breakRule = svg.append("line").attr("class", "ref-line");
  const breakDot = svg.append("circle").attr("r", 5).style("fill", "var(--surface)").style("stroke", "var(--ink)").attr("stroke-width", 2);
  const breakLabel = svg.append("text").attr("class", "ref-label").attr("text-anchor", "middle");
  const current = svg.append("line").style("stroke", "var(--three)").attr("stroke-width", 2);
  const dot2 = svg.append("circle").attr("r", 5).style("fill", "var(--two)");
  const dot3 = svg.append("circle").attr("r", 5).style("fill", "var(--three)");
  explainer = { x, y, m, height, gap, two, twoLabel, breakRule, breakDot, breakLabel, current, dot2, dot3 };
  updateExplainer();
}

function updateExplainerChart(p2, p3) {
  if (!explainer) return;
  const { x, y, m, height, gap, two, twoLabel, breakRule, breakDot, breakLabel, current, dot2, dot3 } = explainer;
  const pps2 = 2 * p2;
  const even = p2 / BREAK_EVEN;
  two.attr("y1", y(pps2)).attr("y2", y(pps2));
  twoLabel.attr("y", y(pps2) - 8).text("Per 2-pt shot");
  const evenIn = even >= P3_RANGE[0] && even <= P3_RANGE[1];
  breakRule.style("display", evenIn ? null : "none")
    .attr("x1", x(even)).attr("x2", x(even)).attr("y1", y(pps2)).attr("y2", height - m.b);
  breakDot.style("display", evenIn ? null : "none").attr("cx", x(even)).attr("cy", y(pps2));
  breakLabel.style("display", evenIn ? null : "none").attr("x", x(even)).attr("y", y(pps2) - 12)
    .text(`break-even ${fmtPct(even)}`);
  current.attr("x1", x(p3)).attr("x2", x(p3)).attr("y1", m.t).attr("y2", height - m.b);
  gap.attr("x1", x(p3)).attr("x2", x(p3)).attr("y1", y(pps2)).attr("y2", y(3 * p3))
    .style("stroke", 3 * p3 > pps2 ? "var(--three)" : "var(--two)");
  dot2.attr("cx", x(p3)).attr("cy", y(pps2));
  dot3.attr("cx", x(p3)).attr("cy", y(3 * p3));
}

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
    `Accuracy ratio ${fmt2(ratio)}. ${verdict} <span style="font-weight:400;color:var(--ink-2)">At this 2-point accuracy, threes break even at ${fmtPct(p2 / BREAK_EVEN)}.</span>`,
  );
  updateExplainerChart(p2, p3);
}
p2Input.addEventListener("input", updateExplainer);
p3Input.addEventListener("input", updateExplainer);
updateExplainer();
responsive("#explainer-chart", drawExplainerChart);

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
  series: [{ key: "p3", label: "3-pt accuracy", color: "var(--three)" }], yFormat: d3.format(".1~%"), height: 200, compact: true,
  tipFormat: fmtPct,
}));
responsive("#p2-chart", (el, w) => lineChart(el, w, {
  series: [{ key: "p2", label: "2-pt accuracy", color: "var(--two)" }], yFormat: d3.format(".1~%"), height: 200, compact: true,
}));

// ------------------------------------------------------------------- wins --

// Season × ratio-band grid; cell color shows average win%.
const MIN_CELL_TEAMS = 5;
// One hue, light to deep, so the grid never reuses the blue (twos) / orange (threes) code.
// Ends come from CSS tokens so the scale follows light/dark mode.
const HEAT_DOMAIN = [0.35, 0.65];
let heatColor;
let heatText;
function updateHeatScale() {
  const css = getComputedStyle(document.documentElement);
  const scale = d3.scaleLinear().domain(HEAT_DOMAIN)
    .range([css.getPropertyValue("--heat-lo").trim(), css.getPropertyValue("--heat-hi").trim()])
    .interpolate(d3.interpolateLab).clamp(true);
  heatColor = scale;
  heatText = (v) => (d3.lab(scale(v)).l > 58 ? "#1a1426" : "#ffffff");
}
// 2014–2016 cover only ~66 teams, so those columns are grouped, muted and labeled.
const isLimited = (season) => season < COVERAGE_BREAK;

function drawWins(el, width) {
  updateHeatScale();
  // Seasons run left to right; the limited-data seasons and the pooled "All" column sit apart.
  const cols = [...winpct.seasons.map((s) => ({ label: String(s.season), cells: s.cells, limited: isLimited(s.season) })),
    { label: "All", cells: winpct.pooled, pooled: true }];
  const narrow = width < 560;
  const m = { t: 46, r: 4, b: 12, l: narrow ? 56 : 168 };
  const gap = narrow ? 6 : 12;
  const rowH = 34;
  // Highest ratio on top, so "twos better" sits above the 1.5 line.
  const bands = [...winpct.bands].reverse();
  const height = m.t + bands.length * rowH + m.b;
  const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", height);
  const firstFull = cols.findIndex((c) => !c.limited);
  const colW = (width - m.l - m.r - 2 * gap) / cols.length;
  const colX = (i) => m.l + i * colW + (i >= firstFull ? gap : 0) + (cols[i].pooled ? gap : 0);
  const y = d3.scaleBand().domain(bands).range([m.t, height - m.b]).paddingInner(0.08);
  const cellW = colW * 0.92;
  const showText = cellW >= 30;

  svg.append("g").selectAll("text").data(cols).join("text")
    .attr("class", (c) => (c.pooled ? "pooled-label" : c.limited ? "row-label limited-label" : "row-label"))
    .attr("x", (c, i) => colX(i) + cellW / 2).attr("y", m.t - 8).attr("text-anchor", "middle")
    .text((c) => (narrow && !c.pooled ? `'${c.label.slice(2)}` : c.label));
  svg.append("g").selectAll("text").data(bands).join("text")
    .attr("x", m.l - 8).attr("y", (b) => y(b) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end")
    .text((b) => b);

  // Bracket over the limited-data seasons.
  const lx0 = colX(0);
  const lx1 = colX(firstFull - 1) + cellW;
  svg.append("path").attr("class", "limited-bracket")
    .attr("d", `M${lx0},${m.t - 22}V${m.t - 27}H${lx1}V${m.t - 22}`);
  svg.append("text").attr("class", "limited-note").attr("x", (lx0 + lx1) / 2).attr("y", m.t - 32).attr("text-anchor", "middle")
    .text(narrow ? "~66 teams" : "Limited data (~66 teams)");

  // Break-even divider between the 1.5–1.6 and 1.4–1.5 rows.
  const by = y(bands.find((b) => b.startsWith("1.4"))) - (y.step() * y.paddingInner()) / 2;
  svg.append("line").attr("class", "ref-line").attr("x1", narrow ? 0 : 4).attr("x2", width - m.r).attr("y1", by).attr("y2", by);
  if (!narrow) {
    svg.append("text").attr("class", "ref-label").attr("x", 4).attr("y", by - 8).text("↑ twos better");
    svg.append("text").attr("class", "ref-label").attr("x", 4).attr("y", by + 16).text("↓ threes better");
    svg.append("text").attr("x", 4).attr("y", m.t - 8).style("font-weight", 600).text("Accuracy ratio");
  }

  cols.forEach((col, i) => {
    const g = svg.append("g").attr("transform", `translate(${colX(i)},0)`)
      .attr("class", col.limited ? "limited" : null);
    const cells = g.selectAll("g").data(col.cells).join("g").attr("transform", (d) => `translate(0,${y(d.band)})`);
    const ok = (d) => d.n >= MIN_CELL_TEAMS && d.win_pct != null;
    cells.append("rect").attr("width", cellW).attr("height", y.bandwidth()).attr("rx", 3)
      .attr("class", (d) => (ok(d) ? null : "cell-empty"))
      .style("fill", (d) => (ok(d) ? heatColor(d.win_pct) : null))
      .on("pointermove pointerdown", (event, d) => showTip(event,
        `<div class="t-title">${col.pooled ? "All seasons" : col.label} · accuracy ratio ${d.band}</div>` +
        tipRow("Teams", d.n) + tipRow("Avg. win %", d.win_pct == null ? "–" : fmtPct(d.win_pct)) +
        (col.limited ? `<div class="t-note">Limited data: ~66 teams this season</div>` : "")))
      .on("pointerleave", hideTip);
    if (showText) {
      cells.filter(ok).append("text").attr("class", "cell-text")
        .attr("x", cellW / 2).attr("y", y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
        .style("font-weight", col.pooled ? 700 : 400).style("pointer-events", "none")
        .style("fill", (d) => (col.limited ? "var(--ink-2)" : heatText(d.win_pct)))
        .text((d) => fmtPct0(d.win_pct));
    }
  });
}
const redrawWins = responsive("#wins-chart", drawWins);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawWins);

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

  // Regions split by the break-even line: 2-pt accuracy = 1.5 × 3-pt accuracy.
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
  svg.append("text").attr("x", (m.l + width - m.r) / 2).attr("y", height - 6).attr("text-anchor", "middle").text("3-point accuracy (how often threes go in)");
  svg.append("text").attr("x", m.l).attr("y", m.t - 4).text("2-point accuracy");

  svg.append("line").attr("class", "ref-line")
    .attr("x1", sx(x0)).attr("y1", sy(BREAK_EVEN * x0)).attr("x2", sx(x1)).attr("y2", sy(BREAK_EVEN * x1));
  svg.append("text").attr("class", "region-label").style("fill", "var(--two)")
    .attr("x", m.l + 10).attr("y", m.t + 16).text("Twos are the better shot");
  svg.append("text").attr("class", "region-label").style("fill", "var(--three)")
    .attr("x", width - m.r - 10).attr("y", width < 500 ? height - m.b - 10 : height - m.b - 96).attr("text-anchor", "end").text("Threes are the better shot");

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
    .on("pointermove pointerdown", (event, d) => showTip(event,
      `<div class="t-title">${d.name}${d.top10 ? " ★" : ""}</div>` +
      tipRow("Season", d.season) +
      tipRow("2-pt accuracy", fmtPct(d.p2), "two") +
      tipRow("3-pt accuracy", fmtPct(d.p3), "three") +
      tipRow("Accuracy ratio", fmt2(d.p2 / d.p3)) +
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
    `<span style="color:var(--league)">◆</span> marks the D-I average (accuracy ratio ${fmt2(lg.ratio)}).`,
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

// ---------------------------------------------------------- accessibility --

// Each chart is drawn as SVG; give screen readers a one-sentence summary of what it shows.
const first = league[0];
const pooledWin = Object.fromEntries(winpct.pooled.map((c) => [c.band, c.win_pct]));
const chartSummaries = {
  "share-chart": `Share of shots that are threes, ${first.season} to ${last.season}: rose from ${fmtPct(first.share3)} to ${fmtPct(last.share3)}.`,
  "p3-chart": `3-point accuracy, ${first.season} to ${last.season}: fell from ${fmtPct(first.p3)} to ${fmtPct(last.p3)}.`,
  "p2-chart": `2-point accuracy, ${first.season} to ${last.season}: went from ${fmtPct(first.p2)} to ${fmtPct(last.p2)}.`,
  "explainer-chart": "Points per shot against 3-point accuracy. The flat 2-point line and the rising 3-point line cross at the break-even 3-point accuracy, which equals 2-point accuracy divided by 1.5.",
  "wins-chart": `Average win rate by season and accuracy ratio. Across all seasons, teams with a ratio of 1.4 to 1.5 won ${fmtPct0(pooledWin["1.4–1.5"])} and 1.5 to 1.6 won ${fmtPct0(pooledWin["1.5–1.6"])}, compared with ${fmtPct0(pooledWin["< 1.3"])} below 1.3 and ${fmtPct0(pooledWin["> 1.7"])} above 1.7.`,
  "ratio-chart": `Division I accuracy ratio, ${first.season} to ${last.season}: rose from ${fmt2(first.ratio)} to ${fmt2(last.ratio)}. The top 10 teams reached ${fmt2(last.top10_ratio)}.`,
  "pps-chart": `Points per shot, ${first.season} to ${last.season}: 2-point attempts went from ${fmt2(first.pps2)} to ${fmt2(last.pps2)}, 3-point attempts from ${fmt2(first.pps3)} to ${fmt2(last.pps3)}.`,
  scatter: "Scatter plot of every team's 2-point and 3-point accuracy for the selected season, with the 1.5 break-even line. The summary below the chart updates with the season.",
};
for (const [id, label] of Object.entries(chartSummaries)) {
  d3.select(`#${id}`).attr("role", "img").attr("aria-label", label);
}
d3.select("#verdict").attr("aria-live", "polite");
d3.select("#scatter-caption").attr("aria-live", "polite");

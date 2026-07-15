import React from 'react';

// Data-driven token trend chart. Renders one polyline per series from the Core
// DashboardTrendSeries data (spec §7.3.4): total + Claude Code / Codex CLI /
// Antigravity CLI / other. Replaces the prototype's hardcoded SVG paths.

const SERIES_COLOR = {
  total: 'var(--model-total)',
  'claude-code': 'var(--model-claude)',
  'codex-cli': 'var(--model-codex)',
  'antigravity-cli': 'var(--model-antigravity)',
  other: 'var(--model-other)',
};

const W = 640;
const H = 210;
const LEFT = 64;
const RIGHT = 18;
const TOP = 8;
const BOTTOM = 186;
const PLOT_W = W - LEFT - RIGHT;

function plotYPct(value, maxToken) {
  const ratio = maxToken > 0 ? value / maxToken : 0;
  const y = BOTTOM - ratio * (BOTTOM - TOP);
  return (y / H) * 100;
}

function plotXPct(index, count) {
  if (count <= 1) return ((LEFT + PLOT_W / 2) / W) * 100;
  const x = LEFT + (index / (count - 1)) * PLOT_W;
  return (x / W) * 100;
}

function seriesPoints(trend, key) {
  return trend
    .filter((p) => p.series_key === key)
    .sort((a, b) => (a.bucket_start < b.bucket_start ? -1 : 1));
}

function toXY(points, maxToken) {
  const n = points.length;
  return points.map((p, i) => {
    const x = n <= 1 ? LEFT + PLOT_W / 2 : LEFT + (i / (n - 1)) * PLOT_W;
    const ratio = maxToken > 0 ? p.token_total / maxToken : 0;
    const y = BOTTOM - ratio * (BOTTOM - TOP);
    return [x, y];
  });
}

function smoothPath(xy) {
  if (xy.length === 0) return '';
  if (xy.length === 1) {
    const [x, y] = xy[0];
    void x;
    return `M${LEFT} ${y} L${W - RIGHT} ${y}`; // single bucket -> flat line
  }
  const [firstX, firstY] = xy[0];
  const segments = [`M${firstX.toFixed(1)} ${firstY.toFixed(1)}`];
  for (let i = 1; i < xy.length; i += 1) {
    const [prevX, prevY] = xy[i - 1];
    const [x, y] = xy[i];
    const midX = (prevX + x) / 2;
    segments.push(`C${midX.toFixed(1)} ${prevY.toFixed(1)} ${midX.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return segments.join(' ');
}

export default function TrendChart({ trend, filter, axis }) {
  const data = Array.isArray(trend) ? trend : [];
  // Shared y-scale from the total series so agent lines stay comparable / below total.
  const totalPts = seriesPoints(data, 'total');
  const maxToken = Math.max(1, axis?.yMax ?? 1, ...totalPts.map((p) => p.token_total));

  const visible =
    filter === 'all'
      ? ['total', 'claude-code', 'codex-cli', 'antigravity-cli', 'other']
      : [filter];
  const yAxisLabels = axis?.yLabels ?? [];
  const xAxisLabels = axis?.xLabels ?? [];

  return (
    <div className="trend-chart-container">
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-chart" preserveAspectRatio="none">
        <defs>
          {Object.entries(SERIES_COLOR).map(([key, color]) => (
            <linearGradient key={key} id={`trend-area-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.38" />
              <stop offset="62%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          ))}
          {Object.entries(SERIES_COLOR).map(([key, color]) => (
            // userSpaceOnUse + fixed viewBox-sized margins, not objectBoundingBox percentages:
            // a single-bucket (e.g. 24h) series draws a perfectly flat line, whose bounding
            // box has zero height. Percentage-based filter regions scale off that bbox, so
            // 150% of a zero height is still zero — the filter region collapses and WebKit
            // renders the whole path as invisible. Fixed user-space coordinates sidestep this.
            <filter key={key} id={`trend-glow-${key}`} filterUnits="userSpaceOnUse" x={-20} y={-30} width={W + 40} height={H + 60}>
              <feDropShadow dx="0" dy="0" stdDeviation="2.7" floodColor={color} floodOpacity="0.32" />
            </filter>
          ))}
        </defs>
        {yAxisLabels.map((label, labelIndex) => {
          const ratio = maxToken > 0 ? label.value / maxToken : 0;
          const y = BOTTOM - ratio * (BOTTOM - TOP);
          return (
            <line key={`${labelIndex}-${label.value}-${label.label}`} x1={LEFT} y1={y} x2={W - RIGHT} y2={y} className="chart-grid-line" vectorEffect="non-scaling-stroke" />
          );
        })}
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} stroke="var(--border-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={LEFT} y1={BOTTOM} x2={W - RIGHT} y2={BOTTOM} stroke="var(--border-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />

        {visible.map((key) => {
          const pts = seriesPoints(data, key);
          if (pts.length === 0) return null;
          const xy = toXY(pts, maxToken);
          const d = smoothPath(xy);
          const color = SERIES_COLOR[key] || 'var(--accent)';
          const fillD = xy.length > 1 ? `${d} L${W - RIGHT} ${BOTTOM} L${LEFT} ${BOTTOM} Z` : '';
          return (
            <React.Fragment key={key}>
              {fillD && (
                <path d={fillD} fill={`url(#trend-area-${key})`} opacity={key === 'total' ? '0.56' : '0.44'} />
              )}
              <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" filter={`url(#trend-glow-${key})`} />
            </React.Fragment>
          );
        })}
      </svg>
      <div className="trend-axis-layer" aria-hidden="true">
        {yAxisLabels.map((label, labelIndex) => (
          <span
            key={`${labelIndex}-${label.value}-${label.label}`}
            className="chart-axis-label chart-axis-label-y"
            style={{
              left: `${((LEFT - 8) / W) * 100}%`,
              top: `${plotYPct(label.value, maxToken)}%`,
            }}
          >
            {label.label}
          </span>
        ))}
        {xAxisLabels.map((label, labelIndex, labels) => {
          const index = totalPts.findIndex((point) => point.bucket_start === label.value);
          const anchorClass = labelIndex === 0 ? 'start' : labelIndex === labels.length - 1 ? 'end' : 'middle';
          return (
            <span
              key={`${labelIndex}-${label.value}`}
              className={`chart-axis-label chart-axis-label-x ${anchorClass}`}
              style={{
                left: `${plotXPct(Math.max(0, index), totalPts.length)}%`,
                top: `${((H - 12) / H) * 100}%`,
              }}
            >
              {label.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

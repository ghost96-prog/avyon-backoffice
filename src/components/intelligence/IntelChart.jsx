// src/components/intelligence/IntelChart.jsx
//
// One small bar-chart component for every `kind: "chart"` section the
// backend sends. Handles the three shapes it produces:
//   • actual + forecast over time (two series, stacked so each date shows one bar)
//   • a single series with per-bar tones   ({ tone: 'critical' | 'warning' | 'info' })
//   • a single series with one highlighted bar ({ highlight: true })
import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { fmtCompact, fmtMoney, fmtNumber } from './format';

const TONE_COLOR = { critical: '#d64545', warning: '#d99020', info: '#4f6bd8', success: '#1c9d6c' };
const ACCENT = '#357abd';
const FORECAST = '#a9c6e8';

export default function IntelChart({ section, sym }) {
  const { data = [], series = [], xKey = 'label', money = true } = section;
  if (!data.length) return <div className="ix-empty">Nothing to chart yet.</div>;

  const fmt = (v) => (money ? fmtMoney(sym, v) : fmtNumber(v));
  const hasTime = series.length > 1;
  const hasHighlight = data.some((d) => d.highlight);
  const tickEvery = data.length > 16 ? Math.ceil(data.length / 8) - 1 : 0;

  return (
    <div className="ix-chart" role="img" aria-label={section.title}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={hasTime ? '18%' : '28%'}>
          <CartesianGrid vertical={false} stroke="#e6eaf0" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: '#e6eaf0' }} tick={{ fontSize: 11, fill: '#8b97a7' }} interval={tickEvery} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: '#8b97a7' }} tickFormatter={(v) => (money ? fmtCompact(sym, v) : fmtNumber(v))} />
          <Tooltip
            cursor={{ fill: 'rgba(53,122,189,0.06)' }}
            contentStyle={{ borderRadius: 10, border: '1px solid #e6eaf0', boxShadow: '0 4px 16px rgba(22,32,43,.08)', fontSize: 12 }}
            formatter={(v, name) => [fmt(v), name]}
          />
          {hasTime ? (
            <>
              <Bar dataKey="actual" name="Actual" stackId="t" fill={ACCENT} radius={[3, 3, 0, 0]} />
              <Bar dataKey="forecast" name="Expected" stackId="t" fill={FORECAST} radius={[3, 3, 0, 0]} />
            </>
          ) : (
            <Bar dataKey={series[0]?.key || 'value'} name={series[0]?.label || 'Value'} radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.tone ? TONE_COLOR[d.tone] : hasHighlight ? (d.highlight ? ACCENT : '#c9d9ec') : ACCENT} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      {hasTime && (
        <div className="ix-chart-legend">
          <span><i style={{ background: ACCENT }} />Actual</span>
          <span><i style={{ background: FORECAST }} />Expected</span>
        </div>
      )}
    </div>
  );
}

// src/components/intelligence/DataTable.jsx
//
// Generic renderer for every `kind: "table"` section the backend sends.
// Column `type`s: product | text | money | number | number1 | percent | delta | tag.
// Sortable columns sort client-side (the backend already sends the rows that
// matter, so there's no paging round-trip).
import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';
import { fmtMoney, fmtNumber, fmtPercent } from './format';

const INITIAL_ROWS = 10;

function Cell({ col, row, sym }) {
  const v = row[col.key];
  switch (col.type) {
    case 'product':
      return (
        <div className="ix-prod">
          <span className="ix-prod-name">{v}</span>
          {row.sub && <span className="ix-prod-sub">{row.sub}</span>}
        </div>
      );
    case 'money': {
      const cls = [col.strong ? 'ix-strong' : '', col.tone === 'bad' ? 'ix-bad' : ''].join(' ');
      return <span className={cls}>{fmtMoney(sym, v, { signed: col.signed })}</span>;
    }
    case 'number': return <span className={col.strong ? 'ix-strong' : ''}>{fmtNumber(v)}</span>;
    case 'number1': return <span>{fmtNumber(v, v >= 10 ? 0 : 1)}</span>;
    case 'percent': return <span>{fmtPercent(v, { signed: col.signed })}</span>;
    case 'delta':
      if (v == null) return <span className="ix-chip ix-chip-info">New</span>;
      if (Math.abs(v) < 0.5) return <span className="ix-muted">—</span>;
      return (
        <span className={`ix-delta ${v > 0 ? 'ix-up' : 'ix-down'}`}>
          {v > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)}%
        </span>
      );
    case 'tag':
      return v ? <span className={`ix-chip ix-chip-${v.tone || 'neutral'}`}>{v.text}</span> : null;
    default:
      return <span className={col.wide ? 'ix-wrap' : ''}>{v ?? '—'}</span>;
  }
}

// Sort key for a cell: tags sort by their text, everything else by value;
// null/undefined always sink to the bottom.
const sortVal = (v) => (v && typeof v === 'object' ? v.text : v);

export default function DataTable({ section, sym }) {
  const { columns = [], rows = [], emptyText = 'Nothing to show.' } = section;
  const [sortKey, setSortKey] = useState(section.defaultSort || null);
  const [dir, setDir] = useState('desc');
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const x = sortVal(a[sortKey]), y = sortVal(b[sortKey]);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return dir === 'desc' ? -c : c;
    });
  }, [rows, sortKey, dir]);

  if (!rows.length) return <div className="ix-empty">{emptyText}</div>;
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_ROWS);

  const onSort = (col) => {
    if (!col.sortable) return;
    if (sortKey === col.key) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(col.key); setDir('desc'); }
  };

  return (
    <>
      <div className="ix-table-wrap">
        <table className="ix-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.align === 'right' ? 'ix-right' : ''} ${c.sortable ? 'ix-sortable' : ''}`}
                  onClick={() => onSort(c)}
                  title={c.hint || undefined}
                  aria-sort={sortKey === c.key ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
                >
                  <span>{c.label}</span>
                  {c.sortable && sortKey === c.key && (dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={`${row.name}-${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === 'right' ? 'ix-right' : ''} ${c.wide ? 'ix-wide' : ''}`}>
                    <Cell col={c} row={row} sym={sym} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > INITIAL_ROWS && (
        <button type="button" className="ix-showall" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </>
  );
}

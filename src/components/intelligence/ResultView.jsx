// src/components/intelligence/ResultView.jsx
//
// Renders ANY tab's response from the backend's shared contract:
//   hero (headline + summary) → KPI strip → insights + actions → sections
//   (table / chart / cards) → notes + methodology.
// Nothing here knows about a specific tab, so new backend tabs render for
// free.
import React, { useState } from 'react';
import {
  AlertOctagon, AlertCircle, CheckCircle2, Info, ArrowRight, TrendingUp, TrendingDown,
  Lightbulb, ListChecks, ChevronDown, Minus, Plus, Sparkles, Trophy, PackagePlus, PackageX,
  ShieldAlert, LineChart,
} from 'lucide-react';
import DataTable from './DataTable';
import IntelChart from './IntelChart';
import { fmtMetric, fmtMoney, toneOf } from './format';

export const TAB_ICONS = { Sparkles, Trophy, PackagePlus, PackageX, TrendingDown, ShieldAlert, LineChart };

const SEV = {
  critical: { icon: AlertOctagon, label: 'Needs attention' },
  warning: { icon: AlertCircle, label: 'Worth a look' },
  success: { icon: CheckCircle2, label: 'Looking good' },
  info: { icon: Info, label: 'For your information' },
};
const PRIORITY_LABEL = { high: 'Do first', medium: 'Next', low: 'When you can' };
const MODE_BADGE = {
  past: 'Actual results',
  current: 'In progress',
  future: 'Forecast',
};

function Hero({ result }) {
  const tone = toneOf(result.severity);
  const S = SEV[tone];
  const Icon = S.icon;
  const mode = result.period?.mode;
  return (
    <section className={`ix-hero ix-tone-${tone}`}>
      <div className="ix-hero-top">
        <span className={`ix-sev ix-sev-${tone}`}><Icon size={14} />{S.label}</span>
        {mode && <span className="ix-mode">{MODE_BADGE[mode]}</span>}
      </div>
      <h2 className="ix-headline">{result.headline}</h2>
      {result.summary && <p className="ix-summary">{result.summary}</p>}
    </section>
  );
}

function Stepper({ label, value, min, max, onChange, unit }) {
  return (
    <div className="ix-stepper">
      <span className="ix-stepper-label">{label}</span>
      <div className="ix-stepper-ctl">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}><Minus size={13} /></button>
        <span>{value} {unit}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}><Plus size={13} /></button>
      </div>
    </div>
  );
}

function ReorderSettings({ settings, onChange }) {
  return (
    <div className="ix-settings">
      <Stepper label="Supplier delivery takes" value={settings.leadTimeDays} min={1} max={60} unit={settings.leadTimeDays === 1 ? 'day' : 'days'} onChange={(v) => onChange({ ...settings, leadTimeDays: v })} />
      <Stepper label="Safety stock" value={settings.safetyDays} min={0} max={30} unit={settings.safetyDays === 1 ? 'day' : 'days'} onChange={(v) => onChange({ ...settings, safetyDays: v })} />
    </div>
  );
}

function Kpis({ metrics, sym }) {
  const list = (metrics || []).filter(Boolean); // tolerate empty slots in the array
  if (!list.length) return null;
  return (
    <div className="ix-kpis">
      {list.map((m, i) => (
        <div key={`${m.label}-${i}`} className={`ix-kpi ${m.tone ? `ix-kpi-${m.tone}` : ''}`}>
          <span className="ix-kpi-label">{m.label}</span>
          <span className="ix-kpi-value">{fmtMetric(m, sym)}</span>
          {m.delta != null && (
            <span className={`ix-kpi-delta ${m.delta >= 0 ? 'ix-up' : 'ix-down'}`}>
              {m.delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(m.delta).toFixed(Math.abs(m.delta) >= 10 ? 0 : 1)}% <em>{m.deltaLabel}</em>
            </span>
          )}
          {m.hint && m.delta == null && <span className="ix-kpi-hint">{m.hint}</span>}
        </div>
      ))}
    </div>
  );
}

function Insights({ insights: raw }) {
  const insights = (raw || []).filter(Boolean);
  if (!insights.length) return null;
  return (
    <section className="ix-card">
      <h3 className="ix-card-title"><Lightbulb size={16} /> What Avyon noticed</h3>
      <ul className="ix-insights">
        {insights.map((ins, i) => {
          const tone = toneOf(ins.severity);
          const Icon = SEV[tone].icon;
          return (
            <li key={i} className={`ix-insight ix-tone-${tone}`}>
              <span className="ix-insight-icon"><Icon size={16} /></span>
              <div>
                <div className="ix-insight-title">{ins.title}</div>
                <p className="ix-insight-body">{ins.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Actions({ actions: raw, sym, onGoTab, onNavigate }) {
  const actions = (raw || []).filter(Boolean);
  if (!actions.length) return null;
  return (
    <section className="ix-card">
      <h3 className="ix-card-title"><ListChecks size={16} /> What to do</h3>
      <ol className="ix-actions">
        {actions.map((a, i) => (
          <li key={i} className="ix-action">
            <span className={`ix-pri ix-pri-${a.priority}`}>{PRIORITY_LABEL[a.priority] || ''}</span>
            <div className="ix-action-main">
              <div className="ix-action-title">{a.title}</div>
              {a.detail && <p className="ix-action-detail">{a.detail}</p>}
              <div className="ix-action-foot">
                {a.impact && (
                  <span className="ix-impact">{a.impact.label}: <strong>{fmtMoney(sym, a.impact.value)}</strong></span>
                )}
                {(a.goTab || a.route) && (
                  <button type="button" className="ix-link" onClick={() => (a.goTab ? onGoTab(a.goTab) : onNavigate(a.route))}>
                    {a.routeLabel || 'Open'} <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Cards({ section, onGoTab }) {
  return (
    <div className="ix-cards">
      {(section.cards || []).filter(Boolean).map((c) => {
        const tone = toneOf(c.severity);
        const Icon = SEV[tone].icon;
        return (
          <button key={c.tab} type="button" className={`ix-minicard ix-tone-${tone}`} onClick={() => onGoTab(c.tab)}>
            <span className="ix-minicard-top"><span className={`ix-sev ix-sev-${tone}`}><Icon size={13} />{SEV[tone].label}</span><ArrowRight size={14} className="ix-minicard-arrow" /></span>
            <span className="ix-minicard-title">{c.title}</span>
            <span className="ix-minicard-headline">{c.headline}</span>
          </button>
        );
      })}
    </div>
  );
}

function Section({ section, sym, onGoTab }) {
  return (
    <section className="ix-card">
      <div className="ix-card-head">
        <h3 className="ix-card-title">{section.title}</h3>
        {section.subtitle && <span className="ix-card-sub">{section.subtitle}</span>}
      </div>
      {section.kind === 'table' && <DataTable section={section} sym={sym} />}
      {section.kind === 'chart' && <IntelChart section={section} sym={sym} />}
      {section.kind === 'cards' && <Cards section={section} onGoTab={onGoTab} />}
    </section>
  );
}

function Method({ notes, methodology }) {
  const [open, setOpen] = useState(false);
  if (!notes?.length && !methodology) return null;
  return (
    <section className="ix-method">
      {notes?.length > 0 && (
        <ul className="ix-notes">{notes.map((n, i) => <li key={i}><Info size={13} />{n}</li>)}</ul>
      )}
      {methodology && (
        <>
          <button type="button" className="ix-method-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            How Avyon worked this out <ChevronDown size={14} className={open ? 'ix-flip' : ''} />
          </button>
          {open && <p className="ix-method-body">{methodology}</p>}
        </>
      )}
    </section>
  );
}

export default function ResultView({ result, settings, onSettingsChange, onGoTab, onNavigate }) {
  const sym = result.currency || '$';
  // the Briefing's "cards" section replaces the need for a separate list, so render it right after the KPIs
  const sections = (result.sections || []).filter(Boolean);
  const cardSections = sections.filter((s) => s.kind === 'cards');
  const otherSections = sections.filter((s) => s.kind !== 'cards');
  return (
    <div className="ix-result">
      <Hero result={result} />
      {result.settings && <ReorderSettings settings={settings} onChange={onSettingsChange} />}
      <Kpis metrics={result.metrics} sym={sym} />
      <div className="ix-twocol">
        <Insights insights={result.insights} />
        <Actions actions={result.actions} sym={sym} onGoTab={onGoTab} onNavigate={onNavigate} />
      </div>
      {cardSections.map((s) => <Section key={s.id} section={s} sym={sym} onGoTab={onGoTab} />)}
      {otherSections.map((s) => <Section key={s.id} section={s} sym={sym} onGoTab={onGoTab} />)}
      <Method notes={result.notes} methodology={result.methodology} />
    </div>
  );
}
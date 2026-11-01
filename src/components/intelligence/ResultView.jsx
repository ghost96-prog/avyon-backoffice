// src/components/intelligence/ResultView.jsx
//
// Renders ANY tab's response from the backend's shared contract, presented as
// a briefing from Avyon:
//
//   stage    Avyon (robot, mood follows the news) says the headline, next to a
//            cartoon of the situation
//   ledger   the key figures, counting up
//   talk     "What I noticed" as messages from Avyon, "What I would do" as a
//            prioritised plan
//   sections tables, charts and topic lists from the backend
//   method   notes and how the numbers were worked out
//
// Nothing here knows about a specific tab beyond choosing a cartoon, so new
// backend tabs render for free.
import React, { useState } from 'react';
import {
  AlertOctagon, AlertCircle, CheckCircle2, Info, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  Minus, Plus, Sparkles, Trophy, PackagePlus, PackageX, ShieldAlert, LineChart,
} from 'lucide-react';
import AvyonBot from './AvyonBot';
import Vignette from './Vignette';
import DataTable from './DataTable';
import IntelChart from './IntelChart';
import { useCountUp, useTypewriter } from './useFx';
import { fmtMetric, fmtMoney, toneOf } from './format';

export const TAB_ICONS = { Sparkles, Trophy, PackagePlus, PackageX, TrendingDown, ShieldAlert, LineChart };

const SEV = {
  critical: { icon: AlertOctagon, label: 'Needs attention', mood: 'sad' },
  warning: { icon: AlertCircle, label: 'Worth a look', mood: 'concerned' },
  success: { icon: CheckCircle2, label: 'Looking good', mood: 'happy' },
  info: { icon: Info, label: 'For your information', mood: 'calm' },
};
const PRIORITY_LABEL = { high: 'Do first', medium: 'Next', low: 'When you can' };
const MODE_BADGE = { past: 'Actual results', current: 'In progress', future: 'Forecast' };

// Avyon's mood for an answer (also used by the page to tint the whole screen).
export const moodOf = (result) => SEV[toneOf(result?.severity)].mood;

// Which cartoon goes with this answer.
export function pickScene(result) {
  const tab = result?.tab;
  const tone = toneOf(result?.severity);
  const future = result?.period?.mode === 'future';
  const metrics = (result?.metrics || []).filter(Boolean);
  const rev = metrics.find((m) => /revenue|sales/i.test(m.label || '') && typeof m.delta === 'number');
  const delta = rev ? rev.delta : null;

  if (tab === 'forecast' || future) return 'forecast';
  if (tab === 'briefing' || tab === 'best_sellers') {
    if (delta != null && delta <= -3) return 'salesDown';
    if (delta != null && delta >= 3) return 'salesUp';
    if (tab === 'best_sellers') return tone === 'success' ? 'salesUp' : 'allGood';
    return tone === 'critical' || tone === 'warning' ? 'emptyShelf' : 'allGood';
  }
  if (tone === 'success') return 'allGood';
  if (tab === 'not_selling') return 'sleeping';
  if (tab === 'losing_money') return 'leak';
  if (tab === 'reorder' || tab === 'potential_losses') return 'emptyShelf';
  return 'allGood';
}

// ── the stage ───────────────────────────────────────────────────────────────
function Stage({ result, question }) {
  const tone = toneOf(result.severity);
  const S = SEV[tone];
  const Icon = S.icon;
  const mode = result.period?.mode;
  const headline = typeof result.headline === 'string' ? result.headline : '';
  const { shown, done } = useTypewriter(headline);

  return (
    <section className="ix-stage" aria-labelledby="ix-headline">
      <div className="ix-stage-bot">
        <AvyonBot mood={S.mood} size={150} talking={!done} />
      </div>

      <div className="ix-voice">
        <div className="ix-voice-meta">
          <span className="ix-sev"><Icon size={13} />{S.label}</span>
          {mode && MODE_BADGE[mode] && <span className="ix-mode">{MODE_BADGE[mode]}</span>}
        </div>
        {question && <p className="ix-voice-q">{question}</p>}
        <h2 id="ix-headline" className="ix-headline" aria-label={headline}>
          <span className="ix-headline-ghost" aria-hidden="true">{headline}</span>
          <span className="ix-headline-typed" aria-hidden="true">
            {shown}
            {!done && <i className="ix-caret" />}
          </span>
        </h2>
        {result.summary && <p className={`ix-summary ${done ? 'is-in' : ''}`}>{result.summary}</p>}
      </div>

      <div className="ix-stage-scene">
        <Vignette scene={pickScene(result)} />
      </div>
    </section>
  );
}

// ── controls that belong to one tab ─────────────────────────────────────────
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
      <p className="ix-settings-lead">Tell me how your suppliers work and I will adjust.</p>
      <Stepper label="Supplier delivery takes" value={settings.leadTimeDays} min={1} max={60} unit={settings.leadTimeDays === 1 ? 'day' : 'days'} onChange={(v) => onChange({ ...settings, leadTimeDays: v })} />
      <Stepper label="Safety stock" value={settings.safetyDays} min={0} max={30} unit={settings.safetyDays === 1 ? 'day' : 'days'} onChange={(v) => onChange({ ...settings, safetyDays: v })} />
    </div>
  );
}

// ── ledger of key figures ───────────────────────────────────────────────────
function Figure({ m, sym, index }) {
  const numeric = typeof m.value === 'number' && Number.isFinite(m.value);
  const animated = useCountUp(numeric ? m.value : 0, { delay: 350 + index * 90 });
  const shown = numeric ? { ...m, value: animated } : m;
  return (
    <div className={`ix-fig ${m.tone ? `ix-fig-${m.tone}` : ''}`} role="listitem">
      <span className="ix-fig-label">{m.label}</span>
      <span className="ix-fig-value">{fmtMetric(shown, sym)}</span>
      {typeof m.delta === 'number' && (
        <span className={`ix-fig-delta ${m.delta >= 0 ? 'ix-up' : 'ix-down'}`}>
          {m.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {Math.abs(m.delta).toFixed(Math.abs(m.delta) >= 10 ? 0 : 1)}% <em>{m.deltaLabel}</em>
        </span>
      )}
      {m.hint && typeof m.delta !== 'number' && <span className="ix-fig-hint">{m.hint}</span>}
    </div>
  );
}

function Ledger({ metrics, sym }) {
  const list = (metrics || []).filter(Boolean); // tolerate empty slots in the array
  if (!list.length) return null;
  return (
    <div className="ix-ledger" role="list">
      {list.map((m, i) => <Figure key={`${m.label}-${i}`} m={m} sym={sym} index={i} />)}
    </div>
  );
}

// ── conversation: what Avyon noticed ────────────────────────────────────────
function MiniBot({ tone }) {
  const mouth = { success: 'M10 21 Q16 26 22 21', info: 'M11 22 Q16 24 21 22', warning: 'M11 23 H21', critical: 'M10 24 Q16 19 22 24' }[tone];
  return (
    <svg className={`ix-minibot ix-minibot-${tone}`} viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x="3" y="5" width="26" height="22" rx="9" fill="#173A58" stroke="rgba(255,255,255,0.18)" />
      <rect x="6.5" y="8.5" width="19" height="15" rx="6" fill="#06111C" />
      <circle cx="12" cy="15" r="2.2" fill="currentColor" />
      <circle cx="20" cy="15" r="2.2" fill="currentColor" />
      <path d={mouth} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform="translate(0 -4)" />
      <line x1="16" y1="5" x2="16" y2="2" stroke="#5B7C99" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="2" r="1.4" fill="currentColor" />
    </svg>
  );
}

function Insights({ insights: raw }) {
  const insights = (raw || []).filter(Boolean);
  if (!insights.length) return null;
  return (
    <section className="ix-panel" aria-label="What Avyon noticed">
      <h3 className="ix-panel-title">What I noticed</h3>
      <ul className="ix-msgs">
        {insights.map((ins, i) => {
          const tone = toneOf(ins.severity);
          return (
            <li key={i} className={`ix-msg ix-tone-${tone}`} style={{ '--i': i }}>
              <MiniBot tone={tone} />
              <div className="ix-bubble">
                <div className="ix-bubble-title">{ins.title}</div>
                <p className="ix-bubble-body">{ins.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── plan: what Avyon would do (ordered by priority) ─────────────────────────
function Actions({ actions: raw, sym, onGoTab, onNavigate }) {
  const actions = (raw || []).filter(Boolean);
  if (!actions.length) return null;
  return (
    <section className="ix-panel" aria-label="What Avyon would do">
      <h3 className="ix-panel-title">What I would do</h3>
      <ol className="ix-plan">
        {actions.map((a, i) => (
          <li key={i} className={`ix-step ix-pri-${a.priority || 'low'}`} style={{ '--i': i }}>
            <span className="ix-step-dot" aria-hidden="true" />
            <div className="ix-step-main">
              <span className="ix-step-pri">{PRIORITY_LABEL[a.priority] || ''}</span>
              <div className="ix-step-title">{a.title}</div>
              {a.detail && <p className="ix-step-detail">{a.detail}</p>}
              <div className="ix-step-foot">
                {a.impact && <span className="ix-impact">{a.impact.label} <strong>{fmtMoney(sym, a.impact.value)}</strong></span>}
                {(a.goTab || a.route) && (
                  <button type="button" className="ix-link" onClick={() => (a.goTab ? onGoTab(a.goTab) : onNavigate(a.route))}>
                    {a.routeLabel || 'Open'}<ChevronRight size={14} />
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

// ── backend sections ────────────────────────────────────────────────────────
function Topics({ section, onGoTab }) {
  return (
    <div className="ix-topics">
      {(section.cards || []).filter(Boolean).map((c) => {
        const tone = toneOf(c.severity);
        const Icon = SEV[tone].icon;
        return (
          <button key={c.tab} type="button" className={`ix-topic ix-tone-${tone}`} onClick={() => onGoTab(c.tab)}>
            <span className="ix-topic-icon"><Icon size={16} /></span>
            <span className="ix-topic-text">
              <span className="ix-topic-title">{c.title}</span>
              <span className="ix-topic-headline">{c.headline}</span>
            </span>
            <ChevronRight size={16} className="ix-topic-go" />
          </button>
        );
      })}
    </div>
  );
}

function Section({ section, sym, onGoTab }) {
  return (
    <section className="ix-sec">
      <div className="ix-sec-head">
        <h3 className="ix-sec-title">{section.title}</h3>
        {section.subtitle && <span className="ix-sec-sub">{section.subtitle}</span>}
      </div>
      {section.kind === 'table' && <DataTable section={section} sym={sym} />}
      {section.kind === 'chart' && <IntelChart section={section} sym={sym} />}
      {section.kind === 'cards' && <Topics section={section} onGoTab={onGoTab} />}
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
            How I worked this out <ChevronDown size={14} className={open ? 'ix-flip' : ''} />
          </button>
          {open && <p className="ix-method-body">{methodology}</p>}
        </>
      )}
    </section>
  );
}

export default function ResultView({ result, question, settings, onSettingsChange, onGoTab, onNavigate }) {
  const sym = result.currency || '$';
  const sections = (result.sections || []).filter(Boolean);
  // the Briefing's topic list reads best right after the figures
  const topicSections = sections.filter((s) => s.kind === 'cards');
  const otherSections = sections.filter((s) => s.kind !== 'cards');
  return (
    <div className="ix-result">
      <Stage result={result} question={question} />
      {result.settings && <ReorderSettings settings={settings} onChange={onSettingsChange} />}
      <Ledger metrics={result.metrics} sym={sym} />
      <div className="ix-talk">
        <Insights insights={result.insights} />
        <Actions actions={result.actions} sym={sym} onGoTab={onGoTab} onNavigate={onNavigate} />
      </div>
      {topicSections.map((s) => <Section key={s.id} section={s} sym={sym} onGoTab={onGoTab} />)}
      {otherSections.map((s) => <Section key={s.id} section={s} sym={sym} onGoTab={onGoTab} />)}
      <Method notes={result.notes} methodology={result.methodology} />
    </div>
  );
}
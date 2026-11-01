// src/components/intelligence/Working.jsx
//
// What the owner sees while an answer is being computed: Avyon "walks through
// the account" step by step, like a narrated walkthrough, instead of a grey
// skeleton. The steps describe what the engine genuinely does for that tab;
// they advance on a timer and the last one waits until the answer arrives.
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import AvyonBot from './AvyonBot';

const STEPS = {
  briefing: [
    'Opening your account for {where}',
    'Reading your sales for {range}',
    'Checking the stock on every shelf',
    'Looking for items that lose you money',
    'Putting your briefing together',
  ],
  best_sellers: [
    'Opening your sales for {range}',
    'Adding up revenue and profit for every item',
    'Comparing with the period before',
    'Ranking what is performing best',
  ],
  reorder: [
    'Counting what is on your shelves',
    'Measuring how fast each item sells',
    'Allowing for supplier delivery time',
    'Working out what to order, and how much',
  ],
  not_selling: [
    'Looking at every item on your shelves',
    'Checking when each one last sold',
    'Adding up the cash sitting in idle stock',
    'Sorting items by how long they have been still',
  ],
  losing_money: [
    'Reading your cost and selling prices',
    'Spotting sales made below cost',
    'Adding up discounts and refunds',
    'Working out where your profit is leaking',
  ],
  potential_losses: [
    'Checking stock against how fast things sell',
    'Finding the items that will run out',
    'Estimating the sales you could miss',
    'Ranking the biggest risks',
  ],
  forecast: [
    'Looking back over your sales history',
    'Finding weekly and seasonal patterns',
    'Projecting the days ahead',
    'Drawing the outlook',
  ],
};
const FALLBACK = ['Opening your account for {where}', 'Reading your data for {range}', 'Working out the answer'];

export default function Working({ tab, range, where, name }) {
  const steps = (STEPS[tab] || FALLBACK).map((s) => s.replace('{range}', range || 'this period').replace('{where}', where || 'your business'));
  const [at, setAt] = useState(0);

  useEffect(() => {
    setAt(0);
    const id = setInterval(() => setAt((i) => Math.min(i + 1, steps.length - 1)), 900);
    return () => clearInterval(id);
  }, [tab, steps.length]);

  return (
    <div className="ix-work" role="status" aria-live="polite" aria-label="Avyon is working this out">
      <div className="ix-work-bot">
        <AvyonBot mood="scanning" size={150} />
      </div>
      <div className="ix-work-panel">
        <p className="ix-work-lead">Give me a moment{name ? `, ${name}` : ''}, while I go through your account.</p>
        <ol className="ix-work-steps">
          {steps.map((s, i) => {
            const state = i < at ? 'done' : i === at ? 'now' : 'next';
            return (
              <li key={s} className={`ix-work-step is-${state}`}>
                <span className="ix-work-mark" aria-hidden="true">{state === 'done' ? <Check size={12} strokeWidth={3} /> : null}</span>
                <span>{s}</span>
              </li>
            );
          })}
        </ol>
        <div className="ix-work-bar" aria-hidden="true"><i style={{ width: `${Math.round(((at + 1) / steps.length) * 92)}%` }} /></div>
      </div>
    </div>
  );
}

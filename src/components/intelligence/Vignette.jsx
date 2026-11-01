// src/components/intelligence/Vignette.jsx
//
// The little cartoon that goes with each answer: a shopkeeper reacting to what
// Avyon found. Pure SVG; the movement lives in Intelligence.css (.vg-*).
//
//   salesDown   rain cloud, slumped shopkeeper, falling line   (sales dropped)
//   salesUp     jumping shopkeeper, growing bars, confetti     (sales grew)
//   emptyShelf  bare shelf, shrug and a question mark          (stock-outs / reorder)
//   sleeping    boxes fast asleep, Zzz, cobweb                 (items not selling)
//   leak        money bag dripping coins                       (selling below cost)
//   forecast    telescope, rising sun, dotted path             (looking ahead)
//   allGood     coffee, thumbs-up, check badge                 (nothing to worry about)
import React from 'react';

const C = {
  skin: '#EAB98F', hair: '#2B1C15', shirt: '#3A7BB4', sleeve: '#2E659A', apron: '#D9A441',
  pants: '#1C3752', shoe: '#0B1826', coral: '#FF7A7A', mint: '#5FE3B0', amber: '#F4B860',
  cyan: '#6CCBF0', ink: '#0A1B2C', box: '#7E93AA', boxDark: '#5F7791', tape: '#D9A441',
};

// ── the shopkeeper ──────────────────────────────────────────────────────────
// Feet at (0,0). Arm angles are degrees clockwise from "hanging straight down".
function Shopkeeper({ armL = 6, armR = -6, tilt = 0, look = 0, mouth = 'smile', brows = 'none', tear = false, children, handR, handL }) {
  const Arm = ({ side, angle, hand }) => (
    <g transform={`translate(${side * 17} -72) rotate(${angle})`}>
      <rect x="-4.6" y="-2" width="9.2" height="31" rx="4.6" fill={C.sleeve} />
      <circle cx="0" cy="32" r="5.6" fill={C.skin} />
      {hand}
    </g>
  );
  const mouthPath = {
    smile: <path d="M-5 5 Q0 10 5 5" fill="none" stroke="#6B2E22" strokeWidth="2" strokeLinecap="round" />,
    open: <path d="M-6 4 Q0 15 6 4 Z" fill="#6B2E22" />,
    frown: <path d="M-5 9 Q0 4 5 9" fill="none" stroke="#6B2E22" strokeWidth="2" strokeLinecap="round" />,
    flat: <path d="M-4 7 H4" fill="none" stroke="#6B2E22" strokeWidth="2" strokeLinecap="round" />,
    o: <ellipse cx="0" cy="7" rx="3" ry="4" fill="#6B2E22" />,
  }[mouth];
  const brow = {
    sad: <g stroke={C.hair} strokeWidth="2" strokeLinecap="round"><path d="M-9 -9 L-3 -12" /><path d="M9 -9 L3 -12" /></g>,
    worry: <g stroke={C.hair} strokeWidth="2" strokeLinecap="round"><path d="M-10 -8 L-3 -12" /><path d="M10 -8 L3 -12" /></g>,
    happy: <g stroke={C.hair} strokeWidth="2" strokeLinecap="round" fill="none"><path d="M-10 -10 Q-6 -14 -2 -10" /><path d="M10 -10 Q6 -14 2 -10" /></g>,
    none: null,
  }[brows];

  return (
    <g>
      <ellipse cx="0" cy="1" rx="26" ry="4" fill="rgba(0,0,0,0.32)" />
      <rect x="-13" y="-38" width="11" height="38" rx="5" fill={C.pants} />
      <rect x="2" y="-38" width="11" height="38" rx="5" fill={C.pants} />
      <ellipse cx="-8" cy="-1" rx="8.5" ry="4" fill={C.shoe} />
      <ellipse cx="8" cy="-1" rx="8.5" ry="4" fill={C.shoe} />
      <Arm side={-1} angle={armL} hand={handL} />
      <rect x="-18" y="-80" width="36" height="46" rx="13" fill={C.shirt} />
      <rect x="-11" y="-66" width="22" height="31" rx="6" fill={C.apron} />
      <rect x="-6" y="-52" width="12" height="9" rx="2.5" fill="rgba(0,0,0,0.14)" />
      <Arm side={1} angle={armR} hand={handR} />
      <rect x="-4.5" y="-86" width="9" height="8" fill={C.skin} />
      <g transform={`translate(0 -99) rotate(${tilt})`}>
        <circle cx="-15" cy="0" r="3.4" fill={C.skin} />
        <circle cx="15" cy="0" r="3.4" fill={C.skin} />
        <circle cx="0" cy="0" r="15.5" fill={C.skin} />
        <path d="M-16 -3 Q-15 -17 0 -17 Q15 -17 16 -3 Q8 -10 0 -9 Q-8 -10 -16 -3 Z" fill={C.hair} />
        <g transform={`translate(${look} 0)`}>
          <circle cx="-5.5" cy="0" r="2" fill="#1B120D" />
          <circle cx="5.5" cy="0" r="2" fill="#1B120D" />
        </g>
        {brow}
        {mouthPath}
        {mouth === 'open' && <g fill="#FF9AA8" opacity="0.5"><circle cx="-10" cy="5" r="3" /><circle cx="10" cy="5" r="3" /></g>}
        {tear && <path className="vg-tear" d="M-8 3 q-3 6 0 9 q3 -3 0 -9 Z" fill="#8FD3FF" />}
      </g>
      {children}
    </g>
  );
}

const Ground = () => (
  <g>
    <ellipse cx="140" cy="172" rx="128" ry="9" fill="rgba(255,255,255,0.045)" />
    <path d="M12 172 H268" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
  </g>
);

// ── scenes ──────────────────────────────────────────────────────────────────
function SalesDown() {
  return (
    <>
      <Ground />
      {/* falling chart */}
      <g>
        <path d="M172 34 V138 H264" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <path d="M172 62 H264 M172 90 H264 M172 118 H264" stroke="rgba(255,255,255,0.07)" />
        <polyline className="vg-draw" points="178,52 196,64 212,56 232,92 256,124" fill="none" stroke={C.coral} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path className="vg-arrow-down" d="M246 124 L258 128 L252 116 Z" fill={C.coral} />
      </g>
      {/* rain cloud */}
      <g transform="translate(26 -4)"><g className="vg-cloud">
        <path d="M52 52 q-12 0 -12 -11 q0 -10 11 -11 q3 -13 18 -13 q14 0 18 11 q13 0 13 12 q0 12 -13 12 Z" fill="#43566F" />
        <path d="M58 30 q8 -8 20 -4" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} className={`vg-rain vg-rain-${i}`} x1={54 + i * 11} y1="58" x2={51 + i * 11} y2="68" stroke="#8FD3FF" strokeWidth="2" strokeLinecap="round" />
        ))}
      </g></g>
      <ellipse className="vg-ripple" cx="96" cy="170" rx="22" ry="3" fill="none" stroke="rgba(143,211,255,0.5)" />
      <g transform="translate(96 166)"><g className="vg-slump">
        <Shopkeeper armL={-3} armR={3} tilt={9} look={0} mouth="frown" brows="sad" tear />
      </g></g>
    </>
  );
}

function SalesUp() {
  const bars = [26, 40, 56, 76, 100];
  return (
    <>
      <Ground />
      <circle className="vg-halo" cx="98" cy="108" r="64" fill="none" stroke={C.mint} strokeOpacity="0.22" strokeDasharray="3 9" />
      <g>
        {bars.map((h, i) => (
          <rect key={i} className={`vg-bar vg-bar-${i}`} x={170 + i * 19} y={166 - h} width="13" height={h} rx="3" fill={C.mint} fillOpacity={0.35 + i * 0.13} />
        ))}
        <path className="vg-arrow-up" d="M256 50 L266 62 L259 60 L259 72 L253 72 L253 60 L246 62 Z" fill={C.mint} />
      </g>
      {[[40, 60, C.amber], [150, 48, C.cyan], [62, 30, C.mint], [132, 82, C.amber], [28, 112, C.cyan], [154, 118, C.mint]].map(([x, y, f], i) => (
        <rect key={i} className={`vg-confetti vg-confetti-${i}`} x={x} y={y} width="6" height="6" rx="1.5" fill={f} />
      ))}
      <g transform="translate(98 166)"><g className="vg-jump">
        <Shopkeeper armL={150} armR={-150} mouth="open" brows="happy" />
      </g></g>
    </>
  );
}

function EmptyShelf() {
  const plank = (y) => <rect x="146" y={y} width="118" height="5" rx="2" fill="#4D6580" />;
  const box = (x, y, w, h, f) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2.5" fill={f} />
      <rect x={x + w / 2 - 3} y={y} width="6" height={h} fill={C.tape} opacity="0.7" />
    </g>
  );
  return (
    <>
      <Ground />
      <g>
        <rect x="144" y="22" width="5" height="148" rx="2" fill="#4D6580" />
        <rect x="261" y="22" width="5" height="148" rx="2" fill="#4D6580" />
        {plank(62)}{plank(108)}{plank(154)}
        {box(154, 38, 30, 24, C.box)}{box(154, 84, 26, 24, C.boxDark)}{box(190, 84, 24, 24, C.box)}
        {box(154, 130, 30, 24, C.boxDark)}
        {[[196, 38, 30, 24], [232, 38, 24, 24], [222, 84, 28, 24], [194, 130, 30, 24], [230, 130, 26, 24]].map(([x, y, w, h], i) => (
          <rect key={i} className={`vg-slot vg-slot-${i}`} x={x} y={y} width={w} height={h} rx="3" fill="none" stroke={C.amber} strokeWidth="1.5" strokeDasharray="4 4" />
        ))}
      </g>
      <g transform="translate(94 40)"><g className="vg-ask">
        <circle cx="0" cy="0" r="15" fill="#1B3550" stroke={C.amber} strokeWidth="1.5" />
        <path d="M-9 14 L-4 12 L-1 17 Z" fill="#1B3550" stroke={C.amber} strokeWidth="1.5" strokeLinejoin="round" />
        <text x="0" y="7" textAnchor="middle" fontFamily="Georgia, serif" fontSize="22" fontWeight="700" fill={C.amber}>?</text>
      </g></g>
      <g transform="translate(88 166)"><g className="vg-shrug">
        <Shopkeeper armL={58} armR={-58} look={0} mouth="o" brows="worry" />
      </g></g>
    </>
  );
}

function Sleeping() {
  const sleepyBox = (x, y, w, h, f, delay) => (
    <g className={`vg-snore vg-snore-${delay}`}>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={f} />
      <rect x={x} y={y} width={w} height="9" rx="4" fill="rgba(255,255,255,0.14)" />
      <rect x={x + w / 2 - 4} y={y} width="8" height={h} fill={C.tape} opacity="0.6" />
      <g fill="none" stroke="#14263A" strokeWidth="2" strokeLinecap="round">
        <path d={`M${x + w / 2 - 20} ${y + h / 2 + 3} q5 5 10 0`} />
        <path d={`M${x + w / 2 + 10} ${y + h / 2 + 3} q5 5 10 0`} />
        <path d={`M${x + w / 2 - 3} ${y + h / 2 + 11} q3 3 6 0`} />
      </g>
    </g>
  );
  return (
    <>
      <Ground />
      <path className="vg-moon" d="M214 30 a20 20 0 1 0 14 34 a16 16 0 1 1 -14 -34 Z" fill="#E9EEF5" opacity="0.9" />
      {[[186, 24], [246, 48], [258, 20], [172, 52]].map(([x, y], i) => (
        <circle key={i} className={`vg-star vg-star-${i}`} cx={x} cy={y} r="1.8" fill="#fff" />
      ))}
      {sleepyBox(70, 128, 84, 44, C.boxDark, 0)}
      {sleepyBox(80, 84, 66, 44, C.box, 1)}
      {sleepyBox(166, 134, 70, 38, C.box, 2)}
      {[0, 1, 2].map((i) => (
        <text key={i} className={`vg-z vg-z-${i}`} x={128 + i * 12} y={78 - i * 4} fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize={16 + i * 5} fill="#BFD3E8">z</text>
      ))}
      <path d="M12 172 q30 -4 36 -40 M12 172 q22 -2 24 -24 M12 172 q10 -4 12 -14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
    </>
  );
}

function Leak() {
  return (
    <>
      <Ground />
      <g>
        <path d="M70 70 q-26 18 -22 54 q3 28 40 28 q38 0 41 -28 q4 -36 -22 -54 Z" fill="#A87D35" />
        <path d="M70 70 q-26 18 -22 54 q3 28 40 28" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
        <path d="M70 70 L62 52 L84 56 L100 52 L90 70 Z" fill="#8E6A2B" />
        <path d="M66 70 Q82 78 96 70" fill="none" stroke={C.coral} strokeWidth="3" strokeLinecap="round" />
        <text x="82" y="122" textAnchor="middle" fontFamily="Georgia, serif" fontSize="34" fontWeight="700" fill="#F6E2A8">$</text>
        <path d="M110 138 l-9 6 l8 4 l-7 7" fill="none" stroke="#2A1B08" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className={`vg-coin vg-coin-${i}`}>
          <circle cx="104" cy="146" r="6.5" fill={C.amber} stroke="#8E6A2B" strokeWidth="1.5" />
          <circle cx="104" cy="146" r="3.2" fill="none" stroke="#8E6A2B" strokeWidth="1" />
        </g>
      ))}
      <g>
        {[[122, 166], [134, 168], [146, 166], [128, 160], [140, 160]].map(([x, y], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y} rx="8" ry="3.2" fill={C.amber} stroke="#8E6A2B" strokeWidth="1" />
          </g>
        ))}
      </g>
      <g transform="translate(212 166)"><g className="vg-fret">
        <Shopkeeper armL={138} armR={-138} mouth="o" brows="worry" />
      </g></g>
      <path className="vg-sweat" d="M232 58 q-5 9 0 12 q5 -3 0 -12 Z" fill="#8FD3FF" />
    </>
  );
}

function Forecast() {
  // drawn along the arm's own axis (local +y) so it always points where the arm points
  const telescope = (
    <g>
      <rect x="-4" y="30" width="8" height="30" rx="3" fill="#8E6A2B" />
      <rect x="-5.5" y="52" width="11" height="22" rx="3" fill={C.apron} />
      <rect x="-6.5" y="70" width="13" height="5" rx="2" fill="#5F4A1E" />
    </g>
  );
  return (
    <>
      <Ground />
      {[[40, 30], [120, 20], [176, 40], [244, 26], [264, 60], [90, 54]].map(([x, y], i) => (
        <circle key={i} className={`vg-star vg-star-${i % 4}`} cx={x} cy={y} r="1.8" fill="#fff" />
      ))}
      <g className="vg-sun">
        <circle cx="216" cy="140" r="30" fill={C.amber} fillOpacity="0.9" />
        <g stroke={C.amber} strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round">
          {[...Array(9)].map((_, i) => {
            const a = (Math.PI * (i + 0.5)) / 9;
            return <line key={i} x1={216 - Math.cos(a) * 38} y1={140 - Math.sin(a) * 38} x2={216 - Math.cos(a) * 48} y2={140 - Math.sin(a) * 48} />;
          })}
        </g>
      </g>
      <path d="M0 172 V150 Q60 132 130 152 Q190 134 280 156 V172 Z" fill="#0F2A44" />
      <path className="vg-trail" d="M128 120 Q170 40 236 56" fill="none" stroke={C.cyan} strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
      <circle className="vg-trail-dot" cx="236" cy="56" r="5" fill={C.cyan} />
      <g transform="translate(84 166)"><g className="vg-look">
        <Shopkeeper armL={8} armR={-122} look={2} mouth="smile" brows="happy" handR={telescope} />
      </g></g>
    </>
  );
}

function AllGood() {
  const mug = (
    <g transform="translate(2 28)">
      <rect x="-7" y="-2" width="14" height="14" rx="3" fill="#E9EEF5" />
      <path d="M7 2 q6 0 6 5 q0 5 -6 5" fill="none" stroke="#E9EEF5" strokeWidth="2" />
      <path className="vg-steam vg-steam-0" d="M-3 -6 q-4 -5 0 -9 q4 -4 0 -9" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" />
      <path className="vg-steam vg-steam-1" d="M3 -6 q-4 -5 0 -9 q4 -4 0 -9" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  const thumb = <rect x="-2.2" y="22" width="4.4" height="9" rx="2.2" fill={C.skin} />;
  return (
    <>
      <Ground />
      <g>
        <path d="M36 172 v-22 h26 v22 Z" fill="#8E5B3A" />
        <path d="M49 150 q-16 -12 -12 -30 q14 4 12 30 Z M49 150 q16 -14 12 -34 q-14 6 -12 34 Z M49 150 v-38" fill="#3E9C74" stroke="#2E7D5B" strokeWidth="1" />
      </g>
      <g transform="translate(206 74)"><g className="vg-badge">
        <circle r="30" fill={C.mint} fillOpacity="0.14" />
        <circle r="22" fill={C.mint} fillOpacity="0.22" stroke={C.mint} strokeWidth="2" />
        <path d="M-10 0 L-3 8 L11 -8" fill="none" stroke={C.mint} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g></g>
      {[[170, 40], [250, 112], [182, 130]].map(([x, y], i) => (
        <path key={i} className={`vg-twinkle vg-twinkle-${i}`} d={`M${x} ${y - 6} l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 Z`} fill={C.mint} />
      ))}
      <g transform="translate(112 166)"><g className="vg-chill">
        <Shopkeeper armL={30} armR={-62} mouth="smile" brows="happy" handL={thumb} handR={mug} />
      </g></g>
    </>
  );
}

const SCENES = { salesDown: SalesDown, salesUp: SalesUp, emptyShelf: EmptyShelf, sleeping: Sleeping, leak: Leak, forecast: Forecast, allGood: AllGood };

const LABELS = {
  salesDown: 'A shopkeeper looking glum under a rain cloud as the sales line falls',
  salesUp: 'A shopkeeper jumping for joy as the sales bars climb',
  emptyShelf: 'A shopkeeper shrugging at a half-empty shelf',
  sleeping: 'Stock boxes fast asleep on a shelf',
  leak: 'A worried shopkeeper watching coins leak from a money bag',
  forecast: 'A shopkeeper looking toward the sunrise through a telescope',
  allGood: 'A relaxed shopkeeper with a coffee and a thumbs up',
};

export default function Vignette({ scene = 'allGood', className = '' }) {
  const Scene = SCENES[scene] || AllGood;
  return (
    <svg className={`vg vg-${scene} ${className}`} viewBox="0 0 280 190" role="img" aria-label={LABELS[scene] || LABELS.allGood}>
      <Scene />
    </svg>
  );
}

export const SCENE_NAMES = Object.keys(SCENES);

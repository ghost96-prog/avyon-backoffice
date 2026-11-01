// src/components/intelligence/AvyonBot.jsx
//
// Avyon, the assistant. A hand-drawn SVG robot whose face, posture and little
// extras (tear, sweat drop, sparkles, scan beam) change with `mood`:
//
//   calm       neutral and attentive
//   happy      arms up, big smile, sparkles       (good news)
//   concerned  worried brows, sweat drop          (worth a look)
//   sad        drooping head and antenna, a tear  (bad news)
//   thinking   eyes glancing about, one arm raised
//   scanning   same as thinking plus a scan beam  (while it reads your account)
//
// Colour comes from the CSS variable --mood (set by the stage), so the glow on
// the eyes, antenna and chest light follows the tone of the answer. Poses are
// static SVG attributes; only wrapper groups animate (see .avy-* in
// Intelligence.css), so transforms never fight each other.
import React, { useId } from 'react';

const POSE = {
  calm:      { armL: 9,   armR: -9,   headRot: 0,  headY: 0, antenna: 0 },
  happy:     { armL: 152, armR: -152, headRot: 0,  headY: -2, antenna: 0 },
  concerned: { armL: 30,  armR: -30,  headRot: 3,  headY: 0, antenna: 10 },
  sad:       { armL: -5,  armR: 5,    headRot: -6, headY: 8, antenna: -34 },
  thinking:  { armL: 9,   armR: -78,  headRot: 0,  headY: 0, antenna: 0 },
  scanning:  { armL: 9,   armR: -78,  headRot: 0,  headY: 0, antenna: 0 },
};

const FACE = '#06111C';

function Arm({ x, angle, animClass, hand }) {
  return (
    <g transform={`translate(${x} 140)`}>
      <g className={animClass}>
        <g transform={`rotate(${angle})`}>
          <rect x="-6" y="-2" width="12" height="42" rx="6" fill="#1D4466" stroke="rgba(255,255,255,0.12)" />
          <circle cx="0" cy="44" r="8" fill="#2A5A85" stroke="rgba(255,255,255,0.14)" />
          {hand}
        </g>
      </g>
    </g>
  );
}

function Eyes({ mood }) {
  if (mood === 'happy') {
    return (
      <g fill="none" stroke="var(--mood)" strokeWidth="5" strokeLinecap="round" className="avy-glow">
        <path d="M70 87 Q80 72 90 87" />
        <path d="M110 87 Q120 72 130 87" />
      </g>
    );
  }
  if (mood === 'sad') {
    return (
      <g>
        <g className="avy-glow">
          <ellipse cx="80" cy="85" rx="8" ry="9" fill="var(--mood)" />
          <ellipse cx="120" cy="85" rx="8" ry="9" fill="var(--mood)" />
        </g>
        {/* heavy lids: highest at the inner corners, drooping toward the outer ones (sad, not angry) */}
        <path d="M64 66 H94 V73 L64 87 Z" fill={FACE} />
        <path d="M106 66 H136 V87 L106 73 Z" fill={FACE} />
        <path d="M65 80 L93 67" stroke="var(--mood)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <path d="M135 80 L107 67" stroke="var(--mood)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      </g>
    );
  }
  const eyes = (
    <g className="avy-glow">
      <ellipse className="avy-eye" cx="80" cy="84" rx="7.5" ry="9.5" fill="var(--mood)" />
      <ellipse className="avy-eye" cx="120" cy="84" rx="7.5" ry="9.5" fill="var(--mood)" />
    </g>
  );
  if (mood === 'concerned') {
    return (
      <g>
        {eyes}
        <path d="M68 70 L91 63" stroke="var(--mood)" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M109 63 L132 70" stroke="var(--mood)" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    );
  }
  if (mood === 'thinking' || mood === 'scanning') return <g className="avy-look">{eyes}</g>;
  return eyes;
}

function Mouth({ mood, talking }) {
  const base = { fill: 'none', stroke: 'var(--mood)', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (mood === 'happy') {
    return <path {...base} fill="var(--mood-soft)" d="M85 98 Q100 118 115 98 Q100 104 85 98 Z" />;
  }
  if (mood === 'sad') return <path {...base} d="M88 108 Q100 97 112 108" />;
  if (mood === 'concerned') return <path {...base} d="M90 104 Q95 100 100 104 Q105 108 110 104" />;
  if (mood === 'thinking' || mood === 'scanning') return <path {...base} d="M92 103 H108" />;
  return <path {...base} className={talking ? 'avy-talk' : undefined} d="M90 101 Q100 108 110 101" />;
}

export default function AvyonBot({ mood = 'calm', size = 170, talking = false, locked = false, className = '', title }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pose = POSE[mood] || POSE.calm;
  const m = POSE[mood] ? mood : 'calm';

  return (
    <svg
      className={`avy-bot avy-${m} ${className}`}
      viewBox="0 0 200 232"
      width={size}
      height={(size * 232) / 200}
      role="img"
      aria-label={title || 'Avyon, your assistant'}
    >
      <defs>
        <linearGradient id={`head${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35658E" />
          <stop offset="1" stopColor="#173753" />
        </linearGradient>
        <linearGradient id={`body${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#274F74" />
          <stop offset="1" stopColor="#10283F" />
        </linearGradient>
        <linearGradient id={`beam${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--mood)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--mood)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--mood)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`face${uid}`}><rect x="52" y="54" width="96" height="62" rx="24" /></clipPath>
      </defs>

      <ellipse className="avy-shadow" cx="100" cy="222" rx="46" ry="6.5" fill="rgba(0,0,0,0.4)" />

      <g className="avy-float">
        {/* legs + torso */}
        <rect x="76" y="196" width="16" height="16" rx="6" fill="#14304A" />
        <rect x="108" y="196" width="16" height="16" rx="6" fill="#14304A" />
        <path
          d="M60 144 Q60 126 78 126 H122 Q140 126 140 144 V180 Q140 202 118 202 H82 Q60 202 60 180 Z"
          fill={`url(#body${uid})`}
          stroke="rgba(255,255,255,0.14)"
        />
        <rect x="78" y="146" width="44" height="34" rx="11" fill="#08182A" stroke="rgba(255,255,255,0.1)" />
        {locked ? (
          <g>
            <rect x="91" y="158" width="18" height="14" rx="3" fill="var(--mood)" />
            <path d="M94 158 V154 Q94 148 100 148 Q106 148 106 154 V158" fill="none" stroke="var(--mood)" strokeWidth="3" />
          </g>
        ) : (
          <g>
            <circle className="avy-chest" cx="100" cy="162" r="7" fill="var(--mood)" />
            <rect x="84" y="171" width="12" height="3" rx="1.5" fill="rgba(255,255,255,0.25)" />
            <rect x="104" y="171" width="12" height="3" rx="1.5" fill="rgba(255,255,255,0.25)" />
          </g>
        )}

        {/* arms sit behind the head, in front of the torso */}
        <Arm x={62} angle={pose.armL} animClass={m === 'happy' ? 'avy-cheer-l' : undefined} />
        <Arm
          x={138}
          angle={pose.armR}
          animClass={m === 'happy' ? 'avy-cheer-r' : undefined}
          hand={(m === 'thinking' || m === 'scanning') ? <circle className="avy-orb" cx="0" cy="52" r="5" fill="var(--mood)" /> : null}
        />

        {/* head */}
        <g className="avy-head">
          <g transform={`translate(0 ${pose.headY}) rotate(${pose.headRot} 100 128)`}>
            <rect x="91" y="118" width="18" height="12" fill="#123049" />
            <rect x="32" y="72" width="12" height="30" rx="6" fill="#1D4466" stroke="rgba(255,255,255,0.12)" />
            <rect x="156" y="72" width="12" height="30" rx="6" fill="#1D4466" stroke="rgba(255,255,255,0.12)" />
            <rect x="42" y="42" width="116" height="86" rx="34" fill={`url(#head${uid})`} stroke="rgba(255,255,255,0.16)" />
            <rect x="52" y="54" width="96" height="62" rx="24" fill={FACE} />
            <rect x="52" y="54" width="96" height="62" rx="24" fill="none" stroke="var(--mood)" strokeOpacity="0.35" />

            {m === 'happy' && (
              <g fill="var(--mood)" opacity="0.28">
                <circle cx="66" cy="100" r="6" />
                <circle cx="134" cy="100" r="6" />
              </g>
            )}

            <Eyes mood={m} />
            <Mouth mood={m} talking={talking} />

            {m === 'scanning' && (
              <g clipPath={`url(#face${uid})`}>
                <rect className="avy-beam" x="44" y="54" width="22" height="62" fill={`url(#beam${uid})`} />
              </g>
            )}

            {/* antenna */}
            <g transform={`rotate(${pose.antenna} 100 42)`}>
              <line x1="100" y1="42" x2="100" y2="22" stroke="#5B7C99" strokeWidth="4" strokeLinecap="round" />
              <circle className="avy-ring" cx="100" cy="17" r="9" fill="none" stroke="var(--mood)" strokeOpacity="0.5" />
              <circle className="avy-bulb" cx="100" cy="17" r="6.5" fill="var(--mood)" opacity={m === 'sad' ? 0.55 : 1} />
            </g>

            {m === 'sad' && (
              <path className="avy-tear" d="M73 96 q-5 8 0 12 q5 -4 0 -12 Z" fill="#8FD3FF" />
            )}
            {m === 'concerned' && (
              <path className="avy-sweat" d="M152 56 q-6 10 0 14 q6 -4 0 -14 Z" fill="#8FD3FF" />
            )}
          </g>
        </g>

        {m === 'happy' && (
          <g fill="var(--mood)">
            <path className="avy-spark avy-spark-1" d="M24 62 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" />
            <path className="avy-spark avy-spark-2" d="M174 44 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5 Z" />
            <path className="avy-spark avy-spark-3" d="M158 12 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
          </g>
        )}
      </g>
    </svg>
  );
}

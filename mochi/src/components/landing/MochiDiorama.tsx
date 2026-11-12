// Clay diorama illustration for the landing hero: a soft mascot on a floating island

import React from 'react';

export const MochiDiorama: React.FC = () => (
  <div className="landing-stage">
    <svg viewBox="0 0 520 420" aria-hidden="true">
        <path
          d="M78 290 C52 150 178 44 304 58 C438 74 492 168 470 288 C450 392 312 408 200 398 C126 391 92 360 78 290 Z"
          fill="var(--l-clay-stage)"
        />

        <circle cx="418" cy="96" r="32" fill="var(--l-yuzu)" />
        <circle cx="408" cy="86" r="10" fill="#ffffff" opacity="0.38" />

        <g fill="var(--l-clay-paper)" opacity="0.92">
          <rect x="96" y="86" width="70" height="24" rx="12" />
          <rect x="126" y="72" width="44" height="20" rx="10" />
          <rect x="330" y="150" width="58" height="20" rx="10" />
        </g>
        <path
          d="M100 140 q 40 -20 84 -6 t 86 2"
          stroke="var(--l-sub)"
          strokeWidth="3"
          strokeDasharray="2 10"
          strokeLinecap="round"
          fill="none"
          opacity="0.4"
        />

        <ellipse cx="260" cy="368" rx="152" ry="20" fill="var(--l-shadow)" opacity="0.55" />

        <path d="M112 316 Q112 368 260 368 Q408 368 408 316 Z" fill="var(--l-matcha)" />
        <path d="M112 316 Q112 368 260 368 Q408 368 408 316 Z" fill="#000000" opacity="0.16" />
        <ellipse cx="260" cy="316" rx="148" ry="40" fill="var(--l-matcha)" />
        <ellipse cx="238" cy="306" rx="92" ry="20" fill="#ffffff" opacity="0.12" />

        <g stroke="var(--l-clay-ink)" strokeWidth="3" strokeLinejoin="round">
          <rect x="126" y="256" width="62" height="62" rx="16" fill="var(--l-yuzu)" />
          <rect x="156" y="206" width="62" height="62" rx="16" fill="var(--l-strawberry)" />
          <rect x="184" y="256" width="62" height="62" rx="16" fill="var(--l-sky)" />
        </g>
        <circle cx="157" cy="287" r="8" fill="#ffffff" opacity="0.55" />
        <circle cx="187" cy="237" r="8" fill="#ffffff" opacity="0.55" />
        <circle cx="215" cy="287" r="8" fill="#ffffff" opacity="0.55" />

        <g stroke="var(--l-clay-ink)" strokeWidth="5" strokeLinecap="round">
          <line x1="398" y1="214" x2="398" y2="318" />
        </g>
        <path
          d="M400 214 L456 228 L400 244 Z"
          fill="var(--l-strawberry)"
          stroke="var(--l-clay-ink)"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        <g className="landing-bob">
          <ellipse cx="248" cy="308" rx="13" ry="8" fill="var(--l-clay-paper)" stroke="var(--l-clay-ink)" strokeWidth="3" />
          <ellipse cx="330" cy="308" rx="13" ry="8" fill="var(--l-clay-paper)" stroke="var(--l-clay-ink)" strokeWidth="3" />

          <ellipse cx="226" cy="262" rx="11" ry="23" fill="#fff6e7" stroke="var(--l-clay-ink)" strokeWidth="3.5" />
          <ellipse cx="352" cy="262" rx="11" ry="23" fill="#fff6e7" stroke="var(--l-clay-ink)" strokeWidth="3.5" />

          <rect
            x="238"
            y="208"
            width="104"
            height="108"
            rx="44"
            fill="#fff6e7"
            stroke="var(--l-clay-ink)"
            strokeWidth="3.5"
          />
          <ellipse cx="290" cy="302" rx="38" ry="9" fill="#000000" opacity="0.07" />

          <path
            d="M250 206 Q244 186 256 180 Q266 176 268 194"
            fill="var(--l-matcha)"
            stroke="var(--l-clay-ink)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M330 206 Q338 188 326 180 Q316 176 313 194"
            fill="var(--l-matcha)"
            stroke="var(--l-clay-ink)"
            strokeWidth="3"
            strokeLinejoin="round"
          />

          <path
            d="M244 216 Q252 172 290 172 Q328 172 336 216 Z"
            fill="var(--l-strawberry)"
            stroke="var(--l-clay-ink)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <rect
            x="240"
            y="204"
            width="100"
            height="16"
            rx="8"
            fill="var(--l-strawberry)"
            stroke="var(--l-clay-ink)"
            strokeWidth="3"
          />
          <circle cx="290" cy="164" r="13" fill="var(--l-yuzu)" stroke="var(--l-clay-ink)" strokeWidth="3" />

          <circle cx="266" cy="254" r="5.5" fill="var(--l-clay-ink)" />
          <circle cx="314" cy="254" r="5.5" fill="var(--l-clay-ink)" />
          <circle cx="264" cy="252" r="1.8" fill="#ffffff" />
          <circle cx="312" cy="252" r="1.8" fill="#ffffff" />
          <circle cx="250" cy="270" r="9" fill="var(--l-strawberry)" opacity="0.45" />
          <circle cx="330" cy="270" r="9" fill="var(--l-strawberry)" opacity="0.45" />
          <path
            d="M282 268 Q290 277 298 268"
            fill="none"
            stroke="var(--l-clay-ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        <g fill="var(--l-yuzu)">
          <path d="M110 196 l 5 10 10 5 -10 5 -5 10 -5 -10 -10 -5 10 -5 Z" />
          <path d="M440 210 l 4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4 Z" opacity="0.85" />
        </g>
        <g fill="var(--l-sky)">
          <path d="M382 88 l 4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4 Z" opacity="0.8" />
        </g>
    </svg>
  </div>
);

export default MochiDiorama;

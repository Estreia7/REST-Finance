'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * How the product works, drawn rather than described.
 *
 * Three stages, connected left to right: what the owner puts in, what the app
 * does with it, and what comes back out. The animation runs once on entry and
 * follows the same order, so the sequence itself carries the explanation.
 *
 * Under prefers-reduced-motion nothing animates and the final frame is shown
 * immediately, which is the complete diagram.
 */

const AMBER = '#E8A317';

export default function WorkflowDiagram({
  labels,
  className = '',
}: {
  labels: {
    input: string;
    inputDetail: string;
    engine: string;
    engineDetail: string;
    output: string;
    outputDetail: string;
  };
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlay(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} ${play ? 'is-visible' : ''}`}>
      <svg
        viewBox="0 0 660 240"
        className="w-full h-auto"
        role="img"
        aria-label={`${labels.input}, ${labels.engine}, ${labels.output}`}
      >
        {/* ---------------------------------------------------- connectors */}
        {/* Drawn first so the cards sit on top of the line ends. */}
        <path
          className="rf-draw"
          d="M196 120h64"
          fill="none"
          stroke={AMBER}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ animationDelay: '500ms' }}
        />
        <path
          className="rf-draw"
          d="M400 120h64"
          fill="none"
          stroke={AMBER}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ animationDelay: '1100ms' }}
        />
        {/* Arrowheads */}
        <path
          className="rf-pop"
          d="M258 120l-7-4.5v9z"
          fill={AMBER}
          style={{ animationDelay: '800ms' }}
        />
        <path
          className="rf-pop"
          d="M462 120l-7-4.5v9z"
          fill={AMBER}
          style={{ animationDelay: '1400ms' }}
        />

        {/* ------------------------------------------------------- stage 1 */}
        <g className="rf-pop">
          <rect
            x="20"
            y="52"
            width="176"
            height="136"
            rx="14"
            fill="currentColor"
            fillOpacity=".04"
            stroke="currentColor"
            strokeOpacity=".14"
            strokeWidth="1.5"
          />
          {/* Four entry fields, filling in sequence */}
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(44 ${82 + i * 24})`}>
              <rect width="36" height="6" rx="3" fill="currentColor" fillOpacity=".18" />
              <rect
                className="rf-field"
                x="46"
                y="-3"
                width="62"
                height="12"
                rx="4"
                fill={AMBER}
                fillOpacity=".24"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              />
            </g>
          ))}
        </g>

        {/* ------------------------------------------------------- stage 2 */}
        <g className="rf-pop" style={{ animationDelay: '700ms' }}>
          <rect
            x="260"
            y="52"
            width="140"
            height="136"
            rx="14"
            fill={AMBER}
            fillOpacity=".07"
            stroke={AMBER}
            strokeOpacity=".3"
            strokeWidth="1.5"
          />
          {/* A bar splitting into goods and labour: the prime cost idea */}
          <rect x="286" y="86" width="88" height="20" rx="6" fill="currentColor" fillOpacity=".08" />
          <rect
            className="rf-grow"
            x="286"
            y="86"
            width="34"
            height="20"
            fill={AMBER}
            fillOpacity=".85"
            style={{ transformOrigin: '286px 0', animationDelay: '900ms' }}
          />
          <rect
            className="rf-grow"
            x="320"
            y="86"
            width="30"
            height="20"
            fill={AMBER}
            fillOpacity=".45"
            style={{ transformOrigin: '320px 0', animationDelay: '1000ms' }}
          />
          {/* Resulting percentage rows */}
          {[0, 1].map((i) => (
            <g key={i} className="rf-pop" style={{ animationDelay: `${1150 + i * 110}ms` }}>
              <rect
                x="286"
                y={126 + i * 20}
                width="44"
                height="6"
                rx="3"
                fill="currentColor"
                fillOpacity=".2"
              />
              <rect x="344" y={126 + i * 20} width="30" height="6" rx="3" fill={AMBER} />
            </g>
          ))}
        </g>

        {/* ------------------------------------------------------- stage 3 */}
        <g className="rf-pop" style={{ animationDelay: '1300ms' }}>
          <rect
            x="464"
            y="52"
            width="176"
            height="136"
            rx="14"
            fill="currentColor"
            fillOpacity=".04"
            stroke="currentColor"
            strokeOpacity=".14"
            strokeWidth="1.5"
          />
          {/* A small chart, trending up */}
          <path
            className="rf-draw"
            d="M492 150l26-16 24 10 30-34 24 12"
            fill="none"
            stroke={AMBER}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animationDelay: '1500ms' }}
          />
          {/* Alert chip: the part that tells you something changed */}
          <g className="rf-pop" style={{ animationDelay: '1900ms' }}>
            <rect x="492" y="80" width="60" height="20" rx="6" fill={AMBER} fillOpacity=".16" />
            <path d="M504 94l4-7 4 7z" fill={AMBER} />
            <rect x="518" y="88" width="26" height="4" rx="2" fill={AMBER} />
          </g>
        </g>

        {/* ---------------------------------------------------------- text */}
        {[
          { x: 108, title: labels.input, detail: labels.inputDetail, delay: 200 },
          { x: 330, title: labels.engine, detail: labels.engineDetail, delay: 800 },
          { x: 552, title: labels.output, detail: labels.outputDetail, delay: 1400 },
        ].map(({ x, title, detail, delay }) => (
          <g key={title} className="rf-pop" style={{ animationDelay: `${delay}ms` }}>
            <text
              x={x}
              y="32"
              textAnchor="middle"
              className="fill-foreground"
              style={{ font: '600 15px var(--font-display), system-ui' }}
            >
              {title}
            </text>
            <text
              x={x}
              y="218"
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ font: '400 12px var(--font-sans), system-ui' }}
            >
              {detail}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

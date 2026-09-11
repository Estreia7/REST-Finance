'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Illustrations for the landing page.
 *
 * Each one depicts something the product actually does rather than decorating
 * the page: a receipt being read, prices drifting, a cost split into its
 * parts. They animate once on entry, never loop, and collapse to their final
 * frame when the visitor prefers reduced motion.
 *
 * Drawn with currentColor and the brand amber so they theme automatically.
 */

const AMBER = '#E8A317';

/** Plays its children's CSS animations once the element is on screen. */
function WhenVisible({
  children,
  className = '',
}: {
  children: ReactNode;
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
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} ${play ? 'is-visible' : ''}`}>
      {children}
    </div>
  );
}

/**
 * Daily entry: four fields filling in, one after another.
 * Illustrates "four fields, under two minutes".
 */
export function DailyEntryArt({ className = '' }: { className?: string }) {
  return (
    <WhenVisible className={className}>
      <svg viewBox="0 0 200 140" className="w-full h-auto" role="img"
           aria-label="Um formulário de quatro campos a ser preenchido">
        <rect x="18" y="14" width="164" height="112" rx="10"
              fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="1.5" />

        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(34 ${34 + i * 24})`}>
            <rect width="52" height="7" rx="3.5" fill="currentColor" fillOpacity=".16" />
            <rect className="rf-field" width="78" height="11" rx="4" x="60" y="-2"
                  fill={AMBER} fillOpacity=".22"
                  style={{ animationDelay: `${i * 140}ms` }} />
          </g>
        ))}

        <rect className="rf-field" x="34" y="104" width="52" height="12" rx="6"
              fill={AMBER} style={{ animationDelay: '620ms' }} />
      </svg>
    </WhenVisible>
  );
}

/**
 * Invoice scanning: a scan line sweeping a receipt, line items resolving.
 */
export function ScanArt({ className = '' }: { className?: string }) {
  return (
    <WhenVisible className={className}>
      <svg viewBox="0 0 200 140" className="w-full h-auto" role="img"
           aria-label="Uma fatura a ser lida, com artigos a serem extraídos">
        {/* Receipt with a torn lower edge */}
        <path d="M44 16h72v104l-9-6-9 6-9-6-9 6-9-6-9 6-9-6-9 6z"
              fill="currentColor" fillOpacity=".05"
              stroke="currentColor" strokeOpacity=".16" strokeWidth="1.5" />

        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} className="rf-line" x="56" y={36 + i * 15}
                width={i % 2 ? 34 : 48} height="5" rx="2.5"
                fill="currentColor" fillOpacity=".22"
                style={{ animationDelay: `${350 + i * 90}ms` }} />
        ))}

        {/* The sweep */}
        <rect className="rf-scan" x="40" y="18" width="80" height="2.5" rx="1.25" fill={AMBER} />

        {/* Extracted values landing on the right */}
        {[0, 1, 2].map((i) => (
          <g key={i} className="rf-pop" style={{ animationDelay: `${700 + i * 130}ms` }}>
            <rect x="130" y={40 + i * 22} width="44" height="15" rx="4"
                  fill={AMBER} fillOpacity=".14" />
            <rect x="137" y={46 + i * 22} width="30" height="4" rx="2" fill={AMBER} />
          </g>
        ))}
      </svg>
    </WhenVisible>
  );
}

/**
 * Price tracking: a supplier's price stepping up, the rise flagged.
 */
export function PriceAlertArt({ className = '' }: { className?: string }) {
  return (
    <WhenVisible className={className}>
      <svg viewBox="0 0 200 140" className="w-full h-auto" role="img"
           aria-label="O preço de um produto a subir ao longo do tempo, com um alerta">
        {/* Baseline */}
        <line x1="24" y1="112" x2="180" y2="112"
              stroke="currentColor" strokeOpacity=".14" strokeWidth="1.5" />

        {/* Steady, then a jump */}
        <path className="rf-draw"
              d="M28 92h26v-4h26v3h26v-26h26v2h26"
              fill="none" stroke={AMBER} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />

        {/* Marker on the jump */}
        <circle className="rf-pop" cx="132" cy="65" r="5.5" fill={AMBER}
                style={{ animationDelay: '900ms' }} />
        <circle className="rf-ping" cx="132" cy="65" r="5.5"
                fill="none" stroke={AMBER} strokeWidth="2" />

        {/* Alert chip */}
        <g className="rf-pop" style={{ animationDelay: '1050ms' }}>
          <rect x="112" y="28" width="62" height="22" rx="7"
                fill={AMBER} fillOpacity=".16" />
          <path d="M124 42l4.5-8 4.5 8z" fill={AMBER} />
          <rect x="138" y="37" width="26" height="4" rx="2" fill={AMBER} />
        </g>
      </svg>
    </WhenVisible>
  );
}

/**
 * Prime cost: a bar splitting into goods and labour against a target line.
 */
export function PrimeCostArt({ className = '' }: { className?: string }) {
  return (
    <WhenVisible className={className}>
      <svg viewBox="0 0 200 140" className="w-full h-auto" role="img"
           aria-label="Receita dividida em mercadorias, pessoal e margem">
        <rect x="24" y="46" width="152" height="30" rx="8"
              fill="currentColor" fillOpacity=".07" />

        {/* Goods */}
        <rect className="rf-grow" x="24" y="46" width="52" height="30"
              fill={AMBER} fillOpacity=".85" style={{ transformOrigin: '24px 0' }} />
        {/* Labour */}
        <rect className="rf-grow" x="76" y="46" width="48" height="30"
              fill={AMBER} fillOpacity=".45"
              style={{ transformOrigin: '76px 0', animationDelay: '160ms' }} />

        {/* Rounded ends */}
        <rect x="24" y="46" width="152" height="30" rx="8"
              fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="1.5" />

        {/* Target marker */}
        <g className="rf-pop" style={{ animationDelay: '520ms' }}>
          <line x1="124" y1="38" x2="124" y2="84"
                stroke="currentColor" strokeOpacity=".5" strokeWidth="2"
                strokeDasharray="3 3" />
          <rect x="104" y="94" width="40" height="16" rx="5"
                fill="currentColor" fillOpacity=".08" />
          <rect x="111" y="100" width="26" height="4" rx="2"
                fill="currentColor" fillOpacity=".45" />
        </g>
      </svg>
    </WhenVisible>
  );
}

/**
 * Monthly report: a document assembling itself, figures then a total.
 */
export function ReportArt({ className = '' }: { className?: string }) {
  return (
    <WhenVisible className={className}>
      <svg viewBox="0 0 200 140" className="w-full h-auto" role="img"
           aria-label="Um relatório mensal a ser gerado">
        <path d="M54 14h68l24 24v88a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6Z"
              fill="currentColor" fillOpacity=".05"
              stroke="currentColor" strokeOpacity=".16" strokeWidth="1.5" />
        <path d="M122 14v24h24" fill="none"
              stroke="currentColor" strokeOpacity=".16" strokeWidth="1.5" />

        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="rf-pop" style={{ animationDelay: `${250 + i * 110}ms` }}>
            <rect x="64" y={54 + i * 16} width="40" height="5" rx="2.5"
                  fill="currentColor" fillOpacity=".2" />
            <rect x="116" y={54 + i * 16} width="22" height="5" rx="2.5"
                  fill="currentColor" fillOpacity=".32" />
          </g>
        ))}

        {/* Total, emphasised */}
        <g className="rf-pop" style={{ animationDelay: '760ms' }}>
          <line x1="64" y1="114" x2="138" y2="114"
                stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" />
          <rect x="64" y="120" width="30" height="6" rx="3" fill={AMBER} fillOpacity=".4" />
          <rect x="112" y="120" width="26" height="6" rx="3" fill={AMBER} />
        </g>
      </svg>
    </WhenVisible>
  );
}

/**
 * Team permissions: one figure sees everything, another sees a masked view.
 */
export function TeamArt({ className = '' }: { className?: string }) {
  return (
    <WhenVisible className={className}>
      <svg viewBox="0 0 200 140" className="w-full h-auto" role="img"
           aria-label="Proprietário com acesso total e colaborador com acesso limitado">
        {[
          { x: 40, delay: 0, full: true },
          { x: 118, delay: 180, full: false },
        ].map(({ x, delay, full }) => (
          <g key={x} className="rf-pop" style={{ animationDelay: `${delay}ms` }}>
            <rect x={x} y="24" width="46" height="92" rx="10"
                  fill="currentColor" fillOpacity=".05"
                  stroke="currentColor" strokeOpacity=".14" strokeWidth="1.5" />
            <circle cx={x + 23} cy="46" r="9"
                    fill={full ? AMBER : 'currentColor'}
                    fillOpacity={full ? 0.9 : 0.25} />
            <rect x={x + 11} y="64" width="24" height="4" rx="2"
                  fill="currentColor" fillOpacity=".2" />

            {/* Rows: the limited view has two of them masked out */}
            {[0, 1, 2].map((r) => {
              const hidden = !full && r > 0;
              return (
                <rect key={r} x={x + 11} y={78 + r * 12} width="24" height="5" rx="2.5"
                      fill={hidden ? 'currentColor' : AMBER}
                      fillOpacity={hidden ? 0.12 : 0.55}
                      strokeDasharray={hidden ? '2 2' : undefined}
                      stroke={hidden ? 'currentColor' : undefined}
                      strokeOpacity={hidden ? 0.25 : undefined} />
              );
            })}
          </g>
        ))}
      </svg>
    </WhenVisible>
  );
}

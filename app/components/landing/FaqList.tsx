'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Accordion FAQ. One open at a time, which keeps the section short enough to
 * scan rather than turning into a wall of prose.
 */
export default function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                className="w-full flex items-start justify-between gap-6 py-5 text-left
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-ring rounded-sm"
              >
                <span className="font-medium text-foreground">{item.q}</span>
                <ChevronDown
                  className={`w-[18px] h-[18px] shrink-0 mt-0.5 text-muted-foreground transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              hidden={!isOpen}
              className="pb-5 pr-10 text-muted-foreground leading-relaxed max-w-[62ch]"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}

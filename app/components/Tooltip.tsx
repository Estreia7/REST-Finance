'use client';

import { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export default function Tooltip({ text, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (show && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // If too close to top of viewport, show below
      setPosition(rect.top < 80 ? 'bottom' : 'top');
    }
  }, [show]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-block cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onTouchStart={() => setShow(v => !v)}
    >
      <span className="border-b border-dotted border-muted-foreground/50 hover:border-primary/70 transition-colors">
        {children}
      </span>
      <span
        className={`absolute left-1/2 -translate-x-1/2 z-50 px-3 py-2 text-xs font-normal text-foreground bg-card-elevated border border-white/10 rounded-lg shadow-modal whitespace-normal text-center max-w-[220px] w-max pointer-events-none transition-all duration-200
          ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
          ${show ? 'opacity-100 translate-y-0' : 'opacity-0 ' + (position === 'top' ? 'translate-y-1' : '-translate-y-1')}
        `}
      >
        {text}
        {/* Arrow */}
        <span
          className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-card-elevated border-white/10 rotate-45
            ${position === 'top' ? 'top-full -mt-1 border-b border-r' : 'bottom-full -mb-1 border-t border-l'}
          `}
        />
      </span>
    </span>
  );
}

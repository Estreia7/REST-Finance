'use client';

import Tooltip from './Tooltip';
import { glossary, glossaryText, type GlossaryKey } from '@/lib/glossary';
import { useLanguage } from '@/lib/language-context';

interface InfoHintProps {
  /** Which term to explain. The text itself lives in lib/glossary.ts. */
  term: GlossaryKey;
  /**
   * Extra sentence appended after the definition, for the one or two places
   * where the same term needs local context — the price threshold, say, whose
   * meaning depends on the value currently selected.
   */
  extra?: string;
  className?: string;
}

/**
 * The small circled "i" beside a figure or a heading.
 *
 * Its job is to be ignorable. An owner who already knows what COGS means
 * should be able to read the whole statement without the icons competing with
 * the numbers, which is why it sits at muted-foreground/60 and only reaches
 * full contrast on hover. The person who does not know needs it to be
 * obviously clickable, which is why it keeps a real hit area and a focus ring
 * rather than being a decorative glyph.
 *
 * Drawn as an inline SVG rather than pulled from lucide: at 13px the lucide
 * Info icon renders its dot and stem a half-pixel off centre, and this one
 * appears often enough on a page for that to read as sloppiness.
 */
export default function InfoHint({ term, extra, className = '' }: InfoHintProps) {
  const { language } = useLanguage();

  const entry = glossary(term, language);
  const text = extra ? `${glossaryText(term, language)} ${extra}` : glossaryText(term, language);

  return (
    <Tooltip
      text={text}
      underline={false}
      label={
        language === 'pt' ? `O que significa ${entry.term}?` : `What does ${entry.term} mean?`
      }
    >
      <span
        // `align-middle` alone drops the glyph below the baseline of the text
        // it annotates, which reads as a misalignment rather than a mark.
        // The small nudge puts its centre on the lowercase midline.
        className={`inline-flex items-center justify-center ml-1 w-3.5 h-3.5 align-[-0.12em]
                    text-muted-foreground/60 hover:text-primary transition-colors ${className}`}
      >
        <svg
          viewBox="0 0 14 14"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5.8" />
          <path d="M7 6.2v3.4" strokeLinecap="round" />
          <circle cx="7" cy="4.3" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      </span>
    </Tooltip>
  );
}

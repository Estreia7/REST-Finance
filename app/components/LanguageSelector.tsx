'use client';

import { Globe } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { Language } from '@/lib/translations';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'pt' ? 'en' : 'pt');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      title={language === 'pt' ? 'Switch to English' : 'Mudar para Português'}
      aria-label={language === 'pt' ? 'Switch to English' : 'Mudar para Português'}
    >
      <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
      <span className="text-sm sm:text-base font-medium">{language.toUpperCase()}</span>
    </button>
  );
}

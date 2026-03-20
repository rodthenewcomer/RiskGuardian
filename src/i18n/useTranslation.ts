'use client';

import { useAppStore } from '@/store/appStore';
import { translations, type Language } from './translations';

export function useTranslation() {
  const language = useAppStore(s => s.language);
  const t = translations[language ?? 'en'];
  return { t, language: (language ?? 'en') as Language };
}

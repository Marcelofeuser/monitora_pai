// Tradução das frases que ficaram fixas no código (fora dos objetos pt/en
// do App.tsx). A chave é a própria frase em português; o dicionário fica em
// i18n-dict.ts. `tx()` lê o idioma atual do módulo, que o LanguageProvider
// atualiza antes de renderizar — por isso funciona também em hooks e
// funções fora de componentes (mensagens de erro, etc.).
import { DICT } from './i18n-dict';

export type Language = 'pt-BR' | 'en' | 'es';
export const LANGUAGE_KEY = 'amparo-language';

let current: Language = 'pt-BR';

export function setCurrentLanguage(language: Language) {
  current = language;
}

export function getCurrentLanguage(): Language {
  return current;
}

/** Idioma salvo pelo usuário; se não houver, o idioma do navegador. */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'pt-BR' || saved === 'en' || saved === 'es') return saved;
  } catch {
    // localStorage indisponível (modo privado antigo, iframe): segue pro navegador
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase();
  if (nav.startsWith('es')) return 'es';
  if (nav.startsWith('en')) return 'en';
  return 'pt-BR';
}

export function tx(text: string): string {
  if (current === 'pt-BR') return text;
  const key = text.replace(/\s+/g, ' ').trim();
  return DICT[key]?.[current] ?? text;
}

/** Para frases montadas com variáveis, em que a ordem das palavras muda por idioma. */
export function pick(variants: { pt: string; en: string; es: string }): string {
  return current === 'en' ? variants.en : current === 'es' ? variants.es : variants.pt;
}

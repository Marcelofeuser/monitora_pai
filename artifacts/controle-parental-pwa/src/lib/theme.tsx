// Tema (claro/escuro) — compartilhado entre o app do Responsável e a tela
// da Criança (PairingJoin.tsx). É um arquivo à parte (em vez de morar
// dentro de App.tsx) justamente pra evitar import circular entre os dois,
// já que App.tsx importa PairingJoin e PairingJoin também precisa do tema.
//
// É uma das únicas duas coisas que o app da Criança pode mexer além de
// conversar e compartilhar localização (a outra é o idioma). As variáveis
// de cor pro modo escuro já existiam no CSS (index.css, bloco ".dark"), só
// faltava algo pra alternar a classe.
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Sun, Moon } from 'lucide-react';

const THEME_KEY = 'amparo-theme';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({
  theme: 'light',
  setTheme: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // localStorage pode falhar (modo privado, etc.).
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage pode falhar (modo privado, etc.) — o tema ainda muda
      // na sessão atual, só não persiste.
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-1"
      aria-label="Tema"
      data-testid="switcher-theme"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-label="Tema claro"
        aria-pressed={theme === 'light'}
        data-testid="button-theme-light"
        className={`grid size-8 place-items-center rounded-full transition-colors ${theme === 'light' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
      >
        <Sun size={16} />
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-label="Tema escuro"
        aria-pressed={theme === 'dark'}
        data-testid="button-theme-dark"
        className={`grid size-8 place-items-center rounded-full transition-colors ${theme === 'dark' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
      >
        <Moon size={16} />
      </button>
    </div>
  );
}

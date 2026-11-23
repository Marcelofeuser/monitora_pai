import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * Identidade visual do Ampara.
 *  - Responsáveis: layout da versão 1 (creme, verde-petróleo e âmbar), com tema claro e escuro.
 *  - Kids: portal da criança da versão 1 (roxo, amarelo, turquesa e rosa sobre lavanda).
 *  - Chat adulto: sempre escuro, com bolhas.
 */

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'ampara-parent-theme';

type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  header: string;
  headerForeground: string;
  hero: string;
  heroForeground: string;
  heroMuted: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarMuted: string;
  sidebarAccent: string;
  sidebarPrimary: string;
  sidebarBorder: string;
};

/** Versão 1 (PWA): fundo creme, texto azul-ardósia, verde-petróleo e âmbar. */
export const PARENT_LIGHT: Palette = {
  background: '#F6F4EE',
  foreground: '#263345',
  card: '#FCFBF8',
  cardForeground: '#263345',
  primary: '#305F5F',
  primaryForeground: '#FCFBF8',
  secondary: '#EBE3D6',
  secondaryForeground: '#263345',
  muted: '#ECE7DF',
  mutedForeground: '#647082',
  accent: '#EAB861',
  accentForeground: '#263345',
  destructive: '#CC392E',
  destructiveForeground: '#FCFBF8',
  border: '#E1DBD0',
  input: '#D7CFC1',
  header: '#F6F4EE',
  headerForeground: '#263345',
  hero: '#305F5F',
  heroForeground: '#FCFBF8',
  heroMuted: '#CFE0DD',
  sidebar: '#233939',
  sidebarForeground: '#F6F4EE',
  sidebarMuted: '#A9B8B5',
  sidebarAccent: '#324E4E',
  sidebarPrimary: '#EAB861',
  sidebarBorder: '#385151',
};

export const PARENT_DARK: Palette = {
  background: '#18202A',
  foreground: '#F6F4EE',
  card: '#212A36',
  cardForeground: '#F6F4EE',
  primary: '#EAB861',
  primaryForeground: '#263345',
  secondary: '#343E4B',
  secondaryForeground: '#F6F4EE',
  muted: '#303945',
  mutedForeground: '#9EA9B7',
  accent: '#418181',
  accentForeground: '#F6F4EE',
  destructive: '#D6554C',
  destructiveForeground: '#263345',
  border: '#343E4B',
  input: '#3F4A5A',
  header: '#18202A',
  headerForeground: '#F6F4EE',
  hero: '#283E3E',
  heroForeground: '#F6F4EE',
  heroMuted: '#A9C3C0',
  sidebar: '#121821',
  sidebarForeground: '#F6F4EE',
  sidebarMuted: '#8F9AA8',
  sidebarAccent: '#283E3E',
  sidebarPrimary: '#EAB861',
  sidebarBorder: '#2A313C',
};

/** Paleta do Ampara Kids (logotipo infantil). */
export const KIDS = {
  background: '#F2F0FF',
  foreground: '#271C40',
  card: '#FFFFFF',
  cardForeground: '#271C40',
  primary: '#894EEF',
  primaryForeground: '#FFFFFF',
  secondary: '#EEEAFB',
  secondaryForeground: '#271C40',
  muted: '#EEEAFB',
  mutedForeground: '#6A5C8A',
  accent: '#FCCD40',
  accentForeground: '#3F2C00',
  destructive: '#EA5353',
  destructiveForeground: '#FFFFFF',
  border: '#DAD0F1',
  input: '#DAD0F1',
  // cores de apoio da versão 1 (roxo, amarelo, turquesa, rosa)
  green: '#1EB8A9',
  yellow: '#FCCD40',
  coral: '#F25AA6',
  aqua: '#1EB8A9',
  lilac: '#B79BFF',
  teal: '#271C40',
  blobYellow: '#FEEFC3',
  blobAqua: '#CAF6F2',
  blobPink: '#FCD5E8',
};

/** Chat adulto: escuro, com bolhas. */
export const CHAT_DARK = {
  background: '#141B24',
  header: '#18202A',
  headerForeground: '#F6F4EE',
  headerMuted: '#9EA9B7',
  bubbleMine: '#2F6B6B',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#212A36',
  bubbleOtherText: '#F6F4EE',
  border: '#2A313C',
  composer: '#18202A',
  input: '#212A36',
  inputText: '#F6F4EE',
  placeholder: '#7C8796',
  accent: '#EAB861',
  danger: '#FF8A80',
  time: '#A9B4C2',
  dayChip: '#212A36',
};

type ThemeContextValue = { mode: ThemeMode; toggle: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ParentThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<ThemeMode | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((value) => {
      if (value === 'light' || value === 'dark') setOverride(value);
    }).catch(() => undefined);
  }, []);

  const mode: ThemeMode = override ?? (system === 'dark' ? 'dark' : 'light');
  const toggle = useCallback(() => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setOverride(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => undefined);
  }, [mode]);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useParentTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  const system = useColorScheme();
  if (context) return context;
  return { mode: system === 'dark' ? 'dark' : 'light', toggle: () => undefined };
}

/** Tokens do app do responsável, no tema claro ou escuro escolhido. */
export function useParentColors() {
  const base = useColors();
  const { mode } = useParentTheme();
  return { ...base, ...(mode === 'dark' ? PARENT_DARK : PARENT_LIGHT) };
}

/** Tokens do app infantil. */
export function useKidsColors() {
  return { ...useColors(), ...KIDS };
}

/** Círculo com iniciais, usado em listas e cabeçalhos. */
export function Avatar({ label, size = 40, background, color }: { label: string; size?: number; background: string; color: string }) {
  const initials = label.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontWeight: '800', fontSize: Math.round(size * 0.38) }}>{initials}</Text>
    </View>
  );
}

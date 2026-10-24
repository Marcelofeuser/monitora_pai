import { ClerkProvider, useAuth, useSignIn, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { createChildPairing, type PairingResult } from './api';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function ParentApp() {
  const colors = useColors();
  if (!publishableKey) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Configuração necessária</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Adicione EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ao .env local para habilitar o login do responsável.</Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ParentSession />
    </ClerkProvider>
  );
}

function ParentSession() {
  const colors = useColors();
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const [pairing, setPairing] = useState<PairingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoaded) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!isSignedIn) return <ParentSignIn />;

  const issuePairing = async (childName: string, childAge: string, consent: boolean) => {
    if (!consent) {
      setError('Confirme que este vínculo foi combinado com a criança.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      const result = await createChildPairing({
        childName: childName.trim(),
        ...(childAge.trim() ? { childAge: childAge.trim() } : {}),
        consent: true,
      }, token);
      setPairing(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o pareamento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · RESPONSÁVEIS</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Olá, {user?.firstName || 'responsável'}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Vincule o aparelho da criança. O código vale por 15 minutos e só pode ser usado uma vez.</Text>
      {pairing ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Código de pareamento</Text>
          <Text accessibilityLabel={`Código ${pairing.pairingCode}`} style={[styles.pairingCode, { color: colors.primary }]}>{pairing.pairingCode.replace(/(\d{4})(\d{4})/, '$1 $2')}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Digite este código no app Ampara Criança. Ele vale até {new Date(pairing.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} e só pode ser usado uma vez.</Text>
          <Pressable onPress={() => setPairing(null)} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>Gerar outro código</Text></Pressable>
        </View>
      ) : (
        <PairingForm colors={colors} busy={busy} error={error} onSubmit={issuePairing} />
      )}
      <Pressable onPress={() => void signOut()} style={styles.linkButton}><Text style={{ color: colors.primary }}>Sair da conta</Text></Pressable>
    </ScrollView>
  );
}

function ParentSignIn() {
  const colors = useColors();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!signIn || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) throw new Error(created.error.message);
      const result = await signIn.password({ password });
      if (result.error) throw new Error(result.error.message);
      if (signIn.status === 'complete') {
        const completed = await signIn.finalize();
        if (completed.error) throw new Error(completed.error.message);
      } else {
        setError('Esta conta precisa de uma etapa adicional de verificação. Use o acesso pelo site enquanto adicionamos esse fluxo ao app.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · RESPONSÁVEIS</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Entre na sua conta</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Use a mesma conta do Ampara. O app da criança entra por pareamento, sem conta de adulto.</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
        <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="voce@email.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Senha</Text>
        <TextInput secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Sua senha" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        {(error || errors.fields.identifier?.message || fetchStatus === 'fetching') && <Text style={[styles.error, { color: colors.destructive }]}>{error || errors.fields.identifier?.message || 'Conectando…'}</Text>}
        <Pressable disabled={busy || !email.trim() || !password} onPress={() => void submit()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Entrar</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function PairingForm({ colors, busy, error, onSubmit }: {
  colors: ReturnType<typeof useColors>;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string, age: string, consent: boolean) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [consent, setConsent] = useState(false);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Dados para o vínculo</Text>
      <Text style={[styles.label, { color: colors.foreground }]}>Nome da criança</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Nome" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Idade (opcional)</Text>
      <TextInput value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Idade" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Pressable onPress={() => setConsent((value) => !value)} style={styles.consentRow} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
        <View style={[styles.checkbox, { borderColor: colors.primary, backgroundColor: consent ? colors.primary : 'transparent' }]} />
        <Text style={[styles.consentText, { color: colors.mutedForeground }]}>Confirmo que sou responsável e que expliquei este vínculo à criança.</Text>
      </Pressable>
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      <Pressable disabled={busy || name.trim().length < 2} onPress={() => void onSubmit(name, age, consent)} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}>
        {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Gerar código de 8 dígitos</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 72, paddingBottom: 36, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontWeight: '700', marginBottom: 5 },
  title: { fontSize: 29, lineHeight: 36, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 7 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginTop: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: { height: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 15 },
  primaryButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  error: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  linkButton: { alignSelf: 'center', padding: 15, marginTop: 6 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5 },
  consentText: { flex: 1, fontSize: 12, lineHeight: 18 },
  pairingCode: { fontSize: 36, lineHeight: 48, fontWeight: '800', letterSpacing: 5, textAlign: 'center', paddingVertical: 14 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
});

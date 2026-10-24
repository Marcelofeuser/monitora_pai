import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { confirmChildPairingCode, fetchChildPrivateMessages, revokeChildDevice, sendChildPrivateMessage } from './api';
import { PrivateChat } from './PrivateChat';

const DEVICE_TOKEN_KEY = 'ampara-child-device-token';
const CHILD_NAME_KEY = 'ampara-child-name';
const CHILD_ID_KEY = 'ampara-child-id';

export function ChildApp() {
  const colors = useColors();
  const [state, setState] = useState<'loading' | 'unpaired' | 'connecting' | 'paired' | 'error'>('loading');
  const [childName, setChildName] = useState('');
  const [parentName, setParentName] = useState('responsável');
  const [childId, setChildId] = useState('');
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scanLock = useRef(false);

  useEffect(() => {
    void Promise.all([
      SecureStore.getItemAsync(DEVICE_TOKEN_KEY),
      AsyncStorage.getItem(CHILD_NAME_KEY),
      AsyncStorage.getItem(CHILD_ID_KEY),
    ]).then(([deviceToken, name, id]) => {
      setChildName(name ?? '');
      setChildId(id ?? '');
      setDeviceToken(deviceToken);
      setState(deviceToken ? 'paired' : 'unpaired');
    }).catch(() => setState('unpaired'));
  }, []);

  const pairWithCode = async (value: string) => {
    if (scanLock.current) return;
    scanLock.current = true;
    const code = value.replace(/\D/g, '');
    if (!/^\d{8}$/.test(code)) {
      setError('Digite os 8 números mostrados no app Ampara Responsáveis.');
      setState('error');
      scanLock.current = false;
      return;
    }
    setState('connecting');
    setError(null);
    try {
      const result = await confirmChildPairingCode(code);
      await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, result.deviceToken);
      setDeviceToken(result.deviceToken);
      await AsyncStorage.multiSet([
        [CHILD_NAME_KEY, result.childName],
        [CHILD_ID_KEY, result.childUserId],
      ]);
      setChildName(result.childName);
      setChildId(result.childUserId);
      setManualValue('');
      setState('paired');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir o pareamento.');
      setState('error');
    } finally {
      scanLock.current = false;
    }
  };

  const disconnect = async () => {
    if (!deviceToken) return;
    try {
      await revokeChildDevice(deviceToken);
      await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
      await AsyncStorage.multiRemove([CHILD_NAME_KEY, CHILD_ID_KEY]);
      setDeviceToken(null);
      setChildName('');
      setChildId('');
      setError(null);
      setState('unpaired');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível sair deste aparelho. Tente novamente com internet.');
    }
  };

  const loadMessages = useCallback(async () => {
    if (!deviceToken) throw new Error('Este aparelho não está conectado.');
    const conversation = await fetchChildPrivateMessages(deviceToken);
    if (conversation.parentName) setParentName(conversation.parentName);
    return conversation.messages;
  }, [deviceToken]);
  const sendMessage = useCallback(async (text: string) => {
    if (!deviceToken) throw new Error('Este aparelho não está conectado.');
    return sendChildPrivateMessage(deviceToken, text);
  }, [deviceToken]);

  if (state === 'loading') {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (state === 'paired') {
    return (
      <PrivateChat
        title={`Conversa · ${parentName}`}
        subtitle={`Ampara Criança · conectado como ${childName}`}
        ownUserId={childId}
        loadMessages={loadMessages}
        sendMessage={sendMessage}
        headerAction={<Pressable disabled={!deviceToken} onPress={() => void disconnect()}><Text style={{ color: colors.destructive }}>Sair</Text></Pressable>}
      />
    );
  }

  const activeError = error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>;

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · CRIANÇA</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Conecte seu aparelho</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Peça ao responsável para abrir o app Ampara Responsáveis e gerar o código de 8 dígitos. O QR usado para baixar este app é separado do pareamento.</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {activeError}
          {state === 'connecting' ? (
            <View style={styles.connecting}><ActivityIndicator color={colors.primary} /><Text style={[styles.body, { color: colors.mutedForeground }]}>Confirmando o vínculo…</Text></View>
          ) : (
            <>
              <TextInput accessibilityLabel="Código de pareamento" keyboardType="number-pad" maxLength={8} value={manualValue} onChangeText={(value) => setManualValue(value.replace(/\D/g, '').slice(0, 8))} placeholder="00000000" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.codeInput, { color: colors.foreground, borderColor: colors.border }]} />
              <Pressable disabled={manualValue.length !== 8} onPress={() => void pairWithCode(manualValue)} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: manualValue.length === 8 ? 1 : 0.55 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Conectar aparelho</Text></Pressable>
            </>
          )}
        </View>
      <Text style={[styles.privacy, { color: colors.mutedForeground }]}>Você verá quando o vínculo estiver ativo. Nenhum dado é compartilhado antes da confirmação.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 72, paddingBottom: 36, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontWeight: '700', marginBottom: 5 },
  title: { fontSize: 29, lineHeight: 36, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginTop: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 9 },
  badge: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  badgeText: { fontSize: 10, letterSpacing: 0.7, fontWeight: '700' },
  primaryButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  input: { height: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 14, marginTop: 5 },
  codeInput: { height: 64, fontSize: 28, fontWeight: '700', letterSpacing: 7, textAlign: 'center' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  linkButton: { alignSelf: 'center', padding: 15 },
  error: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  connecting: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 10 },
  privacy: { textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 15 },
  small: { fontSize: 10, marginTop: 17 },
});

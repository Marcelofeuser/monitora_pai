import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { confirmChildPairing, pairingTokenFromQr } from './api';

const DEVICE_TOKEN_KEY = 'ampara-child-device-token';
const CHILD_NAME_KEY = 'ampara-child-name';
const CHILD_ID_KEY = 'ampara-child-id';

export function ChildApp() {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<'loading' | 'unpaired' | 'scanning' | 'connecting' | 'paired' | 'error'>('loading');
  const [childName, setChildName] = useState('');
  const [childId, setChildId] = useState('');
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
      setState(deviceToken ? 'paired' : 'unpaired');
    }).catch(() => setState('unpaired'));
  }, []);

  const pairWithValue = async (value: string) => {
    if (scanLock.current) return;
    scanLock.current = true;
    const token = pairingTokenFromQr(value);
    if (!token) {
      setError('Este QR não parece ser um convite válido do Ampara.');
      setState('error');
      scanLock.current = false;
      return;
    }
    setState('connecting');
    setError(null);
    try {
      const result = await confirmChildPairing(token);
      await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, result.deviceToken);
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
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
    await AsyncStorage.multiRemove([CHILD_NAME_KEY, CHILD_ID_KEY]);
    setChildName('');
    setChildId('');
    setError(null);
    setState('unpaired');
  };

  if (state === 'loading') {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (state === 'paired') {
    return (
      <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · CRIANÇA</Text>
        <View style={[styles.badge, { backgroundColor: colors.successSoft }]}><Text style={[styles.badgeText, { color: colors.success }]}>APARELHO VINCULADO</Text></View>
        <Text style={[styles.title, { color: colors.foreground }]}>Oi, {childName}!</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Seu aparelho está conectado ao espaço da família. O vínculo fica visível para você e pode ser removido em Ajustes.</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Seu espaço está pronto</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>A próxima etapa vai habilitar as conversas e as opções de compartilhamento combinadas com o responsável.</Text>
          <Text style={[styles.small, { color: colors.mutedForeground }]}>ID do perfil: {childId}</Text>
        </View>
        <Pressable onPress={() => void disconnect()} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>Desvincular este aparelho</Text></Pressable>
      </ScrollView>
    );
  }

  const activeError = error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>;

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · CRIANÇA</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Conecte seu aparelho</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Peça ao responsável para abrir o app Ampara Responsáveis e mostrar o QR de pareamento. O código expira em 15 minutos.</Text>
      {state === 'scanning' ? (
        <View style={[styles.cameraFrame, { borderColor: colors.border }]}>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => void pairWithValue(data)}
            />
          ) : (
            <View style={styles.permissionBox}>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>Precisamos da câmera para ler o QR que o responsável está mostrando.</Text>
              <Pressable onPress={() => void requestPermission()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Permitir câmera</Text></Pressable>
            </View>
          )}
          <Pressable onPress={() => { setState('unpaired'); setError(null); }} style={styles.linkButton}><Text style={{ color: colors.primary }}>Voltar</Text></Pressable>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {activeError}
          {state === 'connecting' ? (
            <View style={styles.connecting}><ActivityIndicator color={colors.primary} /><Text style={[styles.body, { color: colors.mutedForeground }]}>Confirmando o vínculo…</Text></View>
          ) : (
            <>
              <Pressable onPress={() => { setState('scanning'); setError(null); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Abrir câmera e ler QR</Text>
              </Pressable>
              <Text style={[styles.orText, { color: colors.mutedForeground }]}>ou digite o link/código</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} value={manualValue} onChangeText={setManualValue} placeholder="Cole o link ou código do convite" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
              <Pressable disabled={!manualValue.trim()} onPress={() => void pairWithValue(manualValue)} style={[styles.secondaryButton, { borderColor: colors.border, opacity: manualValue.trim() ? 1 : 0.55 }]}><Text style={{ color: colors.foreground }}>Confirmar código</Text></Pressable>
            </>
          )}
        </View>
      )}
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
  cameraFrame: { minHeight: 380, overflow: 'hidden', borderWidth: 1, borderRadius: 22, marginTop: 10 },
  camera: { height: 360, width: '100%' },
  permissionBox: { flex: 1, minHeight: 350, justifyContent: 'center', padding: 20 },
  primaryButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  input: { height: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 14, marginTop: 5 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  orText: { fontSize: 12, textAlign: 'center', marginVertical: 12 },
  linkButton: { alignSelf: 'center', padding: 15 },
  error: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  connecting: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 10 },
  privacy: { textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 15 },
  small: { fontSize: 10, marginTop: 17 },
});

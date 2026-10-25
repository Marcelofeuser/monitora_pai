import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { confirmChildPairingCode, fetchChildGroupMessages, fetchChildGroups, fetchChildPrivateMessages, fetchChildScreenTimeStatus, reportChildLocation, revokeChildDevice, sendChildGroupMessage, sendChildPrivateMessage, sendChildScreenTimeHeartbeat, type ChildLockStatus, type GroupProfile, type PrivateMessageInput } from './api';
import { PrivateChat } from './PrivateChat';
import { NativeCallOverlay } from './NativeCallOverlay';
import { useNativeCall } from './useNativeCall';

const DEVICE_TOKEN_KEY = 'ampara-child-device-token';
const CHILD_NAME_KEY = 'ampara-child-name';
const CHILD_ID_KEY = 'ampara-child-id';
const PARENT_ID_KEY = 'ampara-parent-id';

export function ChildApp() {
  const colors = useColors();
  const [state, setState] = useState<'loading' | 'unpaired' | 'connecting' | 'paired' | 'error'>('loading');
  const [childName, setChildName] = useState('');
  const [parentName, setParentName] = useState('responsável');
  const [childId, setChildId] = useState('');
  const [parentId, setParentId] = useState('');
  const [groups, setGroups] = useState<GroupProfile[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupProfile | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [childLockStatus, setChildLockStatus] = useState<ChildLockStatus | null>(null);
  const [screenTimeError, setScreenTimeError] = useState<string | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scanLock = useRef(false);
  const call = useNativeCall(deviceToken ? { kind: 'child', token: deviceToken } : null);

  const refreshChildLockStatus = useCallback(async () => {
    if (!deviceToken) return;
    const status = await fetchChildScreenTimeStatus(deviceToken);
    setChildLockStatus(status);
    setScreenTimeError(null);
  }, [deviceToken]);

  useEffect(() => {
    if (!deviceToken) {
      setChildLockStatus(null);
      setScreenTimeError(null);
      return;
    }
    let active = true;
    const refresh = () => void refreshChildLockStatus().catch((cause) => {
      if (active) {
        setChildLockStatus(null);
        setScreenTimeError(cause instanceof Error ? cause.message : 'Não foi possível verificar o acesso.');
      }
    });
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void sendChildScreenTimeHeartbeat(deviceToken).then((status) => {
        if (active) {
          setChildLockStatus(status);
          setScreenTimeError(null);
        }
      }).catch((cause) => {
        if (active) {
          setChildLockStatus(null);
          setScreenTimeError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o tempo de uso.');
        }
      });
    }, 60_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [deviceToken, refreshChildLockStatus]);

  useEffect(() => {
    void Promise.all([
      SecureStore.getItemAsync(DEVICE_TOKEN_KEY),
      AsyncStorage.getItem(CHILD_NAME_KEY),
      AsyncStorage.getItem(CHILD_ID_KEY),
      AsyncStorage.getItem(PARENT_ID_KEY),
    ]).then(([deviceToken, name, id, parent]) => {
      setChildName(name ?? '');
      setChildId(id ?? '');
      setParentId(parent ?? '');
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
        [PARENT_ID_KEY, result.parentId],
      ]);
      setChildName(result.childName);
      setChildId(result.childUserId);
      setParentId(result.parentId);
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
      await AsyncStorage.multiRemove([CHILD_NAME_KEY, CHILD_ID_KEY, PARENT_ID_KEY]);
      setDeviceToken(null);
      setChildName('');
      setChildId('');
      setParentId('');
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
    if (conversation.parentId && conversation.parentId !== parentId) {
      setParentId(conversation.parentId);
      await AsyncStorage.setItem(PARENT_ID_KEY, conversation.parentId);
    }
    return conversation.messages;
  }, [deviceToken, parentId]);
  const sendMessage = useCallback(async (input: PrivateMessageInput) => {
    if (!deviceToken) throw new Error('Este aparelho não está conectado.');
    return sendChildPrivateMessage(deviceToken, input);
  }, [deviceToken]);
  const openGroups = async () => {
    if (!deviceToken) return;
    try {
      setGroups(await fetchChildGroups(deviceToken));
      setGroupPickerOpen(true);
    } catch (cause) {
      Alert.alert('Não foi possível abrir os grupos', cause instanceof Error ? cause.message : 'Tente novamente.');
    }
  };
  const selectedGroupId = selectedGroup?.id;
  const loadGroupMessages = useCallback(async () => {
    if (!deviceToken || !selectedGroupId) throw new Error('Selecione um grupo para abrir a conversa.');
    return fetchChildGroupMessages(selectedGroupId, deviceToken);
  }, [deviceToken, selectedGroupId]);
  const sendGroupMessage = useCallback(async (input: PrivateMessageInput) => {
    if (!deviceToken || !selectedGroupId) throw new Error('Selecione um grupo para enviar a mensagem.');
    return sendChildGroupMessage(selectedGroupId, input, deviceToken);
  }, [deviceToken, selectedGroupId]);

  const shareLocation = async () => {
    if (!deviceToken || sharingLocation) return;
    setSharingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Para compartilhar sua localização, permita o acesso enquanto estiver usando o app.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await reportChildLocation(deviceToken, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
      });
      Alert.alert('Localização compartilhada', 'Seu responsável recebeu a posição atual deste aparelho.');
    } catch (cause) {
      Alert.alert('Não foi possível compartilhar', cause instanceof Error ? cause.message : 'Verifique a permissão e a conexão com a internet.');
    } finally {
      setSharingLocation(false);
    }
  };

  if (state === 'loading') {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (state === 'paired' && !childLockStatus) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24, gap: 12 }]}>
        {screenTimeError ? <>
          <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Não foi possível verificar o acesso</Text>
          <Text style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>{screenTimeError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refreshChildLockStatus().catch((cause) => setScreenTimeError(cause instanceof Error ? cause.message : 'Tente novamente.'))} style={[styles.primaryButton, { backgroundColor: colors.primary, paddingHorizontal: 22 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Tentar novamente</Text></Pressable>
        </> : <><ActivityIndicator color={colors.primary} /><Text style={[styles.body, { color: colors.mutedForeground }]}>Verificando o acesso…</Text></>}
      </View>
    );
  }

  if (state === 'paired' && childLockStatus?.locked) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 28, gap: 12 }]}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · CRIANÇA</Text>
        <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Acesso pausado</Text>
        <Text style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>{childLockStatus.lockReason === 'manual' ? 'Seu responsável pausou o acesso ao app. Fale com ele para liberar.' : 'Você atingiu o limite diário de uso. O acesso volta quando o limite diário for renovado.'}</Text>
        {screenTimeError && <Text style={[styles.error, { color: colors.destructive }]}>{screenTimeError}</Text>}
        <Pressable accessibilityRole="button" onPress={() => void refreshChildLockStatus().catch((cause) => setScreenTimeError(cause instanceof Error ? cause.message : 'Tente novamente.'))} style={[styles.primaryButton, { backgroundColor: colors.primary, paddingHorizontal: 22 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Verificar de novo</Text></Pressable>
      </View>
    );
  }

  if (state === 'paired') {
    if (groupPickerOpen && !selectedGroup) {
      return <><ChildGroupPicker groups={groups} onSelect={(group) => { setSelectedGroup(group); setGroupPickerOpen(false); }} onBack={() => setGroupPickerOpen(false)} /><NativeCallOverlay call={call} /></>;
    }
    if (selectedGroup) {
      return <>
        <PrivateChat
          title={selectedGroup.name}
          subtitle={`Grupo · ${selectedGroup.members.map((member) => member.contactName).join(', ') || 'família'}`}
          ownUserId={childId}
          loadMessages={loadGroupMessages}
          sendMessage={sendGroupMessage}
          onBack={() => { setSelectedGroup(null); setGroupPickerOpen(true); }}
          headerAction={<Pressable accessibilityRole="button" onPress={() => { setSelectedGroup(null); void openGroups(); }}><Text style={{ color: colors.primary }}>Grupos</Text></Pressable>}
        />
        <NativeCallOverlay call={call} />
      </>;
    }
    return (
      <>
      <PrivateChat
        title={`Conversa · ${parentName}`}
        subtitle={`Ampara Criança · conectado como ${childName}`}
        ownUserId={childId}
        loadMessages={loadMessages}
        sendMessage={sendMessage}
        headerAction={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable accessibilityRole="button" disabled={!parentId || call.phase !== 'idle'} onPress={() => void call.startCall(parentId, parentName)}>
            <Text style={{ color: colors.primary }}>Ligar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void openGroups()}><Text style={{ color: colors.primary }}>Grupos</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!deviceToken || sharingLocation} onPress={() => void shareLocation()}>
            {sharingLocation ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: colors.primary }}>Compartilhar localização</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!deviceToken} onPress={() => void disconnect()}><Text style={{ color: colors.destructive }}>Sair</Text></Pressable>
        </View>}
      />
      <NativeCallOverlay call={call} />
      </>
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

function ChildGroupPicker({ groups, onSelect, onBack }: {
  groups: GroupProfile[];
  onSelect: (group: GroupProfile) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: colors.primary }}>‹ Voltar à conversa familiar</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Meus grupos</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Converse com as pessoas que seu responsável colocou nos grupos.</Text>
      {groups.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Você ainda não participa de nenhum grupo.</Text> : groups.map((group) => (
        <Pressable key={group.id} accessibilityRole="button" onPress={() => onSelect(group)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{group.name}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{group.members.map((member) => member.contactName).join(' · ') || 'Grupo da família'}</Text>
          <Text style={{ color: colors.primary }}>Abrir conversa ›</Text>
        </Pressable>
      ))}
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

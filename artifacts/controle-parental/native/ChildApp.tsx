import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KIDS, useKidsColors } from './theme';
import { confirmChildPairingCode, fetchChildBio, fetchChildGroupMessages, fetchChildGroups, fetchChildPrivateMessages, fetchChildScreenTimeStatus, reportChildLocation, revokeChildDevice, sendChildGroupMessage, sendChildPrivateMessage, sendChildScreenTimeHeartbeat, updateChildBio, reactAsChild, uploadChildPhoto, type NativeUploadFile, type BioProfile, type ChildLockStatus, type GroupProfile, type PrivateMessageInput } from './api';
import { ChatChip, PrivateChat } from './PrivateChat';
import { ProfilePhoto } from './ProfilePhoto';
import { NativeCallOverlay } from './NativeCallOverlay';
import { useNativeCall } from './useNativeCall';

const DEVICE_TOKEN_KEY = 'ampara-child-device-token';
const CHILD_NAME_KEY = 'ampara-child-name';
const CHILD_ID_KEY = 'ampara-child-id';
const PARENT_ID_KEY = 'ampara-parent-id';

const useChildColors = useKidsColors;

export function ChildApp() {
  const colors = useChildColors();
  const [state, setState] = useState<'loading' | 'unpaired' | 'connecting' | 'paired' | 'error'>('loading');
  const [childName, setChildName] = useState('');
  const [parentName, setParentName] = useState('responsável');
  const [childId, setChildId] = useState('');
  const [parentId, setParentId] = useState('');
  const [groups, setGroups] = useState<GroupProfile[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupProfile | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [childLockStatus, setChildLockStatus] = useState<ChildLockStatus | null>(null);
  const [screenTimeError, setScreenTimeError] = useState<string | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scanLock = useRef(false);
  const call = useNativeCall(deviceToken ? { kind: 'child', token: deviceToken } : null);
  const childMediaHeaders = useCallback(async (): Promise<Record<string, string>> => (deviceToken ? { 'X-Child-Token': deviceToken } : {}), [deviceToken]);
  // 1.1: reações.
  const reactDirect = useCallback(async (messageId: string, emoji: string | null) => {
    if (!deviceToken) throw new Error('Aparelho desconectado.');
    await reactAsChild('direct', messageId, emoji, deviceToken);
  }, [deviceToken]);
  const reactGroup = useCallback(async (messageId: string, emoji: string | null) => {
    if (!deviceToken) throw new Error('Aparelho desconectado.');
    await reactAsChild('group', messageId, emoji, deviceToken);
  }, [deviceToken]);

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
      setError('Digite os 8 números mostrados no app Ampara.');
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

  /** Apaga só o pareamento local (token inválido/revogado no servidor) e volta para a tela de código. */
  const forgetLocalPairing = useCallback(async () => {
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY).catch(() => undefined);
    await AsyncStorage.multiRemove([CHILD_NAME_KEY, CHILD_ID_KEY, PARENT_ID_KEY]).catch(() => undefined);
    setDeviceToken(null);
    setChildName('');
    setChildId('');
    setParentId('');
    setChildLockStatus(null);
    setScreenTimeError(null);
    setState('unpaired');
  }, []);

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
      setProfileOpen(false);
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

  const tokenRejected = !!screenTimeError && /not_authenticated|invalid_device|device_revoked|unauthorized/i.test(screenTimeError);
  if (state === 'paired' && !childLockStatus) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24, gap: 12 }]}>
        {screenTimeError ? <>
          <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Não foi possível verificar o acesso</Text>
          <Text style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>{tokenRejected ? 'Este aparelho não está mais conectado ao responsável. Peça um código novo no app Ampara e conecte de novo.' : screenTimeError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refreshChildLockStatus().catch((cause) => setScreenTimeError(cause instanceof Error ? cause.message : 'Tente novamente.'))} style={[styles.primaryButton, { backgroundColor: colors.primary, paddingHorizontal: 22 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Tentar novamente</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void forgetLocalPairing()} style={{ paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>{tokenRejected ? 'Conectar de novo com um código' : 'Desconectar e parear de novo'}</Text></Pressable>
        </> : <><ActivityIndicator color={colors.primary} /><Text style={[styles.body, { color: colors.mutedForeground }]}>Verificando o acesso…</Text></>}
      </View>
    );
  }

  if (state === 'paired' && childLockStatus?.locked) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 28, gap: 12 }]}>
        <Text style={styles.bigEmoji}>🌙</Text>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA KIDS</Text>
        <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Hora de descansar</Text>
        <Text style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>{childLockStatus.lockReason === 'manual' ? 'Seu responsável pausou o acesso ao app. Fale com ele para liberar.' : 'Você atingiu o limite diário de uso. O acesso volta quando o limite diário for renovado.'}</Text>
        {screenTimeError && <Text style={[styles.error, { color: colors.destructive }]}>{screenTimeError}</Text>}
        <Pressable accessibilityRole="button" onPress={() => void refreshChildLockStatus().catch((cause) => setScreenTimeError(cause instanceof Error ? cause.message : 'Tente novamente.'))} style={[styles.primaryButton, { backgroundColor: colors.primary, paddingHorizontal: 22 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Verificar de novo</Text></Pressable>
      </View>
    );
  }

  if (state === 'paired') {
    if (profileOpen && deviceToken) {
      return <ChildProfileEditor deviceToken={deviceToken} onBack={() => setProfileOpen(false)} />;
    }
    if (groupPickerOpen && !selectedGroup) {
      return <><ChildGroupPicker groups={groups} onSelect={(group) => { setSelectedGroup(group); setGroupPickerOpen(false); }} onBack={() => setGroupPickerOpen(false)} /><NativeCallOverlay call={call} /></>;
    }
    if (selectedGroup) {
      return <>
        <PrivateChat
          getMediaHeaders={childMediaHeaders}
          variant="kids"
          safeTop
          title={selectedGroup.name}
          subtitle={`Grupo · ${selectedGroup.members.map((member) => member.contactName).join(', ') || 'família'}`}
          ownUserId={childId}
          loadMessages={loadGroupMessages}
          sendMessage={sendGroupMessage}
          onReact={reactGroup}
          onBack={() => { setSelectedGroup(null); setGroupPickerOpen(true); }}
          headerAction={<ChatChip kids label="Grupos" emoji="👥" color={KIDS.lilac} onPress={() => { setSelectedGroup(null); void openGroups(); }} />}
        />
        <NativeCallOverlay call={call} />
      </>;
    }
    return (
      <>
      <PrivateChat
          getMediaHeaders={childMediaHeaders}
        variant="kids"
        safeTop
        title={`Conversa · ${parentName}`}
        subtitle={`Ampara Kids · conectado como ${childName}`}
        ownUserId={childId}
        loadMessages={loadMessages}
        sendMessage={sendMessage}
        onReact={reactDirect}
        headerAction={<>
          <ChatChip kids label="Vídeo" emoji="📹" color={KIDS.green} disabled={!parentId || call.phase !== 'idle'} onPress={() => void call.startCall(parentId, parentName)} />
          <ChatChip kids label="Grupos" emoji="👥" color={KIDS.lilac} onPress={() => void openGroups()} />
          <ChatChip kids label="Perfil" emoji="🙂" color={KIDS.aqua} onPress={() => setProfileOpen(true)} />
          <ChatChip kids label="Minha localização" emoji="📍" color={KIDS.coral} loading={sharingLocation} disabled={!deviceToken} onPress={() => void shareLocation()} />
          <ChatChip kids danger label="Sair" emoji="🚪" disabled={!deviceToken} onPress={() => void disconnect()} />
        </>}
      />
      <NativeCallOverlay call={call} />
      </>
    );
  }

  const activeError = error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>;

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <View pointerEvents="none" style={[styles.blob, { top: -60, left: -70, backgroundColor: KIDS.blobYellow }]} />
      <View pointerEvents="none" style={[styles.blob, { top: 40, right: -90, backgroundColor: KIDS.blobAqua }]} />
      <View pointerEvents="none" style={[styles.blob, { bottom: -80, right: -40, backgroundColor: KIDS.blobPink }]} />
      <View style={styles.dotRow}>{[KIDS.coral, KIDS.yellow, KIDS.green, KIDS.aqua, KIDS.lilac].map((color, i) => <View key={`${i}-${color}`} style={[styles.dot, { backgroundColor: color }]} />)}</View>
      <Image accessibilityLabel="Logo Ampara Kids" resizeMode="contain" source={require('../assets/images/logo-ampara-kids.png')} style={styles.brandLogo} />
      <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Vamos conectar! 🎉</Text>
      <Text style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>Peça ao seu responsável para abrir o app Ampara e mostrar o código de 8 números.</Text>
      <View style={[styles.card, styles.pairCard, { backgroundColor: colors.card, borderColor: KIDS.yellow }]}>
        {activeError}
        {state === 'connecting' ? (
          <View style={styles.connecting}><ActivityIndicator color={colors.primary} /><Text style={[styles.body, { color: colors.mutedForeground }]}>Confirmando o vínculo…</Text></View>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.foreground, textAlign: 'center' }]}>Digite o código</Text>
            <TextInput accessibilityLabel="Código de pareamento" keyboardType="number-pad" maxLength={8} value={manualValue} onChangeText={(value) => setManualValue(value.replace(/\D/g, '').slice(0, 8))} placeholder="00000000" placeholderTextColor={colors.input} style={[styles.input, styles.codeInput, { color: colors.foreground, borderColor: KIDS.aqua, backgroundColor: colors.background }]} />
            <Pressable accessibilityRole="button" disabled={manualValue.length !== 8} onPress={() => void pairWithCode(manualValue)} style={[styles.primaryButton, { backgroundColor: KIDS.green, opacity: manualValue.length === 8 ? 1 : 0.5 }]}><Text style={[styles.buttonText, { color: '#0F2D2A' }]}>Conectar meu aparelho</Text></Pressable>
          </>
        )}
      </View>
      <Text style={[styles.privacy, { color: colors.mutedForeground }]}>Nada é compartilhado antes de você confirmar o vínculo.</Text>
    </ScrollView>
  );
}

function ChildProfileEditor({ deviceToken, onBack }: { deviceToken: string; onBack: () => void }) {
  const colors = useChildColors();
  const [profile, setProfile] = useState<BioProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [other, setOther] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchChildBio(deviceToken).then((result) => {
      if (!active) return;
      setProfile(result);
      setName(result.name);
      setPhone(result.phone ?? '');
      setEmail(result.email ?? '');
      setInstagram(result.socialLinks?.instagram ?? '');
      setWhatsapp(result.socialLinks?.whatsapp ?? '');
      setOther(result.socialLinks?.other ?? '');
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu perfil.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deviceToken]);

  const locked = Boolean(profile?.bioLocked);
  const uploadPhoto = async (file: NativeUploadFile) => {
    const result = await uploadChildPhoto(file, deviceToken);
    setProfile((current) => current ? { ...current, photoUrl: result.photoUrl } : current);
  };
  const save = async () => {
    if (busy || locked || name.trim().length < 1) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateChildBio({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        socialLinks: { instagram: instagram.trim(), whatsapp: whatsapp.trim(), other: other.trim() },
      }, deviceToken);
      setProfile(result);
      setSaved(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível salvar seu perfil.';
      setError(message === 'bio_locked_by_parent' ? 'Seu responsável bloqueou a edição desta bio.' : message);
    } finally {
      setBusy(false);
    }
  };

  return <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
    <ChatChip kids label="Voltar à conversa" emoji="💬" color={KIDS.primary} onPress={onBack} />
    <Text style={[styles.title, { color: colors.foreground }]}>Meu perfil 🙂</Text>
    <Text style={[styles.body, { color: colors.mutedForeground }]}>Esses dados ficam no seu espaço familiar. Seu responsável pode bloquear alterações.</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : <>
      <View style={styles.photoRow}>
        <ProfilePhoto name={name || profile?.name || 'Eu'} photoUrl={profile?.photoUrl} headers={{ 'X-Child-Token': deviceToken }} size={92} background={KIDS.yellow} color="#5A3F00" badge={KIDS.coral} onUpload={locked ? undefined : uploadPhoto} onError={setError} />
        <Text style={[styles.body, { color: colors.mutedForeground, flex: 1 }]}>{locked ? 'Seu responsável bloqueou a troca da foto.' : 'Toque na câmera para escolher a sua foto 📸'}</Text>
      </View>
      {locked && <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Bio protegida</Text><Text style={[styles.body, { color: colors.mutedForeground }]}>Seu responsável bloqueou a edição. Você ainda pode visualizar seus dados.</Text></View>}
      <Text style={[styles.label, { color: colors.foreground }]}>Nome</Text>
      <TextInput editable={!locked} value={name} onChangeText={setName} placeholder="Nome" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, opacity: locked ? 0.65 : 1 }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Telefone</Text>
      <TextInput editable={!locked} value={phone} onChangeText={setPhone} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, opacity: locked ? 0.65 : 1 }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
      <TextInput editable={!locked} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, opacity: locked ? 0.65 : 1 }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Instagram</Text>
      <TextInput editable={!locked} value={instagram} onChangeText={setInstagram} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, opacity: locked ? 0.65 : 1 }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>WhatsApp ou outro contato</Text>
      <TextInput editable={!locked} value={whatsapp} onChangeText={setWhatsapp} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, opacity: locked ? 0.65 : 1 }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Outro link</Text>
      <TextInput editable={!locked} value={other} onChangeText={setOther} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, opacity: locked ? 0.65 : 1 }]} />
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {saved && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.primary, fontWeight: '800' }]}>Perfil salvo! ✅</Text>}
      {!locked && <Pressable disabled={busy} onPress={() => void save()} style={[styles.primaryButton, { backgroundColor: KIDS.green, opacity: busy ? 0.65 : 1 }]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: '#0F2D2A' }]}>Salvar perfil</Text>}</Pressable>}
    </>}
  </ScrollView>;
}

function ChildGroupPicker({ groups, onSelect, onBack }: {
  groups: GroupProfile[];
  onSelect: (group: GroupProfile) => void;
  onBack: () => void;
}) {
  const colors = useChildColors();
  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <ChatChip kids label="Voltar à conversa" emoji="💬" color={KIDS.primary} onPress={onBack} />
      <Text style={[styles.title, { color: colors.foreground }]}>Meus grupos 👥</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Converse com as pessoas que seu responsável colocou nos grupos.</Text>
      {groups.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Você ainda não participa de nenhum grupo.</Text> : groups.map((group) => (
        <Pressable key={group.id} accessibilityRole="button" onPress={() => onSelect(group)} style={[styles.card, { backgroundColor: colors.card, borderColor: KIDS.aqua, borderWidth: 2 }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{group.name}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{group.members.map((member) => member.contactName).join(' · ') || 'Grupo da família'}</Text>
          <Text style={{ color: colors.primary }}>Abrir conversa ›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 64, paddingBottom: 36, gap: 12, overflow: 'hidden' },
  brandLogo: { width: '100%', height: 150, marginBottom: 4 },
  blob: { position: 'absolute', width: 240, height: 240, borderRadius: 120, opacity: 0.75 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  bigEmoji: { fontSize: 64 },
  pairCard: { borderWidth: 3, borderRadius: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontWeight: '700', marginBottom: 5 },
  title: { fontSize: 29, lineHeight: 36, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginTop: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 9 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
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

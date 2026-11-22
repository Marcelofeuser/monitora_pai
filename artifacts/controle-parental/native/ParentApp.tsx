import { ClerkProvider, useAuth, useSignIn, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Avatar, ParentThemeProvider, useParentColors as useColors, useParentTheme } from './theme';
import { createChildPairing, createChildReconnectPairing, createParentContact, createParentContactInvite, createParentGroup, fetchParentApprovedContacts, fetchParentChildLocation, fetchParentChildren, fetchParentContacts, fetchParentGroupMessages, fetchParentGroups, fetchParentMirroredConversation, fetchParentPrivateMessages, fetchParentScreenTime, fetchParentBio, updateParentBio, fetchParentChildBio, updateParentChildBio, fetchParentGuardians, uploadParentPhoto, sendParentGroupMessage, sendParentPrivateMessage, setParentChildLock, setParentContactStatus, setParentDailyLimit, type BioProfile, type ChildProfile, type NativeUploadFile, type GuardianProfile, type GroupProfile, type MirroredContact, type PairingResult, type PrivateMessageInput, type ScreenTimeStatus, setParentUnauthorizedHandler } from './api';
import { ChatChip, PrivateChat } from './PrivateChat';
import { ProfilePhoto } from './ProfilePhoto';
import { ParentLocation } from './ParentLocation';
import { NativeCallOverlay } from './NativeCallOverlay';
import { useNativeCall } from './useNativeCall';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const childDownloadUrl = process.env.EXPO_PUBLIC_CHILD_DOWNLOAD_URL?.trim()
  || 'https://baixar.amparakids.com/crianca';

const RELATIONSHIP_OPTIONS = [
  { value: 'pai', label: 'Pai' },
  { value: 'mae', label: 'Mãe' },
  { value: 'avo_m', label: 'Avô' },
  { value: 'avo_f', label: 'Avó' },
  { value: 'tio', label: 'Tio' },
  { value: 'tia', label: 'Tia' },
  { value: 'responsavel', label: 'Outro responsável' },
] as const;

type ShellInfo = { name: string; photoUrl: string | null; headers: Record<string, string>; setPhotoUrl: (url: string | null) => void };
const ShellInfoContext = createContext<ShellInfo>({ name: '', photoUrl: null, headers: {}, setPhotoUrl: () => undefined });

type FeatureKey = 'chat' | 'mirror' | 'location' | 'contacts' | 'groups' | 'screentime';
const FEATURE_BY_MENU: Record<string, FeatureKey> = {
  'Conversa': 'chat', 'Espelhamento': 'mirror', 'Localização': 'location',
  'Contatos': 'contacts', 'Grupos': 'groups', 'Tempo de uso e bloqueio': 'screentime',
};
const FEATURE_LABEL: Record<FeatureKey, string> = {
  chat: 'Conversa', mirror: 'Espelhamento', location: 'Localização',
  contacts: 'Contatos', groups: 'Grupos', screentime: 'Tempo de uso',
};

function relationshipLabel(value: string | null | undefined): string {
  return RELATIONSHIP_OPTIONS.find((option) => option.value === value)?.label ?? 'Responsável';
}

export function ParentApp() {
  return <ParentThemeProvider><ParentGate /></ParentThemeProvider>;
}

function ParentGate() {
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
  const { isLoaded, isSignedIn, getToken, signOut, userId } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const stableGetToken = useCallback(() => getTokenRef.current(), []);
  const parentMediaHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await stableGetToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [stableGetToken]);
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const { user } = useUser();
  const call = useNativeCall(isSignedIn ? { kind: 'parent', getToken: stableGetToken } : null);
  const [pairing, setPairing] = useState<PairingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildProfile | null>(null);
  const [contactChild, setContactChild] = useState<ChildProfile | null>(null);
  const [screenTimeChild, setScreenTimeChild] = useState<ChildProfile | null>(null);
  const [viewingLocation, setViewingLocation] = useState<ChildProfile | null>(null);
  const [mirrorChild, setMirrorChild] = useState<ChildProfile | null>(null);
  const [mirrorContact, setMirrorContact] = useState<MirroredContact | null>(null);
  const [groupChild, setGroupChild] = useState<ChildProfile | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupProfile | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [utilityPage, setUtilityPage] = useState<'account' | 'help' | 'profile' | 'family' | null>(null);
  const [profileChild, setProfileChild] = useState<ChildProfile | null>(null);
  const [ownPhotoUrl, setOwnPhotoUrl] = useState<string | null>(null);
  const [photoHeaders, setPhotoHeaders] = useState<Record<string, string>>({});
  const [pickerFeature, setPickerFeature] = useState<FeatureKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const handlingUnauthorized = useRef(false);
  const refreshingChildren = useRef(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [childrenLoaded, setChildrenLoaded] = useState(false);

  const refreshChildren = useCallback(async () => {
    if (!isSignedIn || refreshingChildren.current) return;
    refreshingChildren.current = true;
    try {
      const token = await getTokenRef.current();
      if (token) {
        setChildren(await fetchParentChildren(token));
        setChildrenError(null);
        setChildrenLoaded(true);
      }
    } catch (err) {
      // Falha transitória não apaga a lista já mostrada, mas o erro fica visível.
      setChildrenError(err instanceof Error ? err.message : 'Não foi possível carregar as crianças.');
    } finally {
      refreshingChildren.current = false;
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      const token = await getTokenRef.current();
      if (!token) return;
      const bio = await fetchParentBio(token);
      if (!active) return;
      setOwnPhotoUrl(bio.photoUrl ?? null);
      setPhotoHeaders({ Authorization: `Bearer ${token}` });
    })().catch(() => undefined);
    return () => { active = false; };
  }, [isSignedIn]);

  useEffect(() => {
    void refreshChildren();
    const timer = setInterval(() => void refreshChildren(), 5000);
    return () => clearInterval(timer);
  }, [refreshChildren]);

  useEffect(() => {
    setParentUnauthorizedHandler(() => {
      if (handlingUnauthorized.current) return;
      handlingUnauthorized.current = true;
      setSessionExpired(true);
      setPairing(null);
      setAddingChild(false);
      setUtilityPage(null);
      setProfileChild(null);
      setSelectedChild(null);
      setContactChild(null);
      setScreenTimeChild(null);
      setViewingLocation(null);
      setMirrorChild(null);
      setMirrorContact(null);
      setGroupChild(null);
      setSelectedGroup(null);
      void signOutRef.current().finally(() => { handlingUnauthorized.current = false; });
    });
    return () => setParentUnauthorizedHandler(null);
  }, []);

  const chooseMenu = (item: string) => {
    setMenuVisible(false);
    setError(null);
    setUtilityPage(null);
    setProfileChild(null);
    const resetRoutes = () => {
      setSelectedChild(null); setContactChild(null); setScreenTimeChild(null);
      setViewingLocation(null); setMirrorChild(null); setMirrorContact(null);
      setGroupChild(null); setSelectedGroup(null); setPairing(null); setAddingChild(false);
    };
    resetRoutes();
    if (item === 'Início') return;
    if (item === 'Conectar criança') { setAddingChild(true); return; }
    if (item === 'Minha conta') { setUtilityPage('account'); return; }
    if (item === 'Perfil') { setUtilityPage('profile'); return; }
    if (item === 'Família') { setUtilityPage('family'); return; }
    if (item === 'Ajuda/Suporte') { setUtilityPage('help'); return; }
    if (item === 'Sair') { setSessionExpired(false); void signOutRef.current(); return; }
    const feature = FEATURE_BY_MENU[item];
    if (feature) requestFeature(feature);
  };

  const openFeature = (feature: FeatureKey, child: ChildProfile) => {
    setPickerFeature(null);
    if (feature === 'chat') setSelectedChild(child);
    else if (feature === 'location') setViewingLocation(child);
    else if (feature === 'contacts') setContactChild(child);
    else if (feature === 'groups') setGroupChild(child);
    else if (feature === 'mirror') setMirrorChild(child);
    else if (feature === 'screentime') setScreenTimeChild(child);
  };

  /** Abre o recurso direto com 1 criança; com várias, pergunta qual (sem expor nomes no menu). */
  const requestFeature = (feature: FeatureKey) => {
    setError(null);
    if (children.length === 0) {
      setNotice(childrenError ? `Não consegui carregar as crianças: ${childrenError}` : childrenLoaded ? 'Nenhuma criança vinculada a esta conta. Se a criança já conectou, ela foi pareada com outra conta de responsável.' : 'Carregando crianças… tente novamente em instantes.');
      return;
    }
    setNotice(null);
    if (children.length === 1) { openFeature(feature, children[0]); return; }
    setPickerFeature(feature);
  };

  const loadMessages = useCallback(async (childId: string) => {
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentPrivateMessages(childId, token);
  }, []);

  const sendMessage = useCallback(async (childId: string, input: PrivateMessageInput) => {
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return sendParentPrivateMessage(childId, input, token);
  }, []);
  const selectedChildId = selectedChild?.id;
  const loadSelectedMessages = useCallback(() => {
    if (!selectedChildId) throw new Error('Selecione uma criança para abrir a conversa.');
    return loadMessages(selectedChildId);
  }, [loadMessages, selectedChildId]);
  const sendSelectedMessage = useCallback((input: PrivateMessageInput) => {
    if (!selectedChildId) throw new Error('Selecione uma criança para enviar a mensagem.');
    return sendMessage(selectedChildId, input);
  }, [sendMessage, selectedChildId]);
  const loadMirroredMessages = useCallback(async (contactUserId: string) => {
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return (await fetchParentMirroredConversation(contactUserId, token)).messages;
  }, []);
  const loadMirroredContacts = useCallback(async (childId: string) => {
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentApprovedContacts(childId, token);
  }, []);
  const locationChildId = viewingLocation?.id;
  const loadChildLocation = useCallback(async () => {
    if (!locationChildId) throw new Error('Selecione uma criança para consultar a localização.');
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentChildLocation(locationChildId, token);
  }, [locationChildId]);
  const selectedGroupId = selectedGroup?.id;
  const loadSelectedGroupMessages = useCallback(async () => {
    if (!selectedGroupId) throw new Error('Selecione um grupo para abrir a conversa.');
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentGroupMessages(selectedGroupId, token);
  }, [selectedGroupId]);
  const sendSelectedGroupMessage = useCallback(async (input: PrivateMessageInput) => {
    if (!selectedGroupId) throw new Error('Selecione um grupo para enviar a mensagem.');
    const token = await getTokenRef.current();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return sendParentGroupMessage(selectedGroupId, input, token);
  }, [selectedGroupId]);

  const shellInfo: ShellInfo = { name: user?.fullName || user?.firstName || 'Responsável', photoUrl: ownPhotoUrl, headers: photoHeaders, setPhotoUrl: setOwnPhotoUrl };
  return <ShellInfoContext.Provider value={shellInfo}>{renderSession()}</ShellInfoContext.Provider>;

  function renderSession() {
  if (!isLoaded) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!isSignedIn) return <ParentSignIn sessionExpired={sessionExpired} />;
  if (viewingLocation) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><ParentLocation childName={viewingLocation.name} loadLocation={loadChildLocation} onBack={() => setViewingLocation(null)} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (contactChild) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><ParentContacts child={contactChild} getToken={stableGetToken} onBack={() => setContactChild(null)} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (screenTimeChild) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><ParentScreenTime child={screenTimeChild} getToken={stableGetToken} onBack={() => setScreenTimeChild(null)} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (mirrorContact && userId) {
    const contactUserId = mirrorContact.contactUserId;
    const loadMirror = () => contactUserId ? loadMirroredMessages(contactUserId) : Promise.resolve([]);
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><PrivateChat getMediaHeaders={parentMediaHeaders} title={mirrorContact.contactName} subtitle="Espelho somente leitura · Criança e contato" ownUserId={userId} loadMessages={loadMirror} sendMessage={async () => { throw new Error('Este espelho é somente para leitura.'); }} readOnly onBack={() => setMirrorContact(null)} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (mirrorChild && userId) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><MirroredContacts child={mirrorChild} loadContacts={loadMirroredContacts} onSelect={setMirrorContact} onBack={() => setMirrorChild(null)} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (selectedGroup && groupChild && userId) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><PrivateChat getMediaHeaders={parentMediaHeaders} title={selectedGroup.name} subtitle={`Grupo · ${selectedGroup.members.map((member) => member.contactName).join(', ') || groupChild.name}`} ownUserId={userId} loadMessages={loadSelectedGroupMessages} sendMessage={sendSelectedGroupMessage} onBack={() => setSelectedGroup(null)} headerAction={<ChatChip label="Chamada de vídeo" icon="video" disabled={call.phase !== 'idle'} onPress={() => void call.startCall(groupChild.id, groupChild.name)} />} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (groupChild && userId) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><ParentGroups child={groupChild} getToken={stableGetToken} onSelect={setSelectedGroup} onBack={() => setGroupChild(null)} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }
  if (selectedChild && userId) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}><PrivateChat getMediaHeaders={parentMediaHeaders} title={selectedChild.name} ownUserId={userId} loadMessages={loadSelectedMessages} sendMessage={sendSelectedMessage} onBack={() => setSelectedChild(null)} headerAction={<ChatChip label="Chamada de vídeo" icon="video" disabled={call.phase !== 'idle'} onPress={() => void call.startCall(selectedChild.id, selectedChild.name)} />} /><NativeCallOverlay call={call} /></ParentMenuShell>;
  }

  const issuePairing = async (childName: string, childAge: string, consent: boolean) => {
    if (!consent) {
      setError('Confirme que este vínculo foi combinado com a criança.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await stableGetToken();
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

  const issueReconnect = async (child: ChildProfile) => {
    setBusy(true);
    setError(null);
    try {
      const token = await stableGetToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      setPairing(await createChildReconnectPairing(child.id, token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o código de reconexão.');
    } finally {
      setBusy(false);
    }
  };

  if (profileChild) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}>
      <ParentChildBio child={profileChild} getToken={stableGetToken} onBack={() => setProfileChild(null)} />
      <NativeCallOverlay call={call} />
    </ParentMenuShell>;
  }

  if (utilityPage) {
    return <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}>
      {utilityPage === 'profile' ? <ParentProfile children={children} getToken={stableGetToken} onEditChild={setProfileChild} onBack={() => setUtilityPage(null)} />
        : utilityPage === 'family' ? <ParentFamily children={children} getToken={stableGetToken} onEditChild={setProfileChild} onBack={() => setUtilityPage(null)} />
          : <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{utilityPage === 'account' ? 'Minha conta' : 'Ajuda e suporte'}</Text>
            {utilityPage === 'account' ? <>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>{user?.fullName || user?.firstName || 'Responsável'}</Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>{user?.primaryEmailAddress?.emailAddress || ''}</Text>
              <Pressable accessibilityRole="button" onPress={() => chooseMenu('Sair')} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Sair da conta</Text></Pressable>
            </> : <>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>Para vincular, gere um código de 8 dígitos em “Conectar criança” e digite-o no app infantil. O QR Code serve somente para baixar o app.</Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>O contato de suporte ainda não está configurado neste app.</Text>
            </>}
          </ScrollView>}
      <NativeCallOverlay call={call} />
    </ParentMenuShell>;
  }

  return (
    <ParentMenuShell colors={colors} menuVisible={menuVisible} setMenuVisible={setMenuVisible} onSelect={chooseMenu}>
    <>
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <View style={[styles.hero, { backgroundColor: colors.hero }]}>
        <Feather name="shield" size={22} color={colors.sidebarPrimary} style={styles.heroShield} />
        <Text style={[styles.heroTitle, { color: colors.heroForeground }]}>Olá, {user?.firstName || 'responsável'}</Text>
        <Text style={[styles.heroText, { color: colors.heroMuted }]}>{children.length === 0 ? 'Conecte o aparelho da criança para começar.' : 'Converse em privado e acompanhe a família com tranquilidade.'}</Text>
      </View>
      {!notice && !!childrenError && <View style={[styles.noticeBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="alert-triangle" size={16} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.foreground }]}>Falha ao carregar crianças: {childrenError}</Text>
      </View>}
      {!notice && !childrenError && childrenLoaded && children.length === 0 && <View style={[styles.noticeBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="info" size={16} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.foreground }]}>Nenhuma criança vinculada a esta conta (0 retornadas pelo servidor).</Text>
      </View>}
      {!!notice && <View style={[styles.noticeBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="info" size={16} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice}</Text>
      </View>}
      {!addingChild && !pairing && (
        <View style={styles.tileRow}>
          {([
            { key: 'chat', label: 'Conversa', icon: 'message-circle' },
            { key: 'mirror', label: 'Espelhamento', icon: 'eye' },
            { key: 'location', label: 'Localização', icon: 'map-pin' },
            { key: 'screentime', label: 'Tempo de uso', icon: 'clock' },
          ] as const).map((tile) => <Pressable key={tile.key} accessibilityRole="button" accessibilityLabel={tile.label} onPress={() => requestFeature(tile.key)} style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
            <View style={[styles.tileIcon, { backgroundColor: colors.secondary }]}><Feather name={tile.icon} size={22} color={colors.primary} /></View>
            <Text style={[styles.tileLabel, { color: colors.foreground }]}>{tile.label}</Text>
          </Pressable>)}
        </View>
      )}
      {!addingChild && !pairing && (
        <Pressable accessibilityRole="button" onPress={() => { setAddingChild(true); setPairing(null); setNotice(null); }} style={[styles.primaryButton, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}>
          <Feather name="plus-circle" size={18} color={colors.primaryForeground} />
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Conectar criança</Text>
        </Pressable>
      )}
      {pairing ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{pairing.childName ? `Conectar ${pairing.childName}` : 'Código de pareamento'}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>No app Ampara Kids, escolha conectar aparelho e digite este código.</Text>
          <Text accessibilityLabel={`Código ${pairing.pairingCode}`} style={[styles.pairingCode, { color: colors.primary }]}>{pairing.pairingCode.replace(/(\d{4})(\d{4})/, '$1 $2')}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Válido até {new Date(pairing.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. O código só pode ser usado uma vez.</Text>
          <Pressable onPress={() => { setPairing(null); setAddingChild(false); void refreshChildren(); }} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>Voltar para a família</Text></Pressable>
        </View>
      ) : addingChild ? (
        <PairingForm colors={colors} busy={busy} error={error} onSubmit={issuePairing} />
      ) : null}
    </ScrollView>
    <ChildPickerModal colors={colors} feature={pickerFeature} children={children} onClose={() => setPickerFeature(null)} onPick={(child) => pickerFeature && openFeature(pickerFeature, child)} />
    <NativeCallOverlay call={call} />
    </>
    </ParentMenuShell>
  );
  }
}

function ChildPickerModal({ colors, feature, children, onClose, onPick }: {
  colors: ReturnType<typeof useColors>;
  feature: FeatureKey | null;
  children: ChildProfile[];
  onClose: () => void;
  onPick: (child: ChildProfile) => void;
}) {
  if (!feature) return null;
  return <View style={[StyleSheet.absoluteFill, { zIndex: 90, elevation: 90 }]}>
    <View style={styles.pickerBackdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{feature ? FEATURE_LABEL[feature] : ''}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Escolha o perfil da criança.</Text>
        {children.map((child) => <Pressable key={child.id} accessibilityRole="button" onPress={() => onPick(child)} style={({ pressed }) => [styles.pickerRow, { borderColor: colors.border, backgroundColor: pressed ? colors.secondary : 'transparent' }]}>
          <Avatar label={child.name} size={38} background={colors.secondary} color={colors.primary} />
          <Text style={[styles.childName, { color: colors.foreground, flex: 1 }]}>{child.name}</Text>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>)}
      </View>
    </View>
  </View>;
}

const MENU_SECTIONS: { title: string; items: { label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] }[] = [
  { title: 'Espaço da família', items: [{ label: 'Início', icon: 'home' }, { label: 'Perfil', icon: 'user' }, { label: 'Família', icon: 'users' }] },
  { title: 'Criança', items: [{ label: 'Conversa', icon: 'message-circle' }, { label: 'Espelhamento', icon: 'eye' }, { label: 'Localização', icon: 'map-pin' }, { label: 'Tempo de uso e bloqueio', icon: 'clock' }] },
  { title: 'Controles', items: [{ label: 'Contatos', icon: 'book' }, { label: 'Grupos', icon: 'users' }, { label: 'Conectar criança', icon: 'plus-circle' }] },
  { title: 'Conta', items: [{ label: 'Minha conta', icon: 'settings' }, { label: 'Ajuda/Suporte', icon: 'help-circle' }] },
];

function BrandMark({ colors, size = 38 }: { colors: ReturnType<typeof useColors>; size?: number }) {
  return <View style={[styles.brandMark, { width: size, height: size, borderRadius: size * 0.33, backgroundColor: colors.sidebarPrimary }]}>
    <Feather name="shield" size={size * 0.52} color="#263345" />
    <Feather name="check" size={size * 0.26} color="#263345" style={styles.brandCheck} />
  </View>;
}

function ParentMenuShell({ colors, menuVisible, setMenuVisible, onSelect, children }: {
  colors: ReturnType<typeof useColors>;
  menuVisible: boolean;
  setMenuVisible: (visible: boolean) => void;
  onSelect: (item: string) => void;
  children: React.ReactNode;
}) {
  const { mode, toggle } = useParentTheme();
  const info = useContext(ShellInfoContext);
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(300, Dimensions.get('window').width * 0.82);
  const slide = useRef(new Animated.Value(-drawerWidth)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (menuVisible) {
      setMounted(true);
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slide, { toValue: -drawerWidth, duration: 170, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [menuVisible, mounted, slide, drawerWidth]);

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[styles.menuHeader, { backgroundColor: colors.header, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu" hitSlop={8} onPress={() => setMenuVisible(true)} style={[styles.roundButton, { backgroundColor: colors.muted }]}>
        <Feather name="menu" size={21} color={colors.headerForeground} />
      </Pressable>
      <BrandMark colors={colors} size={36} />
      <Text style={[styles.menuBrand, { color: colors.headerForeground }]}>ampara</Text>
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} hitSlop={8} onPress={toggle} style={[styles.roundButton, { backgroundColor: colors.muted }]}>
        <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={19} color={colors.headerForeground} />
      </Pressable>
    </View>
    <View style={{ flex: 1 }}>{children}</View>
    {mounted && <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Animated.View style={[styles.drawer, { width: drawerWidth, backgroundColor: colors.sidebar, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 14, transform: [{ translateX: slide }] }]}>
          <View style={styles.drawerBrand}>
            <BrandMark colors={colors} size={36} />
            <Text style={[styles.drawerTitle, { color: colors.sidebarForeground }]}>ampara</Text>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu" hitSlop={10} onPress={() => setMenuVisible(false)} style={styles.drawerClose}><Feather name="x" size={20} color={colors.sidebarForeground} /></Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onSelect('Perfil')} style={[styles.profileCard, { backgroundColor: colors.sidebarAccent, borderColor: colors.sidebarBorder }]}>
            <ProfilePhoto name={info.name} photoUrl={info.photoUrl} headers={info.headers} size={42} background="#EAB86138" color={colors.sidebarPrimary} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.profileName, { color: colors.sidebarForeground }]}>{info.name || 'Seu perfil'}</Text>
              <Text numberOfLines={1} style={[styles.profileSub, { color: colors.sidebarMuted }]}>Responsável</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.sidebarMuted} />
          </Pressable>
          <ScrollView showsVerticalScrollIndicator={false}>
            {MENU_SECTIONS.map((section) => <View key={section.title}>
              <Text style={[styles.drawerSection, { color: colors.sidebarMuted }]}>{section.title.toUpperCase()}</Text>
              {section.items.map((item) => <Pressable key={item.label} accessibilityRole="button" onPress={() => onSelect(item.label)} style={({ pressed }) => [styles.drawerItem, pressed && { backgroundColor: colors.sidebarAccent }]}>
                <Feather name={item.icon} size={19} color={colors.sidebarPrimary} />
                <Text style={[styles.drawerItemText, { color: colors.sidebarForeground }]}>{item.label}</Text>
              </Pressable>)}
            </View>)}
          </ScrollView>
          <View style={[styles.drawerFooter, { borderTopColor: colors.sidebarBorder }]}>
            <Pressable accessibilityRole="button" onPress={() => onSelect('Sair')} style={styles.drawerSignOut}>
              <Feather name="log-out" size={16} color={colors.sidebarMuted} />
              <Text style={[styles.drawerSignOutText, { color: colors.sidebarMuted }]}>Sair da conta</Text>
            </Pressable>
          </View>
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu" onPress={() => setMenuVisible(false)} style={styles.drawerScrim} />
      </View>
    </View>}
  </View>;
}

function ParentProfile({ children: kids, getToken, onEditChild, onBack }: {
  children: ChildProfile[];
  getToken: () => Promise<string | null>;
  onEditChild: (child: ChildProfile) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const [profile, setProfile] = useState<BioProfile | null>(null);
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [other, setOther] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useContext(ShellInfoContext);

  const uploadPhoto = async (file: NativeUploadFile) => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    const result = await uploadParentPhoto(file, token);
    info.setPhotoUrl(result.photoUrl);
    setProfile((current) => current ? { ...current, photoUrl: result.photoUrl } : current);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      const result = await fetchParentBio(token);
      if (!active) return;
      setProfile(result);
      setRelationship(result.relationship ?? '');
      setPhone(result.phone ?? '');
      setEmail(result.email ?? '');
      setInstagram(result.socialLinks?.instagram ?? '');
      setWhatsapp(result.socialLinks?.whatsapp ?? '');
      setOther(result.socialLinks?.other ?? '');
    })().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu perfil.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getToken]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      const result = await updateParentBio({
        relationship: relationship || undefined,
        phone: phone.trim() || null,
        email: email.trim() || null,
        socialLinks: { instagram: instagram.trim(), whatsapp: whatsapp.trim(), other: other.trim() },
      }, token);
      setProfile(result);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o perfil.');
    } finally {
      setBusy(false);
    }
  };

  return <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Perfil</Text>
    <Text style={[styles.body, { color: colors.mutedForeground }]}>Informe como você participa da família e os dados que quer compartilhar.</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : <>
      <View style={styles.photoRow}>
        <ProfilePhoto name={profile?.name ?? info.name} photoUrl={profile?.photoUrl ?? info.photoUrl} headers={info.headers} size={84} background={colors.secondary} color={colors.primary} badge={colors.primary} onUpload={uploadPhoto} onError={setError} />
        <View style={{ flex: 1 }}>
          {!!profile && <Text style={[styles.childName, { color: colors.foreground }]}>{profile.name}</Text>}
          <Text style={[styles.body, { color: colors.mutedForeground, marginBottom: 0 }]}>Toque na câmera para colocar ou trocar sua foto.</Text>
        </View>
      </View>
      <Text style={[styles.label, { color: colors.foreground }]}>Como você é responsável</Text>
      <View style={styles.optionRow}>
        {RELATIONSHIP_OPTIONS.map((option) => <Pressable key={option.value} onPress={() => setRelationship(option.value)} style={[styles.optionButton, { borderColor: relationship === option.value ? colors.primary : colors.border, backgroundColor: relationship === option.value ? colors.primary : colors.card }]}>
          <Text style={{ color: relationship === option.value ? colors.primaryForeground : colors.foreground, fontSize: 13, fontWeight: '600' }}>{option.label}</Text>
        </Pressable>)}
      </View>
      <Text style={[styles.label, { color: colors.foreground }]}>Telefone</Text>
      <TextInput value={phone} onChangeText={setPhone} placeholder="(00) 00000-0000" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="voce@email.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Instagram</Text>
      <TextInput value={instagram} onChangeText={setInstagram} placeholder="@usuario" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>WhatsApp ou outro contato</Text>
      <TextInput value={whatsapp} onChangeText={setWhatsapp} placeholder="Número ou link" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Outro link</Text>
      <TextInput value={other} onChangeText={setOther} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {saved && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.primary, fontWeight: '700' }]}>Perfil salvo.</Text>}
      <Pressable disabled={busy} onPress={() => void save()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}>
        {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Salvar perfil</Text>}
      </Pressable>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 22 }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Perfil das crianças</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Edite a bio de cada criança e escolha se ela pode alterar a própria bio.</Text>
        {kids.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Nenhuma criança vinculada.</Text> : kids.map((kid) => <View key={kid.id} style={[styles.familyRow, { borderBottomColor: colors.border }]}>
          <Avatar label={kid.name} size={38} background={colors.secondary} color={colors.primary} />
          <Text style={[styles.childName, { color: colors.foreground, flex: 1 }]}>{kid.name}</Text>
          <Pressable accessibilityRole="button" onPress={() => onEditChild(kid)} style={[styles.smallButton, { borderColor: colors.border }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>Editar perfil</Text></Pressable>
        </View>)}
      </View>
    </>}
    <Pressable onPress={onBack} style={styles.linkButton}><Text style={{ color: colors.primary }}>Voltar</Text></Pressable>
  </ScrollView>;
}

function ParentFamily({ children, getToken, onEditChild, onBack }: {
  children: ChildProfile[];
  getToken: () => Promise<string | null>;
  onEditChild: (child: ChildProfile) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const [guardians, setGuardians] = useState<GuardianProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      const result = await fetchParentGuardians(token);
      if (active) setGuardians(result);
    })().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os responsáveis.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getToken]);

  return <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Família</Text>
    <Text style={[styles.body, { color: colors.mutedForeground }]}>Aqui ficam os responsáveis e as crianças vinculadas ao seu plano. {guardians.length} responsável(is) · {children.length} criança(s).</Text>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Responsáveis</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : guardians.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Você é o primeiro responsável deste espaço.</Text> : guardians.map((guardian) => <View key={guardian.id} style={[styles.familyRow, { borderBottomColor: colors.border }]}>
        <Avatar label={guardian.name} size={38} background={colors.secondary} color={colors.primary} />
        <View style={{ flex: 1 }}><Text style={[styles.childName, { color: colors.foreground }]}>{guardian.name}</Text><Text style={[styles.body, { color: colors.mutedForeground, marginBottom: 0 }]}>{guardian.role === 'owner' ? 'Titular' : 'Responsável'} · {relationshipLabel(guardian.relationship)}</Text></View>
      </View>)}
    </View>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Crianças</Text>
      {children.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Nenhuma criança vinculada.</Text> : children.map((child) => <View key={child.id} style={[styles.familyRow, { borderBottomColor: colors.border }]}>
        <Avatar label={child.name} size={38} background={colors.secondary} color={colors.primary} />
        <View style={{ flex: 1 }}><Text style={[styles.childName, { color: colors.foreground }]}>{child.name}</Text><Text style={[styles.body, { color: colors.mutedForeground, marginBottom: 0 }]}>Perfil infantil do espaço familiar</Text></View>
        <Pressable onPress={() => onEditChild(child)} style={[styles.smallButton, { borderColor: colors.border }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>Editar bio</Text></Pressable>
      </View>)}
    </View>
    {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    <Pressable onPress={onBack} style={styles.linkButton}><Text style={{ color: colors.primary }}>Voltar</Text></Pressable>
  </ScrollView>;
}

function ParentChildBio({ child, getToken, onBack }: {
  child: ChildProfile;
  getToken: () => Promise<string | null>;
  onBack: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState(child.name);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [other, setOther] = useState('');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      const result = await fetchParentChildBio(child.id, token);
      if (!active) return;
      setName(result.name);
      setPhone(result.phone ?? '');
      setEmail(result.email ?? '');
      setInstagram(result.socialLinks?.instagram ?? '');
      setWhatsapp(result.socialLinks?.whatsapp ?? '');
      setOther(result.socialLinks?.other ?? '');
      setLocked(Boolean(result.bioLocked));
    })().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a bio da criança.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [child.id, getToken]);

  const save = async () => {
    if (busy || name.trim().length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      await updateParentChildBio(child.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        socialLinks: { instagram: instagram.trim(), whatsapp: whatsapp.trim(), other: other.trim() },
        bioLocked: locked,
      }, token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a bio da criança.');
    } finally {
      setBusy(false);
    }
  };

  return <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Bio de {child.name}</Text>
    <Text style={[styles.body, { color: colors.mutedForeground }]}>O responsável pode editar estes dados e decidir se a criança poderá alterá-los.</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : <>
      <Text style={[styles.label, { color: colors.foreground }]}>Nome</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Nome" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Telefone</Text>
      <TextInput value={phone} onChangeText={setPhone} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Instagram</Text>
      <TextInput value={instagram} onChangeText={setInstagram} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>WhatsApp ou outro contato</Text>
      <TextInput value={whatsapp} onChangeText={setWhatsapp} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>Outro link</Text>
      <TextInput value={other} onChangeText={setOther} placeholder="Opcional" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <Pressable onPress={() => setLocked((value) => !value)} style={[styles.statusRow, { borderColor: locked ? colors.primary : colors.border, backgroundColor: locked ? colors.primary : colors.card }]} accessibilityRole="switch" accessibilityState={{ checked: locked }}>
        <Text style={{ color: locked ? colors.primaryForeground : colors.foreground, fontWeight: '700' }}>{locked ? 'Bio bloqueada para a criança' : 'Bio liberada para a criança'}</Text>
        <Text style={{ color: locked ? colors.primaryForeground : colors.mutedForeground, fontSize: 12 }}>{locked ? 'Toque para permitir edição' : 'Toque para bloquear alterações'}</Text>
      </Pressable>
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      <Pressable disabled={busy} onPress={() => void save()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}>
        {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Salvar bio</Text>}
      </Pressable>
    </>}
    <Pressable onPress={onBack} style={styles.linkButton}><Text style={{ color: colors.primary }}>Voltar para Família</Text></Pressable>
  </ScrollView>;
}

function ParentContacts({ child, getToken, onBack }: {
  child: ChildProfile;
  getToken: () => Promise<string | null>;
  onBack: () => void;
}) {
  const colors = useColors();
  const [contacts, setContacts] = useState<MirroredContact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [invite, setInvite] = useState<{ contactId: string; contactName: string; joinUrl: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    setContacts(await fetchParentContacts(child.id, token));
  }, [child.id, getToken]);

  useEffect(() => {
    let active = true;
    void refresh().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os contatos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const add = async () => {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      await createParentContact({
        childId: child.id,
        contactName: name.trim(),
        ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
        ...(relation.trim() ? { relation: relation.trim() } : {}),
      }, token);
      setName('');
      setPhone('');
      setRelation('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o contato.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (contact: MirroredContact, status: 'approved' | 'revoked') => {
    const action = status === 'revoked' ? 'bloquear' : 'reativar';
    Alert.alert(`${action.charAt(0).toUpperCase()}${action.slice(1)} contato?`, `${contact.contactName} ${status === 'revoked' ? 'perderá o acesso às conversas e grupos desta criança.' : 'voltará a poder conversar com esta criança.'}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: action.charAt(0).toUpperCase() + action.slice(1), style: status === 'revoked' ? 'destructive' : 'default', onPress: () => {
        void (async () => {
          setBusy(true);
          setError(null);
          try {
            const token = await getToken();
            if (!token) throw new Error('A sessão expirou. Entre novamente.');
            await setParentContactStatus(contact.id, status, token);
            setInvite(null);
            await refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o contato.');
          } finally {
            setBusy(false);
          }
        })();
      } },
    ]);
  };

  const makeInvite = async (contact: MirroredContact) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      const created = await createParentContactInvite(contact.id, token);
      setInvite({ contactId: contact.id, contactName: created.contactName, joinUrl: created.joinUrl, expiresAt: created.expiresAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o convite.');
    } finally {
      setBusy(false);
    }
  };

  const statusText: Record<string, string> = { approved: 'Aprovado', pending: 'Pendente', denied: 'Recusado', revoked: 'Bloqueado' };
  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: colors.primary }}>‹ Voltar à família</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Contatos · {child.name}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Cadastre pessoas autorizadas. Cada contato poderá entrar pelo link de convite para conversar no app.</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : contacts.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Ainda não há contatos cadastrados.</Text> : contacts.map((contact) => (
        <View key={contact.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{contact.contactName}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Status: {statusText[contact.status] ?? contact.status}</Text>
          {contact.status === 'approved' && !contact.contactUserId && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void makeInvite(contact)} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={{ color: colors.primary }}>Gerar convite por QR</Text></Pressable>}
          {(contact.status === 'approved' || contact.status === 'pending') && <Pressable accessibilityRole="button" disabled={busy} onPress={() => changeStatus(contact, 'revoked')} style={styles.reconnectButton}><Text style={{ color: colors.destructive }}>Bloquear</Text></Pressable>}
          {(contact.status === 'revoked' || contact.status === 'denied') && <Pressable accessibilityRole="button" disabled={busy} onPress={() => changeStatus(contact, 'approved')} style={styles.reconnectButton}><Text style={{ color: colors.primary }}>Reativar acesso</Text></Pressable>}
        </View>
      ))}
      {invite && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Convite para {invite.contactName}</Text>
          <View style={styles.qr}><QRCode value={invite.joinUrl} size={190} /></View>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Este link é válido até {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}.</Text>
          <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `Entre no Ampara Kids pelo convite de ${child.name}: ${invite.joinUrl}` })} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Compartilhar convite</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setInvite(null)} style={styles.reconnectButton}><Text style={{ color: colors.primary }}>Fechar convite</Text></Pressable>
        </View>
      )}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Adicionar contato</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Nome</Text>
        <TextInput value={name} onChangeText={setName} maxLength={120} placeholder="Nome da pessoa" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Telefone (opcional)</Text>
        <TextInput value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" placeholder="(00) 00000-0000" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Relação (opcional)</Text>
        <TextInput value={relation} onChangeText={setRelation} maxLength={60} placeholder="Ex.: avó, tio, amigo" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy || name.trim().length < 2} onPress={() => void add()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy || name.trim().length < 2 ? 0.55 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Adicionar e autorizar</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ParentScreenTime({ child, getToken, onBack }: {
  child: ChildProfile;
  getToken: () => Promise<string | null>;
  onBack: () => void;
}) {
  const colors = useColors();
  const [status, setStatus] = useState<ScreenTimeStatus | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    const next = await fetchParentScreenTime(child.id, token);
    setStatus(next);
    setLimitInput(next.dailyLimitMinutes == null ? '' : String(next.dailyLimitMinutes));
  }, [child.id, getToken]);

  useEffect(() => {
    let active = true;
    void refresh().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o tempo de uso.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const saveLimit = async () => {
    if (busy) return;
    const trimmed = limitInput.trim();
    const limit = trimmed ? Number(trimmed) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1440)) {
      setError('Informe um limite entre 1 e 1440 minutos, ou deixe em branco para remover o limite.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      await setParentDailyLimit(child.id, limit, token);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o limite.');
    } finally {
      setBusy(false);
    }
  };

  const toggleManualLock = () => {
    if (!status || busy || status.lockReason === 'limit') return;
    const locked = status.lockReason !== 'manual';
    Alert.alert(locked ? 'Bloquear agora?' : 'Desbloquear agora?', locked
      ? `O app da criança ficará bloqueado até você liberar o acesso.`
      : `A criança poderá voltar a usar o app, desde que o limite diário não tenha sido atingido.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: locked ? 'Bloquear' : 'Desbloquear', style: locked ? 'destructive' : 'default', onPress: () => {
        void (async () => {
          setBusy(true);
          setError(null);
          try {
            const token = await getToken();
            if (!token) throw new Error('A sessão expirou. Entre novamente.');
            await setParentChildLock(child.id, locked, token);
            await refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o bloqueio.');
          } finally {
            setBusy(false);
          }
        })();
      } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: colors.primary }}>‹ Voltar à família</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Tempo de uso · {child.name}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Acompanhe o uso do app e defina um limite diário. O bloqueio se aplica enquanto a criança usa o app Ampara.</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : status && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Uso de hoje</Text>
          <Text style={[styles.title, { color: colors.primary }]}>{status.minutesUsedToday} min</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{status.dailyLimitMinutes == null ? 'Sem limite diário definido.' : `Limite: ${status.dailyLimitMinutes} min por dia.`}</Text>
          {status.locked && <Text style={[styles.error, { color: colors.destructive }]}>{status.lockReason === 'manual' ? 'Acesso bloqueado manualmente.' : 'Limite diário atingido; o acesso ficará bloqueado até a virada do dia.'}</Text>}
          <Pressable accessibilityRole="button" disabled={busy || status.lockReason === 'limit'} onPress={toggleManualLock} style={[styles.primaryButton, { backgroundColor: status.lockReason === 'manual' ? colors.primary : colors.destructive, opacity: busy || status.lockReason === 'limit' ? 0.55 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{status.lockReason === 'manual' ? 'Desbloquear agora' : status.lockReason === 'limit' ? 'Limite atingido' : 'Bloquear agora'}</Text>}
          </Pressable>
        </View>
      )}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Limite diário</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Defina de 1 a 1440 minutos. Deixe vazio para remover o limite.</Text>
        <TextInput value={limitInput} onChangeText={(value) => setLimitInput(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="Ex.: 90 minutos" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveLimit()} style={[styles.secondaryButton, { borderColor: colors.border, opacity: busy ? 0.55 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: '700' }}>Salvar limite</Text>}
        </Pressable>
      </View>
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    </ScrollView>
  );
}

function ParentGroups({ child, getToken, onSelect, onBack }: {
  child: ChildProfile;
  getToken: () => Promise<string | null>;
  onSelect: (group: GroupProfile) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const [groups, setGroups] = useState<GroupProfile[]>([]);
  const [contacts, setContacts] = useState<MirroredContact[]>([]);
  const [name, setName] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    const [nextGroups, nextContacts] = await Promise.all([
      fetchParentGroups(child.id, token),
      fetchParentApprovedContacts(child.id, token),
    ]);
    setGroups(nextGroups);
    setContacts(nextContacts.filter((contact) => contact.status === 'approved'));
  }, [child.id, getToken]);

  useEffect(() => {
    let active = true;
    void refresh().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os grupos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const create = async () => {
    if (busy || name.trim().length < 1 || selectedContactIds.length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      await createParentGroup(child.id, name.trim(), selectedContactIds, token);
      setName('');
      setSelectedContactIds([]);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o grupo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: colors.primary }}>‹ Voltar à família</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Grupos · {child.name}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Escolha somente contatos aprovados para criar grupos. A criança poderá conversar com os participantes no app dela.</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : groups.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Ainda não há grupos.</Text> : groups.map((group) => (
        <Pressable key={group.id} accessibilityRole="button" onPress={() => onSelect(group)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{group.name}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{group.members.map((member) => member.contactName).join(' · ')}</Text>
          <Text style={{ color: colors.primary }}>Abrir conversa ›</Text>
        </Pressable>
      ))}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Criar grupo</Text>
        <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="Nome do grupo" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        {contacts.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 10 }]}>Adicione contatos aprovados pelo app/site para incluí-los em um grupo.</Text> : contacts.map((contact) => {
          const checked = selectedContactIds.includes(contact.id);
          return <Pressable key={contact.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setSelectedContactIds((current) => checked ? current.filter((id) => id !== contact.id) : [...current, contact.id])} style={styles.consentRow}>
            <View style={[styles.checkbox, { borderColor: colors.primary, backgroundColor: checked ? colors.primary : 'transparent' }]} />
            <Text style={[styles.consentText, { color: colors.foreground }]}>{contact.contactName}</Text>
          </Pressable>;
        })}
        {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy || !name.trim() || !selectedContactIds.length} onPress={() => void create()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy || !name.trim() || !selectedContactIds.length ? 0.55 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Criar grupo</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function MirroredContacts({ child, loadContacts, onSelect, onBack }: {
  child: ChildProfile;
  loadContacts: (childId: string) => Promise<MirroredContact[]>;
  onSelect: (contact: MirroredContact) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const [contacts, setContacts] = useState<MirroredContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadContacts(child.id).then((result) => {
      if (active) setContacts(result.filter((contact) => contact.contactUserId));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os contatos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [child.id, loadContacts]);

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: colors.primary }}>‹ Voltar</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Espelho de {child.name}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Conversas da criança com contatos aprovados. Somente leitura; o chat privado da família não aparece aqui.</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : contacts.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Ainda não há contatos aprovados com conta conectada.</Text> : contacts.map((contact) => (
        <Pressable key={contact.id} accessibilityRole="button" onPress={() => onSelect(contact)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{contact.contactName}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Abrir conversa espelhada ›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ParentSignIn({ sessionExpired = false }: { sessionExpired?: boolean }) {
  const colors = useColors();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<'sign-in' | 'code' | 'new-password'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(sessionExpired ? 'Sua sessão expirou. Entre novamente.' : null);
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

  const sendResetCode = async () => {
    if (!signIn || !email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) throw new Error(created.error.message);
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) throw new Error(sent.error.message);
      setResetStep('code');
      setNotice('Enviamos um código de recuperação para o e-mail da conta.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o código.');
    } finally {
      setBusy(false);
    }
  };

  const verifyResetCode = async () => {
    if (!signIn || !resetCode.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({ code: resetCode.trim() });
      if (result.error) throw new Error(result.error.message);
      if (signIn.status !== 'needs_new_password') {
        throw new Error('Não foi possível confirmar o código. Solicite um novo código e tente novamente.');
      }
      setResetStep('new-password');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o código.');
    } finally {
      setBusy(false);
    }
  };

  const saveNewPassword = async () => {
    if (!signIn || newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      if (result.error) throw new Error(result.error.message);
      if (signIn.status !== 'complete') {
        throw new Error('A senha foi processada, mas a autenticação ainda exige outra etapa.');
      }
      const completed = await signIn.finalize();
      if (completed.error) throw new Error(completed.error.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.');
    } finally {
      setBusy(false);
    }
  };

  const returnToSignIn = () => {
    setResetStep('sign-in');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setNotice(null);
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <View style={styles.brandLogoCard}><Image accessibilityLabel="Logo Ampara" resizeMode="contain" source={require('../assets/images/logo-ampara-solid.png')} style={styles.brandLogoSolid} /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>{resetStep === 'sign-in' ? 'Entre na sua conta' : 'Recuperar senha'}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {resetStep === 'sign-in'
          ? 'Use a mesma conta do Ampara. O app da criança entra por pareamento, sem conta de adulto.'
          : resetStep === 'code'
            ? 'Digite o código enviado ao e-mail associado à sua conta.'
            : 'Escolha uma nova senha com pelo menos 8 caracteres.'}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
        <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} editable={resetStep === 'sign-in' || resetStep === 'code'} placeholder="voce@email.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        {resetStep === 'sign-in' && <>
          <Text style={[styles.label, { color: colors.foreground }]}>Senha</Text>
          <TextInput secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Sua senha" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        </>}
        {resetStep === 'code' && <>
          <Text style={[styles.label, { color: colors.foreground }]}>Código de recuperação</Text>
          <TextInput autoCapitalize="none" autoComplete="one-time-code" keyboardType="number-pad" value={resetCode} onChangeText={setResetCode} placeholder="Código recebido por e-mail" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        </>}
        {resetStep === 'new-password' && <>
          <Text style={[styles.label, { color: colors.foreground }]}>Nova senha</Text>
          <TextInput secureTextEntry autoComplete="new-password" value={newPassword} onChangeText={setNewPassword} placeholder="Mínimo de 8 caracteres" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.label, { color: colors.foreground }]}>Confirme a nova senha</Text>
          <TextInput secureTextEntry autoComplete="new-password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Digite novamente" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        </>}
        {notice && <Text style={[styles.body, { color: colors.primary, marginTop: 12 }]}>{notice}</Text>}
        {(error || (resetStep === 'sign-in' && errors.fields.identifier?.message) || fetchStatus === 'fetching') && <Text style={[styles.error, { color: colors.destructive }]}>{error || errors.fields.identifier?.message || 'Conectando…'}</Text>}
        <Pressable
          disabled={busy || (resetStep === 'sign-in' ? !email.trim() || !password : resetStep === 'code' ? !email.trim() || !resetCode.trim() : !newPassword || !confirmPassword)}
          onPress={() => void (resetStep === 'sign-in' ? submit() : resetStep === 'code' ? verifyResetCode() : saveNewPassword())}
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}
        >
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{resetStep === 'sign-in' ? 'Entrar' : resetStep === 'code' ? 'Confirmar código' : 'Salvar nova senha'}</Text>}
        </Pressable>
        {resetStep === 'sign-in' ? (
          <Pressable disabled={busy} onPress={() => { if (!email.trim()) { setNotice(null); setError('Digite o e-mail da conta acima e toque em "Esqueci minha senha" de novo.'); return; } void sendResetCode(); }} style={styles.linkButton}>
            <Text style={[styles.body, { color: colors.primary, textAlign: 'center', marginBottom: 0 }]}>Esqueci minha senha</Text>
          </Pressable>
        ) : (
          <Pressable disabled={busy} onPress={returnToSignIn} style={styles.linkButton}>
            <Text style={[styles.body, { color: colors.primary, textAlign: 'center', marginBottom: 0 }]}>Voltar ao login</Text>
          </Pressable>
        )}
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
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>1. Baixe o app da criança</Text>
      {childDownloadUrl ? <><View style={styles.qr}><QRCode value={childDownloadUrl} size={176} /></View><Text style={[styles.body, { color: colors.mutedForeground }]}>Escaneie com o aparelho da criança. O QR abre a página de download do Ampara Kids.</Text></> : <Text style={[styles.body, { color: colors.mutedForeground }]}>O QR de download aparecerá quando a página do Ampara estiver configurada.</Text>}
      <Text style={[styles.cardTitle, { color: colors.foreground, marginTop: 18 }]}>2. Informe os dados da criança</Text>
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
        {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Gerar código para conectar o app</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 32, paddingBottom: 36, gap: 12 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  roundButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  brandMark: { alignItems: 'center', justifyContent: 'center' },
  brandCheck: { position: 'absolute' },
  drawer: { height: '100%', paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 12 },
  drawerScrim: { flex: 1, backgroundColor: 'rgba(24,32,42,0.45)' },
  drawerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 18 },
  drawerClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  drawerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 6 },
  profileName: { fontSize: 14, fontWeight: '800' },
  profileSub: { fontSize: 12, marginTop: 2 },
  drawerSection: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 6 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46, paddingHorizontal: 12, borderRadius: 12 },
  drawerItemText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  drawerFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  drawerSignOut: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 40 },
  drawerSignOutText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  heroShield: { position: 'absolute', top: 18, right: 18 },
  hero: { borderRadius: 22, padding: 22, marginBottom: 14 },
  heroTitle: { fontSize: 26, fontWeight: '800' },
  heroText: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  noticeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  tile: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 6 },
  tileIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pickerBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 10 },
  menuButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'flex-start' },
  menuGlyph: { fontSize: 25, fontWeight: '600' },
  menuBrand: { fontSize: 24, fontWeight: '800', letterSpacing: -0.8 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14 },
  menuPanel: { width: 300, maxHeight: '88%', borderWidth: 1, borderRadius: 18, paddingHorizontal: 16 },
  menuItem: { minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  menuItemText: { fontSize: 15, fontWeight: '600' },
  brandLogo: { width: '100%', height: 96, marginBottom: 6 },
  brandLogoCard: { alignSelf: 'stretch', backgroundColor: '#FEFCF7', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14, alignItems: 'center' },
  brandLogoSolid: { width: '100%', height: 84 },
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
  qr: { alignItems: 'center', padding: 14 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  actionButton: { minHeight: 48, flexGrow: 1, minWidth: 96, paddingHorizontal: 14, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton: { paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderRadius: 12 },
  familyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  smallButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  statusRow: { borderWidth: 1, borderRadius: 13, padding: 13, gap: 4, marginTop: 16 },
  childRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  childMain: { minHeight: 60, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationLink: { paddingHorizontal: 8, paddingVertical: 12 },
  childAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  childName: { flex: 1, fontSize: 15, fontWeight: '600' },
  reconnectButton: { paddingVertical: 9 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
});

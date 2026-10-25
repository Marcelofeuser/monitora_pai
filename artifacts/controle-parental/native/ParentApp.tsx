import { ClerkProvider, useAuth, useSignIn, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@/hooks/useColors';
import { createChildPairing, createChildReconnectPairing, createParentContact, createParentContactInvite, createParentGroup, fetchParentApprovedContacts, fetchParentChildLocation, fetchParentChildren, fetchParentContacts, fetchParentGroupMessages, fetchParentGroups, fetchParentMirroredConversation, fetchParentPrivateMessages, fetchParentScreenTime, sendParentGroupMessage, sendParentPrivateMessage, setParentChildLock, setParentContactStatus, setParentDailyLimit, type ChildProfile, type GroupProfile, type MirroredContact, type PairingResult, type PrivateMessageInput, type ScreenTimeStatus } from './api';
import { PrivateChat } from './PrivateChat';
import { ParentLocation } from './ParentLocation';
import { NativeCallOverlay } from './NativeCallOverlay';
import { useNativeCall } from './useNativeCall';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const childDownloadUrl = process.env.EXPO_PUBLIC_CHILD_DOWNLOAD_URL?.trim()
  || 'https://baixar.amparakids.com/crianca';

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
  const { isLoaded, isSignedIn, getToken, signOut, userId } = useAuth();
  const { user } = useUser();
  const call = useNativeCall(isSignedIn ? { kind: 'parent', getToken } : null);
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

  const refreshChildren = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      if (token) setChildren(await fetchParentChildren(token));
    } catch {
      // Falha transitória não apaga a lista já mostrada.
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    void refreshChildren();
    const timer = setInterval(() => void refreshChildren(), 5000);
    return () => clearInterval(timer);
  }, [refreshChildren]);

  const loadMessages = useCallback(async (childId: string) => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentPrivateMessages(childId, token);
  }, [getToken]);

  const sendMessage = useCallback(async (childId: string, input: PrivateMessageInput) => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return sendParentPrivateMessage(childId, input, token);
  }, [getToken]);
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
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return (await fetchParentMirroredConversation(contactUserId, token)).messages;
  }, [getToken]);
  const loadMirroredContacts = useCallback(async (childId: string) => {
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentApprovedContacts(childId, token);
  }, [getToken]);
  const locationChildId = viewingLocation?.id;
  const loadChildLocation = useCallback(async () => {
    if (!locationChildId) throw new Error('Selecione uma criança para consultar a localização.');
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentChildLocation(locationChildId, token);
  }, [getToken, locationChildId]);
  const selectedGroupId = selectedGroup?.id;
  const loadSelectedGroupMessages = useCallback(async () => {
    if (!selectedGroupId) throw new Error('Selecione um grupo para abrir a conversa.');
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return fetchParentGroupMessages(selectedGroupId, token);
  }, [getToken, selectedGroupId]);
  const sendSelectedGroupMessage = useCallback(async (input: PrivateMessageInput) => {
    if (!selectedGroupId) throw new Error('Selecione um grupo para enviar a mensagem.');
    const token = await getToken();
    if (!token) throw new Error('A sessão expirou. Entre novamente.');
    return sendParentGroupMessage(selectedGroupId, input, token);
  }, [getToken, selectedGroupId]);

  if (!isLoaded) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!isSignedIn) return <ParentSignIn />;
  if (viewingLocation) {
    return <><ParentLocation childName={viewingLocation.name} loadLocation={loadChildLocation} onBack={() => setViewingLocation(null)} /><NativeCallOverlay call={call} /></>;
  }
  if (contactChild) {
    return <><ParentContacts child={contactChild} getToken={getToken} onBack={() => setContactChild(null)} /><NativeCallOverlay call={call} /></>;
  }
  if (screenTimeChild) {
    return <><ParentScreenTime child={screenTimeChild} getToken={getToken} onBack={() => setScreenTimeChild(null)} /><NativeCallOverlay call={call} /></>;
  }
  if (mirrorContact && userId) {
    const contactUserId = mirrorContact.contactUserId;
    const loadMirror = () => contactUserId ? loadMirroredMessages(contactUserId) : Promise.resolve([]);
    return <><PrivateChat title={mirrorContact.contactName} subtitle="Espelho somente leitura · Criança e contato" ownUserId={userId} loadMessages={loadMirror} sendMessage={async () => { throw new Error('Este espelho é somente para leitura.'); }} readOnly onBack={() => setMirrorContact(null)} /><NativeCallOverlay call={call} /></>;
  }
  if (mirrorChild && userId) {
    return <><MirroredContacts child={mirrorChild} loadContacts={loadMirroredContacts} onSelect={setMirrorContact} onBack={() => setMirrorChild(null)} /><NativeCallOverlay call={call} /></>;
  }
  if (selectedGroup && groupChild && userId) {
    return <><PrivateChat title={selectedGroup.name} subtitle={`Grupo · ${selectedGroup.members.map((member) => member.contactName).join(', ') || groupChild.name}`} ownUserId={userId} loadMessages={loadSelectedGroupMessages} sendMessage={sendSelectedGroupMessage} onBack={() => setSelectedGroup(null)} headerAction={<Pressable accessibilityRole="button" disabled={call.phase !== 'idle'} onPress={() => void call.startCall(groupChild.id, groupChild.name)}><Text style={{ color: colors.primary, fontWeight: '700' }}>Ligar para {groupChild.name}</Text></Pressable>} /><NativeCallOverlay call={call} /></>;
  }
  if (groupChild && userId) {
    return <><ParentGroups child={groupChild} getToken={getToken} onSelect={setSelectedGroup} onBack={() => setGroupChild(null)} /><NativeCallOverlay call={call} /></>;
  }
  if (selectedChild && userId) {
    return <><PrivateChat title={selectedChild.name} ownUserId={userId} loadMessages={loadSelectedMessages} sendMessage={sendSelectedMessage} onBack={() => setSelectedChild(null)} headerAction={<Pressable accessibilityRole="button" disabled={call.phase !== 'idle'} onPress={() => void call.startCall(selectedChild.id, selectedChild.name)}><Text style={{ color: colors.primary, fontWeight: '700' }}>Ligar</Text></Pressable>} /><NativeCallOverlay call={call} /></>;
  }

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

  const issueReconnect = async (child: ChildProfile) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('A sessão expirou. Entre novamente.');
      setPairing(await createChildReconnectPairing(child.id, token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o código de reconexão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: colors.background }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>AMPARA · RESPONSÁVEIS</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Olá, {user?.firstName || 'responsável'}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Converse em privado e vincule os aparelhos da família.</Text>
      {!addingChild && !pairing && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Crianças da família</Text>
          {children.length === 0 ? <Text style={[styles.body, { color: colors.mutedForeground }]}>Ainda não há perfis vinculados.</Text> : children.map((child) => (
            <View key={child.id} style={[styles.childRow, { borderColor: colors.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Abrir conversa com ${child.name}`} onPress={() => setSelectedChild(child)} style={styles.childMain}>
                <View style={[styles.childAvatar, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>{child.name.charAt(0).toUpperCase()}</Text></View>
                <Text style={[styles.childName, { color: colors.foreground }]}>{child.name}</Text>
                <Text style={{ color: colors.primary }}>Conversa ›</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setViewingLocation(child)} style={styles.locationLink}><Text style={{ color: colors.mutedForeground }}>Localização</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setMirrorChild(child)} style={styles.locationLink}><Text style={{ color: colors.primary }}>Espelho</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setGroupChild(child)} style={styles.locationLink}><Text style={{ color: colors.primary }}>Grupos</Text></Pressable>
            </View>
          ))}
          {children.map((child) => <Pressable key={`reconnect-${child.id}`} disabled={busy} onPress={() => void issueReconnect(child)} style={styles.reconnectButton}><Text style={{ color: colors.primary }}>Conectar outro aparelho de {child.name}</Text></Pressable>)}
          {children.map((child) => <Pressable key={`contacts-${child.id}`} accessibilityRole="button" onPress={() => setContactChild(child)} style={styles.reconnectButton}><Text style={{ color: colors.primary }}>Gerenciar contatos de {child.name}</Text></Pressable>)}
          {children.map((child) => <Pressable key={`time-${child.id}`} accessibilityRole="button" onPress={() => setScreenTimeChild(child)} style={styles.reconnectButton}><Text style={{ color: colors.primary }}>Tempo de uso e bloqueio de {child.name}</Text></Pressable>)}
          <Pressable onPress={() => { setAddingChild(true); setPairing(null); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Adicionar criança</Text></Pressable>
        </View>
      )}
      {pairing ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{pairing.childName ? `Novo aparelho · ${pairing.childName}` : 'Código de pareamento'}</Text>
          <Text accessibilityLabel={`Código ${pairing.pairingCode}`} style={[styles.pairingCode, { color: colors.primary }]}>{pairing.pairingCode.replace(/(\d{4})(\d{4})/, '$1 $2')}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Digite este código no app Ampara Criança. Ele vale até {new Date(pairing.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} e só pode ser usado uma vez.</Text>
          <View style={[styles.downloadBox, { borderTopColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>1. Baixe o app da criança</Text>
            {childDownloadUrl ? <><View style={styles.qr}><QRCode value={childDownloadUrl} size={176} /></View><Text style={[styles.body, { color: colors.mutedForeground }]}>Este QR abre a página que encaminha para a loja do aparelho.</Text></> : <Text style={[styles.body, { color: colors.mutedForeground }]}>O QR de download será exibido depois que a página das lojas for configurada.</Text>}
            <Text style={[styles.cardTitle, { color: colors.foreground, marginTop: 8 }]}>2. Digite o código no app</Text>
          </View>
          <Pressable onPress={() => { setPairing(null); setAddingChild(false); void refreshChildren(); }} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>Voltar para a família</Text></Pressable>
        </View>
      ) : addingChild ? (
        <PairingForm colors={colors} busy={busy} error={error} onSubmit={issuePairing} />
      ) : null}
      <Pressable onPress={() => void signOut()} style={styles.linkButton}><Text style={{ color: colors.primary }}>Sair da conta</Text></Pressable>
    </ScrollView>
    <NativeCallOverlay call={call} />
    </>
  );
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
  downloadBox: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 18 },
  qr: { alignItems: 'center', padding: 14 },
  childRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  childMain: { minHeight: 60, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationLink: { paddingHorizontal: 8, paddingVertical: 12 },
  childAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  childName: { flex: 1, fontSize: 15, fontWeight: '600' },
  reconnectButton: { paddingVertical: 9 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
});

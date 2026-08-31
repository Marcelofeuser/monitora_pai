import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type Role = 'parent' | 'child';
type Section = 'home' | 'conversations' | 'location' | 'settings';
type Profile = { role: Role; responsibleName: string; childName: string };

const PROFILE_KEY = 'controle-parental-profile';
const CONTACTS_KEY = 'controle-parental-contacts';
const PRIVATE_MESSAGES_KEY = 'controle-parental-private-messages';

function alpha(hex: string, opacity: string) {
  return `${hex}${opacity}`;
}

function LogoMark({ colors, size = 44 }: { colors: ReturnType<typeof useColors>; size?: number }) {
  return (
    <View style={[styles.logoMark, { width: size, height: size, borderRadius: size / 3, backgroundColor: colors.primary }]}>
      <Feather name="shield" size={size * 0.46} color={colors.primaryForeground} />
      <View style={[styles.logoDot, { backgroundColor: colors.accent }]} />
    </View>
  );
}

function IconButton({
  icon,
  label,
  colors,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel={label} testID={`icon-${icon}`} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card }, pressed && styles.pressed]}>
      <Feather name={icon} size={19} color={colors.foreground} />
    </Pressable>
  );
}

function PrimaryButton({
  children,
  colors,
  onPress,
  icon,
  variant = 'primary',
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: 'primary' | 'soft' | 'outline';
}) {
  const backgroundColor = variant === 'primary' ? colors.primary : variant === 'soft' ? colors.successSoft : 'transparent';
  const textColor = variant === 'primary' ? colors.primaryForeground : variant === 'soft' ? colors.success : colors.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, { backgroundColor, borderColor: colors.border }, variant === 'outline' && styles.outlineButton, pressed && styles.pressed]}>
      {icon && <Feather name={icon} size={16} color={textColor} />}
      <Text style={[styles.primaryButtonText, { color: textColor }]}>{children}</Text>
    </Pressable>
  );
}

function EmptyState({
  colors,
  icon,
  title,
  body,
  action,
}: {
  colors: ReturnType<typeof useColors>;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.navySoft }]}>
        <Feather name={icon} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
      {action}
    </View>
  );
}

function Onboarding({
  colors,
  onSave,
}: {
  colors: ReturnType<typeof useColors>;
  onSave: (profile: Profile) => Promise<void>;
}) {
  const [step, setStep] = useState<'role' | 'profile'>('role');
  const [role, setRole] = useState<Role>('parent');
  const [responsibleName, setResponsibleName] = useState('');
  const [childName, setChildName] = useState('');
  const [saving, setSaving] = useState(false);
  const isParent = role === 'parent';
  const canContinue = isParent ? responsibleName.trim().length > 1 && childName.trim().length > 1 : childName.trim().length > 1;

  const save = async () => {
    if (!canContinue) return;
    setSaving(true);
    await onSave({ role, responsibleName: responsibleName.trim(), childName: childName.trim() });
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.onboarding, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.onboardingGlow, { backgroundColor: colors.accent }]} />
        <LogoMark colors={colors} size={58} />
        {step === 'role' ? (
          <>
            <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>UM ESPAÇO DA SUA FAMÍLIA</Text>
            <Text style={[styles.onboardingTitle, { color: colors.foreground }]}>Cuidar também é estar por perto.</Text>
            <Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>Comece com seus dados reais. Nada é preenchido automaticamente e você pode apagar tudo quando quiser.</Text>
            <View style={styles.roleOptions}>
              <Pressable testID="choose-parent" onPress={() => { setRole('parent'); setStep('profile'); }} style={({ pressed }) => [styles.roleCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
                <View style={[styles.roleIcon, { backgroundColor: colors.navySoft }]}><Feather name="shield" size={22} color={colors.primary} /></View>
                <View style={styles.roleCopy}><Text style={[styles.roleTitle, { color: colors.foreground }]}>Sou responsável</Text><Text style={[styles.roleDescription, { color: colors.mutedForeground }]}>Criar e acompanhar o espaço da família</Text></View>
                <Feather name="arrow-up-right" size={20} color={colors.mutedForeground} />
              </Pressable>
              <Pressable testID="choose-child" onPress={() => { setRole('child'); setStep('profile'); }} style={({ pressed }) => [styles.roleCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
                <View style={[styles.roleIcon, { backgroundColor: colors.accent }]}><Feather name="smile" size={22} color={colors.accentForeground} /></View>
                <View style={styles.roleCopy}><Text style={[styles.roleTitle, { color: colors.foreground }]}>Sou criança</Text><Text style={[styles.roleDescription, { color: colors.mutedForeground }]}>Entrar no espaço criado pelo responsável</Text></View>
                <Feather name="arrow-up-right" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Pressable onPress={() => setStep('role')} style={styles.backRow}><Feather name="arrow-left" size={17} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Voltar</Text></Pressable>
            <Text style={[styles.onboardingTitle, { color: colors.foreground }]}>{isParent ? 'Vamos começar pela família.' : 'Como podemos chamar você?'}</Text>
            <Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>{isParent ? 'Esses dados ficam somente neste dispositivo até você conectar sua conta.' : 'Digite seu nome para personalizar seu espaço.'}</Text>
            {isParent && <Field label="Seu nome" value={responsibleName} onChangeText={setResponsibleName} placeholder="Digite seu nome" colors={colors} autoFocus />}
            <Field label={isParent ? 'Nome da criança' : 'Seu nome'} value={childName} onChangeText={setChildName} placeholder="Digite um nome" colors={colors} autoFocus={!isParent} />
            <View style={[styles.transparencyNote, { backgroundColor: colors.successSoft }]}><Feather name="lock" size={15} color={colors.success} /><Text style={[styles.transparencyText, { color: colors.inkLight }]}>Você controla o que é compartilhado e pode remover os dados locais em Ajustes.</Text></View>
            <PrimaryButton colors={colors} onPress={save} icon="arrow-right">{saving ? 'Salvando…' : 'Entrar no meu espaço'}</PrimaryButton>
          </>
        )}
        <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}><Feather name="lock" size={12} /> O chat entre responsável e criança é sempre privado.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} autoFocus={autoFocus} style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} />
    </View>
  );
}

function ParentHome({ profile, colors, onOpen }: { profile: Profile; colors: ReturnType<typeof useColors>; onOpen: (section: Section) => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>SEU ESPAÇO</Text>
      <Text style={[styles.greeting, { color: colors.foreground }]}>Olá, {profile.responsibleName}</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Acompanhe o que sua família decidir compartilhar.</Text>
      <View style={[styles.childCard, { backgroundColor: colors.primary }]}>
        <View style={styles.childCardTop}><View style={[styles.avatarLarge, { backgroundColor: colors.card }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{profile.childName.charAt(0).toUpperCase()}</Text></View><View style={styles.childCardCopy}><Text style={styles.heroOverline}>PERFIL DA CRIANÇA</Text><Text style={styles.heroName}>{profile.childName}</Text></View><Feather name="shield" size={19} color={colors.accent} /></View>
        <View style={styles.heroDivider} />
        <Text style={[styles.heroEmptyTitle, { color: colors.primaryForeground }]}>Ainda sem atividade compartilhada</Text>
        <Text style={[styles.heroEmptyBody, { color: alpha(colors.primaryForeground, 'B0') }]}>Quando houver dados reais, eles aparecerão aqui.</Text>
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Visão geral</Text>
      <View style={styles.metricsRow}>
        <Pressable onPress={() => onOpen('conversations')} style={({ pressed }) => [styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><Feather name="message-circle" size={18} color={colors.primary} /><Text style={[styles.metricValueEmpty, { color: colors.foreground }]}>0</Text><Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>conversas espelhadas</Text></Pressable>
        <Pressable onPress={() => onOpen('location')} style={({ pressed }) => [styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><Feather name="map-pin" size={18} color={colors.success} /><Text style={[styles.metricValueEmpty, { color: colors.foreground }]}>—</Text><Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>localização recebida</Text></Pressable>
      </View>
      <EmptyState colors={colors} icon="inbox" title="Seu painel está pronto" body={`Cadastre um contato ou conecte o dispositivo de ${profile.childName} para começar a receber dados reais.`} action={<PrimaryButton colors={colors} onPress={() => onOpen('conversations')} icon="user-plus" variant="soft">Cadastrar contato</PrimaryButton>} />
      <PrivateLink colors={colors} onPress={() => onOpen('settings')} />
    </ScrollView>
  );
}

function Conversations({ colors, contacts, onAdd }: { colors: ReturnType<typeof useColors>; contacts: string[]; onAdd: (name: string) => Promise<void> }) {
  const [newContact, setNewContact] = useState('');
  const add = async () => {
    if (!newContact.trim()) return;
    await onAdd(newContact.trim());
    setNewContact('');
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Conversas</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Somente contatos aprovados aparecem aqui.</Text>
      {contacts.length === 0 ? <EmptyState colors={colors} icon="message-circle" title="Nenhum contato aprovado" body="Adicione o primeiro contato usando o nome real. O pedido ficará pendente até ser aprovado." /> : <View style={styles.contactList}>{contacts.map((contact) => <View key={contact} style={[styles.contactRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.navySoft }]}><Text style={[styles.avatarSmallText, { color: colors.primary }]}>{contact.charAt(0).toUpperCase()}</Text></View><View style={styles.contactCopy}><Text style={[styles.contactName, { color: colors.foreground }]}>{contact}</Text><Text style={[styles.contactMeta, { color: colors.mutedForeground }]}>Aguardando comunicação</Text></View><Feather name="clock" size={17} color={colors.warning} /></View>)}</View>}
      <View style={[styles.addBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.addBoxTitle, { color: colors.foreground }]}>Adicionar contato</Text><Text style={[styles.addBoxBody, { color: colors.mutedForeground }]}>Use o nome real da pessoa. A aprovação continua sendo necessária.</Text><TextInput value={newContact} onChangeText={setNewContact} placeholder="Nome do contato" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.input }]} /><PrimaryButton colors={colors} onPress={add} icon="user-plus">Adicionar para aprovação</PrimaryButton></View>
    </ScrollView>
  );
}

function LocationView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');
  const requestLocation = async () => {
    setStatus('loading');
    try {
      if (Platform.OS === 'web' && !navigator.geolocation) {
        setStatus('denied');
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        return;
      }
      await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Localização</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Nada é mostrado até um dispositivo compartilhar sua localização.</Text>
      <EmptyState colors={colors} icon={status === 'granted' ? 'check-circle' : 'map-pin'} title={status === 'granted' ? 'Permissão concedida neste dispositivo' : 'Nenhuma localização recebida'} body={status === 'granted' ? 'A localização deste dispositivo está disponível para o próximo vínculo autorizado.' : 'Para testar este recurso, autorize a localização quando um dispositivo estiver vinculado.'} action={<PrimaryButton colors={colors} onPress={requestLocation} icon="crosshair" variant={status === 'granted' ? 'soft' : 'primary'}>{status === 'loading' ? 'Solicitando…' : status === 'granted' ? 'Atualizar permissão' : 'Solicitar permissão'}</PrimaryButton>} />
      {status === 'denied' && <View style={[styles.warningBox, { backgroundColor: colors.warningSoft }]}><Feather name="info" size={15} color={colors.warning} /><Text style={[styles.warningText, { color: colors.warning }]}>A permissão não foi concedida. Você pode tentar novamente quando quiser.</Text></View>}
    </ScrollView>
  );
}

function SettingsView({ profile, colors, onClear }: { profile: Profile; colors: ReturnType<typeof useColors>; onClear: () => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Ajustes</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Seus dados e permissões, sem informações de demonstração.</Text>
      <View style={[styles.profilePanel, { backgroundColor: colors.primary }]}><View style={[styles.avatarLarge, { backgroundColor: colors.card }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{(profile.role === 'parent' ? profile.responsibleName : profile.childName).charAt(0).toUpperCase()}</Text></View><View style={styles.childCardCopy}><Text style={styles.heroOverline}>PERFIL ATUAL</Text><Text style={styles.heroName}>{profile.role === 'parent' ? profile.responsibleName : profile.childName}</Text><Text style={styles.profileRole}>{profile.role === 'parent' ? 'Responsável' : 'Criança'}</Text></View></View>
      <Text style={[styles.settingsGroupTitle, { color: colors.mutedForeground }]}>VÍNCULO FAMILIAR</Text>
      <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}><SettingRow colors={colors} icon="user" title={profile.role === 'parent' ? 'Criança vinculada' : 'Responsável vinculado'} subtitle={profile.role === 'parent' ? profile.childName : profile.responsibleName} /><SettingRow colors={colors} icon="eye" title="Espelhamento seletivo" subtitle="Somente contatos aprovados" /><SettingRow colors={colors} icon="lock" title="Canal privado" subtitle="Nunca aparece no monitoramento" /></View>
      <Text style={[styles.settingsGroupTitle, { color: colors.mutedForeground }]}>DADOS LOCAIS</Text>
      <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}><SettingRow colors={colors} icon="database" title="Armazenamento local" subtitle="Os dados ficam neste dispositivo" /></View>
      <Pressable onPress={() => Alert.alert('Apagar dados locais?', 'Esta ação remove o perfil, os contatos e as mensagens salvas neste dispositivo.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Apagar', style: 'destructive', onPress: onClear }])} style={({ pressed }) => [styles.clearButton, { borderColor: colors.destructive }, pressed && styles.pressed]}><Feather name="trash-2" size={16} color={colors.destructive} /><Text style={[styles.clearText, { color: colors.destructive }]}>Apagar todos os dados locais</Text></Pressable>
    </ScrollView>
  );
}

function SettingRow({ colors, icon, title, subtitle }: { colors: ReturnType<typeof useColors>; icon: keyof typeof Feather.glyphMap; title: string; subtitle: string }) {
  return <View style={styles.settingRow}><View style={[styles.settingIcon, { backgroundColor: colors.navySoft }]}><Feather name={icon} size={17} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></View>;
}

function PrivateLink({ colors, onPress }: { colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.privateCard, { backgroundColor: colors.accent }, pressed && styles.pressed]}><View style={[styles.privateIcon, { backgroundColor: alpha(colors.primaryForeground, '35') }]}><Feather name="heart" size={18} color={colors.accentForeground} /></View><View style={styles.privateCopy}><Text style={[styles.privateTitle, { color: colors.accentForeground }]}>Canal privado</Text><Text style={[styles.privateText, { color: colors.accentForeground }]}>A conversa da família nunca é espelhada.</Text></View><Feather name="arrow-up-right" size={19} color={colors.accentForeground} /></Pressable>;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [section, setSection] = useState<Section>('home');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(PROFILE_KEY), AsyncStorage.getItem(CONTACTS_KEY)]).then(([storedProfile, storedContacts]) => {
      if (storedProfile) setProfile(JSON.parse(storedProfile) as Profile);
      if (storedContacts) setContacts(JSON.parse(storedContacts) as string[]);
      setLoading(false);
    });
  }, []);

  const saveProfile = async (nextProfile: Profile) => {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    setProfile(nextProfile);
  };

  const addContact = async (name: string) => {
    const nextContacts = [...contacts, name];
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(nextContacts));
    setContacts(nextContacts);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const clearData = async () => {
    await AsyncStorage.multiRemove([PROFILE_KEY, CONTACTS_KEY, PRIVATE_MESSAGES_KEY]);
    setProfile(null);
    setContacts([]);
    setSection('home');
  };

  if (loading) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!profile) return <Onboarding colors={colors} onSave={saveProfile} />;

  const openSection = (nextSection: Section) => {
    setSection(nextSection);
    void Haptics.selectionAsync();
  };

  return (
    <View style={[styles.app, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <View style={styles.brandRow}><LogoMark colors={colors} size={36} /><View><Text style={[styles.brandName, { color: colors.foreground }]}>amparo</Text><Text style={[styles.brandCaption, { color: colors.mutedForeground }]}>{profile.role === 'parent' ? 'espaço da família' : 'seu espaço'}</Text></View></View>
        <View style={styles.topActions}><IconButton icon="bell" label="Notificações" colors={colors} onPress={() => Alert.alert('Sem novidades', 'As notificações reais aparecerão quando houver uma conta conectada.')} /><View style={[styles.profileChip, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.profileAvatar, { backgroundColor: colors.accent }]}><Text style={[styles.profileAvatarText, { color: colors.accentForeground }]}>{(profile.role === 'parent' ? profile.responsibleName : profile.childName).charAt(0).toUpperCase()}</Text></View></View></View>
      </View>
      <View style={styles.screenBody}>
        {profile.role === 'parent' && section === 'home' && <ParentHome profile={profile} colors={colors} onOpen={openSection} />}
        {profile.role === 'parent' && section === 'conversations' && <Conversations colors={colors} contacts={contacts} onAdd={addContact} />}
        {profile.role === 'parent' && section === 'location' && <LocationView colors={colors} />}
        {profile.role === 'parent' && section === 'settings' && <SettingsView profile={profile} colors={colors} onClear={clearData} />}
        {profile.role === 'child' && <ChildView profile={profile} colors={colors} onOpen={openSection} />}
      </View>
      <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 12) }]}>
        {([['home', 'Início', 'home'], ['conversations', 'Conversas', 'message-circle'], ['location', 'Localização', 'map-pin'], ['settings', 'Ajustes', 'sliders']] as const).map(([item, label, icon]) => <Pressable key={item} onPress={() => openSection(item)} style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}><View style={[styles.navIconWrap, section === item && { backgroundColor: colors.accent }]}><Feather name={icon} size={18} color={section === item ? colors.accentForeground : colors.mutedForeground} /></View><Text style={[styles.navLabel, { color: section === item ? colors.foreground : colors.mutedForeground }]}>{label}</Text></Pressable>)}
      </View>
    </View>
  );
}

function ChildView({ profile, colors, onOpen }: { profile: Profile; colors: ReturnType<typeof useColors>; onOpen: (section: Section) => void }) {
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>SEU ESPAÇO</Text><Text style={[styles.greeting, { color: colors.foreground }]}>Olá, {profile.childName}</Text><View style={[styles.childCard, { backgroundColor: colors.accent }]}><Text style={[styles.heroOverline, { color: colors.accentForeground }]}>TUDO PRONTO</Text><Text style={[styles.childReadyTitle, { color: colors.accentForeground }]}>Quando você compartilhar algo, aparecerá aqui.</Text><Text style={[styles.childReadyBody, { color: colors.accentForeground }]}>Você sempre saberá o que está sendo compartilhado.</Text></View><EmptyState colors={colors} icon="message-circle" title="Nenhuma conversa ainda" body="Contatos aprovados aparecerão aqui quando você começar a conversar." action={<PrimaryButton colors={colors} onPress={() => onOpen('settings')} icon="lock" variant="soft">Ver privacidade</PrimaryButton>} /><PrivateLink colors={colors} onPress={() => onOpen('settings')} /></ScrollView>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onboarding: { flex: 1 },
  onboardingContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  onboardingGlow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, right: -130, top: -100, opacity: 0.42 },
  eyebrow: { fontSize: 10, letterSpacing: 1.25, fontFamily: 'Inter_700Bold', marginTop: 23 },
  onboardingTitle: { fontSize: 38, lineHeight: 45, letterSpacing: -1.1, fontFamily: 'Inter_700Bold', marginTop: 12 },
  onboardingBody: { fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 14 },
  roleOptions: { gap: 12, marginTop: 32 },
  roleCard: { minHeight: 88, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  roleIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  roleCopy: { flex: 1, marginLeft: 14 },
  roleTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  roleDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 4, maxWidth: 230 },
  privacyNote: { textAlign: 'center', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 26 },
  logoMark: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  logoDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, top: 8, right: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 22, marginBottom: 10 },
  backText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  field: { marginTop: 18 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 7 },
  fieldInput: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  transparencyNote: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 15, padding: 12, marginVertical: 20 },
  transparencyText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  topBar: { paddingHorizontal: 20, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { fontSize: 20, letterSpacing: -0.6, fontFamily: 'Inter_700Bold' },
  brandCaption: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  profileChip: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileAvatar: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  screenBody: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  greeting: { fontSize: 29, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', marginTop: 7 },
  pageSubtitle: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 7 },
  childCard: { borderRadius: 24, padding: 18, marginTop: 20, minHeight: 154 },
  childCardTop: { flexDirection: 'row', alignItems: 'center' },
  avatarLarge: { width: 52, height: 52, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  childCardCopy: { flex: 1, marginLeft: 12 },
  heroOverline: { opacity: 0.68, fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  heroName: { fontSize: 19, fontFamily: 'Inter_700Bold', marginTop: 4, color: '#FFFFFF' },
  profileRole: { color: '#FFFFFF', opacity: 0.65, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  heroDivider: { height: 1, backgroundColor: '#FFFFFF', opacity: 0.15, marginVertical: 15 },
  heroEmptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  heroEmptyBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 5 },
  sectionTitle: { fontSize: 17, letterSpacing: -0.25, fontFamily: 'Inter_700Bold', marginTop: 26, marginBottom: 11 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 1, padding: 14 },
  metricValueEmpty: { fontSize: 27, fontFamily: 'Inter_700Bold', marginTop: 11 },
  metricLabel: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium', marginTop: 5 },
  emptyState: { borderRadius: 21, borderWidth: 1, alignItems: 'center', padding: 22, marginTop: 14 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 14 },
  emptyBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 285, marginTop: 7 },
  primaryButton: { minHeight: 46, borderRadius: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, marginTop: 18 },
  outlineButton: { borderWidth: 1 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  privateCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 19, padding: 15, marginTop: 14 },
  privateIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  privateCopy: { flex: 1, marginLeft: 10 },
  privateTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  privateText: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  bottomNav: { minHeight: 84, borderTopWidth: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 9 },
  navItem: { alignItems: 'center', minWidth: 70, paddingVertical: 2 },
  navIconWrap: { width: 36, height: 29, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  pageTitle: { fontSize: 29, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', marginTop: 17 },
  contactList: { gap: 9, marginTop: 17 },
  contactRow: { minHeight: 65, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  contactCopy: { flex: 1, marginLeft: 11 },
  contactName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  contactMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  addBox: { borderWidth: 1, borderRadius: 20, padding: 15, marginTop: 18 },
  addBoxTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  addBoxBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 5, marginBottom: 11 },
  warningBox: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 14, padding: 12, marginTop: 14 },
  warningText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  profilePanel: { minHeight: 96, borderRadius: 21, padding: 15, flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  settingsGroupTitle: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginTop: 25, marginBottom: 9 },
  settingsGroup: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  settingRow: { minHeight: 65, padding: 12, flexDirection: 'row', alignItems: 'center' },
  settingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, marginLeft: 10 },
  settingTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  settingSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  clearButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 21 },
  clearText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  childReadyTitle: { fontSize: 23, lineHeight: 29, letterSpacing: -0.5, fontFamily: 'Inter_700Bold', marginTop: 12 },
  childReadyBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 10, maxWidth: 300 },
});
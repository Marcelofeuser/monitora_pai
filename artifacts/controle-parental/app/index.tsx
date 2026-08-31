import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type Role = 'parent' | 'child';
type Section = 'home' | 'conversations' | 'location' | 'settings';
type ContactStatus = 'pending' | 'approved';

type ActivityItem = {
  id: string;
  kind: 'text' | 'photo' | 'audio';
  title: string;
  preview: string;
  time: string;
  icon: keyof typeof Feather.glyphMap;
  color: 'blue' | 'coral' | 'green';
};

const activity: ActivityItem[] = [
  { id: '1', kind: 'text', title: 'Rafael Lima', preview: 'Oi Marina, você já chegou?', time: 'agora', icon: 'message-circle', color: 'blue' },
  { id: '2', kind: 'photo', title: 'Bia Santos', preview: 'Marina enviou uma foto', time: 'há 12 min', icon: 'image', color: 'coral' },
  { id: '3', kind: 'audio', title: 'Rafael Lima', preview: 'Mensagem de áudio · 0:18', time: 'há 28 min', icon: 'mic', color: 'green' },
];

const conversations = [
  { id: 'rafael', name: 'Rafael Lima', initials: 'RL', last: 'Oi Marina, você já chegou?', time: 'agora', unread: 2, online: true },
  { id: 'bia', name: 'Bia Santos', initials: 'BS', last: 'Marina enviou uma foto', time: 'há 12 min', unread: 0, online: false },
];

function alpha(hex: string, opacity: string) {
  return `${hex}${opacity}`;
}

function IconButton({
  icon,
  onPress,
  colors,
  label,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  label: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      testID={`icon-${icon}`}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card }, pressed && styles.pressed]}
    >
      <Feather name={icon} size={20} color={colors.foreground} />
    </Pressable>
  );
}

function LogoMark({ colors, size = 42 }: { colors: ReturnType<typeof useColors>; size?: number }) {
  return (
    <View style={[styles.logoMark, { width: size, height: size, borderRadius: size / 3, backgroundColor: colors.primary }]}>
      <Feather name="shield" size={size * 0.48} color={colors.primaryForeground} />
      <View style={[styles.logoDot, { backgroundColor: colors.accent }]} />
    </View>
  );
}

function Pill({
  children,
  colors,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
  tone?: 'neutral' | 'success' | 'coral' | 'warning';
}) {
  const palette = {
    neutral: { bg: colors.navySoft, text: colors.inkLight },
    success: { bg: colors.successSoft, text: colors.success },
    coral: { bg: colors.accent, text: colors.accentForeground },
    warning: { bg: colors.warningSoft, text: colors.warning },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.pillText, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

function PrimaryButton({
  children,
  onPress,
  colors,
  icon,
  compact = false,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  icon?: keyof typeof Feather.glyphMap;
  compact?: boolean;
  variant?: 'primary' | 'soft' | 'outline';
}) {
  const backgroundColor = variant === 'primary' ? colors.primary : variant === 'soft' ? colors.successSoft : 'transparent';
  const textColor = variant === 'primary' ? colors.primaryForeground : variant === 'soft' ? colors.success : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      testID={`button-${String(children).toLowerCase().replace(/\s/g, '-')}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.compactButton,
        { backgroundColor, borderColor: colors.border },
        variant === 'outline' && styles.outlineButton,
        pressed && styles.pressed,
      ]}
    >
      {icon && <Feather name={icon} size={compact ? 15 : 17} color={textColor} />}
      <Text style={[styles.primaryButtonText, compact && styles.compactButtonText, { color: textColor }]}>{children}</Text>
    </Pressable>
  );
}

function Onboarding({ onChoose, colors }: { onChoose: (role: Role) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.onboarding, { backgroundColor: colors.background }]}>
      <View style={[styles.onboardingGlow, { backgroundColor: colors.accent }]} />
      <View style={styles.onboardingContent}>
        <LogoMark colors={colors} size={60} />
        <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>CLARO, SEGURO, PRESENTE</Text>
        <Text style={[styles.onboardingTitle, { color: colors.foreground }]}>Cuidar também é estar por perto.</Text>
        <Text style={[styles.onboardingBody, { color: colors.mutedForeground }]}>
          Um espaço transparente para acompanhar a rotina digital da sua família sem perder a conversa mais importante.
        </Text>
        <View style={styles.roleOptions}>
          <Pressable testID="choose-parent" onPress={() => onChoose('parent')} style={({ pressed }) => [styles.roleCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
            <View style={[styles.roleIcon, { backgroundColor: colors.navySoft }]}>
              <Feather name="shield" size={22} color={colors.primary} />
            </View>
            <View style={styles.roleCopy}>
              <Text style={[styles.roleTitle, { color: colors.foreground }]}>Sou responsável</Text>
              <Text style={[styles.roleDescription, { color: colors.mutedForeground }]}>Acompanhar a rotina e manter tudo seguro</Text>
            </View>
            <Feather name="arrow-up-right" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable testID="choose-child" onPress={() => onChoose('child')} style={({ pressed }) => [styles.roleCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
            <View style={[styles.roleIcon, { backgroundColor: colors.accent }]}>
              <Feather name="smile" size={22} color={colors.accentForeground} />
            </View>
            <View style={styles.roleCopy}>
              <Text style={[styles.roleTitle, { color: colors.foreground }]}>Sou criança</Text>
              <Text style={[styles.roleDescription, { color: colors.mutedForeground }]}>Conversar, compartilhar e pedir ajuda</Text>
            </View>
            <Feather name="arrow-up-right" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>
          <Feather name="lock" size={12} /> O chat entre responsável e criança é sempre privado.
        </Text>
      </View>
    </View>
  );
}

function ParentHome({
  colors,
  contactStatus,
  onApprove,
  onOpenSection,
  onPrivateChat,
}: {
  colors: ReturnType<typeof useColors>;
  contactStatus: ContactStatus;
  onApprove: () => void;
  onOpenSection: (section: Section) => void;
  onPrivateChat: () => void;
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>SEGUNDA, 31 DE AGOSTO</Text>
          <Text style={[styles.greeting, { color: colors.foreground }]}>Bom dia, Camila</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.statusText, { color: colors.success }]}>Tudo seguro</Text>
        </View>
      </View>

      <View style={[styles.childHero, { backgroundColor: colors.primary }]}>
        <View style={styles.childHeroTop}>
          <View style={styles.avatarLarge}><Text style={[styles.avatarText, { color: colors.primary }]} >M</Text></View>
          <View style={styles.childHeroText}>
            <Text style={styles.heroOverline}>ACOMPANHANDO AGORA</Text>
            <Text style={styles.heroName}>Marina Oliveira</Text>
          </View>
          <Pressable onPress={() => onOpenSection('settings')} style={styles.heroChevron}>
            <Feather name="chevron-right" size={20} color={alpha(colors.primaryForeground, 'B8')} />
          </Pressable>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStats}>
          <View>
            <Text style={styles.heroStatValue}>2h 18m</Text>
            <Text style={styles.heroStatLabel}>de uso hoje</Text>
          </View>
          <View style={styles.heroStatSeparator} />
          <View>
            <Text style={styles.heroStatValue}>Em casa</Text>
            <Text style={styles.heroStatLabel}>localização atual</Text>
          </View>
          <View style={styles.heroLock}>
            <Feather name="lock" size={15} color={colors.accent} />
          </View>
        </View>
      </View>

      {contactStatus === 'pending' ? (
        <View style={[styles.approvalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIcon, { backgroundColor: colors.warningSoft }]}>
              <Feather name="user-plus" size={19} color={colors.warning} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={[styles.cardEyebrow, { color: colors.warning }]}>AGUARDANDO SUA DECISÃO</Text>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Novo contato para Marina</Text>
            </View>
            <Pill colors={colors} tone="warning">1 novo</Pill>
          </View>
          <View style={styles.contactRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.avatarSmallText, { color: colors.accentForeground }]}>RL</Text></View>
            <View style={styles.contactCopy}>
              <Text style={[styles.contactName, { color: colors.foreground }]}>Rafael Lima</Text>
              <Text style={[styles.contactMeta, { color: colors.mutedForeground }]}>Amigo da escola · há 8 min</Text>
            </View>
            <Feather name="chevron-right" size={19} color={colors.mutedForeground} />
          </View>
          <View style={styles.restrictionRow}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.restrictionText, { color: colors.mutedForeground }]}>Você poderá ajustar as permissões depois.</Text>
          </View>
          <View style={styles.approvalActions}>
            <PrimaryButton colors={colors} onPress={onApprove} icon="check" compact>Permitir contato</PrimaryButton>
            <Pressable onPress={() => Alert.alert('Pedido de contato', 'Rafael poderá enviar mensagens de texto e fotos após a aprovação.')} style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}>
              <Text style={[styles.detailsText, { color: colors.mutedForeground }]}>Ver detalhes</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.approvedBanner, { backgroundColor: colors.successSoft }]}>
          <View style={[styles.approvedIcon, { backgroundColor: colors.success }]}><Feather name="check" size={15} color={colors.primaryForeground} /></View>
          <View style={styles.approvedCopy}><Text style={[styles.approvedTitle, { color: colors.success }]}>Contato aprovado</Text><Text style={[styles.approvedText, { color: colors.inkLight }]}>Rafael agora pode conversar com Marina.</Text></View>
          <Feather name="x" size={18} color={colors.inkLight} />
        </View>
      )}

      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Visão de hoje</Text>
        <Pressable onPress={() => onOpenSection('settings')}><Text style={[styles.linkText, { color: colors.accentForeground }]}>Ajustar</Text></Pressable>
      </View>
      <View style={styles.metricsRow}>
        <Pressable onPress={() => onOpenSection('settings')} style={({ pressed }) => [styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={styles.metricTop}><Feather name="clock" size={17} color={colors.accentForeground} /><Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TEMPO DE USO</Text></View>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>2h 18m</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { width: '58%', backgroundColor: colors.accent }]} /></View>
          <Text style={[styles.metricFoot, { color: colors.mutedForeground }]}>de 4h permitidas</Text>
        </Pressable>
        <Pressable onPress={() => onOpenSection('location')} style={({ pressed }) => [styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={styles.metricTop}><Feather name="map-pin" size={17} color={colors.success} /><Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>LOCALIZAÇÃO</Text></View>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>Em casa</Text>
          <View style={styles.locationLine}><View style={[styles.pulseDot, { backgroundColor: colors.success }]} /><Text style={[styles.metricFoot, { color: colors.success }]}>Atualizado agora</Text></View>
          <Text style={[styles.metricFoot, { color: colors.mutedForeground }]}>Ver histórico de rotas</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Atividade espelhada</Text>
        <Pressable onPress={() => onOpenSection('conversations')}><Text style={[styles.linkText, { color: colors.accentForeground }]}>Ver tudo</Text></Pressable>
      </View>
      <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {activity.map((item, index) => {
          const iconColor = item.color === 'coral' ? colors.accentForeground : item.color === 'green' ? colors.success : colors.primary;
          const iconBg = item.color === 'coral' ? colors.accent : item.color === 'green' ? colors.successSoft : colors.navySoft;
          return (
            <Pressable key={item.id} onPress={() => onOpenSection('conversations')} style={({ pressed }) => [styles.activityItem, index < activity.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.activityIcon, { backgroundColor: iconBg }]}><Feather name={item.icon} size={17} color={iconColor} /></View>
              <View style={styles.activityCopy}><Text style={[styles.activityTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.activityPreview, { color: colors.mutedForeground }]}>{item.preview}</Text></View>
              <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>{item.time}</Text>
            </Pressable>
          );
        })}
        <View style={styles.mirrorNote}><Feather name="eye" size={13} color={colors.mutedForeground} /><Text style={[styles.mirrorNoteText, { color: colors.mutedForeground }]}>Mensagens entre Marina e contatos aprovados aparecem aqui.</Text></View>
      </View>

      <Pressable onPress={onPrivateChat} style={({ pressed }) => [styles.privateCard, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
        <View style={[styles.privateIcon, { backgroundColor: alpha(colors.primaryForeground, '40') }]}><Feather name="heart" size={18} color={colors.accentForeground} /></View>
        <View style={styles.privateCopy}><Text style={[styles.privateTitle, { color: colors.accentForeground }]}>Conversa privada com Marina</Text><Text style={[styles.privateText, { color: colors.accentForeground }]}>Este espaço nunca é espelhado.</Text></View>
        <Feather name="arrow-up-right" size={20} color={colors.accentForeground} />
      </Pressable>
    </ScrollView>
  );
}

function ConversationsView({ colors, onPrivateChat }: { colors: ReturnType<typeof useColors>; onPrivateChat: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedConversation = conversations.find((conversation) => conversation.id === selected);
  if (selectedConversation) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Pressable onPress={() => setSelected(null)} style={styles.backRow}><Feather name="arrow-left" size={18} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Todas as conversas</Text></Pressable>
        <View style={styles.conversationHeader}><View style={[styles.avatar, { backgroundColor: colors.navySoft }]}><Text style={[styles.avatarSmallText, { color: colors.primary }]}>{selectedConversation.initials}</Text></View><View><Text style={[styles.conversationName, { color: colors.foreground }]}>{selectedConversation.name}</Text><Text style={[styles.contactMeta, { color: colors.success }]}>Contato aprovado · espelhando</Text></View><Pill colors={colors} tone="success">Ao vivo</Pill></View>
        <View style={styles.mirrorLabel}><Feather name="eye" size={14} color={colors.accentForeground} /><Text style={[styles.mirrorLabelText, { color: colors.accentForeground }]}>VISÃO DO RESPONSÁVEL</Text></View>
        <View style={styles.chatStack}>
          <View style={[styles.chatBubble, styles.chatBubbleOther, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.chatText, { color: colors.foreground }]}>Oi Marina, você já chegou?</Text><Text style={[styles.chatTime, { color: colors.mutedForeground }]}>10:42</Text></View>
          <View style={[styles.chatBubble, styles.chatBubbleChild, { backgroundColor: colors.primary }]}><Text style={[styles.chatText, { color: colors.primaryForeground }]}>Cheguei sim! Estou fazendo a lição.</Text><Text style={[styles.chatTime, { color: alpha(colors.primaryForeground, 'B0') }]}>10:43</Text></View>
          <View style={[styles.chatBubble, styles.chatBubbleOther, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.chatText, { color: colors.foreground }]}>Legal. Depois me manda uma foto?</Text><Text style={[styles.chatTime, { color: colors.mutedForeground }]}>10:44</Text></View>
        </View>
        <View style={styles.restrictionInfo}><Feather name="shield" size={15} color={colors.success} /><Text style={[styles.restrictionText, { color: colors.inkLight }]}>Texto e fotos permitidos para este contato.</Text></View>
        <PrimaryButton colors={colors} onPress={onPrivateChat} icon="heart" variant="soft">Falar com Marina em privado</PrimaryButton>
      </ScrollView>
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Conversas</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>A comunicação aprovada de Marina, em tempo real.</Text>
      <View style={[styles.privacyBanner, { backgroundColor: colors.navySoft }]}><Feather name="eye" size={18} color={colors.primary} /><Text style={[styles.privacyBannerText, { color: colors.inkLight }]}>Somente canais com contatos aprovados são espelhados.</Text></View>
      <View style={styles.conversationList}>
        {conversations.map((conversation) => (
          <Pressable key={conversation.id} onPress={() => setSelected(conversation.id)} style={({ pressed }) => [styles.conversationRow, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
            <View style={[styles.avatar, { backgroundColor: conversation.id === 'rafael' ? colors.accent : colors.navySoft }]}><Text style={[styles.avatarSmallText, { color: conversation.id === 'rafael' ? colors.accentForeground : colors.primary }]}>{conversation.initials}</Text>{conversation.online && <View style={[styles.onlineDot, { backgroundColor: colors.success, borderColor: colors.card }]} />}</View>
            <View style={styles.conversationCopy}><View style={styles.conversationNameRow}><Text style={[styles.conversationName, { color: colors.foreground }]}>{conversation.name}</Text><Text style={[styles.activityTime, { color: colors.mutedForeground }]}>{conversation.time}</Text></View><Text style={[styles.activityPreview, { color: colors.mutedForeground }]} numberOfLines={1}>{conversation.last}</Text><Text style={[styles.mirrorMini, { color: colors.success }]}><Feather name="eye" size={11} /> espelhado agora</Text></View>
            {conversation.unread > 0 && <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}><Text style={[styles.unreadText, { color: colors.accentForeground }]}>{conversation.unread}</Text></View>}
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function LocationView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [loading, setLoading] = useState(false);
  const [locationText, setLocationText] = useState('Atualizado agora');
  const refreshLocation = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        setLocationText('Localização do dispositivo disponível');
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setLocationText('Permissão necessária para atualizar');
        } else {
          await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocationText('Atualizado agora');
        }
      }
    } catch {
      setLocationText('Não foi possível atualizar agora');
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Localização</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Veja onde Marina está e acompanhe seus lugares seguros.</Text>
      <View style={[styles.mapCard, { backgroundColor: colors.navySoft }]}>
        <View style={styles.mapGrid}><View style={[styles.mapRoad, styles.mapRoadOne, { backgroundColor: alpha(colors.primaryForeground, '90') }]} /><View style={[styles.mapRoad, styles.mapRoadTwo, { backgroundColor: alpha(colors.primaryForeground, '90') }]} /><View style={[styles.mapRoad, styles.mapRoadThree, { backgroundColor: alpha(colors.primaryForeground, '90') }]} /></View>
        <View style={[styles.mapPin, { backgroundColor: colors.accent, borderColor: colors.primaryForeground }]}><Feather name="home" size={18} color={colors.accentForeground} /></View>
        <View style={[styles.mapCallout, { backgroundColor: colors.card }]}><Text style={[styles.mapCalloutTitle, { color: colors.foreground }]}>Casa</Text><Text style={[styles.mapCalloutText, { color: colors.mutedForeground }]}>Marina está aqui</Text></View>
        <View style={styles.mapBottom}><View style={[styles.pulseDot, { backgroundColor: colors.success }]} /><Text style={[styles.mapBottomText, { color: colors.inkLight }]}>{locationText}</Text></View>
      </View>
      <PrimaryButton colors={colors} onPress={refreshLocation} icon="crosshair" variant="outline">{loading ? 'Atualizando…' : 'Atualizar localização'}</PrimaryButton>
      <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28, marginBottom: 12 }]}>Lugares seguros</Text>
      <View style={[styles.safePlaceRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.safePlaceIcon, { backgroundColor: colors.successSoft }]}><Feather name="home" size={18} color={colors.success} /></View><View style={styles.safePlaceCopy}><Text style={[styles.contactName, { color: colors.foreground }]}>Casa</Text><Text style={[styles.contactMeta, { color: colors.mutedForeground }]}>Entrada e saída monitoradas</Text></View><Pill colors={colors} tone="success">Ativo</Pill></View>
      <View style={[styles.safePlaceRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.safePlaceIcon, { backgroundColor: colors.navySoft }]}><Feather name="book-open" size={18} color={colors.primary} /></View><View style={styles.safePlaceCopy}><Text style={[styles.contactName, { color: colors.foreground }]}>Escola</Text><Text style={[styles.contactMeta, { color: colors.mutedForeground }]}>Rua das Acácias, 120</Text></View><Pill colors={colors} tone="neutral">Ativo</Pill></View>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
    </ScrollView>
  );
}

function SettingsView({ colors, onChangeRole }: { colors: ReturnType<typeof useColors>; onChangeRole: () => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Ajustes</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Preferências de acompanhamento da família.</Text>
      <View style={[styles.settingsProfile, { backgroundColor: colors.primary }]}><View style={styles.avatarLarge}><Text style={[styles.avatarText, { color: colors.primary }]}>M</Text></View><View><Text style={[styles.heroOverline, { color: alpha(colors.primaryForeground, 'A0') }]}>PERFIL ACOMPANHADO</Text><Text style={styles.heroName}>Marina Oliveira</Text></View><Feather name="chevron-right" size={20} color={alpha(colors.primaryForeground, 'B8')} /></View>
      <Text style={[styles.settingsGroupTitle, { color: colors.mutedForeground }]}>ROTINA E SEGURANÇA</Text>
      <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingRow colors={colors} icon="clock" iconBg={colors.accent} title="Tempo de uso" subtitle="4 horas por dia" />
        <SettingRow colors={colors} icon="map-pin" iconBg={colors.successSoft} title="Lugares seguros" subtitle="2 áreas monitoradas" />
        <SettingRow colors={colors} icon="users" iconBg={colors.navySoft} title="Contatos aprovados" subtitle="2 contatos ativos" />
      </View>
      <Text style={[styles.settingsGroupTitle, { color: colors.mutedForeground }]}>SUA CONTA</Text>
      <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingRow colors={colors} icon="user" iconBg={colors.navySoft} title="Camila Oliveira" subtitle="Responsável principal" />
        <SettingRow colors={colors} icon="help-circle" iconBg={colors.navySoft} title="Central de ajuda" subtitle="Estamos aqui para ajudar" />
      </View>
      <Pressable onPress={onChangeRole} style={({ pressed }) => [styles.switchRole, { borderColor: colors.border }, pressed && styles.pressed]}><Feather name="repeat" size={17} color={colors.mutedForeground} /><Text style={[styles.switchRoleText, { color: colors.mutedForeground }]}>Trocar perfil de demonstração</Text></Pressable>
      <View style={styles.encryptionNote}><Feather name="lock" size={14} color={colors.success} /><Text style={[styles.encryptionText, { color: colors.mutedForeground }]}>Seus dados são protegidos e o canal privado nunca aparece no monitoramento.</Text></View>
    </ScrollView>
  );
}

function SettingRow({ colors, icon, iconBg, title, subtitle }: { colors: ReturnType<typeof useColors>; icon: keyof typeof Feather.glyphMap; iconBg: string; title: string; subtitle: string }) {
  return <Pressable style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}><View style={[styles.settingIcon, { backgroundColor: iconBg }]}><Feather name={icon} size={17} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>;
}

function ChildHome({ colors, onPrivateChat, onChangeRole }: { colors: ReturnType<typeof useColors>; onPrivateChat: () => void; onChangeRole: () => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.childGreeting}><View><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>SEGUNDA, 31 DE AGOSTO</Text><Text style={[styles.greeting, { color: colors.foreground }]}>Oi, Marina</Text></View><IconButton icon="settings" onPress={onChangeRole} colors={colors} label="Abrir ajustes" /></View>
      <View style={[styles.childTimeCard, { backgroundColor: colors.accent }]}><Text style={[styles.heroOverline, { color: colors.accentForeground }]}>SEU TEMPO DE HOJE</Text><Text style={[styles.childTimeValue, { color: colors.accentForeground }]}>1h 42m</Text><Text style={[styles.childTimeCaption, { color: colors.accentForeground }]}>restantes de 4 horas</Text><View style={[styles.childProgress, { backgroundColor: alpha(colors.primaryForeground, '55') }]}><View style={[styles.progressFill, { width: '58%', backgroundColor: colors.accentForeground }]} /></View><View style={styles.childTimeFooter}><Feather name="info" size={14} color={colors.accentForeground} /><Text style={[styles.childTimeFooterText, { color: colors.accentForeground }]}>Seu responsável pode ajustar este limite.</Text></View></View>
      <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>Suas conversas</Text>
      <View style={[styles.childConversationCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.avatarSmallText, { color: colors.accentForeground }]}>RL</Text></View><View style={styles.conversationCopy}><Text style={[styles.conversationName, { color: colors.foreground }]}>Rafael Lima</Text><Text style={[styles.activityPreview, { color: colors.mutedForeground }]}>Oi Marina, você já chegou?</Text></View><Pill colors={colors} tone="success">Liberado</Pill></View>
      <Pressable onPress={onPrivateChat} style={({ pressed }) => [styles.privateCard, { backgroundColor: colors.primary }, pressed && styles.pressed]}><View style={[styles.privateIcon, { backgroundColor: alpha(colors.primaryForeground, '25') }]}><Feather name="heart" size={18} color={colors.accent} /></View><View style={styles.privateCopy}><Text style={[styles.privateTitle, { color: colors.primaryForeground }]}>Falar com Camila</Text><Text style={[styles.privateText, { color: alpha(colors.primaryForeground, 'B0') }]}>Seu espaço privado com o responsável.</Text></View><Feather name="arrow-up-right" size={20} color={colors.accent} /></Pressable>
      <View style={[styles.childSafetyNote, { backgroundColor: colors.successSoft }]}><Feather name="shield" size={17} color={colors.success} /><Text style={[styles.childSafetyText, { color: colors.inkLight }]}>Se precisar de ajuda, fale com Camila por aqui.</Text></View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [contactStatus, setContactStatus] = useState<ContactStatus>('pending');
  const [privateChatOpen, setPrivateChatOpen] = useState(false);
  const [privateMessage, setPrivateMessage] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    void AsyncStorage.multiGet(['controle-parental-role', 'controle-parental-contact']).then(([storedRole, storedContact]) => {
      if (storedRole[1] === 'parent' || storedRole[1] === 'child') setRole(storedRole[1]);
      if (storedContact[1] === 'approved') setContactStatus('approved');
    });
  }, []);

  const chooseRole = async (nextRole: Role) => {
    await AsyncStorage.setItem('controle-parental-role', nextRole);
    setRole(nextRole);
    setSection('home');
    await Haptics.selectionAsync();
  };

  const approveContact = async () => {
    await AsyncStorage.setItem('controle-parental-contact', 'approved');
    setContactStatus('approved');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const sendPrivateMessage = () => {
    const trimmed = privateMessage.trim();
    if (!trimmed) return;
    setSentMessage(trimmed);
    setPrivateMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pageTitle = useMemo(() => ({ home: '', conversations: 'Conversas', location: 'Localização', settings: 'Ajustes' })[section], [section]);
  if (!fontsLoaded || role === null) {
    if (!fontsLoaded) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
    return <Onboarding colors={colors} onChoose={chooseRole} />;
  }

  const openSection = (next: Section) => {
    setSection(next);
    void Haptics.selectionAsync();
  };

  return (
    <View style={[styles.app, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <View style={styles.brandRow}><LogoMark colors={colors} size={36} /><View><Text style={[styles.brandName, { color: colors.foreground }]}>amparo</Text><Text style={[styles.brandCaption, { color: colors.mutedForeground }]}>{role === 'parent' ? 'modo responsável' : 'modo criança'}</Text></View></View>
        <View style={styles.topActions}><IconButton icon="bell" onPress={() => Alert.alert('Tudo em dia', 'Você não tem novas notificações.')} colors={colors} label="Notificações" /><Pressable onPress={() => chooseRole(role === 'parent' ? 'child' : 'parent')} style={({ pressed }) => [styles.profileChip, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.profileAvatar, { backgroundColor: colors.accent }]}><Text style={[styles.profileAvatarText, { color: colors.accentForeground }]}>{role === 'parent' ? 'C' : 'M'}</Text></View><Feather name="chevron-down" size={14} color={colors.mutedForeground} /></Pressable></View>
      </View>
      <View style={styles.screenBody}>
        {role === 'parent' && section === 'home' && <ParentHome colors={colors} contactStatus={contactStatus} onApprove={approveContact} onOpenSection={openSection} onPrivateChat={() => setPrivateChatOpen(true)} />}
        {role === 'parent' && section === 'conversations' && <ConversationsView colors={colors} onPrivateChat={() => setPrivateChatOpen(true)} />}
        {role === 'parent' && section === 'location' && <LocationView colors={colors} />}
        {role === 'parent' && section === 'settings' && <SettingsView colors={colors} onChangeRole={() => chooseRole('child')} />}
        {role === 'child' && <ChildHome colors={colors} onPrivateChat={() => setPrivateChatOpen(true)} onChangeRole={() => chooseRole('parent')} />}
      </View>
      <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 12) }]}>
        {([
          ['home', 'Resumo', 'home'],
          ['conversations', 'Conversas', 'message-circle'],
          ['location', 'Localização', 'map-pin'],
          ['settings', 'Ajustes', 'sliders'],
        ] as const).map(([item, label, icon]) => (
          <Pressable key={item} onPress={() => openSection(item)} style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}>
            <View style={[styles.navIconWrap, section === item && { backgroundColor: colors.accent }]}><Feather name={icon} size={19} color={section === item ? colors.accentForeground : colors.mutedForeground} /></View>
            <Text style={[styles.navLabel, { color: section === item ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Modal transparent visible={privateChatOpen} animationType="slide" onRequestClose={() => setPrivateChatOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>
          <View style={[styles.privateModal, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}><View style={[styles.privateIcon, { backgroundColor: colors.accent }]}><Feather name="heart" size={18} color={colors.accentForeground} /></View><View style={styles.privateCopy}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Conversa privada</Text><Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Camila ↔ Marina · não espelhada</Text></View><IconButton icon="x" onPress={() => setPrivateChatOpen(false)} colors={colors} label="Fechar conversa" /></View>
            <View style={[styles.chatPrivacy, { backgroundColor: colors.successSoft }]}><Feather name="lock" size={14} color={colors.success} /><Text style={[styles.chatPrivacyText, { color: colors.inkLight }]}>Só vocês duas podem ver estas mensagens.</Text></View>
            <View style={styles.privateMessages}>
              <View style={[styles.chatBubble, styles.chatBubbleOther, { backgroundColor: colors.navySoft }]}><Text style={[styles.chatText, { color: colors.foreground }]}>Oi, filha. Como foi seu dia?</Text><Text style={[styles.chatTime, { color: colors.mutedForeground }]}>10:20</Text></View>
              {sentMessage ? <View style={[styles.chatBubble, styles.chatBubbleChild, { backgroundColor: colors.primary }]}><Text style={[styles.chatText, { color: colors.primaryForeground }]}>{sentMessage}</Text><Text style={[styles.chatTime, { color: alpha(colors.primaryForeground, 'B0') }]}>agora</Text></View> : null}
            </View>
            <View style={[styles.messageComposer, { backgroundColor: colors.background, borderColor: colors.border }]}><TextInput value={privateMessage} onChangeText={setPrivateMessage} placeholder="Escreva uma mensagem…" placeholderTextColor={colors.mutedForeground} style={[styles.messageInput, { color: colors.foreground }]} onSubmitEditing={sendPrivateMessage} returnKeyType="send" /><Pressable accessibilityLabel="Enviar mensagem privada" testID="send-private-message" onPress={sendPrivateMessage} style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Feather name="arrow-up" size={18} color={colors.primaryForeground} /></Pressable></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onboarding: { flex: 1, overflow: 'hidden' },
  onboardingGlow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, right: -120, top: -80, opacity: 0.42 },
  onboardingContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  eyebrow: { fontSize: 11, letterSpacing: 1.3, fontFamily: 'Inter_700Bold', marginTop: 24 },
  onboardingTitle: { fontSize: 39, lineHeight: 45, fontFamily: 'Inter_700Bold', maxWidth: 350, marginTop: 13 },
  onboardingBody: { fontSize: 16, lineHeight: 24, fontFamily: 'Inter_400Regular', marginTop: 15, maxWidth: 340 },
  roleOptions: { gap: 12, marginTop: 36 },
  roleCard: { minHeight: 88, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  roleIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  roleCopy: { flex: 1, marginLeft: 14 },
  roleTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  roleDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 4, maxWidth: 205 },
  privacyNote: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 27 },
  logoMark: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  logoDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, top: 8, right: 8 },
  topBar: { paddingHorizontal: 20, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { fontSize: 20, letterSpacing: -0.6, fontFamily: 'Inter_700Bold' },
  brandCaption: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  profileChip: { height: 40, paddingHorizontal: 7, paddingRight: 10, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  profileAvatar: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  screenBody: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 122 },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 15, marginBottom: 18 },
  childGreeting: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 15, marginBottom: 22 },
  greeting: { fontSize: 29, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', marginTop: 7 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  childHero: { minHeight: 166, borderRadius: 25, padding: 18, overflow: 'hidden' },
  childHeroTop: { flexDirection: 'row', alignItems: 'center' },
  avatarLarge: { width: 52, height: 52, borderRadius: 19, backgroundColor: '#FFFEFB', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  childHeroText: { flex: 1, marginLeft: 12 },
  heroOverline: { color: '#FFFFFF', opacity: 0.62, fontSize: 10, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  heroName: { color: '#FFFFFF', fontSize: 19, fontFamily: 'Inter_700Bold', marginTop: 4 },
  heroChevron: { padding: 8 },
  heroDivider: { height: 1, backgroundColor: '#FFFFFF', opacity: 0.14, marginVertical: 16 },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStatValue: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Inter_700Bold' },
  heroStatLabel: { color: '#FFFFFF', opacity: 0.58, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  heroStatSeparator: { width: 1, height: 29, backgroundColor: '#FFFFFF', opacity: 0.16, marginHorizontal: 22 },
  heroLock: { marginLeft: 'auto', width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF20' },
  approvalCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginTop: 14 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardHeaderCopy: { flex: 1, marginLeft: 10 },
  cardEyebrow: { fontSize: 9, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 4 },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 30 },
  pillText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  contactRow: { flexDirection: 'row', alignItems: 'center', marginTop: 17 },
  avatar: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarSmallText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  contactCopy: { flex: 1, marginLeft: 11 },
  contactName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  contactMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  restrictionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13 },
  restrictionText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  approvalActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  primaryButton: { minHeight: 47, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  compactButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 13 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  compactButtonText: { fontSize: 12 },
  outlineButton: { borderWidth: 1 },
  detailsButton: { paddingVertical: 10 },
  detailsText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  approvedBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 13, marginTop: 14 },
  approvedIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  approvedCopy: { flex: 1, marginLeft: 10 },
  approvedTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  approvedText: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 11 },
  sectionTitle: { fontSize: 17, letterSpacing: -0.25, fontFamily: 'Inter_700Bold' },
  linkText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, minHeight: 130, borderRadius: 18, borderWidth: 1, padding: 13 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metricLabel: { fontSize: 9, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  metricValue: { fontSize: 21, letterSpacing: -0.5, fontFamily: 'Inter_700Bold', marginTop: 13 },
  progressTrack: { height: 6, borderRadius: 5, marginTop: 11, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  metricFoot: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 8 },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  pulseDot: { width: 7, height: 7, borderRadius: 4 },
  activityCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  activityItem: { minHeight: 66, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  activityIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1, marginLeft: 10 },
  activityTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  activityPreview: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  activityTime: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  mirrorNote: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11 },
  mirrorNoteText: { fontSize: 10, fontFamily: 'Inter_400Regular', flex: 1 },
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
  pageSubtitle: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 7, maxWidth: 310 },
  privacyBanner: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 15, padding: 13, marginTop: 20 },
  privacyBannerText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium', flex: 1 },
  conversationList: { gap: 9, marginTop: 16 },
  conversationRow: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center' },
  conversationCopy: { flex: 1, marginLeft: 11 },
  conversationNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  conversationName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  mirrorMini: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 7 },
  unreadBadge: { width: 23, height: 23, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  unreadText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  onlineDot: { position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, borderWidth: 3 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 18 },
  backText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mirrorLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 27, marginBottom: 11 },
  mirrorLabelText: { fontSize: 10, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  chatStack: { gap: 10 },
  chatBubble: { borderRadius: 17, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '83%' },
  chatBubbleOther: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 5 },
  chatBubbleChild: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  chatText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_500Medium' },
  chatTime: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 5, textAlign: 'right' },
  restrictionInfo: { flexDirection: 'row', alignItems: 'center', gap: 7, marginVertical: 18 },
  mapCard: { height: 285, borderRadius: 24, marginTop: 20, overflow: 'hidden', position: 'relative' },
  mapGrid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.28 },
  mapRoad: { position: 'absolute', borderRadius: 20, transform: [{ rotate: '34deg' }] },
  mapRoadOne: { width: 460, height: 14, top: 72, left: -56 },
  mapRoadTwo: { width: 400, height: 11, top: 176, left: -24, transform: [{ rotate: '-24deg' }] },
  mapRoadThree: { width: 500, height: 9, top: 132, left: -40, transform: [{ rotate: '76deg' }] },
  mapPin: { width: 50, height: 50, borderRadius: 19, borderWidth: 4, alignItems: 'center', justifyContent: 'center', position: 'absolute', top: 110, left: '45%' },
  mapCallout: { position: 'absolute', top: 58, left: '38%', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  mapCalloutTitle: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  mapCalloutText: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 2 },
  mapBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFFFFF55' },
  mapBottomText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  safePlaceRow: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  safePlaceIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  safePlaceCopy: { flex: 1, marginLeft: 10 },
  settingsProfile: { flexDirection: 'row', alignItems: 'center', borderRadius: 21, padding: 15, marginTop: 20 },
  settingsGroupTitle: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginTop: 26, marginBottom: 9 },
  settingsGroup: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 12, minHeight: 65 },
  settingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, marginLeft: 10 },
  settingTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  settingSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  switchRole: { minHeight: 45, borderWidth: 1, borderRadius: 14, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  switchRoleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  encryptionNote: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 14 },
  encryptionText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  childTimeCard: { borderRadius: 25, padding: 19, marginBottom: 25 },
  childTimeValue: { fontSize: 47, letterSpacing: -1.5, fontFamily: 'Inter_700Bold', marginTop: 10 },
  childTimeCaption: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: -1 },
  childProgress: { height: 7, borderRadius: 6, overflow: 'hidden', marginTop: 17 },
  childTimeFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  childTimeFooterText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  childConversationCard: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  childSafetyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, padding: 13, marginTop: 14 },
  childSafetyText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#15312F66' },
  privateModal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, minHeight: 430 },
  modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: '#D8DDD5', marginBottom: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  modalSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  chatPrivacy: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, padding: 10, marginTop: 17 },
  chatPrivacyText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  privateMessages: { flex: 1, justifyContent: 'flex-end', gap: 10, paddingVertical: 18 },
  messageComposer: { minHeight: 50, borderWidth: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6 },
  messageInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', minHeight: 44 },
  sendButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
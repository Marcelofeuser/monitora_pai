import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaSource, REACTION_EMOJIS, type PrivateMessage, type PrivateMessageInput } from './api';
import { ALLOWED_STICKERS } from './stickers';
import { Avatar, CHAT_DARK, KIDS } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  ownUserId: string;
  loadMessages: () => Promise<PrivateMessage[]>;
  sendMessage: (input: PrivateMessageInput) => Promise<PrivateMessage>;
  onBack?: () => void;
  headerAction?: React.ReactNode;
  readOnly?: boolean;
  variant?: 'default' | 'kids';
  /** Use quando o chat não está dentro de um container que já respeita a área segura superior. */
  safeTop?: boolean;
  /** Cabeçalhos de autenticação para baixar fotos, áudios e vídeos (a mídia é privada). */
  getMediaHeaders?: () => Promise<Record<string, string>>;
  /** 1.1: reagir (emoji null remove). Sem isto (ex.: espelho), segurar a mensagem não abre reações. */
  onReact?: (messageId: string, emoji: string | null) => Promise<void>;
};

type ChatTheme = {
  kids: boolean;
  background: string;
  header: string;
  headerForeground: string;
  headerMuted: string;
  mineBg: string;
  mineText: string;
  mineTime: string;
  otherBg: string;
  otherText: string;
  otherTime: string;
  otherBorder: string;
  border: string;
  composerBg: string;
  inputBg: string;
  inputText: string;
  placeholder: string;
  accent: string;
  accentText: string;
  danger: string;
  dayChip: string;
  dayText: string;
  sheetBg: string;
  sheetText: string;
  toolPlus: string;
  toolMic: string;
  toolSticker: string;
  toolIcon: string;
  senderColors: string[];
};

const ADULT_THEME: ChatTheme = {
  kids: false,
  background: CHAT_DARK.background,
  header: CHAT_DARK.header,
  headerForeground: CHAT_DARK.headerForeground,
  headerMuted: CHAT_DARK.headerMuted,
  mineBg: CHAT_DARK.bubbleMine,
  mineText: CHAT_DARK.bubbleMineText,
  mineTime: '#D6ECEA',
  otherBg: CHAT_DARK.bubbleOther,
  otherText: CHAT_DARK.bubbleOtherText,
  otherTime: CHAT_DARK.headerMuted,
  otherBorder: CHAT_DARK.border,
  border: CHAT_DARK.border,
  composerBg: CHAT_DARK.composer,
  inputBg: CHAT_DARK.input,
  inputText: CHAT_DARK.inputText,
  placeholder: CHAT_DARK.placeholder,
  accent: CHAT_DARK.accent,
  accentText: '#263345',
  danger: CHAT_DARK.danger,
  dayChip: CHAT_DARK.dayChip,
  dayText: CHAT_DARK.headerMuted,
  sheetBg: '#112321',
  sheetText: '#EAF4F1',
  toolPlus: CHAT_DARK.input,
  toolMic: CHAT_DARK.input,
  toolSticker: CHAT_DARK.input,
  toolIcon: CHAT_DARK.accent,
  senderColors: ['#7FE3D2', '#FFD36B', '#FF9E8F', '#A9B8FF', '#B8E986'],
};

const KIDS_THEME: ChatTheme = {
  kids: true,
  background: KIDS.background,
  header: KIDS.primary,
  headerForeground: '#FFFFFF',
  headerMuted: '#DDF7F3',
  mineBg: KIDS.primary,
  mineText: '#FFFFFF',
  mineTime: '#E3D7FF',
  otherBg: '#FFFFFF',
  otherText: KIDS.foreground,
  otherTime: '#7C8D89',
  otherBorder: KIDS.aqua,
  border: KIDS.border,
  composerBg: '#FFFFFF',
  inputBg: KIDS.background,
  inputText: KIDS.foreground,
  placeholder: '#9AA9A5',
  accent: KIDS.yellow,
  accentText: '#3F2C00',
  danger: KIDS.destructive,
  dayChip: '#FFF1C2',
  dayText: '#7A5A00',
  sheetBg: KIDS.background,
  sheetText: KIDS.foreground,
  toolPlus: KIDS.aqua,
  toolMic: KIDS.coral,
  toolSticker: KIDS.yellow,
  toolIcon: '#FFFFFF',
  senderColors: [KIDS.coral, KIDS.lilac, KIDS.aqua, '#E39A00', KIDS.primary],
};

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: PrivateMessage };

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date) {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Hoje';
  if (dayKey(date) === dayKey(yesterday)) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function clock(value: string) {
  const date = parseDate(value);
  return date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

function buildRows(messages: PrivateMessage[]): Row[] {
  const rows: Row[] = [];
  let lastDay = '';
  for (const message of messages) {
    const date = parseDate(message.createdAt);
    if (date) {
      const key = dayKey(date);
      if (key !== lastDay) {
        rows.push({ kind: 'day', key: `day-${key}`, label: dayLabel(date) });
        lastDay = key;
      }
    }
    rows.push({ kind: 'message', key: message.id, message });
  }
  return rows;
}

function senderColor(theme: ChatTheme, name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) | 0;
  return theme.senderColors[Math.abs(hash) % theme.senderColors.length];
}

/**
 * Botão de ação do cabeçalho do chat (Ligar, Grupos, Perfil...).
 * No chat adulto é uma pílula discreta; no Kids é um chip colorido com emoji.
 */
export function ChatChip({ label, icon, emoji, color, onPress, disabled, danger, kids, loading }: {
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  emoji?: string;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  kids?: boolean;
  loading?: boolean;
}) {
  const adultBg = danger ? 'rgba(255,122,112,0.16)' : 'rgba(255,255,255,0.12)';
  const adultFg = danger ? CHAT_DARK.danger : '#FFFFFF';
  const background = kids ? (danger ? KIDS.destructive : color ?? KIDS.coral) : adultBg;
  const foreground = kids ? '#FFFFFF' : adultFg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [chipStyles.chip, kids && chipStyles.chipKids, { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : kids && emoji ? <Text style={chipStyles.emoji}>{emoji}</Text> : icon ? <Feather name={icon} size={15} color={foreground} /> : null}
      <Text style={[chipStyles.label, kids && chipStyles.labelKids, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 13, borderRadius: 18 },
  chipKids: { minHeight: 42, paddingHorizontal: 15, borderRadius: 21 },
  emoji: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: '700' },
  labelKids: { fontSize: 14, fontWeight: '800' },
});

type GetHeaders = (() => Promise<Record<string, string>>) | undefined;

/** Resolve a URL completa da mídia + cabeçalho de autenticação atual. */
function useMediaSource(contentUrl: string, getHeaders: GetHeaders) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let headers: Record<string, string> = {};
      try { headers = getHeaders ? await getHeaders() : {}; } catch { headers = {}; }
      if (alive) setSource(mediaSource(contentUrl, headers));
    })();
    return () => { alive = false; };
  }, [contentUrl]);
  return source;
}

function MediaFailed({ text, color }: { text: string; color: string }) {
  return <Text style={{ color, fontSize: 13, marginBottom: 6 }}>{text}</Text>;
}

function PhotoMessage({ contentUrl, getHeaders, color }: { contentUrl: string; getHeaders: GetHeaders; color: string }) {
  const source = useMediaSource(contentUrl, getHeaders);
  const [failed, setFailed] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  if (failed) return <MediaFailed text="Não foi possível abrir a foto." color={color} />;
  if (!source) return <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={color} /></View>;
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Abrir foto em tela cheia" onPress={() => setZoomOpen(true)}>
        <Image accessibilityLabel="Foto enviada na conversa" source={source} resizeMode="cover" style={styles.photo} onError={(event) => { console.log('[MEDIA] foto falhou', source.uri, event.nativeEvent?.error); setFailed(true); }} />
      </Pressable>
      <PhotoViewer source={source} visible={zoomOpen} onClose={() => setZoomOpen(false)} />
    </>
  );
}

/** Foto em tela cheia: pinça para ampliar (iOS, via ScrollView) e toque duplo alterna 1x/2,5x. */
function PhotoViewer({ source, visible, onClose }: { source: { uri: string; headers: Record<string, string> }; visible: boolean; onClose: () => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const zoomedRef = useRef(false);
  const lastTapRef = useRef(0);
  const { width, height } = useWindowDimensions();
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      const next = zoomedRef.current ? 1 : 2.5;
      zoomedRef.current = !zoomedRef.current;
      // iOS: zoom programático pelo ScrollView
      (scrollRef.current as any)?.getScrollResponder?.()?.scrollResponderZoomTo?.({ x: width / 2 - width / (2 * next), y: height / 2 - height / (2 * next), width: width / next, height: height / next, animated: true });
    }
    lastTapRef.current = now;
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewerBackdrop}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={handleTap} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            <Image accessibilityLabel="Foto em tela cheia" source={source} resizeMode="contain" style={{ width, height }} />
          </Pressable>
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar foto" onPress={() => { zoomedRef.current = false; onClose(); }} style={styles.viewerClose} hitSlop={12}>
          <Text style={styles.viewerCloseText}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function AudioMessage({ contentUrl, getHeaders, theme, mine }: { contentUrl: string; getHeaders: GetHeaders; theme: ChatTheme; mine: boolean }) {
  const source = useMediaSource(contentUrl, getHeaders);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const tint = mine ? theme.mineText : theme.otherText;
  useEffect(() => { if (source) { try { player.replace(source); } catch (cause) { console.log('[MEDIA] áudio falhou', source.uri, String(cause)); } } }, [source?.uri]);
  const toggle = async () => {
    if (status.playing) { player.pause(); return; }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.play();
    } catch (cause) { console.log('[MEDIA] play falhou', String(cause)); }
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pausar mensagem de áudio' : 'Reproduzir mensagem de áudio'} disabled={!source} onPress={() => void toggle()} style={[styles.mediaLink, !source && { opacity: 0.5 }]}>
      <View style={[styles.audioPill, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : 'rgba(127,160,152,0.2)' }]}>
        <Feather name={status.playing ? 'pause' : 'play'} size={16} color={tint} />
        <Text style={{ color: tint, fontWeight: '700' }}>{status.playing ? 'Pausar áudio' : source ? 'Reproduzir áudio' : 'Carregando…'}</Text>
      </View>
    </Pressable>
  );
}

// expo-video é opcional: se o pacote ainda não estiver instalado no app, cai no link simples.
let ExpoVideo: any = null;
try { ExpoVideo = require('expo-video'); } catch { ExpoVideo = null; }

function InlineVideo({ source }: { source: { uri: string; headers: Record<string, string> } }) {
  const player = ExpoVideo.useVideoPlayer(source, (instance: any) => { instance.loop = false; });
  return <ExpoVideo.VideoView player={player} style={styles.video} nativeControls allowsFullscreen contentFit="contain" />;
}

function VideoMessage({ contentUrl, getHeaders, theme, mine }: { contentUrl: string; getHeaders: GetHeaders; theme: ChatTheme; mine: boolean }) {
  const source = useMediaSource(contentUrl, getHeaders);
  const tint = mine ? theme.mineText : theme.otherText;
  if (!source) return <View style={[styles.video, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={tint} /></View>;
  if (ExpoVideo) return <InlineVideo source={source} />;
  return (
    <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(source.uri)} style={styles.mediaLink}>
      <View style={[styles.audioPill, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : 'rgba(127,160,152,0.2)' }]}>
        <Feather name="play-circle" size={16} color={tint} />
        <Text style={{ color: tint, fontWeight: '700' }}>Abrir vídeo</Text>
      </View>
    </Pressable>
  );
}

export function PrivateChat({ title, subtitle = 'Conversa privada da família', ownUserId, loadMessages, sendMessage, onBack, headerAction, readOnly = false, variant = 'default', safeTop = false, getMediaHeaders, onReact }: Props) {
  const theme = variant === 'kids' ? KIDS_THEME : ADULT_THEME;
  const kids = theme.kids;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  // 1.1: menu ao segurar a mensagem (reações + responder) e citação no composer.
  const [actionFor, setActionFor] = useState<PrivateMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<PrivateMessage | null>(null);
  const inputRef = useRef<TextInput>(null);
  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    extension: '.m4a',
    android: { ...RecordingPresets.LOW_QUALITY.android, extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
  });
  const recorderState = useAudioRecorderState(recorder);
  const finishingRecording = useRef(false);
  const wasRecording = useRef(false);
  const refreshing = useRef(false);
  const listRef = useRef<FlatList<Row>>(null);
  const rows = useMemo(() => buildRows(messages), [messages]);

  const refresh = useCallback(async (showLoading = false) => {
    if (refreshing.current) return;
    refreshing.current = true;
    if (showLoading) setLoading(true);
    try {
      const latest = await loadMessages();
      setMessages(latest);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a conversa.');
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [loadMessages]);

  useEffect(() => {
    void refresh(true);
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const submit = async (input: PrivateMessageInput) => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const payload: PrivateMessageInput = replyingTo ? { ...input, replyToMessageId: replyingTo.id } : input;
      const created = await sendMessage(payload);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
      setDraft('');
      setReplyingTo(null);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const pickMedia = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permita o acesso às fotos e vídeos para anexar uma mídia.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      // iPhone guarda fotos em HEIC e vídeos em HEVC; "compatible" exporta JPEG/H.264,
      // que abrem em qualquer aparelho (Android, PWA) e passam na API.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 60 * 1024 * 1024) {
      setError('O arquivo é maior que o limite de 60 MB. Escolha uma mídia menor.');
      return;
    }
    const type = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const extension = type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    await submit({
      file: { uri: asset.uri, name: asset.fileName || `ampara-${Date.now()}.${extension}`, type },
      caption: draft.trim(),
    });
  };

  const sendSticker = (stickerEmoji: string) => {
    setStickerPickerOpen(false);
    void submit({ stickerEmoji });
  };

  const finishRecording = async () => {
    if (finishingRecording.current || !wasRecording.current) return;
    finishingRecording.current = true;
    wasRecording.current = false;
    try {
      await recorder.stop();
      const uri = recorder.uri ?? recorder.getStatus().url;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!uri) throw new Error('Não foi possível finalizar a gravação.');
      await submit({ file: { uri, name: `ampara-audio-${Date.now()}.m4a`, type: 'audio/mp4' } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o áudio.');
    } finally {
      finishingRecording.current = false;
    }
  };

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 300_000) void finishRecording();
  }, [recorderState.durationMillis, recorderState.isRecording]);

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await finishRecording();
      return;
    }
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Permita o acesso ao microfone para gravar uma mensagem de voz.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      wasRecording.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a gravação.');
    }
  };

  const nameOf = (senderId: string) => {
    if (senderId === ownUserId) return 'Você';
    return messages.find((m) => m.senderId === senderId && m.senderName)?.senderName ?? title;
  };

  const react = async (message: PrivateMessage, emoji: string) => {
    setActionFor(null);
    if (!onReact) return;
    const mineNow = message.reactions?.find((r) => r.userId === ownUserId)?.emoji ?? null;
    const next = mineNow === emoji ? null : emoji;
    // Otimista: atualiza já, o polling confirma.
    setMessages((current) => current.map((m) => m.id !== message.id ? m : {
      ...m,
      reactions: [...(m.reactions ?? []).filter((r) => r.userId !== ownUserId), ...(next ? [{ emoji: next, userId: ownUserId }] : [])],
    }));
    try {
      await onReact(message.id, next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reagir.');
      void refresh();
    }
  };

  const startReply = (message: PrivateMessage) => {
    setActionFor(null);
    setReplyingTo(message);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const canSend = !!draft.trim() && !sending;
  const toolSize = kids ? 46 : 42;

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'day') {
      return (
        <View style={styles.dayRow}>
          <View style={[styles.dayChip, { backgroundColor: theme.dayChip }]}>
            <Text style={[styles.dayText, { color: theme.dayText }]}>{item.label}</Text>
          </View>
        </View>
      );
    }
    const message = item.message;
    const mine = message.senderId === ownUserId;
    const sticker = message.contentUrl?.startsWith('emoji:') ? message.contentUrl.slice('emoji:'.length) : null;
    const mediaUrl = message.contentUrl && !sticker ? message.contentUrl : null;
    const time = clock(message.createdAt);
    const senderLabel = !mine && message.senderName ? (
      <Text style={[styles.senderName, { color: senderColor(theme, message.senderName) }]}>{message.senderName}</Text>
    ) : null;
    const quote = message.replyTo ? (
      <View style={[styles.quote, { borderLeftColor: kids ? KIDS.green : theme.accent, backgroundColor: mine ? 'rgba(0,0,0,0.12)' : 'rgba(127,127,127,0.12)' }]}>
        <Text numberOfLines={1} style={[styles.quoteName, { color: mine ? theme.mineText : theme.accent }]}>{nameOf(message.replyTo.senderId)}</Text>
        <Text numberOfLines={2} style={[styles.quoteText, { color: mine ? theme.mineText : theme.otherText }]}>{previewText(message.replyTo)}</Text>
      </View>
    ) : null;
    const grouped = groupReactions(message.reactions);
    const myReaction = message.reactions?.find((r) => r.userId === ownUserId)?.emoji ?? null;
    const reactionBar = grouped.length > 0 ? (
      <View style={[styles.reactionBar, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
        {grouped.map(({ emoji, count }) => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`Reação ${emoji}, ${count}`}
            disabled={readOnly || !onReact}
            onPress={() => void react(message, emoji)}
            style={[styles.reactionChip, { backgroundColor: theme.composerBg, borderColor: myReaction === emoji ? (kids ? KIDS.green : theme.accent) : theme.border }]}
          >
            <Text style={styles.reactionChipText}>{emoji}{count > 1 ? ` ${count}` : ''}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;
    const canAct = !readOnly && !!onReact;
    return (
      <Pressable
        onLongPress={canAct ? () => setActionFor(message) : undefined}
        delayLongPress={280}
        accessibilityHint={canAct ? 'Segure para reagir ou responder' : undefined}
        style={[styles.messageCol, mine && styles.messageColMine]}
      >
      <View style={[styles.messageRow, mine && styles.messageRowMine]}>
        {sticker ? (
          <View style={styles.stickerMessage}>
            {senderLabel}
            {quote}
            <Text accessibilityLabel={`Figurinha ${sticker}`} style={styles.sticker}>{sticker}</Text>
            <Text style={[styles.time, { color: theme.otherTime }]}>{time}</Text>
          </View>
        ) : (
          <View style={[
            styles.bubble,
            kids && styles.bubbleKids,
            mine ? styles.bubbleMine : styles.bubbleOther,
            {
              backgroundColor: mine ? theme.mineBg : theme.otherBg,
              borderColor: mine ? 'transparent' : theme.otherBorder,
              borderWidth: mine ? 0 : kids ? 2 : StyleSheet.hairlineWidth,
            },
          ]}>
            {senderLabel}
            {quote}
            {message.type === 'photo' && mediaUrl ? <PhotoMessage contentUrl={mediaUrl} getHeaders={getMediaHeaders} color={mine ? theme.mineText : theme.otherText} /> : null}
            {message.type === 'audio' && mediaUrl ? <AudioMessage contentUrl={mediaUrl} getHeaders={getMediaHeaders} theme={theme} mine={mine} /> : null}
            {message.type === 'video' && mediaUrl ? <VideoMessage contentUrl={mediaUrl} getHeaders={getMediaHeaders} theme={theme} mine={mine} /> : null}
            {message.textContent ? <Text style={[styles.messageText, kids && styles.messageTextKids, { color: mine ? theme.mineText : theme.otherText }]}>{message.textContent}</Text> : null}
            {!mediaUrl && !message.textContent ? <Text style={[styles.messageText, { color: mine ? theme.mineText : theme.otherText }]}>Mensagem</Text> : null}
            <Text style={[styles.time, { color: mine ? theme.mineTime : theme.otherTime }]}>{time}</Text>
          </View>
        )}
      </View>
      {reactionBar}
      </Pressable>
    );
  };

  const emptyText = readOnly
    ? 'Ainda não há mensagens nesta conversa.'
    : kids
      ? 'Mande um oi para começar a conversa!'
      : 'Esta conversa é só entre vocês. Envie a primeira mensagem.';

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, kids && styles.headerKids, { backgroundColor: theme.header, paddingTop: safeTop ? insets.top + 12 : 14 }]}>
        <View style={styles.headerTop}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} hitSlop={10} style={styles.back}>
              <Feather name="chevron-left" size={26} color={theme.headerForeground} />
            </Pressable>
          ) : null}
          <Avatar label={title} size={kids ? 46 : 42} background={kids ? KIDS.yellow : theme.accent} color={kids ? '#5A3F00' : theme.accentText} />
          <View style={styles.titleBlock}>
            <Text numberOfLines={1} style={[styles.title, kids && styles.titleKids, { color: theme.headerForeground }]}>{title}</Text>
            <Text numberOfLines={1} style={[styles.subtitle, { color: theme.headerMuted }]}>{subtitle}</Text>
          </View>
        </View>
        {headerAction ? <View style={styles.headerActions}>{headerAction}</View> : null}
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={theme.accent} /></View> : (
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.messages}
          data={rows}
          keyExtractor={(row) => row.key}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={[styles.empty, { color: kids ? KIDS.mutedForeground : theme.headerMuted }]}>{kids ? '💬\n' : ''}{emptyText}</Text>}
          renderItem={renderRow}
        />
      )}
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text>}
      {!readOnly && replyingTo ? (
        <View style={[styles.replyBar, { backgroundColor: theme.composerBg, borderTopColor: theme.border }]}>
          <View style={[styles.quote, { flex: 1, marginBottom: 0, borderLeftColor: kids ? KIDS.green : theme.accent, backgroundColor: 'rgba(127,127,127,0.12)' }]}>
            <Text numberOfLines={1} style={[styles.quoteName, { color: theme.accent }]}>Respondendo a {nameOf(replyingTo.senderId)}</Text>
            <Text numberOfLines={1} style={[styles.quoteText, { color: theme.inputText }]}>{previewText({ type: replyingTo.type, textContent: replyingTo.textContent, sticker: replyingTo.contentUrl?.startsWith('emoji:') ? replyingTo.contentUrl.slice(6) : null })}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancelar resposta" hitSlop={10} onPress={() => setReplyingTo(null)} style={{ padding: 6 }}>
            <Feather name="x" size={20} color={theme.inputText} />
          </Pressable>
        </View>
      ) : null}
      {!readOnly && <View style={[styles.composer, { backgroundColor: theme.composerBg, borderTopColor: theme.border, paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Anexar foto ou vídeo" disabled={sending} onPress={() => void pickMedia()} style={[styles.toolButton, { width: toolSize, height: toolSize, borderRadius: toolSize / 2, backgroundColor: theme.toolPlus }]}>
          <Feather name="plus" size={20} color={theme.toolIcon} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={recorderState.isRecording ? 'Parar e enviar gravação' : 'Gravar mensagem de voz'} disabled={sending} onPress={() => void toggleRecording()} style={[styles.toolButton, { width: toolSize, height: toolSize, borderRadius: toolSize / 2, backgroundColor: recorderState.isRecording ? theme.danger : theme.toolMic }]}>
          <Feather name={recorderState.isRecording ? 'square' : 'mic'} size={18} color={recorderState.isRecording ? '#FFFFFF' : theme.toolIcon} />
        </Pressable>
        {recorderState.isRecording ? <Text accessibilityLiveRegion="polite" style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>{Math.floor(recorderState.durationMillis / 1000)}s</Text> : null}
        <TextInput
          ref={inputRef}
          accessibilityLabel="Mensagem"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => { const text = draft.trim(); if (text) void submit({ textContent: text }); }}
          returnKeyType="send"
          maxLength={4000}
          placeholder={kids ? 'Escreva aqui…' : 'Escreva uma mensagem'}
          placeholderTextColor={theme.placeholder}
          style={[styles.input, kids && styles.inputKids, { color: theme.inputText, backgroundColor: theme.inputBg, borderColor: kids ? theme.border : 'transparent' }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Escolher figurinha" disabled={sending} onPress={() => setStickerPickerOpen(true)} style={[styles.toolButton, { width: toolSize, height: toolSize, borderRadius: toolSize / 2, backgroundColor: theme.toolSticker }]}>
          <Feather name="smile" size={20} color={kids ? '#5A3F00' : theme.toolIcon} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={!canSend} onPress={() => void submit({ textContent: draft.trim() })} style={[styles.send, { width: toolSize, height: toolSize, borderRadius: toolSize / 2, backgroundColor: kids ? KIDS.green : theme.accent, opacity: canSend ? 1 : 0.45 }]}>
          {sending ? <ActivityIndicator color={kids ? '#12362F' : theme.accentText} size="small" /> : <Feather name="send" size={19} color={kids ? '#12362F' : theme.accentText} />}
        </Pressable>
      </View>}
      {!readOnly && <Modal visible={stickerPickerOpen} transparent animationType="slide" onRequestClose={() => setStickerPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.stickerSheet, { backgroundColor: theme.sheetBg }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.sheetText }]}>{kids ? 'Escolha uma figurinha 🎉' : 'Escolha uma figurinha'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar figurinhas" hitSlop={10} onPress={() => setStickerPickerOpen(false)}><Feather name="x" size={22} color={theme.accent} /></Pressable>
            </View>
            <FlatList
              data={ALLOWED_STICKERS}
              numColumns={7}
              keyExtractor={(sticker, index) => `${index}-${sticker}`}
              contentContainerStyle={styles.stickerGrid}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Enviar figurinha ${item}`} disabled={sending} onPress={() => sendSticker(item)} style={styles.stickerButton}>
                  <Text style={styles.stickerOption}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>}
      {canReactModal(readOnly, onReact) && <Modal visible={!!actionFor} transparent animationType="fade" onRequestClose={() => setActionFor(null)}>
        <Pressable style={styles.actionBackdrop} onPress={() => setActionFor(null)}>
          <Pressable style={[styles.actionSheet, { backgroundColor: theme.sheetBg }]} onPress={() => {}}>
            <View style={styles.reactionPickRow}>
              {REACTION_EMOJIS.map((emoji) => {
                const selected = actionFor?.reactions?.some((r) => r.userId === ownUserId && r.emoji === emoji);
                return (
                  <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Reagir com ${emoji}`} onPress={() => actionFor && void react(actionFor, emoji)} style={[styles.reactionPick, selected && { backgroundColor: 'rgba(127,127,127,0.25)' }]}>
                    <Text style={styles.reactionPickText}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="button" onPress={() => actionFor && startReply(actionFor)} style={[styles.actionItem, { borderTopColor: theme.border }]}>
              <Feather name="corner-up-left" size={19} color={theme.sheetText} />
              <Text style={[styles.actionItemText, { color: theme.sheetText }]}>Responder</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 14, paddingBottom: 12, gap: 10 },
  headerKids: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  titleBlock: { flex: 1 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  titleKids: { fontSize: 20 },
  subtitle: { fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  messages: { padding: 14, gap: 8, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', alignSelf: 'center', marginVertical: 24, maxWidth: 260, lineHeight: 22, fontSize: 14 },
  dayRow: { alignItems: 'center', marginVertical: 6 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  dayText: { fontSize: 11, fontWeight: '700' },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  messageCol: { alignItems: 'flex-start' },
  messageColMine: { alignItems: 'flex-end' },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  quoteName: { fontSize: 12, fontWeight: '800' },
  quoteText: { fontSize: 13, opacity: 0.9 },
  reactionBar: { flexDirection: 'row', gap: 4, marginTop: -4, marginBottom: 2, marginHorizontal: 8 },
  reactionChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  reactionChipText: { fontSize: 14 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  actionBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  actionSheet: { borderRadius: 20, overflow: 'hidden' },
  reactionPickRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 8 },
  reactionPick: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  reactionPickText: { fontSize: 28 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  actionItemText: { fontSize: 16, fontWeight: '600' },
  messageRowMine: { justifyContent: 'flex-end' },
  senderName: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  bubble: { maxWidth: '82%', minWidth: 70, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6, borderRadius: 18 },
  bubbleKids: { borderRadius: 22, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 8 },
  bubbleMine: { borderBottomRightRadius: 5 },
  bubbleOther: { borderBottomLeftRadius: 5 },
  messageText: { fontSize: 15, lineHeight: 21 },
  messageTextKids: { fontSize: 16, lineHeight: 23 },
  time: { alignSelf: 'flex-end', fontSize: 10, marginTop: 4 },
  error: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  composer: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  inputKids: { minHeight: 48, fontSize: 16, borderWidth: 2 },
  send: { alignItems: 'center', justifyContent: 'center' },
  toolButton: { alignItems: 'center', justifyContent: 'center' },
  photo: { width: 220, height: 170, borderRadius: 12, marginBottom: 6 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerClose: { position: 'absolute', top: 54, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  viewerCloseText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  video: { width: 240, height: 180, borderRadius: 12, marginBottom: 6, backgroundColor: '#000', overflow: 'hidden' },
  mediaLink: { minHeight: 40, justifyContent: 'center' },
  audioPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 },
  stickerMessage: { alignItems: 'center', paddingHorizontal: 8 },
  sticker: { fontSize: 54, lineHeight: 66 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  stickerSheet: { maxHeight: '72%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 20, paddingBottom: 28 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  stickerGrid: { paddingHorizontal: 10 },
  stickerButton: { width: '14.28%', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  stickerOption: { fontSize: 27 },
});

function canReactModal(readOnly: boolean, onReact: unknown): boolean {
  return !readOnly && !!onReact;
}

function previewText(m: { type: string; textContent: string | null; sticker?: string | null }): string {
  if (m.sticker) return `Figurinha ${m.sticker}`;
  if (m.textContent) return m.textContent;
  if (m.type === 'photo') return '📷 Foto';
  if (m.type === 'audio') return '🎤 Mensagem de voz';
  if (m.type === 'video') return '🎬 Vídeo';
  return 'Mensagem';
}

function groupReactions(reactions?: Array<{ emoji: string; userId: string }>): Array<{ emoji: string; count: number }> {
  if (!reactions?.length) return [];
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count }));
}

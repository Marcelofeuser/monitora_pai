import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { PrivateMessage, PrivateMessageInput } from './api';
import { ALLOWED_STICKERS } from './stickers';

type Props = {
  title: string;
  subtitle?: string;
  ownUserId: string;
  loadMessages: () => Promise<PrivateMessage[]>;
  sendMessage: (input: PrivateMessageInput) => Promise<PrivateMessage>;
  onBack?: () => void;
  headerAction?: React.ReactNode;
  readOnly?: boolean;
};

export function PrivateChat({ title, subtitle = 'Conversa privada da família', ownUserId, loadMessages, sendMessage, onBack, headerAction, readOnly = false }: Props) {
  const colors = useColors();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const listRef = useRef<FlatList<PrivateMessage>>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const latest = await loadMessages();
      setMessages(latest);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a conversa.');
    } finally {
      setLoading(false);
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
      const created = await sendMessage(input);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
      setDraft('');
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
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

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {onBack && <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={{ color: colors.primary }}>Voltar</Text></Pressable>}
        <View style={styles.titleRow}><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>{headerAction}</View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : (
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.messages}
          data={messages}
          keyExtractor={(message) => message.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground }]}>{readOnly ? 'Ainda não há mensagens nesta conversa.' : 'Esta conversa é só entre vocês. Envie a primeira mensagem.'}</Text>}
          renderItem={({ item }) => {
            const mine = item.senderId === ownUserId;
            const sticker = item.contentUrl?.startsWith('emoji:') ? item.contentUrl.slice('emoji:'.length) : null;
            const mediaUrl = item.contentUrl && !sticker ? item.contentUrl : null;
            return (
              <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                {sticker ? (
                  <View style={styles.stickerMessage}>
                    {!mine && item.senderName ? <Text style={[styles.senderName, { color: colors.mutedForeground }]}>{item.senderName}</Text> : null}
                    <Text accessibilityLabel={`Figurinha ${sticker}`} style={styles.sticker}>{sticker}</Text>
                    <Text style={[styles.time, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                ) : (
                  <View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.card, borderColor: colors.border }]}>
                    {!mine && item.senderName ? <Text style={[styles.senderName, { color: colors.mutedForeground }]}>{item.senderName}</Text> : null}
                    {item.type === 'photo' && mediaUrl ? <Image accessibilityLabel="Foto enviada na conversa" source={{ uri: mediaUrl }} resizeMode="cover" style={styles.photo} /> : null}
                    {(item.type === 'video' || item.type === 'audio') && mediaUrl ? (
                      <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(mediaUrl)} style={styles.mediaLink}>
                        <Text style={{ color: mine ? colors.primaryForeground : colors.primary }}>{item.type === 'video' ? '▶ Abrir vídeo' : '▶ Reproduzir áudio'}</Text>
                      </Pressable>
                    ) : null}
                    {item.textContent ? <Text style={{ color: mine ? colors.primaryForeground : colors.foreground }}>{item.textContent}</Text> : null}
                    {!mediaUrl && !item.textContent ? <Text style={{ color: mine ? colors.primaryForeground : colors.foreground }}>Mensagem</Text> : null}
                    <Text style={[styles.time, { color: mine ? colors.primaryForeground : colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {!readOnly && <View style={[styles.composer, { borderTopColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Anexar foto ou vídeo" disabled={sending} onPress={() => void pickMedia()} style={[styles.toolButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.primary, fontSize: 19 }}>＋</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="Mensagem"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => { const text = draft.trim(); if (text) void submit({ textContent: text }); }}
          returnKeyType="send"
          maxLength={4000}
          placeholder="Escreva uma mensagem"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Escolher figurinha" disabled={sending} onPress={() => setStickerPickerOpen(true)} style={[styles.toolButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 19 }}>😊</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={!draft.trim() || sending} onPress={() => void submit({ textContent: draft.trim() })} style={[styles.send, { backgroundColor: colors.primary, opacity: !draft.trim() || sending ? 0.5 : 1 }]}>
          {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Enviar</Text>}
        </Pressable>
      </View>}
      {!readOnly && <Modal visible={stickerPickerOpen} transparent animationType="slide" onRequestClose={() => setStickerPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.stickerSheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Escolha uma figurinha</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar figurinhas" onPress={() => setStickerPickerOpen(false)}><Text style={{ color: colors.primary, fontWeight: '700' }}>Fechar</Text></Pressable>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: 18, paddingTop: 22, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtitle: { fontSize: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  messages: { padding: 16, gap: 10, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', alignSelf: 'center', marginVertical: 24, maxWidth: 260, lineHeight: 20 },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  messageRowMine: { justifyContent: 'flex-end' },
  senderName: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  bubble: { maxWidth: '82%', minWidth: 70, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  time: { alignSelf: 'flex-end', fontSize: 10, marginTop: 5 },
  error: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  composer: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  input: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { minHeight: 44, minWidth: 66, borderRadius: 13, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  toolButton: { minHeight: 44, minWidth: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 220, height: 170, borderRadius: 10, marginBottom: 4 },
  mediaLink: { minHeight: 40, justifyContent: 'center' },
  stickerMessage: { alignItems: 'center', paddingHorizontal: 8 },
  sticker: { fontSize: 54, lineHeight: 66 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  stickerSheet: { maxHeight: '72%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 20, paddingBottom: 28 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  stickerGrid: { paddingHorizontal: 10 },
  stickerButton: { width: '14.28%', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  stickerOption: { fontSize: 27 },
});

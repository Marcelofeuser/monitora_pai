import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { PrivateMessage } from './api';

type Props = {
  title: string;
  subtitle?: string;
  ownUserId: string;
  loadMessages: () => Promise<PrivateMessage[]>;
  sendMessage: (text: string) => Promise<PrivateMessage>;
  onBack?: () => void;
  headerAction?: React.ReactNode;
};

export function PrivateChat({ title, subtitle = 'Conversa privada da família', ownUserId, loadMessages, sendMessage, onBack, headerAction }: Props) {
  const colors = useColors();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await sendMessage(text);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
      setDraft('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
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
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground }]}>Esta conversa é só entre vocês. Envie a primeira mensagem.</Text>}
          renderItem={({ item }) => {
            const mine = item.senderId === ownUserId;
            return <View style={[styles.messageRow, mine && styles.messageRowMine]}><View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={{ color: mine ? colors.primaryForeground : colors.foreground }}>{item.textContent ?? (item.type === 'photo' ? 'Foto' : 'Mensagem')}</Text><Text style={[styles.time, { color: mine ? colors.primaryForeground : colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text></View></View>;
          }}
        />
      )}
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      <View style={[styles.composer, { borderTopColor: colors.border }]}>
        <TextInput
          accessibilityLabel="Mensagem"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          returnKeyType="send"
          maxLength={4000}
          placeholder="Escreva uma mensagem"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={!draft.trim() || sending} onPress={() => void submit()} style={[styles.send, { backgroundColor: colors.primary, opacity: !draft.trim() || sending ? 0.5 : 1 }]}>
          {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Enviar</Text>}
        </Pressable>
      </View>
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
  bubble: { maxWidth: '82%', minWidth: 70, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  time: { alignSelf: 'flex-end', fontSize: 10, marginTop: 5 },
  error: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  composer: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  input: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { minHeight: 44, minWidth: 66, borderRadius: 13, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});

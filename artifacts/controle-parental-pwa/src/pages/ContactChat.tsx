import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  fetchContactConversation,
  sendContactMessage,
  fetchContactGroups,
  fetchContactGroupMessages,
  sendContactGroupMessage,
} from '@/lib/contact-conversations-api';
import type { PrivateMessage, GroupSummary, GroupMessage } from '@/lib/contact-conversations-api';
import { ThemeSwitcher } from '@/lib/theme';
import { EmojiPicker } from '@/components/emoji-picker';
import { AttachmentPicker } from '@/components/attachment-picker';
import { StickerPicker } from '@/components/sticker-picker';
import { AudioRecorderButton } from '@/components/audio-recorder-button';
import { MessageContent, isStickerMessage } from '@/components/message-content';
import { LockKeyhole, Plus, Send } from 'lucide-react';

/**
 * Rota /contact — chat contínuo de um Contato aprovado (mãe, avó, tia)
 * com a Criança dele, depois de aceitar o convite em ContactJoin.tsx.
 * Visual adulto/profissional (igual ao chat do Responsável em App.tsx),
 * de propósito diferente do estilo "fofo" que PairingJoin.tsx usa pra
 * criança — quem abre isso é um adulto da família.
 */
const CONTACT_DEVICE_TOKEN_KEY = 'amparo-contact-device-token';
const CONTACT_ID_KEY = 'amparo-contact-user-id';
const CONTACT_NAME_KEY = 'amparo-contact-name';
const CONTACT_CHILD_NAME_KEY = 'amparo-contact-child-name';

const COMPOSER_MAX_HEIGHT = 128;
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
}

export function ContactChat() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [contactUserId, setContactUserId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupChatMessages, setGroupChatMessages] = useState<GroupMessage[]>([]);
  const [groupChatNames, setGroupChatNames] = useState<Record<string, string>>({});
  const [groupChatLoading, setGroupChatLoading] = useState(false);
  const [groupChatError, setGroupChatError] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [groupSending, setGroupSending] = useState(false);
  const [groupPendingFile, setGroupPendingFile] = useState<File | null>(null);
  const [groupAttachError, setGroupAttachError] = useState<string | null>(null);
  const [groupComposerToolsOpen, setGroupComposerToolsOpen] = useState(false);
  const groupTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      setDeviceToken(localStorage.getItem(CONTACT_DEVICE_TOKEN_KEY));
      setContactUserId(localStorage.getItem(CONTACT_ID_KEY));
      setContactName(localStorage.getItem(CONTACT_NAME_KEY));
      setChildName(localStorage.getItem(CONTACT_CHILD_NAME_KEY));
    } catch {
      // localStorage pode falhar (modo privado, etc.).
    }
  }, []);

  useEffect(() => {
    if (!deviceToken) return;
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      try {
        const data = await fetchContactConversation(deviceToken!);
        if (!cancelled) {
          setMessages(data.messages);
          if (data.childName) setChildName(data.childName);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && showSpinner) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        }
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    }

    load(true);
    const intervalId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceToken]);

  // Lista de grupos em que este Contato foi colocado como membro (chat
  // de grupo de verdade, pedido do Marcelo) -- mesma cadência das outras
  // listas que atualizam sozinhas.
  useEffect(() => {
    if (!deviceToken) return;
    let cancelled = false;

    function loadGroups() {
      fetchContactGroups(deviceToken!)
        .then((data) => {
          if (!cancelled) setGroups(data);
        })
        .catch(() => undefined);
    }

    loadGroups();
    const intervalId = window.setInterval(loadGroups, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceToken]);

  // Poll de 5s do chat de um grupo aberto.
  useEffect(() => {
    if (!deviceToken || !selectedGroupId) return;
    let cancelled = false;

    async function loadGroupMessages(showSpinner: boolean) {
      if (showSpinner) setGroupChatLoading(true);
      try {
        const data = await fetchContactGroupMessages(deviceToken!, selectedGroupId!);
        if (!cancelled) {
          setGroupChatMessages(data.messages);
          setGroupChatNames(data.participantNames);
          setGroupChatError(null);
        }
      } catch (err) {
        if (!cancelled && showSpinner) {
          setGroupChatError(err instanceof Error ? err.message : 'Erro ao carregar o chat do grupo.');
        }
      } finally {
        if (!cancelled && showSpinner) setGroupChatLoading(false);
      }
    }

    loadGroupMessages(true);
    const intervalId = window.setInterval(() => loadGroupMessages(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceToken, selectedGroupId]);

  function selectChildChat() {
    setSelectedGroupId(null);
  }

  function selectGroupChat(groupId: string) {
    setGroupChatMessages([]);
    setGroupChatError(null);
    setGroupDraft('');
    setGroupPendingFile(null);
    setSelectedGroupId(groupId);
  }

  async function handleSendGroupMessage(event: FormEvent) {
    event.preventDefault();
    const text = groupDraft.trim();
    if ((!text && !groupPendingFile) || !deviceToken || !selectedGroupId || groupSending) return;
    setGroupSending(true);
    setGroupChatError(null);
    try {
      const message = groupPendingFile
        ? await sendContactGroupMessage(deviceToken, selectedGroupId, { file: groupPendingFile, caption: text || undefined })
        : await sendContactGroupMessage(deviceToken, selectedGroupId, { textContent: text });
      setGroupChatMessages((current) => [...current, message]);
      setGroupDraft('');
      setGroupPendingFile(null);
      if (groupTextareaRef.current) groupTextareaRef.current.style.height = 'auto';
    } catch (err) {
      setGroupChatError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setGroupSending(false);
    }
  }

  async function sendGroupSticker(emoji: string) {
    if (!deviceToken || !selectedGroupId || groupSending) return;
    setGroupSending(true);
    setGroupChatError(null);
    try {
      const message = await sendContactGroupMessage(deviceToken, selectedGroupId, { stickerEmoji: emoji });
      setGroupChatMessages((current) => [...current, message]);
    } catch (err) {
      setGroupChatError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setGroupSending(false);
    }
  }

  async function sendGroupAudio(file: File) {
    if (!deviceToken || !selectedGroupId || groupSending) return;
    setGroupSending(true);
    setGroupChatError(null);
    try {
      const message = await sendContactGroupMessage(deviceToken, selectedGroupId, { file });
      setGroupChatMessages((current) => [...current, message]);
    } catch (err) {
      setGroupChatError(err instanceof Error ? err.message : 'Erro ao enviar áudio.');
    } finally {
      setGroupSending(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingFile) || !deviceToken || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = pendingFile
        ? await sendContactMessage(deviceToken, { file: pendingFile, caption: text || undefined })
        : await sendContactMessage(deviceToken, { textContent: text });
      setMessages((current) => [...current, message]);
      setDraft('');
      setPendingFile(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function sendSticker(emoji: string) {
    if (!deviceToken || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendContactMessage(deviceToken, { stickerEmoji: emoji });
      setMessages((current) => [...current, message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setSending(false);
    }
  }

  async function sendAudio(file: File) {
    if (!deviceToken || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendContactMessage(deviceToken, { file });
      setMessages((current) => [...current, message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar áudio.');
    } finally {
      setSending(false);
    }
  }

  if (!deviceToken) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8">
        <div className="w-full max-w-md rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 text-center shadow-card">
          <h1 className="text-xl font-bold">Convite não encontrado</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Peça um novo link de convite para o responsável da criança.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[hsl(var(--background))]">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold">
            {selectedGroupId ? (groups.find((g) => g.id === selectedGroupId)?.name ?? 'Grupo') : (childName ?? 'Conversa')}
          </h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {selectedGroupId ? 'Chat de grupo' : contactName ? `Conectado como ${contactName}` : 'Contato aprovado'}
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      {groups.length > 0 && (
        <div className="flex shrink-0 gap-3 overflow-x-auto border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3" data-testid="row-contact-chat-bubbles">
          <button
            type="button"
            onClick={selectChildChat}
            data-testid="button-select-chat-child"
            className={`flex shrink-0 flex-col items-center gap-1 ${selectedGroupId === null ? '' : 'opacity-60'}`}
          >
            <span className="grid size-11 place-items-center rounded-full bg-[hsl(var(--primary))] text-sm font-extrabold text-[hsl(var(--primary-foreground))] shadow-sm">
              {(childName ?? '?').trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-[56px] truncate text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{childName ?? 'Criança'}</span>
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => selectGroupChat(group.id)}
              data-testid={`button-select-chat-group-${group.id}`}
              className={`flex shrink-0 flex-col items-center gap-1 ${selectedGroupId === group.id ? '' : 'opacity-60'}`}
            >
              <span className="grid size-11 place-items-center rounded-full bg-[hsl(var(--secondary))] text-sm font-extrabold text-white shadow-sm">
                {group.name.trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[56px] truncate text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{group.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="list-contact-messages">
        {selectedGroupId ? (
          groupChatLoading && groupChatMessages.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
          ) : groupChatMessages.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem ainda neste grupo. Escreva a primeira aqui embaixo.</p>
          ) : (
            groupChatMessages.map((message) => {
              const fromMe = contactUserId !== null && message.senderId === contactUserId;
              const senderName = groupChatNames[message.senderId] ?? '…';
              const sticker = isStickerMessage(message);
              const bubbleClass = sticker
                ? `${fromMe ? 'self-end' : 'self-start'}`
                : `rounded-2xl px-4 py-2.5 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
              return (
                <div key={message.id} data-testid={`row-group-message-${message.id}`} className={`flex max-w-[80%] flex-col ${fromMe ? 'items-end self-end' : 'items-start self-start'}`}>
                  {!fromMe && (
                    <p className="mb-0.5 px-1 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{senderName}</p>
                  )}
                  <div className={`text-sm leading-6 ${bubbleClass}`}>
                    <MessageContent message={message} authHeaders={{ 'X-Contact-Token': deviceToken }} />
                    <p className={`mt-1 text-[10px] uppercase tracking-[.08em] ${fromMe && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                      {new Date(message.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              );
            })
          )
        ) : loading && messages.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Nenhuma mensagem ainda com {childName ?? 'a criança'}. Escreva a primeira aqui embaixo.
          </p>
        ) : (
          messages.map((message) => {
            const fromMe = contactUserId !== null && message.senderId === contactUserId;
            const sticker = isStickerMessage(message);
            const bubbleClass = sticker
              ? `${fromMe ? 'self-end' : 'self-start'}`
              : `rounded-2xl px-4 py-2.5 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
            return (
              <div key={message.id} data-testid={`row-contact-message-${message.id}`} className={`max-w-[80%] text-sm leading-6 ${bubbleClass}`}>
                <MessageContent message={message} authHeaders={{ 'X-Contact-Token': deviceToken }} />
                <p className={`mt-1 text-[10px] uppercase tracking-[.08em] ${fromMe && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  {new Date(message.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {selectedGroupId ? (
          <>
            {groupChatError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{groupChatError}</p>}
            {groupAttachError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{groupAttachError}</p>}
            {groupPendingFile && (
              <div className="mb-2 flex items-center gap-2 self-start rounded-xl bg-[hsl(var(--muted)/.6)] px-3 py-2 text-xs font-semibold">
                {groupPendingFile.type.startsWith('video/') ? 'Vídeo selecionado:' : 'Foto selecionada:'} {groupPendingFile.name}
                <button type="button" onClick={() => setGroupPendingFile(null)} aria-label="Remover anexo" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  ×
                </button>
              </div>
            )}
            <form onSubmit={handleSendGroupMessage} className="flex items-end gap-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setGroupComposerToolsOpen((current) => !current)}
                  aria-label={groupComposerToolsOpen ? 'Fechar opções' : 'Mais opções (emoji, foto, figurinha, áudio)'}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-transform ${
                    groupComposerToolsOpen
                      ? 'rotate-45 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <Plus size={20} />
                </button>
                {groupComposerToolsOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setGroupComposerToolsOpen(false)} />
                    <div className="absolute bottom-full left-0 z-40 mb-2 flex flex-col gap-1.5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
                      <EmojiPicker
                        onSelect={(emoji) => {
                          setGroupDraft((current) => current + emoji);
                          setGroupComposerToolsOpen(false);
                        }}
                      />
                      <AttachmentPicker
                        onSelect={(file) => {
                          setGroupAttachError(null);
                          setGroupPendingFile(file);
                          setGroupComposerToolsOpen(false);
                        }}
                        onError={setGroupAttachError}
                      />
                      <StickerPicker
                        onSelect={(emoji) => {
                          void sendGroupSticker(emoji);
                          setGroupComposerToolsOpen(false);
                        }}
                      />
                      <AudioRecorderButton
                        onRecorded={(file) => {
                          void sendGroupAudio(file);
                          setGroupComposerToolsOpen(false);
                        }}
                        onError={setGroupAttachError}
                        disabled={groupSending}
                      />
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={groupTextareaRef}
                value={groupDraft}
                onChange={(event) => {
                  setGroupDraft(event.target.value);
                  autoGrowTextarea(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={groupPendingFile ? 'Adicione uma legenda (opcional)…' : 'Escreva pro grupo…'}
                rows={1}
                className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 py-3 text-sm leading-5 outline-none focus:border-[hsl(var(--primary))]"
              />
              <button
                type="submit"
                disabled={(!groupDraft.trim() && !groupPendingFile) || groupSending}
                aria-label="Enviar mensagem"
                className="grid size-12 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {groupSending ? '…' : <Send size={18} />}
              </button>
            </form>
          </>
        ) : (
          <>
            {error && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}
            {attachError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{attachError}</p>}
            {pendingFile && (
              <div className="mb-2 flex items-center gap-2 self-start rounded-xl bg-[hsl(var(--muted)/.6)] px-3 py-2 text-xs font-semibold">
                {pendingFile.type.startsWith('video/') ? 'Vídeo selecionado:' : 'Foto selecionada:'} {pendingFile.name}
                <button type="button" onClick={() => setPendingFile(null)} aria-label="Remover anexo" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  ×
                </button>
              </div>
            )}
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setComposerToolsOpen((current) => !current)}
                  aria-label={composerToolsOpen ? 'Fechar opções' : 'Mais opções (emoji, foto, figurinha, áudio)'}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-transform ${
                    composerToolsOpen
                      ? 'rotate-45 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <Plus size={20} />
                </button>
                {composerToolsOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setComposerToolsOpen(false)} />
                    <div className="absolute bottom-full left-0 z-40 mb-2 flex flex-col gap-1.5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
                      <EmojiPicker
                        onSelect={(emoji) => {
                          setDraft((current) => current + emoji);
                          setComposerToolsOpen(false);
                        }}
                      />
                      <AttachmentPicker
                        onSelect={(file) => {
                          setAttachError(null);
                          setPendingFile(file);
                          setComposerToolsOpen(false);
                        }}
                        onError={setAttachError}
                      />
                      <StickerPicker
                        onSelect={(emoji) => {
                          void sendSticker(emoji);
                          setComposerToolsOpen(false);
                        }}
                      />
                      <AudioRecorderButton
                        onRecorded={(file) => {
                          void sendAudio(file);
                          setComposerToolsOpen(false);
                        }}
                        onError={setAttachError}
                        disabled={sending}
                      />
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  autoGrowTextarea(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={pendingFile ? 'Adicione uma legenda (opcional)…' : `Escreva pra ${childName ?? 'a criança'}…`}
                rows={1}
                className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 py-3 text-sm leading-5 outline-none focus:border-[hsl(var(--primary))]"
              />
              <button
                type="submit"
                disabled={(!draft.trim() && !pendingFile) || sending}
                aria-label="Enviar mensagem"
                className="grid size-12 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {sending ? '…' : <Send size={18} />}
              </button>
            </form>
          </>
        )}
      </div>
      <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-5 py-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
        <LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" />{' '}
        {selectedGroupId ? 'Esta conversa de grupo também fica visível para o responsável.' : <>Esta conversa também fica visível para o responsável de {childName ?? 'a criança'}.</>}
      </div>
    </main>
  );
}

export default ContactChat;

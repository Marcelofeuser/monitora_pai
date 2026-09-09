import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'wouter';
import {
  fetchContactConversation,
  sendContactMessage,
  fetchContactGroups,
  fetchContactGroupMessages,
  sendContactGroupMessage,
  fetchContactParents,
  fetchContactParentChat,
  sendContactParentMessage,
} from '@/lib/contact-conversations-api';
import type { PrivateMessage, GroupSummary, GroupMessage, ContactParent } from '@/lib/contact-conversations-api';
import { ThemeSwitcher } from '@/lib/theme';
import { EmojiPicker } from '@/components/emoji-picker';
import { AttachmentPicker } from '@/components/attachment-picker';
import { StickerPicker } from '@/components/sticker-picker';
import { AudioRecorderButton } from '@/components/audio-recorder-button';
import { MessageContent, isStickerMessage } from '@/components/message-content';
import { LockKeyhole, Phone, Plus, Send, ArrowLeft, ChevronRight, UserCircle2 } from 'lucide-react';
import { useCall } from '@/hooks/use-call';
import { CallOverlays } from '@/components/call/CallOverlays';

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
  // Chamada de voz/vídeo (pedido do Marcelo, 09/09) -- identidade só
  // fica pronta depois que o token vem do localStorage (ver useEffect logo
  // abaixo), por isso o hook recebe null até lá e o useCall interno espera.
  const call = useCall(deviceToken ? { kind: 'contact', token: deviceToken } : null);
  const [contactUserId, setContactUserId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

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

  // "Meu Chat" do lado do Contato: falar direto com o(s) responsável(is)
  // da criança (Item 13 -- pode ter mais de um), cada um com sua própria
  // conversa. Mesmo padrão de estado dos grupos, só trocando a fonte.
  const [parents, setParents] = useState<ContactParent[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [parentChatMessages, setParentChatMessages] = useState<PrivateMessage[]>([]);
  const [parentChatLoading, setParentChatLoading] = useState(false);
  const [parentChatError, setParentChatError] = useState<string | null>(null);
  const [parentDraft, setParentDraft] = useState('');
  const [parentSending, setParentSending] = useState(false);
  const [parentPendingFile, setParentPendingFile] = useState<File | null>(null);
  const [parentAttachError, setParentAttachError] = useState<string | null>(null);
  const [parentComposerToolsOpen, setParentComposerToolsOpen] = useState(false);
  const parentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  // Lista de conversas em coluna (estilo WhatsApp), em vez da fileira
  // horizontal de bolinhas de antes -- pedido do Marcelo. Começa aberta:
  // o Contato vê a lista primeiro e toca numa conversa pra abrir.
  const [chatListOpen, setChatListOpen] = useState(true);

  // Chat tem que rolar sozinho pra ultima mensagem, igual WhatsApp -- so
  // auto-rola se ja estava perto do fim (ou acabou de trocar de
  // conversa: Crianca <-> um dos grupos <-> um dos responsaveis), pra nao
  // puxar a tela de quem rolou pra cima pra ler o historico.
  useEffect(() => { stickToBottomRef.current = true; }, [selectedGroupId, selectedParentId]);
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, groupChatMessages, parentChatMessages, selectedGroupId, selectedParentId]);

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
          const otherParticipant = data.conversation.participantAId === contactUserId
            ? data.conversation.participantBId
            : data.conversation.participantAId;
          setChildId(otherParticipant);
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

  // Lista de responsáveis com quem dá pra falar (a mãe/pai, e qualquer
  // outro guardião adicionado -- Item 13) -- mesma cadência de 20s dos
  // grupos.
  useEffect(() => {
    if (!deviceToken) return;
    let cancelled = false;

    function loadParents() {
      fetchContactParents(deviceToken!)
        .then((data) => {
          if (!cancelled) setParents(data);
        })
        .catch(() => undefined);
    }

    loadParents();
    const intervalId = window.setInterval(loadParents, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceToken]);

  // Poll de 5s do chat aberto com um responsável.
  useEffect(() => {
    if (!deviceToken || !selectedParentId) return;
    let cancelled = false;

    async function loadParentMessages(showSpinner: boolean) {
      if (showSpinner) setParentChatLoading(true);
      try {
        const data = await fetchContactParentChat(deviceToken!, selectedParentId!);
        if (!cancelled) {
          setParentChatMessages(data.messages);
          setParentChatError(null);
        }
      } catch (err) {
        if (!cancelled && showSpinner) {
          setParentChatError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        }
      } finally {
        if (!cancelled && showSpinner) setParentChatLoading(false);
      }
    }

    loadParentMessages(true);
    const intervalId = window.setInterval(() => loadParentMessages(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceToken, selectedParentId]);

  function selectChildChat() {
    setSelectedGroupId(null);
    setSelectedParentId(null);
    setChatListOpen(false);
  }

  function selectGroupChat(groupId: string) {
    setGroupChatMessages([]);
    setGroupChatError(null);
    setGroupDraft('');
    setGroupPendingFile(null);
    setSelectedParentId(null);
    setSelectedGroupId(groupId);
    setChatListOpen(false);
  }

  function selectParentChat(parentId: string) {
    setParentChatMessages([]);
    setParentChatError(null);
    setParentDraft('');
    setParentPendingFile(null);
    setSelectedGroupId(null);
    setSelectedParentId(parentId);
    setChatListOpen(false);
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

  async function handleSendParentMessage(event: FormEvent) {
    event.preventDefault();
    const text = parentDraft.trim();
    if ((!text && !parentPendingFile) || !deviceToken || !selectedParentId || parentSending) return;
    setParentSending(true);
    setParentChatError(null);
    try {
      const message = parentPendingFile
        ? await sendContactParentMessage(deviceToken, selectedParentId, { file: parentPendingFile, caption: text || undefined })
        : await sendContactParentMessage(deviceToken, selectedParentId, { textContent: text });
      setParentChatMessages((current) => [...current, message]);
      setParentDraft('');
      setParentPendingFile(null);
      if (parentTextareaRef.current) parentTextareaRef.current.style.height = 'auto';
    } catch (err) {
      setParentChatError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setParentSending(false);
    }
  }

  async function sendParentSticker(emoji: string) {
    if (!deviceToken || !selectedParentId || parentSending) return;
    setParentSending(true);
    setParentChatError(null);
    try {
      const message = await sendContactParentMessage(deviceToken, selectedParentId, { stickerEmoji: emoji });
      setParentChatMessages((current) => [...current, message]);
    } catch (err) {
      setParentChatError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setParentSending(false);
    }
  }

  async function sendParentAudio(file: File) {
    if (!deviceToken || !selectedParentId || parentSending) return;
    setParentSending(true);
    setParentChatError(null);
    try {
      const message = await sendContactParentMessage(deviceToken, selectedParentId, { file });
      setParentChatMessages((current) => [...current, message]);
    } catch (err) {
      setParentChatError(err instanceof Error ? err.message : 'Erro ao enviar áudio.');
    } finally {
      setParentSending(false);
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

  // Alvo da chamada (se houver) pra tela atual -- null na lista de
  // conversas e no chat de grupo (chamada é sempre 1:1, não em grupo).
  const inChatList = chatListOpen && (groups.length > 0 || parents.length > 0);
  const callTarget = inChatList || selectedGroupId
    ? null
    : selectedParentId
      ? { id: selectedParentId, name: parents.find((p) => p.parentId === selectedParentId)?.parentName ?? 'Responsável' }
      : childId
        ? { id: childId, name: childName ?? 'Criança' }
        : null;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[hsl(var(--background))]">
      <CallOverlays call={call} peerName={callTarget?.name} />
      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {!chatListOpen && (groups.length > 0 || parents.length > 0) && (
            <button
              type="button"
              onClick={() => setChatListOpen(true)}
              aria-label="Voltar pra lista de conversas"
              data-testid="button-back-to-chat-list"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">
              {chatListOpen && (groups.length > 0 || parents.length > 0)
                ? 'Conversas'
                : selectedGroupId
                  ? (groups.find((g) => g.id === selectedGroupId)?.name ?? 'Grupo')
                  : selectedParentId
                    ? (parents.find((p) => p.parentId === selectedParentId)?.parentName ?? 'Responsável')
                    : (childName ?? 'Conversa')}
            </h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {chatListOpen && (groups.length > 0 || parents.length > 0)
                ? (contactName ? `Conectado como ${contactName}` : 'Contato aprovado')
                : selectedGroupId ? 'Chat de grupo' : selectedParentId ? 'Conversa com o responsável' : contactName ? `Conectado como ${contactName}` : 'Contato aprovado'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {callTarget && (
            <button
              type="button"
              onClick={() => call.startCall(callTarget.id, callTarget.name)}
              aria-label={`Ligar para ${callTarget.name}`}
              data-testid="button-start-call"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))]"
            >
              <Phone size={18} />
            </button>
          )}
          {/* "Meu perfil" (pedido do Marcelo, 08/09): foto, telefone,
              e-mail e redes sociais do Contato -- mesma BIO mostrada logo
              depois de confirmar o convite em ContactJoin.tsx, reaberta
              aqui pra editar depois. */}
          <Link
            href="/contact/bio"
            aria-label="Meu perfil"
            title="Meu perfil"
            data-testid="link-contact-profile"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            <UserCircle2 size={20} />
          </Link>
          <ThemeSwitcher />
        </div>
      </header>

      {chatListOpen && (groups.length > 0 || parents.length > 0) ? (
        /* Lista de conversas em COLUNA, igual ao WhatsApp -- antes era uma
           fileira horizontal de bolinhas, trocada por pedido do Marcelo.
           Toca numa linha pra abrir a conversa cheia. */
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" data-testid="list-contact-chat-selector">
          <button
            type="button"
            onClick={selectChildChat}
            data-testid="button-select-chat-child"
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted)/.6)]"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-base font-extrabold text-[hsl(var(--primary-foreground))] shadow-sm">
              {(childName ?? '?').trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold text-[hsl(var(--foreground))]">{childName ?? 'Criança'}</span>
              <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Conversa com a criança</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
          </button>
          {parents.map((parent) => (
            <button
              key={parent.parentId}
              type="button"
              onClick={() => selectParentChat(parent.parentId)}
              data-testid={`button-select-chat-parent-${parent.parentId}`}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted)/.6)]"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[hsl(var(--accent))] text-base font-extrabold text-[hsl(var(--accent-foreground))] shadow-sm">
                {parent.parentName.trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-[hsl(var(--foreground))]">{parent.parentName}</span>
                <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Responsável</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
            </button>
          ))}
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => selectGroupChat(group.id)}
              data-testid={`button-select-chat-group-${group.id}`}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted)/.6)]"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-base font-extrabold text-white shadow-sm">
                {group.name.trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-[hsl(var(--foreground))]">{group.name}</span>
                <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Grupo</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
            </button>
          ))}
        </div>
      ) : (
      <>
      <div
        ref={listRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
        data-testid="list-contact-messages"
      >
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
        ) : selectedParentId ? (
          parentChatLoading && parentChatMessages.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
          ) : parentChatMessages.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Nenhuma mensagem ainda com {parents.find((p) => p.parentId === selectedParentId)?.parentName ?? 'o responsável'}. Escreva a primeira aqui embaixo.
            </p>
          ) : (
            parentChatMessages.map((message) => {
              const fromMe = contactUserId !== null && message.senderId === contactUserId;
              const sticker = isStickerMessage(message);
              const bubbleClass = sticker
                ? `${fromMe ? 'self-end' : 'self-start'}`
                : `rounded-2xl px-4 py-2.5 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
              return (
                <div key={message.id} data-testid={`row-parent-message-${message.id}`} className={`max-w-[80%] text-sm leading-6 ${bubbleClass}`}>
                  <MessageContent message={message} authHeaders={{ 'X-Contact-Token': deviceToken }} />
                  <p className={`mt-1 text-[10px] uppercase tracking-[.08em] ${fromMe && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                    {new Date(message.createdAt).toLocaleString('pt-BR')}
                  </p>
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
        ) : selectedParentId ? (
          <>
            {parentChatError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{parentChatError}</p>}
            {parentAttachError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{parentAttachError}</p>}
            {parentPendingFile && (
              <div className="mb-2 flex items-center gap-2 self-start rounded-xl bg-[hsl(var(--muted)/.6)] px-3 py-2 text-xs font-semibold">
                {parentPendingFile.type.startsWith('video/') ? 'Vídeo selecionado:' : 'Foto selecionada:'} {parentPendingFile.name}
                <button type="button" onClick={() => setParentPendingFile(null)} aria-label="Remover anexo" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  ×
                </button>
              </div>
            )}
            <form onSubmit={handleSendParentMessage} className="flex items-end gap-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setParentComposerToolsOpen((current) => !current)}
                  aria-label={parentComposerToolsOpen ? 'Fechar opções' : 'Mais opções (emoji, foto, figurinha, áudio)'}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-transform ${
                    parentComposerToolsOpen
                      ? 'rotate-45 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <Plus size={20} />
                </button>
                {parentComposerToolsOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setParentComposerToolsOpen(false)} />
                    <div className="absolute bottom-full left-0 z-40 mb-2 flex flex-col gap-1.5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
                      <EmojiPicker
                        onSelect={(emoji) => {
                          setParentDraft((current) => current + emoji);
                          setParentComposerToolsOpen(false);
                        }}
                      />
                      <AttachmentPicker
                        onSelect={(file) => {
                          setParentAttachError(null);
                          setParentPendingFile(file);
                          setParentComposerToolsOpen(false);
                        }}
                        onError={setParentAttachError}
                      />
                      <StickerPicker
                        onSelect={(emoji) => {
                          void sendParentSticker(emoji);
                          setParentComposerToolsOpen(false);
                        }}
                      />
                      <AudioRecorderButton
                        onRecorded={(file) => {
                          void sendParentAudio(file);
                          setParentComposerToolsOpen(false);
                        }}
                        onError={setParentAttachError}
                        disabled={parentSending}
                      />
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={parentTextareaRef}
                value={parentDraft}
                onChange={(event) => {
                  setParentDraft(event.target.value);
                  autoGrowTextarea(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={parentPendingFile ? 'Adicione uma legenda (opcional)…' : `Escreva pro responsável…`}
                rows={1}
                className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 py-3 text-sm leading-5 outline-none focus:border-[hsl(var(--primary))]"
              />
              <button
                type="submit"
                disabled={(!parentDraft.trim() && !parentPendingFile) || parentSending}
                aria-label="Enviar mensagem"
                className="grid size-12 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {parentSending ? '…' : <Send size={18} />}
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
      </>
      )}
      {!(chatListOpen && (groups.length > 0 || parents.length > 0)) && (
      <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-5 py-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
        <LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" />{' '}
        {selectedGroupId
          ? 'Esta conversa de grupo também fica visível para o responsável.'
          : selectedParentId
            ? 'Esta é uma conversa direta com o responsável -- não aparece pra criança.'
            : <>Esta conversa também fica visível para o responsável de {childName ?? 'a criança'}.</>}
      </div>
      )}
    </main>
  );
}

export default ContactChat;

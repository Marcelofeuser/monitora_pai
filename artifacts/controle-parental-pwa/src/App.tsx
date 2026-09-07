import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Ban,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  EyeOff,
  Hourglass,
  House,
  Lock,
  Unlock,
  Info,
  LogOut,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import '@clerk/themes/shadcn.css';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { PairingGenerate } from '@/pages/PairingGenerate';
import { PairingJoin } from '@/pages/PairingJoin';
import { ContactJoin } from '@/pages/ContactJoin';
import { ContactChat } from '@/pages/ContactChat';
import { GuardianJoin } from '@/pages/GuardianJoin';
import QRCode from 'qrcode';
import { ThemeProvider, ThemeSwitcher } from '@/lib/theme';
import { EmojiPicker } from '@/components/emoji-picker';
import { AttachmentPicker } from '@/components/attachment-picker';
import { enablePushNotifications, disablePushNotifications, isPushSupported } from '@/lib/push';
import { enableNativeIOSPush, disableNativeIOSPush, isNativeIOSBridgeAvailable } from '@/lib/nativePush';
import { StickerPicker } from '@/components/sticker-picker';
import { AudioRecorderButton } from '@/components/audio-recorder-button';
import { MessageContent, isStickerMessage } from '@/components/message-content';
import { fetchGroups, createGroup, uploadGroupPhoto, deleteGroup, addGroupMember, removeGroupMember, fetchGroupMessages, sendGroupMessage } from '@/lib/groups-api';
import type { Group, GroupMessage } from '@/lib/groups-api';
import { fetchChildren, fetchApprovedContacts, fetchParentContactConversation, fetchPrivateConversation, sendPrivateMessage, addApprovedContact, deleteContact, inviteContact, updateContact, blockContact } from '@/lib/conversations-api';
import type { ChildUser, ApprovedContact, PrivateMessage } from '@/lib/conversations-api';
import { useLongPress } from '@/hooks/use-long-press';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchChildLocation } from '@/lib/location-api';
import type { ChildLocation } from '@/lib/location-api';
import { fetchScreenTime, setDailyLimit, setChildLock } from '@/lib/screen-time-api';
import type { ScreenTimeStatus } from '@/lib/screen-time-api';
import { fetchMe, updateMyRelationship } from '@/lib/me-api';
import { fetchGuardians, createGuardianInvite, removeGuardian, acceptGuardianInvite } from '@/lib/guardians-api';
import type { GuardianInfo } from '@/lib/guardians-api';
import { RELATIONSHIP_OPTIONS } from '@/lib/relationship';
import type { ParentRelationship } from '@/lib/relationship';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Role = 'responsible' | 'child';
type Profile = { displayName: string; familyName: string; role: Role };
const queryClient = new QueryClient();
const PROFILE_KEY = 'amparo-profile';
const CONTACTS_KEY = 'amparo-contacts';
const LANGUAGE_KEY = 'amparo-language';
const TOUR_KEY_PREFIX = 'amparo-onboarding-completed';
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const pt = {
  language: { brazil: 'Português do Brasil', english: 'English', switcher: 'Idioma' },
  onboarding: {
    aside: 'um espaço de família, não uma sala de controle', overline: 'privado por padrão',
    heroOne: 'Segurança funciona', heroTwo: 'melhor', heroThree: 'às claras.',
    description: 'O Ampara oferece à família um lugar compartilhado para combinar cuidados, conversar e compartilhar uma localização quando todos concordarem. Sem monitoramento escondido. Sem adivinhar o que é real.',
    checkOne: 'Todos podem ver o que é compartilhado', checkTwo: 'Nada começa sem consentimento',
    step: '01 / comece aqui', question: 'Vamos criar o espaço da sua família', choiceDescription: 'Esta tela é só pra você, o Responsável — a criança nunca cadastra nada aqui, ela entra pelo link/QR de pareamento.',
    adult: 'Adulto responsável', adultDescription: 'Ajudo a manter a família conectada.',
    child: 'Criança', childDescription: 'Quero participar do meu espaço de segurança.',
    yourName: 'Seu nome', yourNamePlaceholder: 'Digite seu nome', familyName: 'Nome do espaço da família', familyNamePlaceholder: 'Dê um nome ao seu espaço',
    localNote: 'Por enquanto, isso fica neste dispositivo. O Ampara nunca inventa uma pessoa, mensagem ou localização.',
    error: 'Escolha um papel e preencha os dois campos para continuar.', create: 'Criar meu espaço de família',
    footer: 'Ampara / um espaço claro para cuidar', help: 'Precisa de ajuda? Peça para sua família configurar junto.',
  },
  auth: {
    title: 'Conta do Responsável', description: 'Entre para manter seu espaço seguro entre dispositivos. Crianças entram apenas pelo pareamento da família.',
    signIn: 'Entrar', signUp: 'Criar conta', signedIn: 'Conta conectada', signedOut: 'Ainda sem uma conta?', signOut: 'Sair',
  },
  nav: { overview: 'Visão geral', pair: 'Vincular criança', conversations: 'Conversas', location: 'Localização', screenTime: 'Tempo de uso', settings: 'Configurações' },
  shell: {
    yourProfile: 'Seu perfil', setupIncomplete: 'Configuração incompleta', completeSetup: 'Concluir configuração',
    familySpace: 'Espaço da família', noMonitoring: 'Sem monitoramento escondido, nunca.', localMode: 'modo local',
    familyNotSet: 'não configurado', localPrivate: 'local e privado', openMenu: 'Abrir menu', closeMenu: 'Fechar menu',
    closeNavigation: 'Fechar navegação', mainNav: 'Navegação principal', mobileNav: 'Navegação móvel', bottomNav: 'Navegação inferior',
  },
  dashboard: {
    eyebrow: '01 / visão geral', greeting: 'Bom ter você aqui, {name}.', title: 'Um lugar claro para cuidar.',
    description: 'Este é o espaço compartilhado de segurança da sua família. Ele começa quieto, porque só atualizações reais devem aparecer aqui.',
    noProfileDescription: 'Configure seu perfil de família para tornar este espaço seu. Até lá, nada é coletado ou presumido.',
    setupTitle: 'Seu espaço ainda não foi configurado.', setupText: 'Comece com seu papel e um nome para que este espaço pertença a você.', setupAction: 'Configurar espaço',
    sharedTruth: 'verdade compartilhada', noReport: 'Nada para relatar', goodNews: 'é uma boa notícia.',
    emptyExplanation: 'Quando sua família começar a compartilhar, é aqui que as atualizações claras e combinadas vão aparecer.',
    status: 'status do espaço', quietReady: 'Quieto e pronto', profile: 'Seu perfil', profileDone: 'Configurado neste dispositivo', profileNeeds: 'Precisa dos seus dados',
    approved: 'Nenhuma conversa aprovada', approvedCount: '{count} contato(s) aprovado(s) localmente', noChildLocation: 'Nenhuma localização de criança compartilhada',
    onlyShows: 'O Ampara mostra apenas informações que alguém escolheu ativamente compartilhar com este espaço da família.',
    connectEyebrow: 'manter conectado', connectTitle: 'Conversas aprovadas', connectText: 'Um lugar para mensagens que todos podem ver como parte do espaço da família.', connectAction: 'Abrir conversas',
    locationEyebrow: 'quando importa', locationTitle: 'Localização, com consentimento', locationText: 'A localização fica vazia até que uma criança escolha compartilhá-la. A permissão fica sempre visível.', locationAction: 'Revisar localização',
  },
  contacts: {
    eyebrow: 'contatos locais', title: 'Quem pode conversar aqui?', description: 'Aprovações ficam neste dispositivo por enquanto. Nada é enviado para outro aparelho até que a conexão familiar e o backend estejam disponíveis.',
    childTitle: 'Pedir um contato', childText: 'Use o nome e a referência real que sua família reconhece. O pedido ficará pendente neste dispositivo; ele não será enviado para outra pessoa.',
    adultTitle: 'Aprovar contatos', adultText: 'Revise pedidos feitos neste dispositivo. Aprovar não envia uma notificação e não cria mensagens.',
    idLabel: 'ID ou referência do contato', idPlaceholder: 'Digite uma referência combinada',
    nameLabel: 'Nome do contato', namePlaceholder: 'Digite o nome real',
    identifierLabel: 'Telefone ou outro identificador (opcional)', identifierPlaceholder: 'Opcional',
    request: 'Pedir aprovação', pending: 'pendente', approved: 'aprovado', denied: 'negado', revoked: 'revogado', textOnly: 'somente texto',
    pendingTitle: 'Pedidos pendentes', pendingEmpty: 'Nenhum pedido pendente neste dispositivo.',
    approvedTitle: 'Contatos aprovados', approvedEmpty: 'Nenhum convite feito ainda.',
    historyTitle: 'Negados e revogados', historyEmpty: 'Nenhum contato negado ou revogado.',
    approve: 'Aprovar', deny: 'Negar', approveTextOnly: 'Aprovar somente texto', revoke: 'Revogar',
    channelsTitle: 'Canais disponíveis', channelsEmpty: 'Nenhum canal disponível. Um adulto responsável precisa aprovar um contato primeiro.',
    channelNote: 'Canal aprovado, sem mensagens ainda.', localId: 'ID local', submitted: 'Pedido salvo neste dispositivo.',
    duplicate: 'Já existe um contato com este ID local.', missing: 'Preencha o ID e o nome do contato para continuar.',
    noControls: 'Crianças não veem controles de aprovação. A decisão fica com um adulto responsável.',
    statusLabel: 'status', identifierMissing: 'sem identificador adicional',
    approveAlert: 'A aprovação foi salva somente neste dispositivo.', denyAlert: 'A decisão foi salva somente neste dispositivo.', revokeAlert: 'O contato foi revogado neste dispositivo.',
  },
  tutorial: {
    skip: 'Pular tutorial', back: 'Voltar', next: 'Próximo', finish: 'Ir para o painel', stepOf: 'passo {current} de {total}',
    // Item 15 do checklist: os passos "Perfil da criança" (child-profile) e
    // "Atividade compartilhada" (activity) apontavam pros blocos "Status do
    // espaço" e "Localização" removidos do Dashboard na simplificação da
    // Visão Geral (07/09) -- sem elemento correspondente, o GuidedTour só
    // deixa de desenhar o destaque (spotlight), mas o passo de texto sem
    // nenhum realce visual ficava confuso. Removidos.
    parent: [
      { title: 'Bem-vindo ao Ampara', text: 'Este é um espaço claro para cuidar, conversar e compartilhar somente o que sua família escolher.', target: 'dashboard' },
      { title: 'Aprove contatos', text: 'Antes de conversar, revise cada pedido e escolha entre aprovar, limitar a texto, negar ou revogar.', target: 'approved-contacts' },
      { title: 'Chat privado', text: 'A conversa entre Responsável e Criança fica separada e nunca é espelhada.', target: 'private-channel' },
    ],
    child: [
      { title: 'Seu espaço de segurança', text: 'Aqui você participa das escolhas e sempre sabe o que está sendo compartilhado.', target: 'dashboard' },
      { title: 'Contatos aprovados', text: 'Peça um contato usando uma referência que sua família reconheça. Só será possível conversar depois da aprovação.', target: 'approved-contacts' },
      { title: 'Chat privado', text: 'O canal com o Responsável é privado e não aparece no monitoramento de conversas aprovadas.', target: 'private-channel' },
      { title: 'Localização com escolha', text: 'Você decide quando compartilhar sua localização e vê claramente quando a permissão está ativa.', target: 'activity' },
    ],
  },
  conversations: {
    eyebrow: '02 / conversas', title: 'Converse onde mora a confiança.',
    description: 'Somente conversas aprovadas ficam aqui. O canal privado da família é identificado com clareza e nunca é compartilhado em silêncio.',
    privacy: 'Como a privacidade funciona', approvedTab: 'Conversas aprovadas', privateTab: 'Canal privado da família',
    emptyEyebrow: 'nada compartilhado ainda', emptyTitle: 'Suas conversas estão vazias.',
    emptyText: 'Quando uma pessoa da família for aprovada e iniciar uma conversa, ela aparecerá aqui. O Ampara não cria mensagens de exemplo.',
    learnPrivate: 'Conhecer o canal privado', privateTitle: 'Canal privado da família', privateBadge: 'privado',
    privateDescription: 'Um espaço direto para um adulto responsável e uma criança. As mensagens aqui só ficam visíveis para essas duas pessoas quando os dois perfis entrarem neste espaço da família.',
    noParticipants: 'nenhum participante ainda', readyTitle: 'Este canal estará pronto quando sua família estiver.',
    readyWithProfile: 'Adicione outro perfil de família no dispositivo dele para disponibilizar este canal privado.',
    readyWithoutProfile: 'Complete seu perfil e depois convide as pessoas em quem confia.',
    prepare: 'Preparar canal privado', alert: 'Os perfis de família serão conectados quando o serviço compartilhado estiver disponível.',
    privateFooter: 'Privado significa privado: este canal nunca será listado como uma conversa de grupo aprovada.',
  },
  location: {
    eyebrow: '03 / localização', title: 'Localização, por acordo.',
    description: 'Uma localização nunca é inferida aqui. Ela aparece somente depois que uma criança escolhe compartilhá-la e o dispositivo permite.',
    permission: 'Permissão do dispositivo', allowed: 'permitida', denied: 'não permitida', notRequested: 'não solicitada',
    permissionText: 'Permissão e compartilhamento com a família são escolhas separadas. O Ampara só pergunta ao dispositivo quando você pede.',
    waiting: 'Aguardando sua escolha…', granted: 'Permissão concedida', ask: 'Pedir permissão',
    locationUnavailable: 'A permissão de localização não está disponível neste navegador.', notGranted: 'A permissão não foi concedida. Nenhuma localização foi salva.',
    share: 'Compartilhar minha localização', sharedChoice: 'Sua família pode ver que você escolheu compartilhar.', privateChoice: 'Sua localização permanece privada.',
    map: 'mapa da família', consent: 'consentimento necessário', noLocation: 'Nenhuma localização compartilhada',
    sharingOnEmpty: 'O compartilhamento está ativo, mas ainda não há atualização de localização.',
    mapEmpty: 'Este mapa permanece intencionalmente vazio até que uma criança escolha compartilhar uma localização.',
    noTracking: 'Sem rastreamento em segundo plano. Sem último ponto visto.',
  },
  settings: {
    eyebrow: '04 / configurações', title: 'Seu espaço, sua voz.',
    description: 'Veja e altere o perfil e as permissões do dispositivo que dão forma a este espaço do Ampara.',
    profile: 'Perfil da família', stored: 'Armazenado somente neste dispositivo', save: 'Salvar alterações', saved: 'Salvo neste dispositivo.',
    notifications: 'Notificações', notificationsText: 'Uma preferência local para futuras atualizações aprovadas.',
    device: 'Este dispositivo', deviceText: 'O Ampara está rodando em modo local. Não há sincronização de conta nem coleta em segundo plano.',
    browserData: 'Os dados ficam no seu navegador', remove: 'Remover perfil local', removeText: 'Isso limpa seu perfil e as escolhas locais de compartilhamento deste dispositivo.',
    removeButton: 'Remover perfil', removeConfirm: 'Remover este perfil local de família deste dispositivo?', tutorialTitle: 'Tutorial guiado', tutorialText: 'Revise os passos principais do Ampara sempre que quiser.', tutorialAction: 'Ver tutorial novamente',
    relationshipTitle: 'Como a criança te chama', relationshipText: 'Escolha como você aparece para ela na tela de conversa — em vez do genérico "Responsável".', relationshipSaved: 'Salvo.',
  },
  notFound: { title: 'Esta página não está aqui.', text: 'O espaço do Ampara que você pediu não existe.', back: 'Voltar ao Ampara' },
  metadata: { title: 'Ampara — um espaço claro para cuidar', description: 'Um espaço transparente de segurança familiar para adultos responsáveis e crianças.' },
} as const;

const en = {
  language: { brazil: 'Brazilian Portuguese', english: 'English', switcher: 'Language' },
  onboarding: {
    aside: 'a family space, not a control room', overline: 'private by default',
    heroOne: 'Safety works', heroTwo: 'better', heroThree: 'in the open.',
    description: 'Ampara gives families a shared place to check in, talk, and share a location when everyone agrees. No hidden monitoring. No guessing what is real.',
    checkOne: 'Everyone can see what is shared', checkTwo: 'Nothing starts without consent',
    step: '01 / start here', question: "Let's set up your family's space", choiceDescription: "This screen is just for you, the guardian — the child never signs up here, she joins through the pairing link/QR code.",
    adult: 'Responsible adult', adultDescription: 'I help keep the family connected.',
    child: 'Child', childDescription: 'I want a say in my safety space.',
    yourName: 'Your name', yourNamePlaceholder: 'Type your name', familyName: 'Family space name', familyNamePlaceholder: 'Give your space a name',
    localNote: 'This stays on this device for now. Ampara will never make up a person, message, or location.',
    error: 'Choose a role and complete both fields to continue.', create: 'Create my family space',
    footer: 'Ampara / a clear space for care', help: 'Need help? Ask your family to set this up together.',
  },
  auth: {
    title: 'Responsible adult account', description: 'Sign in to keep your family space safe across devices. Children join only through family pairing.',
    signIn: 'Sign in', signUp: 'Create account', signedIn: 'Account connected', signedOut: 'No account yet?', signOut: 'Sign out',
  },
  nav: { overview: 'Overview', pair: 'Pair device', conversations: 'Conversations', location: 'Location', screenTime: 'Screen time', settings: 'Settings' },
  shell: {
    yourProfile: 'Your profile', setupIncomplete: 'Setup incomplete', completeSetup: 'Complete setup',
    familySpace: 'Family space', noMonitoring: 'No hidden monitoring, ever.', localMode: 'local mode',
    familyNotSet: 'not set up', localPrivate: 'local and private', openMenu: 'Open menu', closeMenu: 'Close menu',
    closeNavigation: 'Close navigation', mainNav: 'Main navigation', mobileNav: 'Mobile navigation', bottomNav: 'Bottom navigation',
  },
  dashboard: {
    eyebrow: '01 / overview', greeting: 'Good to have you, {name}.', title: 'A clear place to care.',
    description: 'This is your family’s shared safety space. It starts quiet, because only your real updates belong here.',
    noProfileDescription: 'Set up your family profile to make this space yours. Until then, nothing is being collected or assumed.',
    setupTitle: 'Your family space is not set up yet.', setupText: 'Start with your role and a name so this space belongs to you.', setupAction: 'Set up space',
    sharedTruth: 'shared truth', noReport: 'Nothing to report', goodNews: 'is good news.',
    emptyExplanation: 'When your family starts sharing, this is where the clear, agreed-upon updates will appear.',
    status: 'space status', quietReady: 'Quiet and ready', profile: 'Your profile', profileDone: 'Set up on this device', profileNeeds: 'Needs your details',
    approved: 'No approved conversations', approvedCount: '{count} approved contact(s) stored locally', noChildLocation: 'No child location shared',
    onlyShows: 'Ampara only shows information someone has actively chosen to share with this family space.',
    connectEyebrow: 'stay connected', connectTitle: 'Approved conversations', connectText: 'A place for messages that everyone can see are part of the family space.', connectAction: 'Open conversations',
    locationEyebrow: 'when it matters', locationTitle: 'Location, with consent', locationText: 'Location is empty until a child chooses to share it. Permission is always visible.', locationAction: 'Review location',
  },
  contacts: {
    eyebrow: 'local contacts', title: 'Who can talk here?', description: 'Approvals stay on this device for now. Nothing is sent to another device until family linking and the backend are available.',
    childTitle: 'Request a contact', childText: 'Use the real name and reference your family recognizes. The request stays pending on this device; it is not sent to anyone else.',
    adultTitle: 'Approve contacts', adultText: 'Review requests made on this device. Approving does not send a notification or create messages.',
    idLabel: 'Contact ID or reference', idPlaceholder: 'Type an agreed reference',
    nameLabel: 'Contact name', namePlaceholder: 'Type the real name',
    identifierLabel: 'Phone or another identifier (optional)', identifierPlaceholder: 'Optional',
    request: 'Request approval', pending: 'pending', approved: 'approved', denied: 'denied', revoked: 'revoked', textOnly: 'text only',
    pendingTitle: 'Pending requests', pendingEmpty: 'No pending requests on this device.',
    approvedTitle: 'Approved contacts', approvedEmpty: 'No contacts approved yet.',
    historyTitle: 'Denied and revoked', historyEmpty: 'No denied or revoked contacts.',
    approve: 'Approve', deny: 'Deny', approveTextOnly: 'Approve text only', revoke: 'Revoke',
    channelsTitle: 'Available channels', channelsEmpty: 'No channels available. A responsible adult must approve a contact first.',
    channelNote: 'Approved channel, no messages yet.', localId: 'Local ID', submitted: 'Request saved on this device.',
    duplicate: 'A contact with this local ID already exists.', missing: 'Enter a contact ID and name to continue.',
    noControls: 'Children do not see approval controls. A responsible adult makes the decision.',
    statusLabel: 'status', identifierMissing: 'no additional identifier',
    approveAlert: 'Approval was saved on this device only.', denyAlert: 'The decision was saved on this device only.', revokeAlert: 'The contact was revoked on this device.',
  },
  tutorial: {
    skip: 'Skip tutorial', back: 'Back', next: 'Next', finish: 'Go to dashboard', stepOf: 'step {current} of {total}',
    parent: [
      { title: 'Welcome to Ampara', text: 'This is a clear place to care, talk, and share only what your family chooses.', target: 'dashboard' },
      { title: 'Child profile', text: 'Review the child profile and keep real family details in this space.', target: 'child-profile' },
      { title: 'Shared activity', text: 'Approved conversations and location appear on the dashboard when they are truly shared.', target: 'activity' },
      { title: 'Approve contacts', text: 'Before anyone talks, review each request and choose approve, text-only, deny, or revoke.', target: 'approved-contacts' },
      { title: 'Private chat', text: 'The conversation between the responsible adult and child stays separate and is never mirrored.', target: 'private-channel' },
    ],
    child: [
      { title: 'Your safety space', text: 'You take part in the choices here and always know what is being shared.', target: 'dashboard' },
      { title: 'Approved contacts', text: 'Request a contact using a reference your family recognizes. You can talk only after approval.', target: 'approved-contacts' },
      { title: 'Private chat', text: 'The channel with the responsible adult is private and does not appear in approved conversation monitoring.', target: 'private-channel' },
      { title: 'Location by choice', text: 'You decide when to share your location and can clearly see when permission is active.', target: 'activity' },
    ],
  },
  conversations: {
    eyebrow: '02 / conversations', title: 'Talk where trust lives.',
    description: 'Only approved conversations belong here. The private family channel is clearly marked and never silently shared.',
    privacy: 'How privacy works', approvedTab: 'Approved conversations', privateTab: 'Private family channel',
    emptyEyebrow: 'nothing shared yet', emptyTitle: 'Your conversations are empty.',
    emptyText: 'When a family member is approved and starts a conversation, it will appear here. Ampara does not create placeholder messages.',
    learnPrivate: 'Learn about the private channel', privateTitle: 'Private family channel', privateBadge: 'private',
    privateDescription: 'A direct space for a responsible adult and child. Messages here are visible only to those two people once both profiles join this family space.',
    noParticipants: 'no participants yet', readyTitle: 'This channel is ready when your family is.',
    readyWithProfile: 'Add another family profile on their own device to make this private channel available.',
    readyWithoutProfile: 'Complete your profile first, then invite the people you trust.',
    prepare: 'Prepare private channel', alert: 'Family profiles will be connected when the shared family service is available.',
    privateFooter: 'Private means private: this channel will never be listed as an approved group conversation.',
  },
  location: {
    eyebrow: '03 / location', title: 'Location, by agreement.',
    description: 'A location is never inferred here. It appears only after a child chooses to share it and the device allows it.',
    permission: 'Device permission', allowed: 'allowed', denied: 'not allowed', notRequested: 'not requested',
    permissionText: 'Permission and family sharing are separate choices. Ampara asks the device only when you ask Ampara.',
    waiting: 'Waiting for your choice…', granted: 'Permission granted', ask: 'Ask for permission',
    locationUnavailable: 'Location permission is not available in this browser.', notGranted: 'Permission was not granted. No location was saved.',
    share: 'Share my location', sharedChoice: 'Your family can see that you chose to share.', privateChoice: 'Your location stays private.',
    map: 'family map', consent: 'consent required', noLocation: 'No location shared',
    sharingOnEmpty: 'Sharing is on, but there is no location update yet.',
    mapEmpty: 'This map stays intentionally empty until a child chooses to share a location.',
    noTracking: 'No background tracking. No last-seen pin.',
  },
  settings: {
    eyebrow: '04 / settings', title: 'Your space, your say.',
    description: 'See and change the profile and device permissions that shape this Ampara space.',
    profile: 'Family profile', stored: 'Stored on this device only', save: 'Save changes', saved: 'Saved on this device.',
    notifications: 'Notifications', notificationsText: 'A local preference for future approved updates.',
    device: 'This device', deviceText: 'Ampara is running in local mode. There is no account sync or background collection.',
    browserData: 'Data stays in your browser', remove: 'Remove local profile', removeText: 'This clears your profile and local sharing choices from this device.',
    removeButton: 'Remove profile', removeConfirm: 'Remove this local family profile from this device?', tutorialTitle: 'Guided tutorial', tutorialText: 'Review the main Ampara steps whenever you want.', tutorialAction: 'View tutorial again',
    relationshipTitle: 'How the child addresses you', relationshipText: 'Choose how you appear to her on the chat screen — instead of the generic "Responsável".', relationshipSaved: 'Saved.',
  },
  notFound: { title: 'This page is not here.', text: 'The Ampara space you asked for does not exist.', back: 'Back to Ampara' },
  metadata: { title: 'Ampara — a clear space for care', description: 'A transparent family safety space for responsible adults and children.' },
} as const;

type Language = 'pt-BR' | 'en';
type Copy = typeof pt | typeof en;
const copies = { 'pt-BR': pt, en };
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void; t: Copy }>({
  language: 'pt-BR', setLanguage: () => undefined, t: pt,
});

function useLanguage() {
  return useContext(LanguageContext);
}

function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'pt-BR');
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem(LANGUAGE_KEY, next);
  };
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
    document.title = copies[language].metadata.title;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute('content', copies[language].metadata.description);
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t: copies[language] }}>{children}</LanguageContext.Provider>;
}

function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-1" aria-label={t.language.switcher}>
      <button type="button" onClick={() => setLanguage('pt-BR')} aria-label={t.language.brazil} aria-pressed={language === 'pt-BR'} data-testid="button-language-pt" className={`grid size-8 place-items-center rounded-full text-base transition-colors ${language === 'pt-BR' ? 'bg-[hsl(var(--primary))] grayscale-0' : 'grayscale opacity-60 hover:grayscale-0 hover:opacity-100'}`}>🇧🇷</button>
      <button type="button" onClick={() => setLanguage('en')} aria-label={t.language.english} aria-pressed={language === 'en'} data-testid="button-language-en" className={`grid size-8 place-items-center rounded-full text-base transition-colors ${language === 'en' ? 'bg-[hsl(var(--primary))] grayscale-0' : 'grayscale opacity-60 hover:grayscale-0 hover:opacity-100'}`}>🇺🇸</button>
    </div>
  );
}

function readProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 group" data-testid="link-brand-home">
      <span className="grid size-10 place-items-center rounded-[13px] bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] shadow-[0_8px_20px_rgba(231,184,103,.25)] transition-transform duration-300 group-hover:rotate-[-5deg]">
        <ShieldCheck size={22} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="font-display text-[27px] leading-none tracking-[-.04em] text-[hsl(var(--foreground))]">
          ampara
        </span>
      )}
    </Link>
  );
}

function Button({
  children,
  variant = 'primary',
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  testId,
}: {
  children: ReactNode;
  variant?: 'primary' | 'outline' | 'ghost' | 'soft';
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  testId?: string;
}) {
  const variants = {
    primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_8px_18px_rgba(27,74,71,.16)] hover:-translate-y-0.5 hover:bg-[hsl(180_33%_24%)]',
    outline: 'border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] text-[hsl(var(--foreground))] hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.4)] hover:bg-[hsl(var(--muted))]',
    ghost: 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
    soft: 'bg-[hsl(var(--accent)/.2)] text-[hsl(var(--foreground))] hover:-translate-y-0.5 hover:bg-[hsl(var(--accent)/.34)]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold tracking-[-.01em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function IconBox({
  icon: Icon,
  tone = 'teal',
}: {
  icon: LucideIcon;
  tone?: 'teal' | 'gold' | 'rose' | 'slate';
}) {
  const tones = {
    teal: 'bg-[hsl(180_33%_28%/.1)] text-[hsl(var(--primary))]',
    gold: 'bg-[hsl(var(--accent)/.25)] text-[hsl(31_55%_32%)]',
    rose: 'bg-[hsl(4_63%_49%/.1)] text-[hsl(var(--destructive))]',
    slate: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  };
  return (
    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}>
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}

function Onboarding() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const existing = readProfile();
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [familyName, setFamilyName] = useState(existing?.familyName ?? '');
  const [error, setError] = useState('');

  // Antes: "/" sempre mostrava o formulário de cadastro (nome + espaço da
  // família), mesmo pra quem já tinha perfil local salvo — por isso
  // "todo login pedia pra cadastrar de novo". O perfil (nome, espaço da
  // família, papel) é local por design (ver readProfile/saveProfile); uma
  // vez que já existe, pula direto pro dashboard. Se a sessão do Clerk
  // tiver caído nesse meio tempo, o guard de login do Dashboard
  // (RequireSignedIn) já cuida de mandar pro /sign-in.
  useEffect(() => {
    if (existing) {
      setLocation('/dashboard', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esta tela é só pro Responsável (a Criança nunca "cadastra" nada — ela
  // só entra pelo link/QR de pareamento, ver PairingJoin.tsx). Antes havia
  // aqui um seletor "Adulto responsável / Criança" que deixava CRIAR um
  // perfil local como Criança — o que não deveria existir (a Criança não
  // pode criar nada). Removido; o papel agora é sempre 'responsible'.
  function finish(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !familyName.trim()) {
      setError(t.onboarding.error);
      return;
    }
    saveProfile({ role: 'responsible', displayName: displayName.trim(), familyName: familyName.trim() });
    setLocation('/dashboard');
  }

  if (existing) return null;

  return (
    <main className="texture min-h-[100dvh] overflow-hidden bg-[hsl(var(--background))]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-8 lg:px-14">
        <header className="flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))] sm:flex">
            <span className="size-2 rounded-full bg-[hsl(var(--accent))]" />
            {t.onboarding.aside}
          </div>
          <LanguageSwitcher />
          <ThemeSwitcher />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-14 pb-8 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-24 lg:py-16">
          <section className="animate-rise-in max-w-[680px]">
            <p className="mb-5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.2em] text-[hsl(var(--primary))]">
              <span className="h-px w-8 bg-[hsl(var(--accent))]" />
              {t.onboarding.overline}
            </p>
            <h1 className="font-display text-[clamp(3.5rem,8vw,7.5rem)] leading-[.86] tracking-[-.065em] text-[hsl(var(--foreground))]">
              {t.onboarding.heroOne}<br />
              <em className="text-[hsl(var(--primary))]">{t.onboarding.heroTwo}</em> {t.onboarding.heroThree}
            </h1>
            <p className="mt-8 max-w-[510px] text-lg leading-8 text-[hsl(var(--muted-foreground))]">
              {t.onboarding.description}
            </p>
            <div className="mt-10 flex flex-wrap gap-5 text-sm font-semibold text-[hsl(var(--foreground))]">
              <span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> {t.onboarding.checkOne}</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> {t.onboarding.checkTwo}</span>
            </div>
          </section>

          <section className="animate-rise-in rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.8)] p-5 shadow-card backdrop-blur sm:p-8" style={{ animationDelay: '120ms' }}>
            <div className="mb-8">
              <p className="font-mono-app text-[11px] font-medium uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">{t.onboarding.step}</p>
              <h2 className="mt-3 font-display text-4xl tracking-[-.045em]">{t.onboarding.question}</h2>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.onboarding.choiceDescription}</p>
            </div>
            <AuthPrompt />
            <form onSubmit={finish} className="mt-8 space-y-5">
              <Field label={t.onboarding.yourName} value={displayName} onChange={setDisplayName} placeholder={t.onboarding.yourNamePlaceholder} testId="input-profile-name" />
              <Field label={t.onboarding.familyName} value={familyName} onChange={setFamilyName} placeholder={t.onboarding.familyNamePlaceholder} testId="input-family-name" />
              <div className="flex items-start gap-3 border-t border-[hsl(var(--border))] pt-5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                <LockKeyhole size={16} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" />
                <span>{t.onboarding.localNote}</span>
              </div>
              {error && <p className="text-sm font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-onboarding-error">{t.onboarding.error}</p>}
              <Button type="submit" className="w-full" testId="button-create-family">
                {t.onboarding.create} <ArrowRight size={17} />
              </Button>
            </form>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]">
          <span>{t.onboarding.footer}</span>
          <span className="flex items-center gap-2"><CircleHelp size={14} /> {t.onboarding.help}</span>
        </footer>
      </div>
    </main>
  );
}

function AuthPrompt() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  if (!isLoaded) return null;
  return (
    <div className="mt-5 rounded-2xl border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.06)] p-4" data-testid="auth-prompt">
      <p className="text-sm font-extrabold">{t.auth.title}</p>
      <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.auth.description}</p>
      {isSignedIn ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-[hsl(var(--primary))]"><Check size={14} className="mr-1 inline-block align-[-2px]" /> {t.auth.signedIn}</span>
          <button type="button" onClick={() => void signOut()} className="text-xs font-bold text-[hsl(var(--muted-foreground))] underline underline-offset-4" data-testid="button-auth-sign-out">{t.auth.signOut}</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">{t.auth.signedOut}</span>
          <Link href="/sign-in" className="rounded-full bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-auth-sign-in">{t.auth.signIn}</Link>
          <Link href="/sign-up" className="rounded-full border border-[hsl(var(--border))] px-4 py-2 text-xs font-bold" data-testid="link-auth-sign-up">{t.auth.signUp}</Link>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; testId: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 text-sm outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))] focus:bg-[hsl(var(--card))]"
      />
    </label>
  );
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: House },
  { href: '/pair', label: 'Pair', icon: QrCode },
  { href: '/conversations', label: 'Conversations', icon: MessageCircle },
  { href: '/groups/new', label: 'Criar grupos', icon: Users },
  { href: '/location', label: 'Location', icon: MapPin },
  { href: '/screen-time', label: 'Screen time', icon: Hourglass },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PENDING_GUARDIAN_INVITE_KEY = 'amparo-pending-guardian-invite';

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const profile = readProfile();
  const [guardianAcceptedMessage, setGuardianAcceptedMessage] = useState<string | null>(null);

  // Item 13 do pedido (multiplos Responsaveis): quando alguem aceita um
  // convite de Responsavel sem ainda ter conta (GuardianJoin.tsx guarda o
  // token aqui antes de mandar pro /sign-in ou /sign-up), confirma o
  // convite pendente assim que a pessoa cai logada em QUALQUER tela do
  // app -- AppShell envolve todas as rotas autenticadas.
  useEffect(() => {
    let pendingToken: string | null = null;
    try {
      pendingToken = localStorage.getItem(PENDING_GUARDIAN_INVITE_KEY);
    } catch {
      pendingToken = null;
    }
    if (!pendingToken) return;
    let cancelled = false;
    (async () => {
      try {
        const authToken = await getToken();
        // pendingToken! -- o guard "if (!pendingToken) return" acima não
        // estreita o tipo dentro desta função assíncrona aninhada (mesmo
        // padrão já visto em ContactChat.tsx).
        const result = await acceptGuardianInvite(pendingToken!, authToken);
        if (!cancelled) {
          setGuardianAcceptedMessage(
            result.childrenCount === 1
              ? 'Você agora também é Responsável por 1 criança deste espaço.'
              : `Você agora também é Responsável por ${result.childrenCount} crianças deste espaço.`,
          );
        }
      } catch {
        // Convite invalido/expirado/ja usado/ja aceito -- nao ha nada pra
        // mostrar, so evita tentar de novo a cada navegacao.
      } finally {
        try {
          localStorage.removeItem(PENDING_GUARDIAN_INVITE_KEY);
        } catch {
          // ignora
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <div className="texture min-h-[100dvh] bg-[hsl(var(--background))]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col bg-[hsl(var(--sidebar))] px-5 py-7 text-[hsl(var(--sidebar-foreground))] lg:flex">
        <BrandMark compact />
        <div className="mt-7 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.55)] p-4">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.displayName} dark />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{profile?.displayName || t.shell.yourProfile}</p>
              <p className="truncate text-xs text-[hsl(var(--sidebar-foreground)/.6)]">{profile?.familyName || t.shell.setupIncomplete}</p>
            </div>
          </div>
          {!profile && <Link href="/" className="mt-3 flex items-center justify-between text-xs font-bold text-[hsl(var(--sidebar-primary))]" data-testid="link-complete-setup">{t.shell.completeSetup} <ArrowRight size={13} /></Link>}
        </div>
        <nav className="mt-9 flex-1 space-y-1" aria-label={t.shell.mainNav}>
          <p className="mb-3 px-3 font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.45)]">{t.shell.familySpace}</p>
          {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} onClick={() => setMenuOpen(false)} />)}
        </nav>
        <div className="border-t border-[hsl(var(--sidebar-border))] pt-5">
          <p className="flex items-center gap-2 text-xs leading-5 text-[hsl(var(--sidebar-foreground)/.6)]"><EyeOff size={15} /> {t.shell.noMonitoring}</p>
          <button
            type="button"
            onClick={() => { void signOut(); }}
            data-testid="button-shell-sign-out"
            className="mt-4 flex items-center gap-2 text-xs font-bold text-[hsl(var(--sidebar-foreground)/.7)] underline underline-offset-4 hover:text-[hsl(var(--sidebar-foreground))]"
          >
            <LogOut size={14} /> {t.auth.signOut}
          </button>
          <p className="mt-4 font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.35)]">Ampara v0.1 / {t.shell.localMode}</p>
        </div>
      </aside>

      {menuOpen && <button aria-label={t.shell.closeNavigation} data-testid="button-close-mobile-nav" className="fixed inset-0 z-40 bg-[hsl(var(--foreground)/.28)] lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[hsl(var(--sidebar))] px-5 py-7 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between"><BrandMark compact /><button className="grid size-11 place-items-center rounded-full hover:bg-[hsl(var(--sidebar-accent))]" onClick={() => setMenuOpen(false)} aria-label={t.shell.closeMenu} data-testid="button-close-menu"><X size={20} /></button></div>
        <nav className="mt-10 space-y-1" aria-label={t.shell.mobileNav}>
          {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} onClick={() => setMenuOpen(false)} />)}
        </nav>
        <button
          type="button"
          onClick={() => { setMenuOpen(false); void signOut(); }}
          data-testid="button-shell-sign-out-mobile"
          className="mt-6 flex items-center gap-2 border-t border-[hsl(var(--sidebar-border))] pt-5 text-xs font-bold text-[hsl(var(--sidebar-foreground)/.7)] underline underline-offset-4"
        >
          <LogOut size={14} /> {t.auth.signOut}
        </button>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.86)] px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <button className="grid size-11 place-items-center rounded-full hover:bg-[hsl(var(--muted))] lg:hidden" onClick={() => setMenuOpen(true)} aria-label={t.shell.openMenu} data-testid="button-open-menu"><Menu size={21} /></button>
          <div className="lg:hidden"><BrandMark /></div>
          <div className="hidden lg:block"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{t.shell.familySpace} / {profile?.familyName || t.shell.familyNotSet}</p></div>
          <div className="flex items-center gap-3"><LanguageSwitcher /><ThemeSwitcher /><span className="hidden items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))] sm:flex"><span className="size-2 rounded-full bg-[hsl(var(--primary))]" /> {t.shell.localPrivate}</span></div>
        </header>
        <main className="mx-auto max-w-[1280px] px-5 pb-9 pt-9 sm:px-8 lg:px-12 lg:pb-12 lg:pt-12">
          {guardianAcceptedMessage && (
            <div
              role="status"
              data-testid="banner-guardian-invite-accepted"
              className="mb-6 rounded-2xl border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.08)] p-4 text-sm font-semibold text-[hsl(var(--primary))]"
            >
              {guardianAcceptedMessage}
            </div>
          )}
          {children}
        </main>
      </div>

      <GuidedTour profile={profile} />
    </div>
  );
}

type TourStep = { title: string; text: string; target: string };

function GuidedTour({ profile }: { profile: Profile | null }) {
  const { t } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [spotlight, setSpotlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // Sempre o roteiro do Responsável — não existe mais um perfil local de
  // Criança de verdade (ver nota em Onboarding()); a Criança tem seu
  // próprio tutorial embutido na tela dela (PairingJoin.tsx), não este.
  const steps: readonly TourStep[] = t.tutorial.parent;
  const profileKey = profile ? `${TOUR_KEY_PREFIX}-${profile.role}-${profile.displayName.trim().toLowerCase()}` : '';

  useEffect(() => {
    if (!profileKey) return;
    setOpen(localStorage.getItem(profileKey) !== 'true');
    setStepIndex(0);
  }, [profileKey]);

  useEffect(() => {
    const restart = () => {
      if (!profileKey) return;
      localStorage.removeItem(profileKey);
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener('amparo:start-tour', restart);
    return () => window.removeEventListener('amparo:start-tour', restart);
  }, [profileKey]);

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector(`[data-tour="${steps[stepIndex]?.target}"]`);
    if (!(target instanceof HTMLElement)) {
      setSpotlight(null);
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = target.getBoundingClientRect();
    setSpotlight({ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 });
  }, [open, stepIndex, steps]);

  if (!profile || !open || steps.length === 0) return null;
  const current = steps[stepIndex];
  const complete = () => {
    localStorage.setItem(profileKey, 'true');
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" aria-label="Tutorial guiado" data-testid="guided-tour">
      {spotlight && <div className="pointer-events-none fixed rounded-2xl border-2 border-[hsl(var(--accent))] transition-all duration-300" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height, boxShadow: '0 0 0 9999px rgba(18, 35, 35, .58)' }} />}
      <section className="pointer-events-auto fixed bottom-5 left-5 right-5 mx-auto max-w-[460px] rounded-[24px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[0_24px_70px_rgba(18,35,35,.25)] sm:bottom-8 sm:left-auto sm:right-8 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <span className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">{t.tutorial.stepOf.replace('{current}', String(stepIndex + 1)).replace('{total}', String(steps.length))}</span>
          <button type="button" onClick={complete} className="text-xs font-bold text-[hsl(var(--muted-foreground))] underline underline-offset-4" data-testid="button-skip-tour">{t.tutorial.skip}</button>
        </div>
        <h2 className="mt-3 font-display text-3xl tracking-[-.045em]">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{current.text}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => Math.max(0, index - 1))} className="min-h-10 rounded-full px-4 text-xs font-bold text-[hsl(var(--muted-foreground))] disabled:opacity-35" data-testid="button-tour-back">{t.tutorial.back}</button>
          <button type="button" onClick={() => stepIndex === steps.length - 1 ? complete() : setStepIndex((index) => index + 1)} className="min-h-10 rounded-full bg-[hsl(var(--primary))] px-5 text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="button-tour-next">{stepIndex === steps.length - 1 ? t.tutorial.finish : t.tutorial.next} <ArrowRight size={14} className="ml-1 inline-block align-[-2px]" /></button>
        </div>
      </section>
    </div>
  );
}

function NavItem({ item, active, onClick, mobile = false }: { item: typeof navItems[number]; active: boolean; onClick?: () => void; mobile?: boolean }) {
  const Icon = item.icon;
  const { t } = useLanguage();
  const labels = [t.nav.overview, t.nav.pair, t.nav.conversations, t.nav.location, t.nav.screenTime, t.nav.settings];
  const label = labels[navItems.findIndex((nav) => nav.href === item.href)];
  return (
    <Link href={item.href} onClick={onClick} data-testid={`link-nav-${item.href.slice(1)}`} className={`${mobile ? 'flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px]' : 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm'} font-bold transition-colors ${active ? (mobile ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]') : (mobile ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.65)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]')}`}>
      <Icon size={mobile ? 19 : 18} strokeWidth={active ? 2.3 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}

// shape: 'circle' pra contato 1:1 (padrao), 'balloon' pra grupo (balao de
// festa, pra diferenciar rapidamente na lista -- pedido do Marcelo) e
// 'star' pro avatar favoritado (fica pra quando o long-press/favoritar for
// implementado, ja deixando o Avatar pronto pra receber o shape certo).
// photoUrl: se vier preenchido (grupo com foto), mostra a imagem em vez
// das iniciais, respeitando o mesmo recorte (circulo/balao/estrela).
function Avatar({ name, dark = false, shape = 'circle', photoUrl }: { name?: string; dark?: boolean; shape?: 'circle' | 'balloon' | 'star'; photoUrl?: string | null }) {
  const initials = name?.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '?';
  const tone = dark ? 'bg-[hsl(var(--sidebar-primary)/.22)] text-[hsl(var(--sidebar-primary))]' : 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]';

  if (shape === 'balloon') {
    return (
      <span className="relative inline-grid size-10 shrink-0 place-items-center" data-testid="avatar-profile">
        {photoUrl ? (
          <img src={photoUrl} alt={name ?? 'Grupo'} className="size-10 -rotate-6 rounded-[50%_50%_50%_4px] object-cover" />
        ) : (
          <span className={`grid size-10 -rotate-6 place-items-center rounded-[50%_50%_50%_4px] text-xs font-extrabold ${tone}`}>{initials}</span>
        )}
        <span className={`absolute bottom-[-3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 ${dark ? 'bg-[hsl(var(--sidebar-primary)/.22)]' : 'bg-[hsl(var(--accent))]'}`} />
      </span>
    );
  }

  if (shape === 'star') {
    return (
      <span
        className={`grid size-10 shrink-0 place-items-center text-xs font-extrabold ${photoUrl ? '' : tone}`}
        style={{ clipPath: 'polygon(50% 0%, 63% 35%, 100% 38%, 72% 60%, 82% 96%, 50% 76%, 18% 96%, 28% 60%, 0% 38%, 37% 35%)' }}
        data-testid="avatar-profile"
      >
        {photoUrl ? <img src={photoUrl} alt={name ?? ''} className="size-10 object-cover" /> : initials}
      </span>
    );
  }

  return (
    <span className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-extrabold ${photoUrl ? '' : tone}`} data-testid="avatar-profile">
      {photoUrl ? <img src={photoUrl} alt={name ?? ''} className="size-10 object-cover" /> : initials}
    </span>
  );
}

// Linhas das listas verticais de Conversas/Grupos (pedido do Marcelo: bolinhas
// em coluna, não em linha) -- cada uma isolada em componente próprio porque
// useLongPress é hook e não pode ser chamado dentro de um .map() direto
// (violaria a ordem de hooks se a lista mudar de tamanho).
function ContactRow({ contact, onOpen, onLongPress }: { contact: ApprovedContact; onOpen: () => void; onLongPress: () => void }) {
  const longPress = useLongPress(onLongPress);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`button-open-contact-mirror-${contact.id}`}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--muted)/.5)]"
      {...longPress}
    >
      <Avatar name={contact.contactName} shape={contact.isFavorite ? 'star' : 'circle'} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{contact.contactName}</span>
    </button>
  );
}

function GroupRow({ group, onOpen, onLongPress }: { group: Group; onOpen: () => void; onLongPress: () => void }) {
  const longPress = useLongPress(onLongPress);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`button-open-group-chat-${group.id}`}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--muted)/.5)]"
      {...longPress}
    >
      <Avatar name={group.name} shape="balloon" photoUrl={group.photoUrl} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.name}</span>
    </button>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="animate-rise-in mb-9 flex flex-col justify-between gap-5 border-b border-[hsl(var(--border))] pb-8 md:flex-row md:items-end">
      <div>
        <p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[clamp(2.7rem,5vw,4.6rem)] leading-[.95] tracking-[-.06em]">{title}</h1>
        <p className="mt-4 max-w-[560px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SetupNotice() {
  const { t } = useLanguage();
  const profile = readProfile();
  if (profile) return null;
  return (
    <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.12)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><Info size={18} className="mt-0.5 shrink-0 text-[hsl(31_55%_32%)]" /><div><p className="text-sm font-extrabold">{t.dashboard.setupTitle}</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.dashboard.setupText}</p></div></div>
      <Link href="/" data-testid="link-setup-notice" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))]">{t.dashboard.setupAction} <ArrowRight size={14} /></Link>
    </div>
  );
}

// Pedido do Marcelo (redesign): a home passa a ter SÓ a mensagem de
// boas-vindas + 2 botões fixos no rodapé -- "Espelho" (acompanhar as
// conversas da criança, era o card "Conversas" antigo) e "Chat" (chat
// próprio do Responsável, novo). O resto das páginas (Vincular, Local,
// Tempo de tela, Configurações) já mora no hambúrguer -- isso não mudou,
// só tirei o card daqui pra sobrar só a saudação.
function Dashboard() {
  const { t } = useLanguage();
  const profile = readProfile();
  return (
    <>
      <PageIntro eyebrow={t.dashboard.eyebrow} title={profile ? t.dashboard.greeting.replace('{name}', profile.displayName) : t.dashboard.title} description={profile ? t.dashboard.description : t.dashboard.noProfileDescription} />
      <SetupNotice />
      <div aria-hidden="true" data-tour="dashboard" className="h-28" />
      <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center gap-3 px-4 lg:pl-[252px]">
        <Link
          href="/conversations"
          data-testid="button-dashboard-open-mirror"
          className="flex items-center gap-2 rounded-full border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] px-6 py-3.5 text-sm font-extrabold shadow-[0_12px_32px_rgba(24,48,48,.14)] transition-transform hover:scale-105 active:scale-95"
        >
          <EyeOff size={18} className="text-[hsl(var(--primary))]" /> Espelho
        </Link>
        <Link
          href="/meu-chat"
          data-testid="button-dashboard-open-chat"
          className="flex items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-7 py-3.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_12px_32px_rgba(24,48,48,.28)] transition-transform hover:scale-105 active:scale-95"
        >
          <MessageCircle size={18} /> Chat
        </Link>
      </div>
    </>
  );
}

function StatusRow({ icon: Icon, label, value, done = false }: { icon: LucideIcon; label: string; value: string; done?: boolean }) {
  return <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] py-4 last:border-0"><span className="grid size-8 place-items-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Icon size={15} /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{label}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{value}</p></div>{done ? <span className="grid size-6 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Check size={13} /></span> : <span className="size-2 rounded-full bg-[hsl(var(--border))]" />}</div>;
}

function ActionCard({ icon, tone, eyebrow, title, text, href, action }: { icon: LucideIcon; tone: 'teal' | 'gold'; eyebrow: string; title: string; text: string; href: string; action: string }) {
  return <Link href={href} data-testid={`link-card-${href.slice(1)}`} className="group rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(24,48,48,.11)] sm:p-7"><div className="flex items-start justify-between"><IconBox icon={icon} tone={tone} /><ArrowRight size={19} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" /></div><p className="mt-8 font-mono-app text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">{eyebrow}</p><h2 className="mt-2 font-display text-3xl tracking-[-.04em]">{title}</h2><p className="mt-3 max-w-[390px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-extrabold text-[hsl(var(--primary))]">{action} <ChevronRight size={14} /></span></Link>;
}

// Mesma lógica de components/emoji-picker.tsx etc. usada em
// PairingJoin.tsx: o campo de escrever cresce sozinho até um limite, em
// vez de ficar cortado numa linha só (pedido do Marcelo, feito primeiro
// do lado da Criança e replicado aqui do lado do Responsável).
const PRIVATE_COMPOSER_MAX_HEIGHT = 128;
function autoGrowPrivateTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, PRIVATE_COMPOSER_MAX_HEIGHT)}px`;
}

function Conversations() {
  const [privateOpen, setPrivateOpen] = useState(false);
  const { t } = useLanguage();
  const { getToken, userId } = useAuth();
  const profile = readProfile();
  const [children, setChildren] = useState<ChildUser[] | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [approvedContacts, setApprovedContacts] = useState<ApprovedContact[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [deleteContactError, setDeleteContactError] = useState<string | null>(null);
  // Chat espelhado por contato (pedido do Marcelo: "o chat e um espelho
  // do chat da crianca" -- toda pessoa aprovada vira uma conversa de
  // verdade aqui, nao so uma lista solta). So-leitura: o Responsavel
  // nunca manda mensagem por aqui, so acompanha.
  const [openContactMirrorId, setOpenContactMirrorId] = useState<string | null>(null);
  const [contactMirrorMessages, setContactMirrorMessages] = useState<PrivateMessage[]>([]);
  const [contactMirrorChildName, setContactMirrorChildName] = useState<string | null>(null);
  const [contactMirrorLoading, setContactMirrorLoading] = useState(false);
  const [contactMirrorError, setContactMirrorError] = useState<string | null>(null);
  const contactMirrorListRef = useRef<HTMLDivElement | null>(null);
  const contactMirrorStickToBottomRef = useRef(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [privateMessages, setPrivateMessages] = useState<PrivateMessage[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [privateDraft, setPrivateDraft] = useState('');
  const [privateSending, setPrivateSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const privateTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const privateListRef = useRef<HTMLDivElement | null>(null);
  const privateStickToBottomRef = useRef(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [privateAuthToken, setPrivateAuthToken] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<ApprovedContact | null>(null);
  const [inviteQrDataUrl, setInviteQrDataUrl] = useState<string | null>(null);
  const [inviteJoinUrl, setInviteJoinUrl] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [invitingContactId, setInvitingContactId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Item do pedido: "convites" precisa de botao de copiar link, clicar no
  // link ja copia, ou compartilhar (abre as opcoes nativas do aparelho) --
  // antes so mostrava o link em texto puro, sem nenhuma acao.
  const [inviteCopied, setInviteCopied] = useState(false);

  // Menus de long-press (2s) na bolinha do contato e no balão do grupo --
  // pedido do Marcelo. Um sheet de cada vez, guardado pelo próprio objeto
  // (não só o id) pra renderizar nome/foto sem precisar re-buscar na lista.
  const [contactSheetTarget, setContactSheetTarget] = useState<ApprovedContact | null>(null);
  const [contactSheetBusy, setContactSheetBusy] = useState(false);
  const [contactSheetError, setContactSheetError] = useState<string | null>(null);
  const [groupSheetTarget, setGroupSheetTarget] = useState<Group | null>(null);
  const [groupSheetBusy, setGroupSheetBusy] = useState(false);
  const [groupSheetError, setGroupSheetError] = useState<string | null>(null);
  const [groupSheetAddOpen, setGroupSheetAddOpen] = useState(false);

  // Chat de grupo de verdade (pedido do Marcelo) -- tela cheia, abre ao
  // clicar na bolinha do grupo. Poll de 5s igual ao canal privado/contato.
  const [openGroupChatId, setOpenGroupChatId] = useState<string | null>(null);
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
  const groupListRef = useRef<HTMLDivElement | null>(null);
  const groupStickToBottomRef = useRef(true);

  // Reabrir uma conversa (trocar de criança/grupo) sempre começa colada
  // no fim, igual WhatsApp.
  useEffect(() => { privateStickToBottomRef.current = true; }, [selectedChildId]);
  useEffect(() => { groupStickToBottomRef.current = true; }, [openGroupChatId]);
  useEffect(() => { contactMirrorStickToBottomRef.current = true; }, [openContactMirrorId]);

  useEffect(() => {
    const el = privateListRef.current;
    if (el && privateStickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [privateMessages]);

  useEffect(() => {
    const el = groupListRef.current;
    if (el && groupStickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [groupChatMessages]);

  useEffect(() => {
    const el = contactMirrorListRef.current;
    if (el && contactMirrorStickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [contactMirrorMessages]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const kids = await fetchChildren(token);
        if (cancelled) return;
        setChildren(kids);
        setSelectedChildId((current) => current ?? kids[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar conversas.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Antes: contatos aprovados eram sempre buscados só pra children[0] — com
  // mais de uma criança vinculada, os contatos da segunda nunca apareciam
  // aqui, mesmo já aprovados. Agora refaz a busca sempre que a criança
  // selecionada muda.
  useEffect(() => {
    if (!selectedChildId) return;
    let cancelled = false;
    async function loadContacts() {
      try {
        const token = await getToken();
        const contacts = await fetchApprovedContacts(selectedChildId!, token);
        if (!cancelled) setApprovedContacts(contacts);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar conversas.');
      }
    }
    loadContacts();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId, getToken]);

  useEffect(() => {
    if (!selectedChildId) return;
    let cancelled = false;
    async function loadGroups() {
      try {
        const token = await getToken();
        const data = await fetchGroups(selectedChildId!, token);
        if (!cancelled) setGroups(data);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar grupos.');
      }
    }
    loadGroups();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId, getToken]);

  // Canal privado: busca o histórico real assim que a aba é aberta (ou a
  // criança selecionada muda), e depois fica atualizando sozinho a cada 5s
  // enquanto a aba estiver aberta. Antes buscava só uma vez — mensagem que
  // a Criança mandasse depois disso só aparecia recarregando a página.
  useEffect(() => {
    if (!privateOpen || !selectedChildId) return;
    let cancelled = false;

    async function loadPrivate(showSpinner: boolean) {
      if (showSpinner) setPrivateLoading(true);
      try {
        const token = await getToken();
        if (!cancelled) setPrivateAuthToken(token);
        const data = await fetchPrivateConversation(selectedChildId!, token);
        if (!cancelled) {
          setPrivateMessages(data.messages);
          setPrivateError(null);
        }
      } catch (err) {
        // Erro num poll silencioso não deve gritar na tela — só na carga
        // inicial, pra não ficar piscando aviso a cada 5s se a rede cair
        // por um instante.
        if (!cancelled && showSpinner) {
          setPrivateError(err instanceof Error ? err.message : 'Erro ao carregar o canal privado.');
        }
      } finally {
        if (!cancelled && showSpinner) setPrivateLoading(false);
      }
    }

    loadPrivate(true);
    const intervalId = window.setInterval(() => loadPrivate(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [privateOpen, selectedChildId, getToken]);

  async function sendPrivate(event: FormEvent) {
    event.preventDefault();
    const text = privateDraft.trim();
    if ((!text && !pendingFile) || !selectedChildId || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const token = await getToken();
      setPrivateAuthToken(token);
      const message = pendingFile
        ? await sendPrivateMessage(selectedChildId, { file: pendingFile, caption: text || undefined }, token)
        : await sendPrivateMessage(selectedChildId, { textContent: text }, token);
      setPrivateMessages((current) => [...current, message]);
      setPrivateDraft('');
      setPendingFile(null);
      if (privateTextareaRef.current) privateTextareaRef.current.style.height = 'auto';
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setPrivateSending(false);
    }
  }

  // Áudio grava e manda na hora, sem passar pelo composer — igual figurinha.
  async function sendAudio(file: File) {
    if (!selectedChildId || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const token = await getToken();
      setPrivateAuthToken(token);
      const message = await sendPrivateMessage(selectedChildId, { file }, token);
      setPrivateMessages((current) => [...current, message]);
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar áudio.');
    } finally {
      setPrivateSending(false);
    }
  }

  // Figurinha manda na hora, sem passar pelo composer — igual WhatsApp.
  async function sendSticker(emoji: string) {
    if (!selectedChildId || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const token = await getToken();
      setPrivateAuthToken(token);
      const message = await sendPrivateMessage(selectedChildId, { stickerEmoji: emoji }, token);
      setPrivateMessages((current) => [...current, message]);
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setPrivateSending(false);
    }
  }

  // Só o Responsável adiciona contato — a Criança nunca vê essa opção no
  // app dela (ver PairingJoin.tsx). Depois de aprovado aqui, o contato já
  // nasce liberado pra conversar (ver comentário em routes/contacts.ts).
  async function addContact(event: FormEvent) {
    event.preventDefault();
    const name = newContactName.trim();
    if (!name || !selectedChildId || addingContact) return;
    setAddingContact(true);
    setAddContactError(null);
    try {
      const token = await getToken();
      const contact = await addApprovedContact(selectedChildId, name, token);
      setApprovedContacts((current) => [...current, contact]);
      setNewContactName('');
    } catch (err) {
      setAddContactError(err instanceof Error ? err.message : 'Erro ao adicionar contato.');
    } finally {
      setAddingContact(false);
    }
  }

  // Exclusão de verdade (não é "revogar") — pedido do Marcelo: opção de
  // excluir qualquer contato. Se ele estiver em algum grupo, sai de lá
  // junto (cascade no backend) — por isso refaz a busca de grupos também,
  // pra não deixar um nome fantasma na lista de membros na tela.
  async function handleDeleteContact(contact: ApprovedContact) {
    if (deletingContactId || !selectedChildId) return;
    if (!window.confirm(`Excluir o contato "${contact.contactName}"? Ele sai de qualquer grupo do qual participe.`)) {
      return;
    }
    setDeletingContactId(contact.id);
    setDeleteContactError(null);
    try {
      const token = await getToken();
      await deleteContact(contact.id, token);
      setApprovedContacts((current) => current.filter((item) => item.id !== contact.id));
      setSelectedContactIds((current) => current.filter((id) => id !== contact.id));
      const refreshedGroups = await fetchGroups(selectedChildId, token);
      setGroups(refreshedGroups);
    } catch (err) {
      setDeleteContactError(err instanceof Error ? err.message : 'Erro ao excluir contato.');
    } finally {
      setDeletingContactId(null);
    }
  }

  // Long-press na bolinha > "favoritar" (vira avatar em estrela, ver
  // shape='star' em Avatar) e "bloquear" (revoga o acesso -- reaproveita
  // status="revoked", já existente; o contato some das listas de Convites/
  // Conversas/Grupos, que só mostram status=approved). "Renomear" logo
  // abaixo; "Excluir" reusa handleDeleteContact (já tem confirmação).
  async function handleToggleFavorite(contact: ApprovedContact) {
    setContactSheetBusy(true);
    setContactSheetError(null);
    try {
      const token = await getToken();
      const updated = await updateContact(contact.id, { isFavorite: !contact.isFavorite }, token);
      setApprovedContacts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setContactSheetTarget(updated);
    } catch (err) {
      setContactSheetError(err instanceof Error ? err.message : 'Erro ao favoritar.');
    } finally {
      setContactSheetBusy(false);
    }
  }

  async function handleRenameContact(contact: ApprovedContact) {
    const name = window.prompt('Novo nome do contato:', contact.contactName)?.trim();
    if (!name || name === contact.contactName) return;
    setContactSheetBusy(true);
    setContactSheetError(null);
    try {
      const token = await getToken();
      const updated = await updateContact(contact.id, { contactName: name }, token);
      setApprovedContacts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setContactSheetTarget(updated);
    } catch (err) {
      setContactSheetError(err instanceof Error ? err.message : 'Erro ao renomear.');
    } finally {
      setContactSheetBusy(false);
    }
  }

  async function handleBlockContact(contact: ApprovedContact) {
    if (!window.confirm(`Bloquear "${contact.contactName}"? A pessoa deixa de poder conversar com a criança — some das listas de Convites, Conversas e Grupos.`)) {
      return;
    }
    setContactSheetBusy(true);
    setContactSheetError(null);
    try {
      const token = await getToken();
      await blockContact(contact.id, token);
      setApprovedContacts((current) => current.filter((item) => item.id !== contact.id));
      setContactSheetTarget(null);
    } catch (err) {
      setContactSheetError(err instanceof Error ? err.message : 'Erro ao bloquear.');
    } finally {
      setContactSheetBusy(false);
    }
  }

  // Convite por link/QR (pedido do Marcelo: "a Lorena recebe um link com
  // qrcode, ela basta clicar que já faz o pré cadastro dela feito") -- só
  // faz sentido pra quem ainda não é um usuário de verdade (contactUserId
  // null); depois de aceitar, o Contato já aparece "Conectado" na lista.
  async function handleInviteContact(contact: ApprovedContact) {
    if (invitingContactId) return;
    setInvitingContactId(contact.id);
    setInviteError(null);
    try {
      const token = await getToken();
      const result = await inviteContact(contact.id, token);
      const qrDataUrl = await QRCode.toDataURL(result.joinUrl, { width: 280, margin: 2 });
      setInviteTarget(contact);
      setInviteQrDataUrl(qrDataUrl);
      setInviteJoinUrl(result.joinUrl);
      setInviteExpiresAt(result.expiresAt);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao gerar o convite.');
    } finally {
      setInvitingContactId(null);
    }
  }

  function closeInviteModal() {
    setInviteTarget(null);
    setInviteQrDataUrl(null);
    setInviteJoinUrl(null);
    setInviteExpiresAt(null);
    setInviteCopied(false);
  }

  async function copyInviteLink() {
    if (!inviteJoinUrl) return;
    try {
      await navigator.clipboard.writeText(inviteJoinUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // clipboard pode falhar (permissao, contexto nao seguro etc.) --
      // o link continua selecionavel/copiavel manualmente no texto.
    }
  }

  async function shareInviteLink() {
    if (!inviteJoinUrl || !inviteTarget) return;
    const shareData = {
      title: 'Convite do Ampara',
      text: `${inviteTarget.contactName}, aqui está seu convite para o Ampara:`,
      url: inviteJoinUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // usuario cancelou o compartilhamento -- sem erro pra mostrar
      }
    } else {
      void copyInviteLink();
    }
  }

  async function handleCreateGroup(event: FormEvent) {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || selectedContactIds.length === 0 || !selectedChildId || creatingGroup) return;
    setCreatingGroup(true);
    setGroupError(null);
    try {
      const token = await getToken();
      const group = await createGroup(selectedChildId, name, selectedContactIds, token);
      setGroups((current) => [...current, group]);
      setGroupName('');
      setSelectedContactIds([]);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Erro ao criar grupo.');
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    try {
      const token = await getToken();
      await deleteGroup(groupId, token);
      setGroups((current) => current.filter((group) => group.id !== groupId));
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Erro ao excluir grupo.');
    }
  }

  // Pedido do Marcelo: dava pra escolher os membros só na criação do
  // grupo -- não tinha como colocar mais alguém depois (ex: criou o grupo
  // só com a Verônica, quis colocar a Rafaella junto em seguida).
  async function handleAddGroupMember(groupId: string, contactId: string) {
    if (!contactId) return;
    try {
      const token = await getToken();
      await addGroupMember(groupId, contactId, token);
      const contact = approvedContacts.find((item) => item.id === contactId);
      if (contact) {
        setGroups((current) =>
          current.map((group) =>
            group.id === groupId ? { ...group, members: [...group.members, { id: contact.id, contactName: contact.contactName }] } : group,
          ),
        );
      }
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Erro ao adicionar ao grupo.');
    }
  }

  async function handleRemoveGroupMember(groupId: string, contactId: string) {
    try {
      const token = await getToken();
      await removeGroupMember(groupId, contactId, token);
      setGroups((current) =>
        current.map((group) =>
          group.id === groupId ? { ...group, members: group.members.filter((member) => member.id !== contactId) } : group,
        ),
      );
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Erro ao remover do grupo.');
    }
  }

  // Long-press no balão > "trocar foto", chamado pelo menu do grupo.
  // "Ver informações" é só a própria sheet (nome + foto + membros, sem
  // rota nova); "adicionar pessoas" e "excluir grupo" reusam
  // handleAddGroupMember/handleDeleteGroup, já existentes acima.
  async function handleGroupSheetPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !groupSheetTarget) return;
    setGroupSheetBusy(true);
    setGroupSheetError(null);
    try {
      const token = await getToken();
      const updated = await uploadGroupPhoto(groupSheetTarget.id, file, token);
      setGroups((current) => current.map((group) => (group.id === updated.id ? { ...group, photoUrl: updated.photoUrl } : group)));
      setGroupSheetTarget((current) => (current ? { ...current, photoUrl: updated.photoUrl } : current));
    } catch (err) {
      setGroupSheetError(err instanceof Error ? err.message : 'Erro ao trocar a foto.');
    } finally {
      setGroupSheetBusy(false);
    }
  }

  // Poll de 5s enquanto o chat de um grupo estiver aberto em tela cheia
  // (mesmo padrao do canal privado e de ContactChat.tsx).
  useEffect(() => {
    if (!openGroupChatId) return;
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setGroupChatLoading(true);
      try {
        const token = await getToken();
        const data = await fetchGroupMessages(openGroupChatId!, token);
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

    load(true);
    const intervalId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [openGroupChatId, getToken]);

  function openGroupChat(groupId: string) {
    setGroupChatMessages([]);
    setGroupChatError(null);
    setGroupDraft('');
    setGroupPendingFile(null);
    setOpenGroupChatId(groupId);
  }

  function closeGroupChat() {
    setOpenGroupChatId(null);
  }

  useEffect(() => {
    if (!openContactMirrorId) return;
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setContactMirrorLoading(true);
      try {
        const token = await getToken();
        const data = await fetchParentContactConversation(openContactMirrorId!, token);
        if (!cancelled) {
          setContactMirrorMessages(data.messages);
          setContactMirrorChildName(data.childName);
          setContactMirrorError(null);
        }
      } catch (err) {
        if (!cancelled && showSpinner) {
          setContactMirrorError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        }
      } finally {
        if (!cancelled && showSpinner) setContactMirrorLoading(false);
      }
    }

    load(true);
    const intervalId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [openContactMirrorId, getToken]);

  function openContactMirror(contactUserId: string) {
    setContactMirrorMessages([]);
    setContactMirrorError(null);
    setOpenContactMirrorId(contactUserId);
  }

  function closeContactMirror() {
    setOpenContactMirrorId(null);
  }

  async function handleSendGroupMessage(event: FormEvent) {
    event.preventDefault();
    const text = groupDraft.trim();
    if ((!text && !groupPendingFile) || !openGroupChatId || groupSending) return;
    setGroupSending(true);
    setGroupChatError(null);
    try {
      const token = await getToken();
      const message = groupPendingFile
        ? await sendGroupMessage(openGroupChatId, { file: groupPendingFile, caption: text || undefined }, token)
        : await sendGroupMessage(openGroupChatId, { textContent: text }, token);
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
    if (!openGroupChatId || groupSending) return;
    setGroupSending(true);
    setGroupChatError(null);
    try {
      const token = await getToken();
      const message = await sendGroupMessage(openGroupChatId, { stickerEmoji: emoji }, token);
      setGroupChatMessages((current) => [...current, message]);
    } catch (err) {
      setGroupChatError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setGroupSending(false);
    }
  }

  async function sendGroupAudio(file: File) {
    if (!openGroupChatId || groupSending) return;
    setGroupSending(true);
    setGroupChatError(null);
    try {
      const token = await getToken();
      const message = await sendGroupMessage(openGroupChatId, { file }, token);
      setGroupChatMessages((current) => [...current, message]);
    } catch (err) {
      setGroupChatError(err instanceof Error ? err.message : 'Erro ao enviar audio.');
    } finally {
      setGroupSending(false);
    }
  }

  const hasChild = (children?.length ?? 0) > 0;
  const selectedChildName = children?.find((child) => child.id === selectedChildId)?.name ?? null;
  const mediaAuthHeaders: HeadersInit = privateAuthToken ? { Authorization: `Bearer ${privateAuthToken}` } : {};

  return (
    <>
      <PageIntro eyebrow={t.conversations.eyebrow} title={t.conversations.title} description={t.conversations.description} action={<Button variant="outline" onClick={() => setPrivateOpen(true)} testId="button-open-channel-info"><Info size={16} /> {t.conversations.privacy}</Button>} />
      {children && children.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1 sm:w-fit" data-testid="selector-conversations-child">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => setSelectedChildId(child.id)}
              data-testid={`button-select-conversations-child-${child.id}`}
              className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${selectedChildId === child.id ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}
      <div className="mb-6 flex items-center gap-1 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1 sm:w-fit">
        <button onClick={() => setPrivateOpen(false)} data-testid="button-tab-approved" className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${!privateOpen ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>{t.conversations.approvedTab}</button>
        <button onClick={() => setPrivateOpen(true)} data-testid="button-tab-private" className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${privateOpen ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>{t.conversations.privateTab}</button>
      </div>
      {!privateOpen ? (
        loadError ? (
          <p className="rounded-2xl bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" data-testid="status-conversations-error">{loadError}</p>
        ) : !hasChild ? (
          <EmptyState icon={MessageCircle} eyebrow={t.conversations.emptyEyebrow} title={t.conversations.emptyTitle} text="Nenhuma criança vinculada ainda. Vá em 'Vincular criança' para gerar o QR code de pareamento." actionLabel="Vincular criança" onAction={() => { window.location.href = '/pair'; }} testId="button-empty-private" />
        ) : (
          <section className="overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-card">
            <div className="border-b border-[hsl(var(--border))] p-6 sm:p-8">
              <h2 className="text-xl font-extrabold">Convites ({approvedContacts.length})</h2>
              <form onSubmit={addContact} className="mt-4 flex items-center gap-2" data-testid="form-add-contact">
                <input
                  value={newContactName}
                  onChange={(event) => setNewContactName(event.target.value)}
                  placeholder="Nome do contato (ex: Vovó Ana)"
                  data-testid="input-new-contact-name"
                  className="h-11 flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
                />
                <button
                  type="submit"
                  disabled={!newContactName.trim() || addingContact}
                  data-testid="button-add-contact"
                  className="h-11 whitespace-nowrap rounded-md bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
                >
                  {addingContact ? "…" : "Adicionar"}
                </button>
              </form>
              {addContactError && (
                <p className="mt-2 text-sm text-red-600" data-testid="status-add-contact-error">{addContactError}</p>
              )}
              {deleteContactError && (
                <p className="mt-2 text-sm text-red-600" data-testid="status-delete-contact-error">{deleteContactError}</p>
              )}
              {approvedContacts.length === 0 ? (
                <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">{t.contacts.approvedEmpty}</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {approvedContacts.map((contact) => (
                    <li key={contact.id} className="flex items-center justify-between gap-3 rounded-xl bg-[hsl(var(--muted)/.5)] px-4 py-3 text-sm font-bold" data-testid={`row-approved-contact-${contact.id}`}>
                      <span className="min-w-0 flex-1 truncate">{contact.contactName}</span>
                      <div className="flex shrink-0 items-center gap-3">
                        {contact.contactUserId ? (
                          <span className="text-xs font-semibold text-green-600">Conectado</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { void handleInviteContact(contact); }}
                            disabled={invitingContactId === contact.id}
                            data-testid={`button-invite-contact-${contact.id}`}
                            className="text-xs font-semibold text-[hsl(var(--primary))] transition-colors hover:underline disabled:opacity-60"
                          >
                            {invitingContactId === contact.id ? 'Gerando…' : 'Convidar'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { void handleDeleteContact(contact); }}
                          disabled={deletingContactId === contact.id}
                          aria-label={`Excluir contato ${contact.contactName}`}
                          data-testid={`button-delete-contact-${contact.id}`}
                          className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--destructive))] disabled:opacity-60"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {inviteError && (
                <p className="mt-2 text-sm text-red-600" data-testid="status-invite-contact-error">{inviteError}</p>
              )}
            </div>
            <div className="p-6 sm:p-8">
              <h2 className="text-xl font-extrabold">Conversas ({approvedContacts.filter((contact) => contact.contactUserId).length})</h2>
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">O chat aqui é um espelho da conversa de cada pessoa aprovada com a criança — só leitura.</p>
              {approvedContacts.filter((contact) => contact.contactUserId).length === 0 ? (
                <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Nenhum contato conectado ainda. Assim que alguém aceitar o convite, a conversa aparece aqui.</p>
              ) : (
                <div className="mt-4 flex flex-col gap-1" data-testid="row-contact-mirror-bubbles">
                  {approvedContacts.filter((contact) => contact.contactUserId).map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      onOpen={() => openContactMirror(contact.contactUserId!)}
                      onLongPress={() => { setContactSheetError(null); setContactSheetTarget(contact); }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-[hsl(var(--border))] p-6 sm:p-8">
              <h2 className="text-xl font-extrabold">Grupos ({groups.length})</h2>
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Um grupo só existe se você criar — escolha entre os contatos já aprovados.</p>
              {groups.length > 0 && (
                <div className="mt-4 flex flex-col gap-1" data-testid="row-group-bubbles">
                  {groups.map((group) => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      onOpen={() => openGroupChat(group.id)}
                      onLongPress={() => { setGroupSheetError(null); setGroupSheetAddOpen(false); setGroupSheetTarget(group); }}
                    />
                  ))}
                </div>
              )}
              <form onSubmit={handleCreateGroup} className="mt-4 flex flex-col gap-3" data-testid="form-create-group">
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Nome do grupo (ex: Família)"
                  data-testid="input-group-name"
                  className="h-11 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
                />
                {approvedContacts.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Aprove pelo menos um contato antes de criar um grupo.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {approvedContacts.map((contact) => {
                      const checked = selectedContactIds.includes(contact.id);
                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => setSelectedContactIds((current) => (checked ? current.filter((id) => id !== contact.id) : [...current, contact.id]))}
                          data-testid={`button-toggle-group-contact-${contact.id}`}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${checked ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}
                        >
                          {contact.contactName}
                        </button>
                      );
                    })}
                  </div>
                )}
                {groupError && <p className="text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{groupError}</p>}
                <Button type="submit" disabled={!groupName.trim() || selectedContactIds.length === 0 || creatingGroup} className="w-fit" testId="button-create-group">
                  {creatingGroup ? 'Criando…' : 'Criar grupo'}
                </Button>
              </form>
              {groups.length === 0 ? (
                <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">Nenhum grupo criado ainda.</p>
              ) : (
                <ul className="mt-5 flex flex-col gap-2">
                  {groups.map((group) => {
                    const memberIds = new Set(group.members.map((member) => member.id));
                    const availableToAdd = approvedContacts.filter((contact) => !memberIds.has(contact.id));
                    return (
                    <li key={group.id} className="rounded-xl bg-[hsl(var(--muted)/.5)] px-4 py-3 text-sm" data-testid={`row-group-${group.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold">{group.name}</p>
                        <button type="button" onClick={() => { void handleDeleteGroup(group.id); }} aria-label="Excluir grupo" data-testid={`button-delete-group-${group.id}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]">
                          <X size={16} />
                        </button>
                      </div>
                      {group.members.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {group.members.map((member) => (
                            <span key={member.id} className="flex items-center gap-1 rounded-full bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-bold" data-testid={`chip-group-member-${group.id}-${member.id}`}>
                              {member.contactName}
                              <button type="button" onClick={() => { void handleRemoveGroupMember(group.id, member.id); }} aria-label={`Remover ${member.contactName} do grupo`} data-testid={`button-remove-group-member-${group.id}-${member.id}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]">
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {availableToAdd.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(event) => { void handleAddGroupMember(group.id, event.target.value); event.target.value = ''; }}
                          data-testid={`select-add-group-member-${group.id}`}
                          className="mt-2 h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs outline-none focus:border-[hsl(var(--primary))]"
                        >
                          <option value="" disabled>+ Adicionar contato ao grupo</option>
                          {availableToAdd.map((contact) => (
                            <option key={contact.id} value={contact.id}>{contact.contactName}</option>
                          ))}
                        </select>
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><Info size={13} /> Toque na bolinha do grupo, no topo, para abrir o chat em tela cheia.</p>
            </div>
          </section>
        )
      ) : (
           <section className="overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-card" data-tour="private-channel">
          <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div className="flex items-start gap-4"><IconBox icon={LockKeyhole} tone="teal" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-extrabold">{t.conversations.privateTitle}</h2><span className="rounded-full bg-[hsl(var(--primary)/.1)] px-2.5 py-1 font-mono-app text-[10px] font-medium uppercase tracking-[.08em] text-[hsl(var(--primary))]">{t.conversations.privateBadge}</span></div><p className="mt-2 max-w-[590px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.conversations.privateDescription}</p></div></div><span className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))]"><EyeOff size={15} /> {t.conversations.noParticipants}</span></div>
          {!hasChild ? (
            <div className="flex min-h-[290px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative mb-5"><span className="absolute inset-[-9px] rounded-full border border-dashed border-[hsl(var(--accent)/.65)] animate-pulse-soft" /><span className="relative grid size-16 place-items-center rounded-full bg-[hsl(var(--accent)/.24)] text-[hsl(31_55%_32%)]"><UserPlus size={25} /></span></div><h3 className="font-display text-3xl tracking-[-.04em]">{t.conversations.readyTitle}</h3><p className="mt-3 max-w-[410px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{profile ? t.conversations.readyWithProfile : t.conversations.readyWithoutProfile}</p></div>
          ) : (
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <div
                ref={privateListRef}
                onScroll={(event) => {
                  const el = event.currentTarget;
                  privateStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                }}
                className="flex min-h-[220px] flex-col gap-3 overflow-y-auto rounded-2xl bg-[hsl(var(--muted)/.4)] p-4"
                data-testid="list-private-messages"
              >
                {privateLoading && privateMessages.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
                ) : privateMessages.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Nenhuma mensagem ainda com {selectedChildName ?? 'a criança'}. Escreva a primeira aqui embaixo.
                  </p>
                ) : (
                  privateMessages.map((message) => {
                    const fromMe = message.senderId !== selectedChildId;
                    const sticker = isStickerMessage(message);
                    const bubbleClass = sticker
                      ? `${fromMe ? 'self-end' : 'self-start'}`
                      : `rounded-2xl px-4 py-2.5 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
                    return (
                      <div
                        key={message.id}
                        data-testid={`row-private-message-${message.id}`}
                        className={`max-w-[80%] text-sm leading-6 ${bubbleClass}`}
                      >
                        <MessageContent message={message} authHeaders={mediaAuthHeaders} />
                        <p className={`mt-1 text-[10px] font-mono-app uppercase tracking-[.08em] ${fromMe && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          {new Date(message.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
              {privateError && <p className="text-xs font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-private-error">{privateError}</p>}
              {attachError && <p className="text-xs font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-attach-error">{attachError}</p>}
              {pendingFile && (
                <div className="flex items-center gap-2 self-start rounded-xl bg-[hsl(var(--muted)/.6)] px-3 py-2 text-xs font-semibold" data-testid="chip-pending-attachment">
                  {pendingFile.type.startsWith('video/') ? 'Vídeo selecionado:' : 'Foto selecionada:'} {pendingFile.name}
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    aria-label="Remover anexo"
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <form onSubmit={sendPrivate} className="flex items-end gap-2">
                {/* Antes eram 4 botões soltos (emoji/anexo/figurinha/áudio) ao
                    lado do campo de escrever — em telas estreitas isso
                    estourava a largura e escondia o botão Enviar (mesmo
                    problema corrigido do lado da Criança em
                    PairingJoin.tsx). Agora ficam atrás de um único botão
                    "+" que abre em cascata por cima. */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setComposerToolsOpen((current) => !current)}
                    aria-label={composerToolsOpen ? 'Fechar opções' : 'Mais opções (emoji, foto, figurinha, áudio)'}
                    data-testid="button-composer-tools"
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
                      <div
                        className="absolute bottom-full left-0 z-40 mb-2 flex flex-col gap-1.5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-1.5 shadow-lg"
                        data-testid="panel-composer-tools"
                      >
                        <EmojiPicker
                          onSelect={(emoji) => {
                            setPrivateDraft((current) => current + emoji);
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
                          disabled={privateSending}
                        />
                      </div>
                    </>
                  )}
                </div>
                <textarea
                  ref={privateTextareaRef}
                  value={privateDraft}
                  onChange={(event) => {
                    setPrivateDraft(event.target.value);
                    autoGrowPrivateTextarea(event.target);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={pendingFile ? 'Adicione uma legenda (opcional)…' : `Escreva pra ${selectedChildName ?? 'a criança'}…`}
                  rows={1}
                  className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 py-3 text-sm leading-5 outline-none focus:border-[hsl(var(--primary))]"
                  data-testid="input-private-message"
                />
                <Button type="submit" disabled={(!privateDraft.trim() && !pendingFile) || privateSending} testId="button-send-private-message">
                  {privateSending ? 'Enviando…' : 'Enviar'}
                </Button>
              </form>
            </div>
          )}
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-6 py-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" /> {t.conversations.privateFooter}</div>
        </section>
      )}
      {inviteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--foreground)/.35)] p-4" onClick={closeInviteModal}>
          <div
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 text-center shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold">Convidar {inviteTarget.contactName}</h2>
            {inviteQrDataUrl && (
              <img src={inviteQrDataUrl} alt={`QR code de convite para ${inviteTarget.contactName}`} width={220} height={220} />
            )}
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Peça para {inviteTarget.contactName} escanear este código com a câmera do celular, ou envie o link abaixo.
              {inviteExpiresAt && <> Válido por 7 dias.</>}
            </p>
            {inviteJoinUrl && (
              <button
                type="button"
                onClick={() => { void copyInviteLink(); }}
                data-testid="button-copy-invite-link"
                title="Clique para copiar o link"
                className="w-full break-all rounded-xl bg-[hsl(var(--muted)/.5)] px-3 py-2 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
              >
                {inviteJoinUrl}
              </button>
            )}
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={() => { void copyInviteLink(); }}
                data-testid="button-copy-invite-link-action"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-[hsl(var(--border))] text-sm font-bold transition-colors hover:border-[hsl(var(--primary))]"
              >
                {inviteCopied ? 'Copiado!' : 'Copiar link'}
              </button>
              <button
                type="button"
                onClick={() => { void shareInviteLink(); }}
                data-testid="button-share-invite-link"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))]"
              >
                Compartilhar
              </button>
            </div>
            <button type="button" onClick={closeInviteModal} className="text-sm font-medium underline" data-testid="button-close-invite-modal">
              Fechar
            </button>
          </div>
        </div>
      )}
      {openGroupChatId && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[hsl(var(--background))]" data-testid="overlay-group-chat">
          <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={groups.find((group) => group.id === openGroupChatId)?.name} />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold">{groups.find((group) => group.id === openGroupChatId)?.name ?? 'Grupo'}</h1>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Chat de grupo</p>
              </div>
            </div>
            <button type="button" onClick={closeGroupChat} aria-label="Fechar chat do grupo" data-testid="button-close-group-chat" className="grid size-10 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <X size={20} />
            </button>
          </header>

          <div
            ref={groupListRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              groupStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
            data-testid="list-group-messages"
          >
            {groupChatLoading && groupChatMessages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
            ) : groupChatMessages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem ainda neste grupo. Escreva a primeira aqui embaixo.</p>
            ) : (
              groupChatMessages.map((message) => {
                const fromMe = message.senderId === userId;
                const senderName = groupChatNames[message.senderId] ?? '…';
                const sticker = isStickerMessage(message);
                const bubbleClass = sticker
                  ? `${fromMe ? 'self-end' : 'self-start'}`
                  : `rounded-2xl px-4 py-2.5 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
                return (
                  <div key={message.id} data-testid={`row-group-message-${message.id}`} className={`flex max-w-[80%] flex-col ${fromMe ? 'self-end items-end' : 'self-start items-start'}`}>
                    {!fromMe && (
                      <p className="mb-1 px-1 text-[11px] font-bold text-[hsl(var(--muted-foreground))]">{senderName}</p>
                    )}
                    <div className={`text-sm leading-6 ${bubbleClass}`}>
                      <MessageContent message={message} authHeaders={mediaAuthHeaders} />
                      <p className={`mt-1 text-[10px] font-mono-app uppercase tracking-[.08em] ${fromMe && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                        {new Date(message.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            {groupChatError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-group-chat-error">{groupChatError}</p>}
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
                  autoGrowPrivateTextarea(event.target);
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
              <Button type="submit" disabled={(!groupDraft.trim() && !groupPendingFile) || groupSending} testId="button-send-group-message">
                {groupSending ? 'Enviando…' : 'Enviar'}
              </Button>
            </form>
          </div>
        </div>
      )}
      {openContactMirrorId && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[hsl(var(--background))]" data-testid="overlay-contact-mirror">
          <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={approvedContacts.find((contact) => contact.contactUserId === openContactMirrorId)?.contactName} />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold">{approvedContacts.find((contact) => contact.contactUserId === openContactMirrorId)?.contactName ?? 'Contato'}</h1>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Espelho da conversa com {contactMirrorChildName ?? 'a criança'} — só leitura</p>
              </div>
            </div>
            <button type="button" onClick={closeContactMirror} aria-label="Fechar conversa" data-testid="button-close-contact-mirror" className="grid size-10 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <X size={20} />
            </button>
          </header>

          <div
            ref={contactMirrorListRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              contactMirrorStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
            data-testid="list-contact-mirror-messages"
          >
            {contactMirrorLoading && contactMirrorMessages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
            ) : contactMirrorMessages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem ainda nessa conversa.</p>
            ) : (
              contactMirrorMessages.map((message) => {
                const fromContact = message.senderId === openContactMirrorId;
                const senderName = fromContact
                  ? approvedContacts.find((contact) => contact.contactUserId === openContactMirrorId)?.contactName ?? 'Contato'
                  : contactMirrorChildName ?? 'Criança';
                const sticker = isStickerMessage(message);
                const bubbleClass = sticker
                  ? `${fromContact ? 'self-end' : 'self-start'}`
                  : `rounded-2xl px-4 py-2.5 shadow-sm ${fromContact ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
                return (
                  <div key={message.id} data-testid={`row-contact-mirror-message-${message.id}`} className={`flex max-w-[80%] flex-col ${fromContact ? 'self-end items-end' : 'self-start items-start'}`}>
                    <p className="mb-1 px-1 text-[11px] font-bold text-[hsl(var(--muted-foreground))]">{senderName}</p>
                    <div className={`text-sm leading-6 ${bubbleClass}`}>
                      <MessageContent message={message} authHeaders={mediaAuthHeaders} />
                      <p className={`mt-1 text-[10px] font-mono-app uppercase tracking-[.08em] ${fromContact && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                        {new Date(message.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {contactMirrorError && <p className="shrink-0 px-4 pb-2 text-sm font-semibold text-[hsl(var(--destructive))]">{contactMirrorError}</p>}
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-6 py-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" /> Espelho: você só acompanha, quem manda mensagem aqui é {contactMirrorChildName ?? 'a criança'} e a pessoa aprovada.</div>
        </div>
      )}

      {/* Long-press (2s) na bolinha do contato -- pedido do Marcelo:
          bloquear / renomear / favoritar / excluir. */}
      <Sheet open={!!contactSheetTarget} onOpenChange={(open) => { if (!open) setContactSheetTarget(null); }}>
        <SheetContent side="bottom" className="mx-auto max-w-[480px] rounded-t-[26px]" data-testid="sheet-contact-actions">
          {contactSheetTarget && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar name={contactSheetTarget.contactName} shape={contactSheetTarget.isFavorite ? 'star' : 'circle'} />
                  <SheetTitle>{contactSheetTarget.contactName}</SheetTitle>
                </div>
              </SheetHeader>
              {contactSheetError && <p className="mt-2 text-sm font-semibold text-[hsl(var(--destructive))]">{contactSheetError}</p>}
              <div className="mt-4 flex flex-col gap-1">
                {/* contactSheetTarget! nos onClick abaixo: dentro de uma
                    closure aninhada (o corpo da arrow function), o guard
                    "contactSheetTarget &&" do JSX não estreita o tipo de
                    volta pra não-nulo -- mesmo padrão documentado em
                    CreateGroupWizard/ContactChat.tsx. */}
                <button type="button" disabled={contactSheetBusy} data-testid="button-contact-sheet-block" onClick={() => { void handleBlockContact(contactSheetTarget!); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-[hsl(var(--muted)/.5)] disabled:opacity-60">
                  <Ban size={18} /> Bloquear pessoa
                </button>
                <button type="button" disabled={contactSheetBusy} data-testid="button-contact-sheet-rename" onClick={() => { void handleRenameContact(contactSheetTarget!); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-[hsl(var(--muted)/.5)] disabled:opacity-60">
                  <Pencil size={18} /> Renomear
                </button>
                <button type="button" disabled={contactSheetBusy} data-testid="button-contact-sheet-favorite" onClick={() => { void handleToggleFavorite(contactSheetTarget!); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-[hsl(var(--muted)/.5)] disabled:opacity-60">
                  <Star size={18} /> {contactSheetTarget.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
                </button>
                <button type="button" disabled={contactSheetBusy} data-testid="button-contact-sheet-delete" onClick={() => { const target = contactSheetTarget!; setContactSheetTarget(null); void handleDeleteContact(target); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]">
                  <Trash2 size={18} /> Excluir contato
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Long-press (2s) no balão do grupo -- pedido do Marcelo: ver
          informações / trocar foto / adicionar pessoas / excluir grupo. */}
      <Sheet
        open={!!groupSheetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setGroupSheetTarget(null);
            setGroupSheetAddOpen(false);
          }
        }}
      >
        <SheetContent side="bottom" className="mx-auto max-w-[480px] rounded-t-[26px]" data-testid="sheet-group-actions">
          {groupSheetTarget && (() => {
            // target = groupSheetTarget!: dentro desta IIFE (uma closure
            // aninhada) o guard "groupSheetTarget &&" do JSX não estreita
            // de volta -- mesmo padrão documentado em CreateGroupWizard.
            // Um "!" só aqui em cima e o resto do bloco (inclusive os
            // onClick, closures ainda mais aninhadas) usa "target", que já
            // não é mais um union com null e não precisa de mais nenhum "!".
            const target = groupSheetTarget!;
            const memberIds = new Set(target.members.map((member) => member.id));
            const availableToAdd = approvedContacts.filter((contact) => !memberIds.has(contact.id));
            return (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <Avatar name={target.name} shape="balloon" photoUrl={target.photoUrl} />
                    <div>
                      <SheetTitle>{target.name}</SheetTitle>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{target.members.length} {target.members.length === 1 ? 'pessoa' : 'pessoas'}</p>
                    </div>
                  </div>
                </SheetHeader>
                {groupSheetError && <p className="mt-2 text-sm font-semibold text-[hsl(var(--destructive))]">{groupSheetError}</p>}
                {target.members.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {target.members.map((member) => (
                      <span key={member.id} className="rounded-full bg-[hsl(var(--muted)/.6)] px-2.5 py-1 text-xs font-bold">{member.contactName}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-1">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-[hsl(var(--muted)/.5)]">
                    <Camera size={18} /> {groupSheetBusy ? 'Enviando…' : 'Trocar foto'}
                    <input type="file" accept="image/*" className="hidden" disabled={groupSheetBusy} onChange={handleGroupSheetPhotoChange} data-testid="input-group-sheet-photo" />
                  </label>
                  <button type="button" data-testid="button-group-sheet-add" onClick={() => setGroupSheetAddOpen((current) => !current)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-[hsl(var(--muted)/.5)]">
                    <UserPlus size={18} /> Adicionar pessoas
                  </button>
                  {groupSheetAddOpen && (
                    <div className="ml-9 flex flex-wrap gap-2 pb-2">
                      {availableToAdd.length === 0 ? (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">Todos os Convites já estão nesse grupo.</p>
                      ) : (
                        availableToAdd.map((contact) => (
                          <button
                            key={contact.id}
                            type="button"
                            data-testid={`button-group-sheet-add-${contact.id}`}
                            onClick={() => {
                              void handleAddGroupMember(target.id, contact.id);
                              setGroupSheetTarget((current) => (current ? { ...current, members: [...current.members, { id: contact.id, contactName: contact.contactName }] } : current));
                            }}
                            className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
                          >
                            + {contact.contactName}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    data-testid="button-group-sheet-delete"
                    onClick={() => {
                      if (!window.confirm(`Excluir o grupo "${target.name}"? Essa ação não pode ser desfeita.`)) return;
                      setGroupSheetTarget(null);
                      void handleDeleteGroup(target.id);
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]"
                  >
                    <Trash2 size={18} /> Excluir grupo
                  </button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}

// Pedido do Marcelo: "Criar grupos" vira item do hambúrguer, com um
// fluxo de passos -- 1) nome do grupo, 2) adicionar pessoas (contatos já
// aprovados/Convites), 3) colocar foto (opcional), 4) botão criar. O grupo
// criado já aparece na hora na lista de conversas (mesma tela /conversations
// que já lê `groups` do backend).
function CreateGroupWizard() {
  const { getToken } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [children, setChildren] = useState<ChildUser[] | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [approvedContacts, setApprovedContacts] = useState<ApprovedContact[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const list = await fetchChildren(token);
        if (cancelled) return;
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      } catch {
        if (!cancelled) setError('Não foi possível carregar suas crianças.');
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  useEffect(() => {
    if (!selectedChildId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        // selectedChildId! -- o guard "if (!selectedChildId) return" acima
        // nao estreita o tipo dentro desta funcao assincrona aninhada
        // (mesmo padrao documentado em ContactChat.tsx/App.tsx).
        const contacts = await fetchApprovedContacts(selectedChildId!, token);
        if (!cancelled) setApprovedContacts(contacts.filter((contact) => contact.contactUserId));
      } catch {
        if (!cancelled) setError('Não foi possível carregar os convites já aceitos.');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedChildId, getToken]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleCreate() {
    if (!selectedChildId || !groupName.trim() || selectedContactIds.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const token = await getToken();
      const group = await createGroup(selectedChildId, groupName.trim(), selectedContactIds, token);
      if (photoFile) {
        try {
          await uploadGroupPhoto(group.id, photoFile, token);
        } catch {
          // grupo já foi criado -- se a foto falhar, segue mesmo assim,
          // dá pra tentar de novo depois pelo menu do balão.
        }
      }
      setLocation('/conversations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar o grupo.');
      setCreating(false);
    }
  }

  const canGoStep2 = groupName.trim().length > 0 && !!selectedChildId;
  const canGoStep3 = selectedContactIds.length > 0;

  return (
    <>
      <PageIntro eyebrow="hambúrguer" title="Criar grupos" description="Nome, depois quem participa, depois (se quiser) uma foto — o grupo aparece na sua lista de conversas assim que for criado." />
      <section className="max-w-[560px] overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-card">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-6 py-4">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`} />
          ))}
        </div>
        <div className="p-6 sm:p-8">
          {error && <p className="mb-4 text-sm font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold">1. Nome do grupo</h2>
              {children && children.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {children.map((child) => (
                    <button key={child.id} type="button" onClick={() => setSelectedChildId(child.id)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selectedChildId === child.id ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Nome do grupo (ex: Família)"
                data-testid="input-wizard-group-name"
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
              />
              <Button className="w-fit" disabled={!canGoStep2} onClick={() => setStep(2)} testId="button-wizard-next-1">Próximo <ArrowRight size={15} /></Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold">2. Quem participa</h2>
              {approvedContacts.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum convite aceito ainda para essa criança. Aceite um convite primeiro em "Convites".</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {approvedContacts.map((contact) => {
                    const checked = selectedContactIds.includes(contact.id);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => setSelectedContactIds((current) => (checked ? current.filter((id) => id !== contact.id) : [...current, contact.id]))}
                        data-testid={`button-wizard-toggle-contact-${contact.id}`}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${checked ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}
                      >
                        {contact.contactName}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} testId="button-wizard-back-2">Voltar</Button>
                <Button disabled={!canGoStep3} onClick={() => setStep(3)} testId="button-wizard-next-2">Próximo <ArrowRight size={15} /></Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold">3. Foto do grupo (opcional)</h2>
              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <img src={photoPreview} alt="Pré-visualização" className="size-16 rounded-[50%_50%_50%_4px] object-cover" />
                ) : (
                  <Avatar name={groupName} shape="balloon" />
                )}
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-[hsl(var(--border))] px-4 text-sm font-bold hover:border-[hsl(var(--primary))]">
                  Colocar foto
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} data-testid="input-wizard-group-photo" />
                </label>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} testId="button-wizard-back-3">Voltar</Button>
                <Button disabled={creating} onClick={() => { void handleCreate(); }} testId="button-wizard-create">{creating ? 'Criando…' : 'Criar grupo'}</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// Pedido do Marcelo: chat próprio do Responsável, pra conversar com quem
// ele quiser (mesmo modelo do chat da Criança). Backend de mensagem
// direta Responsável<->Convite ainda não existe (hoje o que existe é só o
// espelho, somente-leitura, da conversa da criança) -- fica como próximo
// passo dedicado. Por enquanto a tela já existe e explica isso, em vez de
// fingir uma função que não funciona de verdade.
function MyChat() {
  return (
    <>
      <PageIntro eyebrow="seu chat" title="Chat" description="Seu próprio espaço para conversar com quem você quiser da família — separado do espelho da criança." />
      <EmptyState
        icon={MessageCircle}
        eyebrow="em construção"
        title="Ainda vem por aqui"
        text="O chat próprio do Responsável está em construção — vai funcionar igual ao chat da criança, com os mesmos Convites da família. Por enquanto, use o Espelho para acompanhar as conversas dela."
        actionLabel="Ver Convites"
        onAction={() => { window.location.href = '/conversations'; }}
        testId="button-my-chat-empty-action"
      />
    </>
  );
}

function EmptyState({ icon: Icon, eyebrow, title, text, actionLabel, onAction, testId }: { icon: LucideIcon; eyebrow: string; title: string; text: string; actionLabel?: string; onAction?: () => void; testId?: string }) {
  return <section className="flex min-h-[390px] flex-col items-center justify-center rounded-[26px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 py-14 text-center"><span className="mb-6 grid size-16 place-items-center rounded-[22px] bg-[hsl(var(--muted))] text-[hsl(var(--primary))]"><Icon size={27} strokeWidth={1.6} /></span><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{eyebrow}</p><h2 className="mt-3 font-display text-4xl tracking-[-.05em]">{title}</h2><p className="mt-3 max-w-[420px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p>{actionLabel && <Button variant="outline" className="mt-7" onClick={onAction} testId={testId}>{actionLabel} <ArrowRight size={15} /></Button>}</section>;
}

// Antes, esta tela decidia entre o Responsável (dados reais do backend)
// e uma "Criança" local (uma tela de permissão/compartilhamento falsa,
// só com localStorage, nunca ligada a nada real) com base no papel salvo
// no perfil local do navegador. Essa Criança local não existe mais (ver
// nota em Onboarding()) — a localização de verdade da Criança já é 100%
// automática pelo lado dela (PairingJoin.tsx), sem nenhuma tela própria.
function LocationPage() {
  return <ResponsibleLocationPage />;
}

// Tela real: busca as crianças vinculadas e a última localização reportada
// por elas, igual ao padrão usado em Conversations() (getToken + fetch*).
//
// Antes: sempre mostrava children[0], sem seletor nenhum. Com mais de uma
// criança vinculada (ex.: Rafaella e Mariana), a localização compartilhada
// por uma delas podia nunca aparecer — a tela ficava presa mostrando
// sempre a mesma criança, mesmo com a outra tendo compartilhado a posição
// dela com sucesso (confirmado nos logs do Railway: POST /api/location
// 201 pra uma criança enquanto a tela mostrava "ainda não compartilhou"
// pra outra). Agora tem um seletor quando há mais de uma criança.
function ResponsibleLocationPage() {
  const { t } = useLanguage();
  const { getToken } = useAuth();
  const [children, setChildren] = useState<ChildUser[] | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [location, setLocation] = useState<ChildLocation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const kids = await fetchChildren(token);
        if (cancelled) return;
        setChildren(kids);
        setSelectedChildId((current) => current ?? kids[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar localização.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    if (!selectedChildId) return;
    let cancelled = false;
    async function loadLocation() {
      try {
        const token = await getToken();
        const loc = await fetchChildLocation(selectedChildId!, token);
        if (!cancelled) setLocation(loc);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar localização.');
      }
    }
    loadLocation();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId, getToken]);

  const hasChild = (children?.length ?? 0) > 0;
  const selectedChild = children?.find((child) => child.id === selectedChildId) ?? children?.[0] ?? null;
  const recordedLabel = location ? new Date(location.recordedAt).toLocaleString('pt-BR') : null;
  // Bounding box pequeno ao redor do ponto, só pra enquadrar o mapa embutido
  // do OpenStreetMap (sem precisar adicionar leaflet como dependência).
  const bbox = location
    ? `${location.longitude - 0.01},${location.latitude - 0.01},${location.longitude + 0.01},${location.latitude + 0.01}`
    : null;

  return (
    <>
      <PageIntro eyebrow={t.location.eyebrow} title={t.location.title} description={t.location.description} />
      {children && children.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1 sm:w-fit" data-testid="selector-location-child">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => { setSelectedChildId(child.id); setLocation(null); }}
              data-testid={`button-select-child-${child.id}`}
              className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${selectedChildId === child.id ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
        <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
          <div className="flex items-start justify-between"><IconBox icon={MapPin} tone="gold" /></div>
          <h2 className="mt-8 font-display text-4xl tracking-[-.05em]">{t.location.title}</h2>
          {loadError ? (
            <p className="mt-3 text-xs font-semibold leading-5 text-[hsl(var(--destructive))]" role="alert" data-testid="status-location-error">{loadError}</p>
          ) : !hasChild ? (
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Nenhuma criança vinculada ainda. Vá em "Vincular criança" para gerar o QR code de pareamento.</p>
          ) : !location ? (
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{selectedChild?.name ?? 'A criança'} ainda não compartilhou a localização. Isso só acontece quando ela toca em "Compartilhar minha localização" no aparelho dela.</p>
          ) : (
            <div className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              <p>Última localização de {selectedChild?.name}:</p>
              <p className="mt-2 font-mono-app text-xs">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>
              <p className="mt-1 text-xs">Registrada em {recordedLabel}{location.accuracyMeters ? ` · precisão de ~${Math.round(location.accuracyMeters)}m` : ''}</p>
            </div>
          )}
        </section>
        <section className="relative min-h-[430px] overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(191_25%_25%)] text-[hsl(var(--card))]">
          {bbox ? (
            <iframe
              title="Mapa de localização"
              className="size-full min-h-[430px] border-0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${location!.latitude},${location!.longitude}`}
              data-testid="iframe-location-map"
            />
          ) : (
            <div className="relative flex h-full min-h-[430px] flex-col items-center justify-center p-6 text-center sm:p-8">
              <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(32deg, transparent 48%, hsl(38 77% 65% / .18) 49%, transparent 50%), linear-gradient(118deg, transparent 48%, hsl(42 32% 95% / .12) 49%, transparent 50%)', backgroundSize: '78px 78px' }} />
              <span className="relative mb-6 grid size-20 place-items-center rounded-full border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><MapPin size={31} strokeWidth={1.4} /></span>
              <h2 className="relative font-display text-4xl tracking-[-.05em]">{t.location.noLocation}</h2>
              <p className="relative mt-3 max-w-[330px] text-sm leading-6 text-[hsl(var(--card)/.65)]">{t.location.mapEmpty}</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// Mantida como estava: fluxo local de permissão/compartilhamento do lado da
// Criança dentro do app principal (a tela real de compartilhamento fica em
// PairingJoin.tsx, mas esta continua existindo pra quem navega direto pra
// /location no papel de Criança).
// Tempo de uso e bloqueio temporário (item 11). Mesmo padrão de seletor de
// criança das outras telas (Conversas/Localização): getToken + fetch*, com
// seletor só quando há mais de uma criança vinculada.
function ScreenTimePage() {
  const { t } = useLanguage();
  const { getToken } = useAuth();
  const [children, setChildren] = useState<ChildUser[] | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScreenTimeStatus | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const kids = await fetchChildren(token);
        if (cancelled) return;
        setChildren(kids);
        setSelectedChildId((current) => current ?? kids[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar tempo de uso.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    if (!selectedChildId) return;
    let cancelled = false;
    async function loadStatus() {
      try {
        const token = await getToken();
        const data = await fetchScreenTime(selectedChildId!, token);
        if (!cancelled) {
          setStatus(data);
          setLimitInput(data.dailyLimitMinutes !== null ? String(data.dailyLimitMinutes) : '');
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar tempo de uso.');
      }
    }
    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId, getToken]);

  async function saveLimit(event: FormEvent) {
    event.preventDefault();
    if (!selectedChildId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const token = await getToken();
      const trimmed = limitInput.trim();
      const minutes = trimmed === '' ? null : Number(trimmed);
      if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0)) {
        throw new Error('Informe um número de minutos válido.');
      }
      await setDailyLimit(selectedChildId, minutes, token);
      setStatus((current) => (current ? { ...current, dailyLimitMinutes: minutes } : current));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar o limite.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock() {
    if (!selectedChildId || !status || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const token = await getToken();
      const shouldLock = status.lockReason !== 'manual';
      await setChildLock(selectedChildId, shouldLock, token);
      setStatus((current) =>
        current
          ? {
              ...current,
              locked: shouldLock,
              lockReason: shouldLock
                ? 'manual'
                : current.dailyLimitMinutes !== null && current.minutesUsedToday >= current.dailyLimitMinutes
                  ? 'limit'
                  : null,
            }
          : current,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao bloquear/desbloquear.');
    } finally {
      setBusy(false);
    }
  }

  const hasChild = (children?.length ?? 0) > 0;
  const selectedChild = children?.find((child) => child.id === selectedChildId) ?? null;
  const manuallyLocked = status?.lockReason === 'manual';

  return (
    <>
      <PageIntro eyebrow={t.nav.screenTime} title={t.nav.screenTime} description="Defina um limite diário de uso do chat e bloqueie o acesso quando precisar." />
      {children && children.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1 sm:w-fit" data-testid="selector-screen-time-child">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => {
                setSelectedChildId(child.id);
                setStatus(null);
              }}
              data-testid={`button-select-screen-time-child-${child.id}`}
              className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${selectedChildId === child.id ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}
      {loadError ? (
        <p className="rounded-2xl bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" data-testid="status-screen-time-error">{loadError}</p>
      ) : !hasChild ? (
        <EmptyState icon={Hourglass} eyebrow={t.nav.screenTime} title="Nenhuma criança vinculada" text="Vá em 'Vincular criança' para gerar o QR code de pareamento." actionLabel="Vincular criança" onAction={() => { window.location.href = '/pair'; }} testId="button-empty-screen-time" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
            <div className="flex items-start gap-4"><IconBox icon={Hourglass} tone="gold" /><div><h2 className="text-lg font-extrabold">Uso de hoje{selectedChild ? ` — ${selectedChild.name}` : ''}</h2></div></div>
            <p className="mt-5 font-display text-4xl tracking-[-.05em]" data-testid="text-minutes-used-today">{status ? `${status.minutesUsedToday} min` : '—'}</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {status?.dailyLimitMinutes != null ? `Limite diário: ${status.dailyLimitMinutes} min` : 'Sem limite diário definido'}
            </p>
            {status?.locked && (
              <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.08)] px-3 py-2 text-xs font-bold text-[hsl(var(--destructive))]" data-testid="status-child-locked">
                {status.lockReason === 'manual' ? 'Bloqueado manualmente agora.' : 'Bloqueado — estourou o limite diário de hoje.'}
              </p>
            )}
            <button
              type="button"
              onClick={() => { void toggleLock(); }}
              disabled={busy || !status}
              data-testid="button-toggle-child-lock"
              className={`mt-5 inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-bold text-white transition-colors disabled:opacity-60 ${manuallyLocked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive))]'}`}
            >
              {manuallyLocked ? <><Unlock size={14} /> Desbloquear agora</> : <><Lock size={14} /> Bloquear agora</>}
            </button>
            {actionError && <p className="mt-3 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{actionError}</p>}
          </section>
          <form onSubmit={saveLimit} className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
            <h2 className="text-lg font-extrabold">Limite diário</h2>
            <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Em minutos por dia. Deixe em branco para não ter limite — ex: 90 para uma hora e meia.</p>
            <input
              type="number"
              min={1}
              max={1440}
              value={limitInput}
              onChange={(event) => setLimitInput(event.target.value)}
              placeholder="ex: 90"
              data-testid="input-daily-limit-minutes"
              className="mt-4 h-11 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
            />
            <div className="mt-5">
              <Button type="submit" disabled={busy} testId="button-save-daily-limit">Salvar limite</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// Item 13 do pedido (multiplos Responsaveis): gera/mostra o link de
// convite pra um 2o Responsavel entrar no mesmo espaco, e lista quem ja
// tem acesso -- mesmo espirito da secao de convite de Contato (ver
// Conversations()), so que aqui o convidado vira um Responsavel de
// verdade (conta Clerk propria), nao um Contato.
function GuardiansSection() {
  const { getToken, userId } = useAuth();
  const [guardians, setGuardians] = useState<GuardianInfo[] | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadGuardians() {
    try {
      const token = await getToken();
      const list = await fetchGuardians(token);
      setGuardians(list);
    } catch {
      setGuardians([]);
    }
  }

  useEffect(() => {
    void loadGuardians();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite() {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const invite = await createGuardianInvite(token);
      setInviteUrl(invite.joinUrl);
      setCopied(false);
    } catch {
      setError('Não foi possível gerar o convite agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard pode falhar (sem permissão, contexto não seguro) — o
      // link continua visível pra copiar manualmente.
    }
  }

  async function handleRemove(parentId: string) {
    if (!window.confirm('Remover o acesso deste Responsável ao espaço da família?')) return;
    try {
      const token = await getToken();
      await removeGuardian(parentId, token);
      await loadGuardians();
    } catch {
      setError('Não foi possível remover agora. Tente de novo.');
    }
  }

  return (
    <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7">
      <div className="flex items-start gap-4">
        <IconBox icon={Users} tone="teal" />
        <div className="flex-1">
          <h2 className="text-lg font-extrabold">Responsáveis</h2>
          <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
            Convide outro adulto responsável (o outro pai/mãe, avó, etc.) para acompanhar o mesmo espaço — as mesmas
            crianças, conversas, localização e tempo de uso.
          </p>

          {guardians && guardians.length > 0 && (
            <ul className="mt-4 space-y-2">
              {guardians.map((g) => (
                <li
                  key={g.id}
                  data-testid={`row-guardian-${g.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span>{g.name}</span>
                    {g.id === userId && <span className="text-[hsl(var(--muted-foreground))]">(você)</span>}
                    {g.role === 'owner' && (
                      <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        dono original
                      </span>
                    )}
                  </div>
                  {g.role !== 'owner' && g.id !== userId && (
                    <button
                      type="button"
                      onClick={() => { void handleRemove(g.id); }}
                      data-testid={`button-remove-guardian-${g.id}`}
                      className="text-xs font-bold text-[hsl(var(--destructive))] underline underline-offset-4"
                    >
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-3 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}

          {inviteUrl ? (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Envie este link pra pessoa — ao entrar ou criar conta, ela já ganha acesso ao espaço:
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  data-testid="input-guardian-invite-url"
                  className="min-w-0 flex-1 truncate rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={() => { void handleCopy(); }}
                  data-testid="button-copy-guardian-invite"
                  className="shrink-0 rounded-md bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))]"
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => { void handleInvite(); }}
              data-testid="button-invite-guardian"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
            >
              {busy ? 'Gerando link…' : 'Convidar novo Responsável'} <UserPlus size={14} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsPage() {
  const { t } = useLanguage();
  const { getToken } = useAuth();
  const profile = readProfile();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [family, setFamily] = useState(profile?.familyName ?? '');
  const [saved, setSaved] = useState(false);
  const [, setLocation] = useLocation();
  const [notifications, setNotifications] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<ParentRelationship | null>(null);
  const [relationshipBusy, setRelationshipBusy] = useState(false);
  const [relationshipSaved, setRelationshipSaved] = useState(false);

  // Carrega o relacionamento já salvo no servidor (pedido do Marcelo: pai,
  // mãe, avó, tio etc — ver lib/relationship.ts). Vem do backend, não do
  // localStorage, porque é isso que a Criança vê do lado dela.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      const me = await fetchMe(token).catch(() => null);
      if (!cancelled && me) setRelationship(me.relationship);
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  async function chooseRelationship(next: ParentRelationship) {
    if (relationshipBusy || next === relationship) return;
    setRelationshipBusy(true);
    try {
      const token = await getToken();
      const me = await updateMyRelationship(next, token);
      setRelationship(me.relationship);
      setRelationshipSaved(true);
      window.setTimeout(() => setRelationshipSaved(false), 2200);
    } catch {
      // Silencioso — o seletor simplesmente não muda de seleção, o
      // Responsável pode tentar de novo.
    } finally {
      setRelationshipBusy(false);
    }
  }

  // Reflete o estado real da assinatura (não um valor salvo isolado no
  // localStorage) — assim, se o usuário negou a permissão do navegador ou
  // limpou os dados, o toggle não mente dizendo que está ligado.
  // No app nativo iOS (Ampara) não existe Push API de navegador -- usa a
  // ponte nativa (nativePush.ts) em vez de push.ts. Guardamos o estado do
  // toggle nesse caso no localStorage deste aparelho só pra UI (não tem
  // como consultar de volta se um token FCM já está registrado).
  const NATIVE_IOS_FLAG_KEY = 'amparo-native-push-enabled';
  const nativeIOS = isNativeIOSBridgeAvailable();

  useEffect(() => {
    let cancelled = false;
    if (nativeIOS) {
      setNotifications(localStorage.getItem(NATIVE_IOS_FLAG_KEY) === '1');
      return;
    }
    if (!isPushSupported()) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setNotifications(Boolean(subscription));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleNotifications() {
    if (notificationsBusy) return;
    setNotificationsBusy(true);
    setNotificationsError(null);
    try {
      const token = await getToken();
      if (nativeIOS) {
        if (notifications) {
          await disableNativeIOSPush(token);
          localStorage.removeItem(NATIVE_IOS_FLAG_KEY);
          setNotifications(false);
        } else {
          await enableNativeIOSPush(token);
          localStorage.setItem(NATIVE_IOS_FLAG_KEY, '1');
          setNotifications(true);
        }
      } else if (notifications) {
        await disablePushNotifications({ kind: 'parent', authToken: token });
        setNotifications(false);
      } else {
        await enablePushNotifications({ kind: 'parent', authToken: token });
        setNotifications(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setNotificationsError(
        message === 'permission_denied'
          ? 'Você negou a permissão de notificação — libere nas configurações do aparelho pra ativar.'
          : message === 'push_not_supported' || message === 'native_bridge_not_available'
            ? 'Este app não suporta notificações push.'
            : 'Não foi possível ativar as notificações agora.',
      );
    } finally {
      setNotificationsBusy(false);
    }
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !family.trim()) return;
    // Sempre 'responsible' (nunca preserva profile?.role) — auto-corrige
    // qualquer perfil local antigo salvo como 'child' pelo bug do seletor
    // de papel que existia em Onboarding().
    saveProfile({ displayName: name.trim(), familyName: family.trim(), role: 'responsible' });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }
  function deleteProfile() {
    if (window.confirm(t.settings.removeConfirm)) {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(CONTACTS_KEY);
      localStorage.removeItem('amparo-location-sharing');
      setLocation('/');
    }
  }
  return (
    <>
      <PageIntro eyebrow={t.settings.eyebrow} title={t.settings.title} description={t.settings.description} />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <form onSubmit={saveSettings} className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-4 border-b border-[hsl(var(--border))] pb-6"><Avatar name={name} /><div><h2 className="text-lg font-extrabold">{t.settings.profile}</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{t.settings.stored}</p></div></div>
          <div className="mt-7 space-y-5"><Field label={t.onboarding.yourName} value={name} onChange={setName} placeholder={t.onboarding.yourNamePlaceholder} testId="input-settings-name" /><Field label={t.onboarding.familyName} value={family} onChange={setFamily} placeholder={t.onboarding.familyNamePlaceholder} testId="input-settings-family" /></div>
          <div className="mt-7 flex flex-wrap items-center gap-4"><Button type="submit" testId="button-save-settings">{t.settings.save} <Check size={16} /></Button>{saved && <span className="text-xs font-bold text-[hsl(var(--primary))]" role="status" data-testid="status-settings-saved">{t.settings.saved}</span>}</div>
        </form>
        <div className="space-y-5">
           <GuardiansSection />
           <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={Users} tone="gold" /><div className="flex-1"><h2 className="text-lg font-extrabold">{t.settings.relationshipTitle}</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.relationshipText}</p><div className="mt-4 flex flex-wrap gap-2">{RELATIONSHIP_OPTIONS.filter((opt) => opt.value !== 'responsavel').map((opt) => (<button key={opt.value} type="button" disabled={relationshipBusy} onClick={() => { void chooseRelationship(opt.value); }} data-testid={`button-relationship-${opt.value}`} className={`min-h-9 rounded-full border px-4 text-xs font-bold transition-colors disabled:opacity-60 ${relationship === opt.value ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--card-border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'}`}>{opt.label}</button>))}</div>{relationshipSaved && <span className="mt-3 block text-xs font-bold text-[hsl(var(--primary))]" role="status" data-testid="status-relationship-saved">{t.settings.relationshipSaved}</span>}</div></div></section>
           <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={CircleHelp} tone="teal" /><div className="flex-1"><h2 className="text-lg font-extrabold">{t.settings.tutorialTitle}</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.tutorialText}</p><button type="button" onClick={() => { window.dispatchEvent(new Event('amparo:start-tour')); }} data-testid="button-restart-tour" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))]">{t.settings.tutorialAction} <ArrowRight size={14} /></button></div></div></section>
          <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={Bell} tone="gold" /><div className="flex-1"><h2 className="text-lg font-extrabold">{t.settings.notifications}</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.notificationsText}</p>{notificationsError && <p className="mt-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{notificationsError}</p>}</div><button role="switch" aria-checked={notifications} disabled={notificationsBusy} onClick={() => { void toggleNotifications(); }} data-testid="switch-notifications" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${notifications ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${notifications ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></section>
          <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={Smartphone} tone="teal" /><div><h2 className="text-lg font-extrabold">{t.settings.device}</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.deviceText}</p></div></div><div className="mt-5 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-4 text-xs font-bold text-[hsl(var(--primary))]"><Check size={14} /> {t.settings.browserData}</div></section>
          <section className="rounded-[26px] border border-[hsl(var(--destructive)/.2)] bg-[hsl(var(--destructive)/.04)] p-6 sm:p-7"><h2 className="text-sm font-extrabold text-[hsl(var(--destructive))]">{t.settings.remove}</h2><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.removeText}</p><button type="button" onClick={deleteProfile} data-testid="button-delete-profile" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[hsl(var(--destructive)/.3)] px-4 text-xs font-bold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]">{t.settings.removeButton} <X size={14} /></button></section>
        </div>
      </div>
    </>
  );
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/favicon.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#2f6f6c',
    colorForeground: '#243245',
    colorMutedForeground: '#6d7378',
    colorDanger: '#b8423a',
    colorBackground: '#fbfaf7',
    colorInput: '#f4f0e8',
    colorInputForeground: '#243245',
    colorNeutral: '#ddd5c7',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf7] rounded-[24px] w-[440px] max-w-full overflow-hidden shadow-card',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display text-3xl text-[#243245]',
    headerSubtitle: 'text-[#6d7378]',
    socialButtonsBlockButtonText: 'text-[#243245] font-bold',
    formFieldLabel: 'text-[#243245] font-bold',
    footerActionLink: 'text-[#2f6f6c] font-bold',
    footerActionText: 'text-[#6d7378]',
    dividerText: 'text-[#6d7378]',
    identityPreviewEditButton: 'text-[#2f6f6c]',
    formFieldSuccessText: 'text-[#2f6f6c]',
    alertText: 'text-[#b8423a]',
    logoBox: 'rounded-xl',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'border-[#ddd5c7] bg-[#f4f0e8] hover:bg-[#eee8dc]',
    formButtonPrimary: 'bg-[#2f6f6c] hover:bg-[#285d5a] text-[#fbfaf7]',
    formFieldInput: 'border-[#ddd5c7] bg-[#f4f0e8] text-[#243245]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#ddd5c7]',
    alert: 'bg-[#b8423a]/10',
    otpCodeFieldInput: 'border-[#ddd5c7] bg-[#f4f0e8]',
    formFieldRow: 'gap-2',
    main: 'bg-transparent',
  },
};

function SignInPage() {
  const { t } = useLanguage();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8">
      <div>
        <p className="mb-4 text-center font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">{t.auth.title}</p>
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </main>
  );
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Onboarding} /><Route path="/dashboard" component={DashboardRoute} /><Route path="/conversations" component={ConversationsRoute} /><Route path="/groups/new" component={CreateGroupRoute} /><Route path="/meu-chat" component={MyChatRoute} /><Route path="/location" component={LocationRoute} /><Route path="/screen-time" component={ScreenTimeRoute} /><Route path="/settings" component={SettingsRoute} /><Route path="/pair" component={PairingRoute} /><Route path="/join" component={PairingJoin} /><Route path="/join-contact" component={ContactJoin} /><Route path="/aceitar-responsavel" component={GuardianJoin} /><Route path="/contact" component={ContactChat} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}
// /join não exige o Responsável logado — é a rota que o QR code abre no
// aparelho da Criança, que ainda não tem conta. /pair é o gerador do QR,
// usado pelo Responsável já autenticado.
//
// Antes desta correção, /pair não conferia login nenhum: um Responsável
// deslogado (sessão expirada, aba nova, etc.) conseguia preencher o
// formulário e só descobria o problema com um erro genérico
// "not_authenticated" vindo do servidor. Agora, se não tem sessão ativa,
// manda direto pra tela de login em vez de deixar tentar e falhar.
function RequireSignedIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/sign-in');
    }
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
}

function PairingRoute() { return <RequireSignedIn><AppShell><PairingGenerate /></AppShell></RequireSignedIn>; }
// Dashboard, Conversas, Localização e Configurações também dependem do
// Responsável autenticado (chamam a API com o token do Clerk) — sem esse
// guard, uma sessão expirada nessas telas caía no mesmo erro genérico que
// o /pair tinha antes, em vez de mandar pro login.
function DashboardRoute() { return <RequireSignedIn><AppShell><Dashboard /></AppShell></RequireSignedIn>; }
function ConversationsRoute() { return <RequireSignedIn><AppShell><Conversations /></AppShell></RequireSignedIn>; }
function CreateGroupRoute() { return <RequireSignedIn><AppShell><CreateGroupWizard /></AppShell></RequireSignedIn>; }
function MyChatRoute() { return <RequireSignedIn><AppShell><MyChat /></AppShell></RequireSignedIn>; }
function LocationRoute() { return <RequireSignedIn><AppShell><LocationPage /></AppShell></RequireSignedIn>; }
function ScreenTimeRoute() { return <RequireSignedIn><AppShell><ScreenTimePage /></AppShell></RequireSignedIn>; }
function SettingsRoute() { return <RequireSignedIn><AppShell><SettingsPage /></AppShell></RequireSignedIn>; }

function NotFound() {
  const { t } = useLanguage();
  return <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] p-6"><div className="max-w-md text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--primary))]"><RefreshCw size={26} /></span><h1 className="mt-6 font-display text-5xl tracking-[-.05em]">{t.notFound.title}</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{t.notFound.text}</p><Link href="/" data-testid="link-not-found-home" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))]">{t.notFound.back} <ArrowRight size={16} /></Link></div></main>;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{ signIn: { start: { title: 'Entre no Ampara', subtitle: 'Acesse seu espaço da família' } }, signUp: { start: { title: 'Crie sua conta', subtitle: 'Comece seu espaço de cuidado' } } }}
    >
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={SwitchRouter} />
      </Switch>
      <Toaster />
    </ClerkProvider>
  );
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=4`, { updateViaCache: 'none' }).catch(() => undefined);
    }
  }, []);
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
  return <QueryClientProvider client={queryClient}><TooltipProvider><ThemeProvider><LanguageProvider><ClerkApp /></LanguageProvider></ThemeProvider></TooltipProvider></QueryClientProvider>;
}

function SwitchRouter() {
  return <Router />;
}

export default App;
import { createContext, useContext, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Baby,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  EyeOff,
  HeartHandshake,
  House,
  Info,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  UserPlus,
  UserRound,
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
import { ThemeProvider, ThemeSwitcher } from '@/lib/theme';
import { EmojiPicker } from '@/components/emoji-picker';
import { fetchChildren, fetchApprovedContacts, fetchMirroredMessages, fetchPrivateConversation, sendPrivateMessage, addApprovedContact } from '@/lib/conversations-api';
import type { ChildUser, ApprovedContact, MirroredMessage, PrivateMessage } from '@/lib/conversations-api';
import { fetchChildLocation } from '@/lib/location-api';
import type { ChildLocation } from '@/lib/location-api';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Role = 'responsible' | 'child';
type Profile = { displayName: string; familyName: string; role: Role };
type ContactStatus = 'pending' | 'approved' | 'denied' | 'revoked';
type Contact = { id: string; displayName: string; identifier?: string; status: ContactStatus; textOnly?: boolean };

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
    description: 'O Amparo oferece à família um lugar compartilhado para combinar cuidados, conversar e compartilhar uma localização quando todos concordarem. Sem monitoramento escondido. Sem adivinhar o que é real.',
    checkOne: 'Todos podem ver o que é compartilhado', checkTwo: 'Nada começa sem consentimento',
    step: '01 / comece aqui', question: 'Qual é o seu papel nesta família?', choiceDescription: 'Sua escolha define o que você vê. É possível mudar depois.',
    adult: 'Adulto responsável', adultDescription: 'Ajudo a manter a família conectada.',
    child: 'Criança', childDescription: 'Quero participar do meu espaço de segurança.',
    yourName: 'Seu nome', yourNamePlaceholder: 'Digite seu nome', familyName: 'Nome do espaço da família', familyNamePlaceholder: 'Dê um nome ao seu espaço',
    localNote: 'Por enquanto, isso fica neste dispositivo. O Amparo nunca inventa uma pessoa, mensagem ou localização.',
    error: 'Escolha um papel e preencha os dois campos para continuar.', create: 'Criar meu espaço de família',
    footer: 'Amparo / um espaço claro para cuidar', help: 'Precisa de ajuda? Peça para sua família configurar junto.',
  },
  auth: {
    title: 'Conta do Responsável', description: 'Entre para manter seu espaço seguro entre dispositivos. Crianças entram apenas pelo pareamento da família.',
    signIn: 'Entrar', signUp: 'Criar conta', signedIn: 'Conta conectada', signedOut: 'Ainda sem uma conta?', signOut: 'Sair',
  },
  nav: { overview: 'Visão geral', pair: 'Vincular criança', conversations: 'Conversas', location: 'Localização', settings: 'Configurações' },
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
    onlyShows: 'O Amparo mostra apenas informações que alguém escolheu ativamente compartilhar com este espaço da família.',
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
    approvedTitle: 'Contatos aprovados', approvedEmpty: 'Nenhum contato aprovado ainda.',
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
    parent: [
      { title: 'Bem-vindo ao Amparo', text: 'Este é um espaço claro para cuidar, conversar e compartilhar somente o que sua família escolher.', target: 'dashboard' },
      { title: 'Perfil da criança', text: 'Confira o perfil da criança e mantenha os dados reais da família neste espaço.', target: 'child-profile' },
      { title: 'Atividade compartilhada', text: 'Conversas aprovadas e localização aparecem no painel quando forem compartilhadas de verdade.', target: 'activity' },
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
    emptyText: 'Quando uma pessoa da família for aprovada e iniciar uma conversa, ela aparecerá aqui. O Amparo não cria mensagens de exemplo.',
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
    permissionText: 'Permissão e compartilhamento com a família são escolhas separadas. O Amparo só pergunta ao dispositivo quando você pede.',
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
    description: 'Veja e altere o perfil e as permissões do dispositivo que dão forma a este espaço do Amparo.',
    profile: 'Perfil da família', stored: 'Armazenado somente neste dispositivo', save: 'Salvar alterações', saved: 'Salvo neste dispositivo.',
    notifications: 'Notificações', notificationsText: 'Uma preferência local para futuras atualizações aprovadas.',
    device: 'Este dispositivo', deviceText: 'O Amparo está rodando em modo local. Não há sincronização de conta nem coleta em segundo plano.',
    browserData: 'Os dados ficam no seu navegador', remove: 'Remover perfil local', removeText: 'Isso limpa seu perfil e as escolhas locais de compartilhamento deste dispositivo.',
    removeButton: 'Remover perfil', removeConfirm: 'Remover este perfil local de família deste dispositivo?', tutorialTitle: 'Tutorial guiado', tutorialText: 'Revise os passos principais do Amparo sempre que quiser.', tutorialAction: 'Ver tutorial novamente',
  },
  notFound: { title: 'Esta página não está aqui.', text: 'O espaço do Amparo que você pediu não existe.', back: 'Voltar ao Amparo' },
  metadata: { title: 'Amparo — um espaço claro para cuidar', description: 'Um espaço transparente de segurança familiar para adultos responsáveis e crianças.' },
} as const;

const en = {
  language: { brazil: 'Brazilian Portuguese', english: 'English', switcher: 'Language' },
  onboarding: {
    aside: 'a family space, not a control room', overline: 'private by default',
    heroOne: 'Safety works', heroTwo: 'better', heroThree: 'in the open.',
    description: 'Amparo gives families a shared place to check in, talk, and share a location when everyone agrees. No hidden monitoring. No guessing what is real.',
    checkOne: 'Everyone can see what is shared', checkTwo: 'Nothing starts without consent',
    step: '01 / start here', question: 'Who are you in this family?', choiceDescription: 'Your choice shapes what you see. You can change it later.',
    adult: 'Responsible adult', adultDescription: 'I help keep the family connected.',
    child: 'Child', childDescription: 'I want a say in my safety space.',
    yourName: 'Your name', yourNamePlaceholder: 'Type your name', familyName: 'Family space name', familyNamePlaceholder: 'Give your space a name',
    localNote: 'This stays on this device for now. Amparo will never make up a person, message, or location.',
    error: 'Choose a role and complete both fields to continue.', create: 'Create my family space',
    footer: 'Amparo / a clear space for care', help: 'Need help? Ask your family to set this up together.',
  },
  auth: {
    title: 'Responsible adult account', description: 'Sign in to keep your family space safe across devices. Children join only through family pairing.',
    signIn: 'Sign in', signUp: 'Create account', signedIn: 'Account connected', signedOut: 'No account yet?', signOut: 'Sign out',
  },
  nav: { overview: 'Overview', pair: 'Pair device', conversations: 'Conversations', location: 'Location', settings: 'Settings' },
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
    onlyShows: 'Amparo only shows information someone has actively chosen to share with this family space.',
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
      { title: 'Welcome to Amparo', text: 'This is a clear place to care, talk, and share only what your family chooses.', target: 'dashboard' },
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
    emptyText: 'When a family member is approved and starts a conversation, it will appear here. Amparo does not create placeholder messages.',
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
    permissionText: 'Permission and family sharing are separate choices. Amparo asks the device only when you ask Amparo.',
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
    description: 'See and change the profile and device permissions that shape this Amparo space.',
    profile: 'Family profile', stored: 'Stored on this device only', save: 'Save changes', saved: 'Saved on this device.',
    notifications: 'Notifications', notificationsText: 'A local preference for future approved updates.',
    device: 'This device', deviceText: 'Amparo is running in local mode. There is no account sync or background collection.',
    browserData: 'Data stays in your browser', remove: 'Remove local profile', removeText: 'This clears your profile and local sharing choices from this device.',
    removeButton: 'Remove profile', removeConfirm: 'Remove this local family profile from this device?', tutorialTitle: 'Guided tutorial', tutorialText: 'Review the main Amparo steps whenever you want.', tutorialAction: 'View tutorial again',
  },
  notFound: { title: 'This page is not here.', text: 'The Amparo space you asked for does not exist.', back: 'Back to Amparo' },
  metadata: { title: 'Amparo — a clear space for care', description: 'A transparent family safety space for responsible adults and children.' },
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

function readContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 group" data-testid="link-brand-home">
      <span className="grid size-10 place-items-center rounded-[13px] bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] shadow-[0_8px_20px_rgba(231,184,103,.25)] transition-transform duration-300 group-hover:rotate-[-5deg]">
        <ShieldCheck size={22} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="font-display text-[27px] leading-none tracking-[-.04em] text-[hsl(var(--foreground))]">
          amparo
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
  const [role, setRole] = useState<Role | null>(existing?.role ?? null);
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

  function finish(event: FormEvent) {
    event.preventDefault();
    if (!role || !displayName.trim() || !familyName.trim()) {
      setError(t.onboarding.error);
      return;
    }
    saveProfile({ role, displayName: displayName.trim(), familyName: familyName.trim() });
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
            <div className="grid gap-3 sm:grid-cols-2">
              <RoleChoice selected={role === 'responsible'} onClick={() => { setRole('responsible'); setError(''); }} icon={HeartHandshake} title={t.onboarding.adult} text={t.onboarding.adultDescription} testId="button-role-responsible" />
              <RoleChoice selected={role === 'child'} onClick={() => { setRole('child'); setError(''); }} icon={Baby} title={t.onboarding.child} text={t.onboarding.childDescription} testId="button-role-child" />
            </div>
            {role === 'responsible' && <AuthPrompt />}
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

function RoleChoice({ selected, onClick, icon: Icon, title, text, testId }: { selected: boolean; onClick: () => void; icon: LucideIcon; title: string; text: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={selected}
      className={`group min-h-[116px] rounded-2xl border p-4 text-left transition-all duration-200 ${selected ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/.25)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.55)] hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.4)]'}`}
    >
      <span className={`mb-3 grid size-9 place-items-center rounded-xl ${selected ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]'}`}>
        <Icon size={18} />
      </span>
      <span className="block text-sm font-extrabold">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-[hsl(var(--muted-foreground))]">{text}</span>
    </button>
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
  { href: '/location', label: 'Location', icon: MapPin },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const profile = readProfile();
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
          <p className="mt-4 font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.35)]">Amparo v0.1 / {t.shell.localMode}</p>
        </div>
      </aside>

      {menuOpen && <button aria-label={t.shell.closeNavigation} data-testid="button-close-mobile-nav" className="fixed inset-0 z-40 bg-[hsl(var(--foreground)/.28)] lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[hsl(var(--sidebar))] px-5 py-7 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between"><BrandMark compact /><button className="grid size-11 place-items-center rounded-full hover:bg-[hsl(var(--sidebar-accent))]" onClick={() => setMenuOpen(false)} aria-label={t.shell.closeMenu} data-testid="button-close-menu"><X size={20} /></button></div>
        <nav className="mt-10 space-y-1" aria-label={t.shell.mobileNav}>
          {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} onClick={() => setMenuOpen(false)} />)}
        </nav>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.86)] px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <button className="grid size-11 place-items-center rounded-full hover:bg-[hsl(var(--muted))] lg:hidden" onClick={() => setMenuOpen(true)} aria-label={t.shell.openMenu} data-testid="button-open-menu"><Menu size={21} /></button>
          <div className="lg:hidden"><BrandMark /></div>
          <div className="hidden lg:block"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{t.shell.familySpace} / {profile?.familyName || t.shell.familyNotSet}</p></div>
          <div className="flex items-center gap-3"><LanguageSwitcher /><ThemeSwitcher /><span className="hidden items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))] sm:flex"><span className="size-2 rounded-full bg-[hsl(var(--primary))]" /> {t.shell.localPrivate}</span></div>
        </header>
        <main className="mx-auto max-w-[1280px] px-5 pb-28 pt-9 sm:px-8 lg:px-12 lg:pb-12 lg:pt-12">{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-20 flex h-[70px] items-center justify-around rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.94)] px-1 shadow-[0_12px_40px_rgba(24,48,48,.12)] backdrop-blur lg:hidden" aria-label={t.shell.bottomNav}>
        {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} mobile />)}
      </nav>
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
  const steps: readonly TourStep[] = profile?.role === 'child' ? t.tutorial.child : t.tutorial.parent;
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
  const labels = [t.nav.overview, t.nav.pair, t.nav.conversations, t.nav.location, t.nav.settings];
  const label = labels[navItems.findIndex((nav) => nav.href === item.href)];
  return (
    <Link href={item.href} onClick={onClick} data-testid={`link-nav-${item.href.slice(1)}`} className={`${mobile ? 'flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px]' : 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm'} font-bold transition-colors ${active ? (mobile ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]') : (mobile ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.65)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]')}`}>
      <Icon size={mobile ? 19 : 18} strokeWidth={active ? 2.3 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}

function Avatar({ name, dark = false }: { name?: string; dark?: boolean }) {
  const initials = name?.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '?';
  return <span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold ${dark ? 'bg-[hsl(var(--sidebar-primary)/.22)] text-[hsl(var(--sidebar-primary))]' : 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'}`} data-testid="avatar-profile">{initials}</span>;
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

function Dashboard() {
  const { t } = useLanguage();
  const profile = readProfile();
  const approvedCount = readContacts().filter((contact) => contact.status === 'approved').length;
  return (
    <>
      <PageIntro eyebrow={t.dashboard.eyebrow} title={profile ? t.dashboard.greeting.replace('{name}', profile.displayName) : t.dashboard.title} description={profile ? t.dashboard.description : t.dashboard.noProfileDescription} />
      <SetupNotice />
      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]" data-tour="activity">
        <div className="relative min-h-[330px] overflow-hidden rounded-[26px] bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))]" data-tour="child-profile">
          <div className="absolute -right-16 -top-16 size-64 rounded-full border border-[hsl(var(--accent)/.25)]" /><div className="absolute -right-5 top-[-5px] size-44 rounded-full border border-[hsl(var(--accent)/.2)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--primary-foreground)/.65)]"><span className="size-2 rounded-full bg-[hsl(var(--accent))]" /> {t.dashboard.sharedTruth}</span><ShieldCheck size={24} className="text-[hsl(var(--accent))]" /></div>
            <div className="mt-20 max-w-[480px]"><p className="font-display text-[clamp(2.5rem,5vw,4.2rem)] leading-[.92] tracking-[-.06em]">{t.dashboard.noReport}<br /><em className="text-[hsl(var(--accent))]">{t.dashboard.goodNews}</em></p><p className="mt-5 max-w-[370px] text-sm leading-6 text-[hsl(var(--primary-foreground)/.7)]">{t.dashboard.emptyExplanation}</p></div>
          </div>
        </div>
        <div className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7">
          <div className="flex items-center justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">{t.dashboard.status}</p><h2 className="mt-2 text-xl font-extrabold">{t.dashboard.quietReady}</h2></div><IconBox icon={WifiOff} tone="slate" /></div>
          <div className="mt-7 space-y-0">
            <StatusRow icon={UserRound} label={t.dashboard.profile} value={profile ? t.dashboard.profileDone : t.dashboard.profileNeeds} done={!!profile} />
            <StatusRow icon={MessageCircle} label={t.nav.conversations} value={approvedCount > 0 ? t.dashboard.approvedCount.replace('{count}', String(approvedCount)) : t.dashboard.approved} />
            <StatusRow icon={MapPin} label={t.nav.location} value={t.dashboard.noChildLocation} />
          </div>
          <p className="mt-7 border-t border-[hsl(var(--border))] pt-5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.dashboard.onlyShows}</p>
        </div>
      </section>
      <section className="mt-5 grid gap-5 md:grid-cols-2" data-tour="dashboard">
        <ActionCard icon={MessageCircle} tone="gold" eyebrow={t.dashboard.connectEyebrow} title={t.dashboard.connectTitle} text={t.dashboard.connectText} href="/conversations" action={t.dashboard.connectAction} />
        <ActionCard icon={Navigation} tone="teal" eyebrow={t.dashboard.locationEyebrow} title={t.dashboard.locationTitle} text={t.dashboard.locationText} href="/location" action={t.dashboard.locationAction} />
      </section>
    </>
  );
}

function StatusRow({ icon: Icon, label, value, done = false }: { icon: LucideIcon; label: string; value: string; done?: boolean }) {
  return <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] py-4 last:border-0"><span className="grid size-8 place-items-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Icon size={15} /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{label}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{value}</p></div>{done ? <span className="grid size-6 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Check size={13} /></span> : <span className="size-2 rounded-full bg-[hsl(var(--border))]" />}</div>;
}

function ActionCard({ icon, tone, eyebrow, title, text, href, action }: { icon: LucideIcon; tone: 'teal' | 'gold'; eyebrow: string; title: string; text: string; href: string; action: string }) {
  return <Link href={href} data-testid={`link-card-${href.slice(1)}`} className="group rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(24,48,48,.11)] sm:p-7"><div className="flex items-start justify-between"><IconBox icon={icon} tone={tone} /><ArrowRight size={19} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" /></div><p className="mt-8 font-mono-app text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">{eyebrow}</p><h2 className="mt-2 font-display text-3xl tracking-[-.04em]">{title}</h2><p className="mt-3 max-w-[390px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-extrabold text-[hsl(var(--primary))]">{action} <ChevronRight size={14} /></span></Link>;
}

function Conversations() {
  const [privateOpen, setPrivateOpen] = useState(false);
  const { t } = useLanguage();
  const { getToken } = useAuth();
  const profile = readProfile();
  const [children, setChildren] = useState<ChildUser[] | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [approvedContacts, setApprovedContacts] = useState<ApprovedContact[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [mirroredMessages, setMirroredMessages] = useState<MirroredMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [privateMessages, setPrivateMessages] = useState<PrivateMessage[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [privateDraft, setPrivateDraft] = useState('');
  const [privateSending, setPrivateSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const kids = await fetchChildren(token);
        if (cancelled) return;
        setChildren(kids);
        setSelectedChildId((current) => current ?? kids[0]?.id ?? null);
        const mirrored = await fetchMirroredMessages(token);
        if (!cancelled) setMirroredMessages(mirrored);
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

  // Canal privado: antes essa aba era só um cartão estático ("Pronto pra
  // começar") sem nenhuma mensagem de verdade — não existia jeito de
  // escrever pra criança. Agora busca e mostra o histórico real assim que
  // a aba é aberta (ou a criança selecionada muda).
  useEffect(() => {
    if (!privateOpen || !selectedChildId) return;
    let cancelled = false;
    async function loadPrivate() {
      setPrivateLoading(true);
      setPrivateError(null);
      try {
        const token = await getToken();
        const data = await fetchPrivateConversation(selectedChildId!, token);
        if (!cancelled) setPrivateMessages(data.messages);
      } catch (err) {
        if (!cancelled) setPrivateError(err instanceof Error ? err.message : 'Erro ao carregar o canal privado.');
      } finally {
        if (!cancelled) setPrivateLoading(false);
      }
    }
    loadPrivate();
    return () => {
      cancelled = true;
    };
  }, [privateOpen, selectedChildId, getToken]);

  async function sendPrivate(event: FormEvent) {
    event.preventDefault();
    const text = privateDraft.trim();
    if (!text || !selectedChildId || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const token = await getToken();
      const message = await sendPrivateMessage(selectedChildId, text, token);
      setPrivateMessages((current) => [...current, message]);
      setPrivateDraft('');
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
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

  const hasChild = (children?.length ?? 0) > 0;
  const selectedChildName = children?.find((child) => child.id === selectedChildId)?.name ?? null;

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
              <h2 className="text-xl font-extrabold">Contatos aprovados ({approvedContacts.length})</h2>
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
              {approvedContacts.length === 0 ? (
                <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">{t.contacts.approvedEmpty}</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {approvedContacts.map((contact) => (
                    <li key={contact.id} className="rounded-xl bg-[hsl(var(--muted)/.5)] px-4 py-3 text-sm font-bold" data-testid={`row-approved-contact-${contact.id}`}>{contact.contactName}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-6 sm:p-8">
              <h2 className="text-xl font-extrabold">Mensagens espelhadas ({mirroredMessages.length})</h2>
              {mirroredMessages.length === 0 ? (
                <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem espelhada ainda.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {mirroredMessages.map((entry) => (
                    <li key={entry.message.id} className="rounded-xl bg-[hsl(var(--muted)/.5)] px-4 py-3 text-sm" data-testid={`row-mirrored-message-${entry.message.id}`}>{entry.message.textContent ?? `[${entry.message.type}]`}</li>
                  ))}
                </ul>
              )}
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
              <div className="flex min-h-[220px] flex-col gap-3 overflow-y-auto rounded-2xl bg-[hsl(var(--muted)/.4)] p-4" data-testid="list-private-messages">
                {privateLoading && privateMessages.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
                ) : privateMessages.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Nenhuma mensagem ainda com {selectedChildName ?? 'a criança'}. Escreva a primeira aqui embaixo.
                  </p>
                ) : (
                  privateMessages.map((message) => {
                    const fromMe = message.senderId !== selectedChildId;
                    return (
                      <div
                        key={message.id}
                        data-testid={`row-private-message-${message.id}`}
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))] shadow-sm'}`}
                      >
                        {message.textContent}
                        <p className={`mt-1 text-[10px] font-mono-app uppercase tracking-[.08em] ${fromMe ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          {new Date(message.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
              {privateError && <p className="text-xs font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-private-error">{privateError}</p>}
              <form onSubmit={sendPrivate} className="flex items-center gap-3">
                <EmojiPicker onSelect={(emoji) => setPrivateDraft((current) => current + emoji)} />
                <input
                  value={privateDraft}
                  onChange={(event) => setPrivateDraft(event.target.value)}
                  placeholder={`Escreva pra ${selectedChildName ?? 'a criança'}…`}
                  className="h-12 flex-1 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 text-sm outline-none focus:border-[hsl(var(--primary))]"
                  data-testid="input-private-message"
                />
                <Button type="submit" disabled={!privateDraft.trim() || privateSending} testId="button-send-private-message">
                  {privateSending ? 'Enviando…' : 'Enviar'}
                </Button>
              </form>
            </div>
          )}
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-6 py-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" /> {t.conversations.privateFooter}</div>
        </section>
      )}
      <ContactManagement />
    </>
  );
}

function ContactManagement() {
  const { t } = useLanguage();
  const profile = readProfile();
  const [contacts, setContacts] = useState<Contact[]>(() => readContacts());
  const [contactId, setContactId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isChild = profile?.role === 'child';
  const pending = contacts.filter((contact) => contact.status === 'pending');
  const approved = contacts.filter((contact) => contact.status === 'approved');
  const history = contacts.filter((contact) => contact.status === 'denied' || contact.status === 'revoked');

  function persist(next: Contact[]) {
    setContacts(next);
    saveContacts(next);
  }

  function requestContact(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    const cleanId = contactId.trim();
    const cleanName = displayName.trim();
    if (!cleanId || !cleanName) {
      setError(t.contacts.missing);
      return;
    }
    if (contacts.some((contact) => contact.id.toLowerCase() === cleanId.toLowerCase())) {
      setError(t.contacts.duplicate);
      return;
    }
    persist([...contacts, { id: cleanId, displayName: cleanName, identifier: identifier.trim() || undefined, status: 'pending' }]);
    setContactId('');
    setDisplayName('');
    setIdentifier('');
    setNotice(t.contacts.submitted);
  }

  function changeStatus(id: string, status: ContactStatus, textOnly = false) {
    const next = contacts.map((contact) => contact.id === id ? { ...contact, status, textOnly: status === 'approved' ? textOnly : undefined } : contact);
    persist(next);
    setNotice(status === 'approved' ? (textOnly ? t.contacts.approveTextOnly : t.contacts.approveAlert) : status === 'denied' ? t.contacts.denyAlert : t.contacts.revokeAlert);
  }

  return (
    <section className="mt-6 rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8" data-tour="approved-contacts">
      <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4"><IconBox icon={UserPlus} tone="gold" /><div><p className="font-mono-app text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">{t.contacts.eyebrow}</p><h2 className="mt-2 font-display text-3xl tracking-[-.045em]">{isChild ? t.contacts.childTitle : t.contacts.adultTitle}</h2><p className="mt-2 max-w-[650px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{isChild ? t.contacts.childText : t.contacts.adultText}</p></div></div>
        <span className="flex shrink-0 items-center gap-2 rounded-full bg-[hsl(var(--muted))] px-3 py-2 font-mono-app text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]"><LockKeyhole size={12} /> {t.shell.localMode}</span>
      </div>

      {isChild ? (
        <>
          <form onSubmit={requestContact} className="grid gap-4 border-b border-[hsl(var(--border))] py-7 md:grid-cols-2">
            <Field label={t.contacts.idLabel} value={contactId} onChange={setContactId} placeholder={t.contacts.idPlaceholder} testId="input-contact-id" />
            <Field label={t.contacts.nameLabel} value={displayName} onChange={setDisplayName} placeholder={t.contacts.namePlaceholder} testId="input-contact-name" />
            <Field label={t.contacts.identifierLabel} value={identifier} onChange={setIdentifier} placeholder={t.contacts.identifierPlaceholder} testId="input-contact-identifier" />
            <div className="flex items-end"><Button type="submit" className="w-full md:w-auto" testId="button-request-contact"><Plus size={16} /> {t.contacts.request}</Button></div>
          </form>
          {error && <p className="border-b border-[hsl(var(--border))] py-4 text-xs font-bold text-[hsl(var(--destructive))]" role="alert" data-testid="status-contact-error">{error}</p>}
          {notice && <p className="border-b border-[hsl(var(--border))] py-4 text-xs font-bold text-[hsl(var(--primary))]" role="status" data-testid="status-contact-notice"><Check size={14} className="mr-1 inline-block align-[-2px]" /> {notice}</p>}
          <div className="pt-7"><ContactSectionTitle title={t.contacts.channelsTitle} count={approved.length} /><div className="mt-4">{approved.length === 0 ? <p className="rounded-2xl bg-[hsl(var(--muted)/.55)] p-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]" data-testid="empty-contact-channels">{t.contacts.channelsEmpty}</p> : approved.map((contact) => <ContactRow key={contact.id} contact={contact} t={t} />)}</div></div>
          <div className="mt-7 border-t border-[hsl(var(--border))] pt-6"><ContactSectionTitle title={t.contacts.pendingTitle} count={pending.length} /><div className="mt-4">{pending.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="empty-contact-pending">{t.contacts.pendingEmpty}</p> : pending.map((contact) => <ContactRow key={contact.id} contact={contact} t={t} />)}</div><p className="mt-5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Info size={14} /> {t.contacts.noControls}</p></div>
        </>
      ) : (
        <>
          {notice && <p className="border-b border-[hsl(var(--border))] py-4 text-xs font-bold text-[hsl(var(--primary))]" role="status" data-testid="status-contact-notice"><Check size={14} className="mr-1 inline-block align-[-2px]" /> {notice}</p>}
          <div className="pt-7"><ContactSectionTitle title={t.contacts.pendingTitle} count={pending.length} /><div className="mt-4">{pending.length === 0 ? <p className="rounded-2xl bg-[hsl(var(--muted)/.55)] p-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]" data-testid="empty-contact-pending">{t.contacts.pendingEmpty}</p> : pending.map((contact) => <ContactRow key={contact.id} contact={contact} t={t} actions={<div className="flex flex-wrap gap-2"><Button variant="soft" className="min-h-9 px-3 text-xs" onClick={() => changeStatus(contact.id, 'approved')} testId={`button-approve-contact-${contact.id}`}>{t.contacts.approve}</Button><Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => changeStatus(contact.id, 'denied')} testId={`button-deny-contact-${contact.id}`}>{t.contacts.deny}</Button><Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => changeStatus(contact.id, 'approved', true)} testId={`button-approve-text-contact-${contact.id}`}>{t.contacts.approveTextOnly}</Button></div>} />)}</div></div>
          <div className="mt-8 border-t border-[hsl(var(--border))] pt-7"><ContactSectionTitle title={t.contacts.approvedTitle} count={approved.length} /><div className="mt-4">{approved.length === 0 ? <p className="rounded-2xl bg-[hsl(var(--muted)/.55)] p-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]" data-testid="empty-contact-approved">{t.contacts.approvedEmpty}</p> : approved.map((contact) => <ContactRow key={contact.id} contact={contact} t={t} actions={<Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => changeStatus(contact.id, 'revoked')} testId={`button-revoke-contact-${contact.id}`}>{t.contacts.revoke}</Button>} />)}</div></div>
          <div className="mt-8 border-t border-[hsl(var(--border))] pt-7"><ContactSectionTitle title={t.contacts.historyTitle} count={history.length} /><div className="mt-4">{history.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="empty-contact-history">{t.contacts.historyEmpty}</p> : history.map((contact) => <ContactRow key={contact.id} contact={contact} t={t} />)}</div></div>
        </>
      )}
    </section>
  );
}

function ContactSectionTitle({ title, count }: { title: string; count: number }) {
  return <div className="flex items-center gap-3"><h3 className="text-sm font-extrabold">{title}</h3><span className="grid min-w-7 place-items-center rounded-full bg-[hsl(var(--muted))] px-2 py-1 font-mono-app text-[10px] text-[hsl(var(--muted-foreground))]" data-testid={`text-contact-count-${title}`}>{count}</span></div>;
}

function ContactRow({ contact, t, actions }: { contact: Contact; t: Copy; actions?: ReactNode }) {
  const statusLabel = contact.status === 'pending' ? t.contacts.pending : contact.status === 'approved' ? t.contacts.approved : contact.status === 'denied' ? t.contacts.denied : t.contacts.revoked;
  return <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-contact-${contact.id}`}><div className="flex min-w-0 items-center gap-3"><Avatar name={contact.displayName} /><div className="min-w-0"><p className="truncate text-sm font-extrabold">{contact.displayName}</p><p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{t.contacts.localId}: {contact.id} · {contact.identifier || t.contacts.identifierMissing}</p>{contact.status === 'approved' && <p className="mt-1 text-xs text-[hsl(var(--primary))]">{t.contacts.channelNote}{contact.textOnly ? ` · ${t.contacts.textOnly}` : ''}</p>}</div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-full px-2.5 py-1 font-mono-app text-[10px] uppercase tracking-[.08em] ${contact.status === 'approved' ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : contact.status === 'pending' ? 'bg-[hsl(var(--accent)/.25)] text-[hsl(31_55%_32%)]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{t.contacts.statusLabel}: {statusLabel}{contact.textOnly ? ` / ${t.contacts.textOnly}` : ''}</span>{actions}</div></div>;
}

function EmptyState({ icon: Icon, eyebrow, title, text, actionLabel, onAction, testId }: { icon: LucideIcon; eyebrow: string; title: string; text: string; actionLabel?: string; onAction?: () => void; testId?: string }) {
  return <section className="flex min-h-[390px] flex-col items-center justify-center rounded-[26px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 py-14 text-center"><span className="mb-6 grid size-16 place-items-center rounded-[22px] bg-[hsl(var(--muted))] text-[hsl(var(--primary))]"><Icon size={27} strokeWidth={1.6} /></span><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{eyebrow}</p><h2 className="mt-3 font-display text-4xl tracking-[-.05em]">{title}</h2><p className="mt-3 max-w-[420px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p>{actionLabel && <Button variant="outline" className="mt-7" onClick={onAction} testId={testId}>{actionLabel} <ArrowRight size={15} /></Button>}</section>;
}

function LocationPage() {
  const profile = readProfile();
  // O Responsável vê localização real (backend); a Criança continua com a
  // tela local de permissão/compartilhamento que já existia.
  if (profile?.role !== 'child') {
    return <ResponsibleLocationPage />;
  }
  return <ChildLocationPage />;
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
function ChildLocationPage() {
  const { t } = useLanguage();
  const [permission, setPermission] = useState<'unknown' | 'asking' | 'granted' | 'denied'>('unknown');
  const [sharing, setSharing] = useState(() => localStorage.getItem('amparo-location-sharing') === 'true');
  const [error, setError] = useState('');

  function requestPermission() {
    setError('');
    if (!navigator.geolocation) { setPermission('denied'); setError(t.location.locationUnavailable); return; }
    setPermission('asking');
    navigator.geolocation.getCurrentPosition(() => setPermission('granted'), () => { setPermission('denied'); setError(t.location.notGranted); }, { enableHighAccuracy: false, timeout: 8000 });
  }
  function toggleSharing() {
    const next = !sharing;
    setSharing(next);
    localStorage.setItem('amparo-location-sharing', String(next));
  }
  return (
    <>
      <PageIntro eyebrow={t.location.eyebrow} title={t.location.title} description={t.location.description} />
      <div className="grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
        <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
          <div className="flex items-start justify-between"><IconBox icon={MapPin} tone="gold" /><span className={`rounded-full px-3 py-1 font-mono-app text-[10px] uppercase tracking-[.08em] ${permission === 'granted' ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : permission === 'denied' ? 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{permission === 'granted' ? t.location.allowed : permission === 'denied' ? t.location.denied : t.location.notRequested}</span></div>
          <h2 className="mt-8 font-display text-4xl tracking-[-.05em]">{t.location.permission}</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.location.permissionText}</p>
          <Button className="mt-7 w-full" onClick={requestPermission} disabled={permission === 'asking'} testId="button-request-location">{permission === 'asking' ? t.location.waiting : permission === 'granted' ? t.location.granted : t.location.ask} <Navigation size={16} /></Button>
          {error && <p className="mt-3 text-xs font-semibold leading-5 text-[hsl(var(--destructive))]" role="alert" data-testid="status-location-error">{error}</p>}
          <div className="mt-8 border-t border-[hsl(var(--border))] pt-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-extrabold">{t.location.share}</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{sharing ? t.location.sharedChoice : t.location.privateChoice}</p></div><button role="switch" aria-checked={sharing} onClick={toggleSharing} data-testid="switch-location-sharing" className={`relative h-7 w-12 rounded-full transition-colors ${sharing ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${sharing ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></div>
        </section>
        <section className="relative min-h-[430px] overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(191_25%_25%)] p-6 text-[hsl(var(--card))] sm:p-8">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(32deg, transparent 48%, hsl(38 77% 65% / .18) 49%, transparent 50%), linear-gradient(118deg, transparent 48%, hsl(42 32% 95% / .12) 49%, transparent 50%)', backgroundSize: '78px 78px' }} />
          <div className="relative flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--accent))]">{t.location.map}</span><span className="flex items-center gap-2 rounded-full border border-[hsl(var(--card)/.2)] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--card)/.65)]"><LockKeyhole size={12} /> {t.location.consent}</span></div><div className="flex flex-1 flex-col items-center justify-center text-center"><span className="mb-6 grid size-20 place-items-center rounded-full border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><MapPin size={31} strokeWidth={1.4} /></span><h2 className="font-display text-4xl tracking-[-.05em]">{t.location.noLocation}</h2><p className="mt-3 max-w-[330px] text-sm leading-6 text-[hsl(var(--card)/.65)]">{sharing ? t.location.sharingOnEmpty : t.location.mapEmpty}</p></div><div className="flex items-center gap-2 border-t border-[hsl(var(--card)/.15)] pt-5 text-xs text-[hsl(var(--card)/.6)]"><EyeOff size={15} /> {t.location.noTracking}</div></div>
        </section>
      </div>
    </>
  );
}

function SettingsPage() {
  const { t } = useLanguage();
  const profile = readProfile();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [family, setFamily] = useState(profile?.familyName ?? '');
  const [saved, setSaved] = useState(false);
  const [, setLocation] = useLocation();
  const [notifications, setNotifications] = useState(() => localStorage.getItem('amparo-notifications') === 'true');

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !family.trim()) return;
    saveProfile({ displayName: name.trim(), familyName: family.trim(), role: profile?.role ?? 'responsible' });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }
  function deleteProfile() {
    if (window.confirm(t.settings.removeConfirm)) {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(CONTACTS_KEY);
      localStorage.removeItem('amparo-location-sharing');
      localStorage.removeItem('amparo-notifications');
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
           <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={CircleHelp} tone="teal" /><div className="flex-1"><h2 className="text-lg font-extrabold">{t.settings.tutorialTitle}</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.tutorialText}</p><button type="button" onClick={() => { window.dispatchEvent(new Event('amparo:start-tour')); }} data-testid="button-restart-tour" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))]">{t.settings.tutorialAction} <ArrowRight size={14} /></button></div></div></section>
          <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={Bell} tone="gold" /><div className="flex-1"><h2 className="text-lg font-extrabold">{t.settings.notifications}</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.settings.notificationsText}</p></div><button role="switch" aria-checked={notifications} onClick={() => { const next = !notifications; setNotifications(next); localStorage.setItem('amparo-notifications', String(next)); }} data-testid="switch-notifications" className={`relative h-7 w-12 rounded-full transition-colors ${notifications ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${notifications ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></section>
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
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Onboarding} /><Route path="/dashboard" component={DashboardRoute} /><Route path="/conversations" component={ConversationsRoute} /><Route path="/location" component={LocationRoute} /><Route path="/settings" component={SettingsRoute} /><Route path="/pair" component={PairingRoute} /><Route path="/join" component={PairingJoin} /><Route component={NotFound} /></Switch></ErrorBoundary>;
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
function LocationRoute() { return <RequireSignedIn><AppShell><LocationPage /></AppShell></RequireSignedIn>; }
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
      localization={{ signIn: { start: { title: 'Entre no Amparo', subtitle: 'Acesse seu espaço da família' } }, signUp: { start: { title: 'Crie sua conta', subtitle: 'Comece seu espaço de cuidado' } } }}
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
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=3`, { updateViaCache: 'none' }).catch(() => undefined);
    }
  }, []);
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
  return <QueryClientProvider client={queryClient}><TooltipProvider><ThemeProvider><LanguageProvider><ClerkApp /></LanguageProvider></ThemeProvider></TooltipProvider></QueryClientProvider>;
}

function SwitchRouter() {
  return <Router />;
}

export default App;
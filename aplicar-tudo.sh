#!/bin/bash
set -e

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script DE DENTRO da pasta monitora_pai (onde tem uma pasta .git)."
  exit 1
fi

echo "==> Atualizando com o GitHub..."
git pull origin main

echo "==> Escrevendo o patch..."
cat > /tmp/conectar-conversas.patch << 'PATCH_EOF_MARKER_9f8a2'
diff --git a/artifacts/api-server/src/routes/contacts.ts b/artifacts/api-server/src/routes/contacts.ts
index e4aa789..cc6c77c 100644
--- a/artifacts/api-server/src/routes/contacts.ts
+++ b/artifacts/api-server/src/routes/contacts.ts
@@ -15,6 +15,51 @@ async function assertIsParentOfChild(parentId: string, childId: string) {
   return Boolean(child);
 }
 
+/**
+ * GET /api/children
+ * Lista as crianças vinculadas ao Responsável autenticado — usado pelo
+ * frontend para saber qual childId consultar nas telas de Conversas/Localização.
+ */
+router.get("/children", async (req, res) => {
+  const auth = getAuth(req);
+  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });
+
+  const children = await db
+    .select()
+    .from(usersTable)
+    .where(and(eq(usersTable.role, "child"), eq(usersTable.parentId, auth.userId)));
+
+  return res.json(children);
+});
+
+const contactStatusFilter = z.enum(["pending", "approved", "denied", "revoked"]).optional();
+
+/**
+ * GET /api/contacts?childId=...&status=approved
+ * Lista contatos de uma criança, com filtro opcional de status.
+ * Substitui a antiga rota fixa /contacts/pending por algo mais geral.
+ */
+router.get("/contacts", async (req, res) => {
+  const auth = getAuth(req);
+  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });
+
+  const childId = String(req.query.childId ?? "");
+  if (!childId) return res.status(400).json({ error: "missing_child_id" });
+
+  const statusParsed = contactStatusFilter.safeParse(req.query.status);
+  if (!statusParsed.success) return res.status(400).json({ error: "invalid_status" });
+
+  const isParent = await assertIsParentOfChild(auth.userId, childId);
+  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });
+
+  const conditions = statusParsed.data
+    ? and(eq(contactsTable.childId, childId), eq(contactsTable.status, statusParsed.data))
+    : eq(contactsTable.childId, childId);
+
+  const contacts = await db.select().from(contactsTable).where(conditions);
+  return res.json(contacts);
+});
+
 const requestContactSchema = z.object({
   childId: z.string().uuid(),
   contactName: z.string().min(1).max(120),
diff --git a/artifacts/controle-parental-pwa/src/App.tsx b/artifacts/controle-parental-pwa/src/App.tsx
index c57e711..331ced9 100644
--- a/artifacts/controle-parental-pwa/src/App.tsx
+++ b/artifacts/controle-parental-pwa/src/App.tsx
@@ -18,6 +18,7 @@ import {
   MessageCircle,
   Navigation,
   Plus,
+  QrCode,
   RefreshCw,
   Settings,
   ShieldCheck,
@@ -35,6 +36,8 @@ import { Link, Route, Switch, useLocation } from 'wouter';
 import { ErrorBoundary } from '@/components/error-boundary';
 import { PairingGenerate } from '@/pages/PairingGenerate';
 import { PairingJoin } from '@/pages/PairingJoin';
+import { fetchChildren, fetchApprovedContacts, fetchMirroredMessages } from '@/lib/conversations-api';
+import type { ChildUser, ApprovedContact, MirroredMessage } from '@/lib/conversations-api';
 import { Toaster } from '@/components/ui/toaster';
 import { TooltipProvider } from '@/components/ui/tooltip';
 import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
@@ -72,7 +75,7 @@ const pt = {
     title: 'Conta do Responsável', description: 'Entre para manter seu espaço seguro entre dispositivos. Crianças entram apenas pelo pareamento da família.',
     signIn: 'Entrar', signUp: 'Criar conta', signedIn: 'Conta conectada', signedOut: 'Ainda sem uma conta?', signOut: 'Sair',
   },
-  nav: { overview: 'Visão geral', conversations: 'Conversas', location: 'Localização', settings: 'Configurações' },
+  nav: { overview: 'Visão geral', pair: 'Vincular criança', conversations: 'Conversas', location: 'Localização', settings: 'Configurações' },
   shell: {
     yourProfile: 'Seu perfil', setupIncomplete: 'Configuração incompleta', completeSetup: 'Concluir configuração',
     familySpace: 'Espaço da família', noMonitoring: 'Sem monitoramento escondido, nunca.', localMode: 'modo local',
@@ -186,7 +189,7 @@ const en = {
     title: 'Responsible adult account', description: 'Sign in to keep your family space safe across devices. Children join only through family pairing.',
     signIn: 'Sign in', signUp: 'Create account', signedIn: 'Account connected', signedOut: 'No account yet?', signOut: 'Sign out',
   },
-  nav: { overview: 'Overview', conversations: 'Conversations', location: 'Location', settings: 'Settings' },
+  nav: { overview: 'Overview', pair: 'Pair device', conversations: 'Conversations', location: 'Location', settings: 'Settings' },
   shell: {
     yourProfile: 'Your profile', setupIncomplete: 'Setup incomplete', completeSetup: 'Complete setup',
     familySpace: 'Family space', noMonitoring: 'No hidden monitoring, ever.', localMode: 'local mode',
@@ -561,6 +564,7 @@ function Field({ label, value, onChange, placeholder, testId }: { label: string;
 
 const navItems = [
   { href: '/dashboard', label: 'Overview', icon: House },
+  { href: '/pair', label: 'Pair', icon: QrCode },
   { href: '/conversations', label: 'Conversations', icon: MessageCircle },
   { href: '/location', label: 'Location', icon: MapPin },
   { href: '/settings', label: 'Settings', icon: Settings },
@@ -688,7 +692,7 @@ function GuidedTour({ profile }: { profile: Profile | null }) {
 function NavItem({ item, active, onClick, mobile = false }: { item: typeof navItems[number]; active: boolean; onClick?: () => void; mobile?: boolean }) {
   const Icon = item.icon;
   const { t } = useLanguage();
-  const labels = [t.nav.overview, t.nav.conversations, t.nav.location, t.nav.settings];
+  const labels = [t.nav.overview, t.nav.pair, t.nav.conversations, t.nav.location, t.nav.settings];
   const label = labels[navItems.findIndex((nav) => nav.href === item.href)];
   return (
     <Link href={item.href} onClick={onClick} data-testid={`link-nav-${item.href.slice(1)}`} className={`${mobile ? 'flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px]' : 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm'} font-bold transition-colors ${active ? (mobile ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]') : (mobile ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.65)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]')}`}>
@@ -773,7 +777,42 @@ function ActionCard({ icon, tone, eyebrow, title, text, href, action }: { icon:
 function Conversations() {
   const [privateOpen, setPrivateOpen] = useState(false);
   const { t } = useLanguage();
+  const { getToken } = useAuth();
   const profile = readProfile();
+  const [children, setChildren] = useState<ChildUser[] | null>(null);
+  const [approvedContacts, setApprovedContacts] = useState<ApprovedContact[]>([]);
+  const [mirroredMessages, setMirroredMessages] = useState<MirroredMessage[]>([]);
+  const [loadError, setLoadError] = useState<string | null>(null);
+
+  useEffect(() => {
+    let cancelled = false;
+    async function load() {
+      try {
+        const token = await getToken();
+        const kids = await fetchChildren(token);
+        if (cancelled) return;
+        setChildren(kids);
+        if (kids.length > 0) {
+          const [contacts, mirrored] = await Promise.all([
+            fetchApprovedContacts(kids[0].id, token),
+            fetchMirroredMessages(token),
+          ]);
+          if (cancelled) return;
+          setApprovedContacts(contacts);
+          setMirroredMessages(mirrored);
+        }
+      } catch (err) {
+        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar conversas.');
+      }
+    }
+    load();
+    return () => {
+      cancelled = true;
+    };
+  }, [getToken]);
+
+  const hasChild = (children?.length ?? 0) > 0;
+
   return (
     <>
       <PageIntro eyebrow={t.conversations.eyebrow} title={t.conversations.title} description={t.conversations.description} action={<Button variant="outline" onClick={() => setPrivateOpen(true)} testId="button-open-channel-info"><Info size={16} /> {t.conversations.privacy}</Button>} />
@@ -782,11 +821,40 @@ function Conversations() {
         <button onClick={() => setPrivateOpen(true)} data-testid="button-tab-private" className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${privateOpen ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>{t.conversations.privateTab}</button>
       </div>
       {!privateOpen ? (
-        <EmptyState icon={MessageCircle} eyebrow={t.conversations.emptyEyebrow} title={t.conversations.emptyTitle} text={t.conversations.emptyText} actionLabel={t.conversations.learnPrivate} onAction={() => setPrivateOpen(true)} testId="button-empty-private" />
+        loadError ? (
+          <p className="rounded-2xl bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" data-testid="status-conversations-error">{loadError}</p>
+        ) : !hasChild ? (
+          <EmptyState icon={MessageCircle} eyebrow={t.conversations.emptyEyebrow} title={t.conversations.emptyTitle} text="Nenhuma criança vinculada ainda. Vá em 'Vincular criança' para gerar o QR code de pareamento." actionLabel="Vincular criança" onAction={() => { window.location.href = '/pair'; }} testId="button-empty-private" />
+        ) : approvedContacts.length === 0 ? (
+          <EmptyState icon={MessageCircle} eyebrow={t.conversations.emptyEyebrow} title={t.conversations.emptyTitle} text={t.conversations.emptyText} actionLabel={t.conversations.learnPrivate} onAction={() => setPrivateOpen(true)} testId="button-empty-private" />
+        ) : (
+          <section className="overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-card">
+            <div className="border-b border-[hsl(var(--border))] p-6 sm:p-8">
+              <h2 className="text-xl font-extrabold">Contatos aprovados ({approvedContacts.length})</h2>
+              <ul className="mt-4 flex flex-col gap-2">
+                {approvedContacts.map((contact) => (
+                  <li key={contact.id} className="rounded-xl bg-[hsl(var(--muted)/.5)] px-4 py-3 text-sm font-bold" data-testid={`row-approved-contact-${contact.id}`}>{contact.contactName}</li>
+                ))}
+              </ul>
+            </div>
+            <div className="p-6 sm:p-8">
+              <h2 className="text-xl font-extrabold">Mensagens espelhadas ({mirroredMessages.length})</h2>
+              {mirroredMessages.length === 0 ? (
+                <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem espelhada ainda.</p>
+              ) : (
+                <ul className="mt-4 flex flex-col gap-2">
+                  {mirroredMessages.map((entry) => (
+                    <li key={entry.message.id} className="rounded-xl bg-[hsl(var(--muted)/.5)] px-4 py-3 text-sm" data-testid={`row-mirrored-message-${entry.message.id}`}>{entry.message.textContent ?? `[${entry.message.type}]`}</li>
+                  ))}
+                </ul>
+              )}
+            </div>
+          </section>
+        )
       ) : (
            <section className="overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-card" data-tour="private-channel">
           <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div className="flex items-start gap-4"><IconBox icon={LockKeyhole} tone="teal" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-extrabold">{t.conversations.privateTitle}</h2><span className="rounded-full bg-[hsl(var(--primary)/.1)] px-2.5 py-1 font-mono-app text-[10px] font-medium uppercase tracking-[.08em] text-[hsl(var(--primary))]">{t.conversations.privateBadge}</span></div><p className="mt-2 max-w-[590px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.conversations.privateDescription}</p></div></div><span className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))]"><EyeOff size={15} /> {t.conversations.noParticipants}</span></div>
-          <div className="flex min-h-[290px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative mb-5"><span className="absolute inset-[-9px] rounded-full border border-dashed border-[hsl(var(--accent)/.65)] animate-pulse-soft" /><span className="relative grid size-16 place-items-center rounded-full bg-[hsl(var(--accent)/.24)] text-[hsl(31_55%_32%)]"><UserPlus size={25} /></span></div><h3 className="font-display text-3xl tracking-[-.04em]">{t.conversations.readyTitle}</h3><p className="mt-3 max-w-[410px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{profile ? t.conversations.readyWithProfile : t.conversations.readyWithoutProfile}</p><Button variant="soft" className="mt-6" onClick={() => window.alert(t.conversations.alert)} testId="button-prepare-channel">{t.conversations.prepare} <Plus size={16} /></Button></div>
+          <div className="flex min-h-[290px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative mb-5"><span className="absolute inset-[-9px] rounded-full border border-dashed border-[hsl(var(--accent)/.65)] animate-pulse-soft" /><span className="relative grid size-16 place-items-center rounded-full bg-[hsl(var(--accent)/.24)] text-[hsl(31_55%_32%)]"><UserPlus size={25} /></span></div><h3 className="font-display text-3xl tracking-[-.04em]">{t.conversations.readyTitle}</h3><p className="mt-3 max-w-[410px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{profile ? t.conversations.readyWithProfile : t.conversations.readyWithoutProfile}</p></div>
           <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-6 py-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" /> {t.conversations.privateFooter}</div>
         </section>
       )}
diff --git a/artifacts/controle-parental-pwa/src/lib/conversations-api.ts b/artifacts/controle-parental-pwa/src/lib/conversations-api.ts
new file mode 100644
index 0000000..02d9ece
--- /dev/null
+++ b/artifacts/controle-parental-pwa/src/lib/conversations-api.ts
@@ -0,0 +1,57 @@
+// Cliente para dados reais do Responsável: filhos vinculados, contatos
+// aprovados e mensagens espelhadas. Usa token Bearer pelo mesmo motivo
+// de pairing-api.ts (PWA e api-server em domínios diferentes no Railway).
+const API_URL = import.meta.env.VITE_API_URL ?? '';
+
+function authHeaders(token: string | null): HeadersInit {
+  return {
+    'Content-Type': 'application/json',
+    ...(token ? { Authorization: `Bearer ${token}` } : {}),
+  };
+}
+
+export type ChildUser = {
+  id: string;
+  name: string;
+};
+
+export async function fetchChildren(authToken: string | null): Promise<ChildUser[]> {
+  const res = await fetch(`${API_URL}/api/children`, { headers: authHeaders(authToken) });
+  if (!res.ok) throw new Error(`fetch_children_failed_${res.status}`);
+  return res.json();
+}
+
+export type ApprovedContact = {
+  id: string;
+  contactName: string;
+  status: string;
+};
+
+export async function fetchApprovedContacts(
+  childId: string,
+  authToken: string | null,
+): Promise<ApprovedContact[]> {
+  const res = await fetch(
+    `${API_URL}/api/contacts?childId=${encodeURIComponent(childId)}&status=approved`,
+    { headers: authHeaders(authToken) },
+  );
+  if (!res.ok) throw new Error(`fetch_contacts_failed_${res.status}`);
+  return res.json();
+}
+
+export type MirroredMessage = {
+  message: {
+    id: string;
+    type: string;
+    textContent: string | null;
+    contentUrl: string | null;
+    createdAt: string;
+  };
+  mirroredAt: string;
+};
+
+export async function fetchMirroredMessages(authToken: string | null): Promise<MirroredMessage[]> {
+  const res = await fetch(`${API_URL}/api/messages/mirrored`, { headers: authHeaders(authToken) });
+  if (!res.ok) throw new Error(`fetch_mirrored_failed_${res.status}`);
+  return res.json();
+}
PATCH_EOF_MARKER_9f8a2

echo "==> Aplicando as mudancas..."
git apply /tmp/conectar-conversas.patch

echo "==> Commitando..."
git add -A
git commit -m "Adiciona menu de vinculo e conecta Conversas ao backend real"

echo "==> Enviando pro GitHub..."
git push origin main

echo ""
echo "==> PRONTO. O Railway vai detectar e buildar sozinho em instantes."

import { useEffect, useState } from 'react';
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
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  UserPlus,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Role = 'responsible' | 'child';
type Profile = { displayName: string; familyName: string; role: Role };

const queryClient = new QueryClient();
const PROFILE_KEY = 'amparo-profile';

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
  const existing = readProfile();
  const [role, setRole] = useState<Role | null>(existing?.role ?? null);
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [familyName, setFamilyName] = useState(existing?.familyName ?? '');
  const [error, setError] = useState('');

  function finish(event: FormEvent) {
    event.preventDefault();
    if (!role || !displayName.trim() || !familyName.trim()) {
      setError('Choose a role and complete both fields to continue.');
      return;
    }
    saveProfile({ role, displayName: displayName.trim(), familyName: familyName.trim() });
    setLocation('/dashboard');
  }

  return (
    <main className="texture min-h-[100dvh] overflow-hidden bg-[hsl(var(--background))]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-8 lg:px-14">
        <header className="flex items-center justify-between">
          <BrandMark />
          <div className="hidden items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))] sm:flex">
            <span className="size-2 rounded-full bg-[hsl(var(--accent))]" />
            a family space, not a control room
          </div>
        </header>

        <div className="grid flex-1 items-center gap-14 pb-8 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-24 lg:py-16">
          <section className="animate-rise-in max-w-[680px]">
            <p className="mb-5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.2em] text-[hsl(var(--primary))]">
              <span className="h-px w-8 bg-[hsl(var(--accent))]" />
              private by default
            </p>
            <h1 className="font-display text-[clamp(3.5rem,8vw,7.5rem)] leading-[.86] tracking-[-.065em] text-[hsl(var(--foreground))]">
              Safety works<br />
              <em className="text-[hsl(var(--primary))]">better</em> in the open.
            </h1>
            <p className="mt-8 max-w-[510px] text-lg leading-8 text-[hsl(var(--muted-foreground))]">
              Amparo gives families a shared place to check in, talk, and share a location when everyone agrees. No hidden monitoring. No guessing what is real.
            </p>
            <div className="mt-10 flex flex-wrap gap-5 text-sm font-semibold text-[hsl(var(--foreground))]">
              <span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Everyone can see what is shared</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Nothing starts without consent</span>
            </div>
          </section>

          <section className="animate-rise-in rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card)/.8)] p-5 shadow-card backdrop-blur sm:p-8" style={{ animationDelay: '120ms' }}>
            <div className="mb-8">
              <p className="font-mono-app text-[11px] font-medium uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">01 / start here</p>
              <h2 className="mt-3 font-display text-4xl tracking-[-.045em]">Who are you in this family?</h2>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Your choice shapes what you see. You can change it later.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RoleChoice selected={role === 'responsible'} onClick={() => { setRole('responsible'); setError(''); }} icon={HeartHandshake} title="Responsible adult" text="I help keep the family connected." testId="button-role-responsible" />
              <RoleChoice selected={role === 'child'} onClick={() => { setRole('child'); setError(''); }} icon={Baby} title="Child" text="I want a say in my safety space." testId="button-role-child" />
            </div>
            <form onSubmit={finish} className="mt-8 space-y-5">
              <Field label="Your name" value={displayName} onChange={setDisplayName} placeholder="Type your name" testId="input-profile-name" />
              <Field label="Family space name" value={familyName} onChange={setFamilyName} placeholder="Give your space a name" testId="input-family-name" />
              <div className="flex items-start gap-3 border-t border-[hsl(var(--border))] pt-5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                <LockKeyhole size={16} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" />
                <span>This stays on this device for now. Amparo will never make up a person, message, or location.</span>
              </div>
              {error && <p className="text-sm font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-onboarding-error">{error}</p>}
              <Button type="submit" className="w-full" testId="button-create-family">
                Create my family space <ArrowRight size={17} />
              </Button>
            </form>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]">
          <span>Amparo / a clear space for care</span>
          <span className="flex items-center gap-2"><CircleHelp size={14} /> Need help? Ask your family to set this up together.</span>
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
  { href: '/conversations', label: 'Conversations', icon: MessageCircle },
  { href: '/location', label: 'Location', icon: MapPin },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const profile = readProfile();
  return (
    <div className="texture min-h-[100dvh] bg-[hsl(var(--background))]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col bg-[hsl(var(--sidebar))] px-5 py-7 text-[hsl(var(--sidebar-foreground))] lg:flex">
        <BrandMark compact />
        <div className="mt-7 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.55)] p-4">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.displayName} dark />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{profile?.displayName || 'Your profile'}</p>
              <p className="truncate text-xs text-[hsl(var(--sidebar-foreground)/.6)]">{profile?.familyName || 'Setup incomplete'}</p>
            </div>
          </div>
          {!profile && <Link href="/" className="mt-3 flex items-center justify-between text-xs font-bold text-[hsl(var(--sidebar-primary))]" data-testid="link-complete-setup">Complete setup <ArrowRight size={13} /></Link>}
        </div>
        <nav className="mt-9 flex-1 space-y-1" aria-label="Main navigation">
          <p className="mb-3 px-3 font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.45)]">Family space</p>
          {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} onClick={() => setMenuOpen(false)} />)}
        </nav>
        <div className="border-t border-[hsl(var(--sidebar-border))] pt-5">
          <p className="flex items-center gap-2 text-xs leading-5 text-[hsl(var(--sidebar-foreground)/.6)]"><EyeOff size={15} /> No hidden monitoring, ever.</p>
          <p className="mt-4 font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.35)]">Amparo v0.1 / local mode</p>
        </div>
      </aside>

      {menuOpen && <button aria-label="Close navigation" data-testid="button-close-mobile-nav" className="fixed inset-0 z-40 bg-[hsl(var(--foreground)/.28)] lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[hsl(var(--sidebar))] px-5 py-7 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between"><BrandMark compact /><button className="grid size-11 place-items-center rounded-full hover:bg-[hsl(var(--sidebar-accent))]" onClick={() => setMenuOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X size={20} /></button></div>
        <nav className="mt-10 space-y-1" aria-label="Mobile navigation">
          {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} onClick={() => setMenuOpen(false)} />)}
        </nav>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.86)] px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <button className="grid size-11 place-items-center rounded-full hover:bg-[hsl(var(--muted))] lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu size={21} /></button>
          <div className="lg:hidden"><BrandMark /></div>
          <div className="hidden lg:block"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Family space / {profile?.familyName || 'not set up'}</p></div>
          <div className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))]"><span className="size-2 rounded-full bg-[hsl(var(--primary))]" /> local and private</div>
        </header>
        <main className="mx-auto max-w-[1280px] px-5 pb-28 pt-9 sm:px-8 lg:px-12 lg:pb-12 lg:pt-12">{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-20 flex h-[70px] items-center justify-around rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.94)] px-1 shadow-[0_12px_40px_rgba(24,48,48,.12)] backdrop-blur lg:hidden" aria-label="Bottom navigation">
        {navItems.map((item) => <NavItem key={item.href} item={item} active={location === item.href} mobile />)}
      </nav>
    </div>
  );
}

function NavItem({ item, active, onClick, mobile = false }: { item: typeof navItems[number]; active: boolean; onClick?: () => void; mobile?: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onClick} data-testid={`link-nav-${item.label.toLowerCase()}`} className={`${mobile ? 'flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px]' : 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm'} font-bold transition-colors ${active ? (mobile ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]') : (mobile ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.65)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]')}`}>
      <Icon size={mobile ? 19 : 18} strokeWidth={active ? 2.3 : 1.8} />
      <span>{item.label}</span>
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
  const profile = readProfile();
  if (profile) return null;
  return (
    <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.12)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><Info size={18} className="mt-0.5 shrink-0 text-[hsl(31_55%_32%)]" /><div><p className="text-sm font-extrabold">Your family space is not set up yet.</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Start with your role and a name so this space belongs to you.</p></div></div>
      <Link href="/" data-testid="link-setup-notice" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))]">Set up space <ArrowRight size={14} /></Link>
    </div>
  );
}

function Dashboard() {
  const profile = readProfile();
  return (
    <>
      <PageIntro eyebrow="01 / overview" title={profile ? `Good to have you, ${profile.displayName}.` : 'A clear place to care.'} description={profile ? 'This is your family’s shared safety space. It starts quiet, because only your real updates belong here.' : 'Set up your family profile to make this space yours. Until then, nothing is being collected or assumed.'} />
      <SetupNotice />
      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="relative min-h-[330px] overflow-hidden rounded-[26px] bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))] sm:p-9">
          <div className="absolute -right-16 -top-16 size-64 rounded-full border border-[hsl(var(--accent)/.25)]" /><div className="absolute -right-5 top-[-5px] size-44 rounded-full border border-[hsl(var(--accent)/.2)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--primary-foreground)/.65)]"><span className="size-2 rounded-full bg-[hsl(var(--accent))]" /> shared truth</span><ShieldCheck size={24} className="text-[hsl(var(--accent))]" /></div>
            <div className="mt-20 max-w-[480px]"><p className="font-display text-[clamp(2.5rem,5vw,4.2rem)] leading-[.92] tracking-[-.06em]">Nothing to report<br /><em className="text-[hsl(var(--accent))]">is good news.</em></p><p className="mt-5 max-w-[370px] text-sm leading-6 text-[hsl(var(--primary-foreground)/.7)]">When your family starts sharing, this is where the clear, agreed-upon updates will appear.</p></div>
          </div>
        </div>
        <div className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7">
          <div className="flex items-center justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">space status</p><h2 className="mt-2 text-xl font-extrabold">Quiet and ready</h2></div><IconBox icon={WifiOff} tone="slate" /></div>
          <div className="mt-7 space-y-0">
            <StatusRow icon={UserRound} label="Your profile" value={profile ? 'Set up on this device' : 'Needs your details'} done={!!profile} />
            <StatusRow icon={MessageCircle} label="Conversations" value="No approved conversations" />
            <StatusRow icon={MapPin} label="Location sharing" value="No child location shared" />
          </div>
          <p className="mt-7 border-t border-[hsl(var(--border))] pt-5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Amparo only shows information someone has actively chosen to share with this family space.</p>
        </div>
      </section>
      <section className="mt-5 grid gap-5 md:grid-cols-2">
        <ActionCard icon={MessageCircle} tone="gold" eyebrow="stay connected" title="Approved conversations" text="A place for messages that everyone can see are part of the family space." href="/conversations" action="Open conversations" />
        <ActionCard icon={Navigation} tone="teal" eyebrow="when it matters" title="Location, with consent" text="Location is empty until a child chooses to share it. Permission is always visible." href="/location" action="Review location" />
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
  const profile = readProfile();
  return (
    <>
      <PageIntro eyebrow="02 / conversations" title="Talk where trust lives." description="Only approved conversations belong here. The private family channel is clearly marked and never silently shared." action={<Button variant="outline" onClick={() => setPrivateOpen(true)} testId="button-open-channel-info"><Info size={16} /> How privacy works</Button>} />
      <div className="mb-6 flex items-center gap-1 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1 sm:w-fit">
        <button onClick={() => setPrivateOpen(false)} data-testid="button-tab-approved" className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${!privateOpen ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>Approved conversations</button>
        <button onClick={() => setPrivateOpen(true)} data-testid="button-tab-private" className={`min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors ${privateOpen ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>Private family channel</button>
      </div>
      {!privateOpen ? (
        <EmptyState icon={MessageCircle} eyebrow="nothing shared yet" title="Your conversations are empty." text="When a family member is approved and starts a conversation, it will appear here. Amparo does not create placeholder messages." actionLabel="Learn about the private channel" onAction={() => setPrivateOpen(true)} testId="button-empty-private" />
      ) : (
        <section className="overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-card">
          <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div className="flex items-start gap-4"><IconBox icon={LockKeyhole} tone="teal" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-extrabold">Private family channel</h2><span className="rounded-full bg-[hsl(var(--primary)/.1)] px-2.5 py-1 font-mono-app text-[10px] font-medium uppercase tracking-[.08em] text-[hsl(var(--primary))]">private</span></div><p className="mt-2 max-w-[590px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">A direct space for a responsible adult and child. Messages here are visible only to those two people once both profiles join this family space.</p></div></div><span className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))]"><EyeOff size={15} /> no participants yet</span></div>
          <div className="flex min-h-[290px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative mb-5"><span className="absolute inset-[-9px] rounded-full border border-dashed border-[hsl(var(--accent)/.65)] animate-pulse-soft" /><span className="relative grid size-16 place-items-center rounded-full bg-[hsl(var(--accent)/.24)] text-[hsl(31_55%_32%)]"><UserPlus size={25} /></span></div><h3 className="font-display text-3xl tracking-[-.04em]">This channel is ready when your family is.</h3><p className="mt-3 max-w-[410px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{profile ? 'Add another family profile on their own device to make this private channel available.' : 'Complete your profile first, then invite the people you trust.'}</p><Button variant="soft" className="mt-6" onClick={() => window.alert('Family profiles will be connected when the shared family service is available.')} testId="button-prepare-channel">Prepare private channel <Plus size={16} /></Button></div>
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-6 py-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" /> Private means private: this channel will never be listed as an approved group conversation.</div>
        </section>
      )}
    </>
  );
}

function EmptyState({ icon: Icon, eyebrow, title, text, actionLabel, onAction, testId }: { icon: LucideIcon; eyebrow: string; title: string; text: string; actionLabel?: string; onAction?: () => void; testId?: string }) {
  return <section className="flex min-h-[390px] flex-col items-center justify-center rounded-[26px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 py-14 text-center"><span className="mb-6 grid size-16 place-items-center rounded-[22px] bg-[hsl(var(--muted))] text-[hsl(var(--primary))]"><Icon size={27} strokeWidth={1.6} /></span><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{eyebrow}</p><h2 className="mt-3 font-display text-4xl tracking-[-.05em]">{title}</h2><p className="mt-3 max-w-[420px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p>{actionLabel && <Button variant="outline" className="mt-7" onClick={onAction} testId={testId}>{actionLabel} <ArrowRight size={15} /></Button>}</section>;
}

function LocationPage() {
  const profile = readProfile();
  const [permission, setPermission] = useState<'unknown' | 'asking' | 'granted' | 'denied'>('unknown');
  const [sharing, setSharing] = useState(() => localStorage.getItem('amparo-location-sharing') === 'true');
  const [error, setError] = useState('');

  function requestPermission() {
    setError('');
    if (!navigator.geolocation) { setPermission('denied'); setError('Location permission is not available in this browser.'); return; }
    setPermission('asking');
    navigator.geolocation.getCurrentPosition(() => setPermission('granted'), () => { setPermission('denied'); setError('Permission was not granted. No location was saved.'); }, { enableHighAccuracy: false, timeout: 8000 });
  }
  function toggleSharing() {
    const next = !sharing;
    setSharing(next);
    localStorage.setItem('amparo-location-sharing', String(next));
  }
  return (
    <>
      <PageIntro eyebrow="03 / location" title="Location, by agreement." description="A location is never inferred here. It appears only after a child chooses to share it and the device allows it." />
      <div className="grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
        <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
          <div className="flex items-start justify-between"><IconBox icon={MapPin} tone="gold" /><span className={`rounded-full px-3 py-1 font-mono-app text-[10px] uppercase tracking-[.08em] ${permission === 'granted' ? 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : permission === 'denied' ? 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{permission === 'granted' ? 'allowed' : permission === 'denied' ? 'not allowed' : 'not requested'}</span></div>
          <h2 className="mt-8 font-display text-4xl tracking-[-.05em]">Device permission</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Permission and family sharing are separate choices. Amparo asks the device only when you ask Amparo.</p>
          <Button className="mt-7 w-full" onClick={requestPermission} disabled={permission === 'asking'} testId="button-request-location">{permission === 'asking' ? 'Waiting for your choice…' : permission === 'granted' ? 'Permission granted' : 'Ask for permission'} <Navigation size={16} /></Button>
          {error && <p className="mt-3 text-xs font-semibold leading-5 text-[hsl(var(--destructive))]" role="alert" data-testid="status-location-error">{error}</p>}
          {profile?.role === 'child' && <div className="mt-8 border-t border-[hsl(var(--border))] pt-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-extrabold">Share my location</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{sharing ? 'Your family can see that you chose to share.' : 'Your location stays private.'}</p></div><button role="switch" aria-checked={sharing} onClick={toggleSharing} data-testid="switch-location-sharing" className={`relative h-7 w-12 rounded-full transition-colors ${sharing ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${sharing ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></div>}
        </section>
        <section className="relative min-h-[430px] overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(191_25%_25%)] p-6 text-[hsl(var(--card))] sm:p-8">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(32deg, transparent 48%, hsl(38 77% 65% / .18) 49%, transparent 50%), linear-gradient(118deg, transparent 48%, hsl(42 32% 95% / .12) 49%, transparent 50%)', backgroundSize: '78px 78px' }} />
          <div className="relative flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--accent))]">family map</span><span className="flex items-center gap-2 rounded-full border border-[hsl(var(--card)/.2)] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--card)/.65)]"><LockKeyhole size={12} /> consent required</span></div><div className="flex flex-1 flex-col items-center justify-center text-center"><span className="mb-6 grid size-20 place-items-center rounded-full border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><MapPin size={31} strokeWidth={1.4} /></span><h2 className="font-display text-4xl tracking-[-.05em]">No location shared</h2><p className="mt-3 max-w-[330px] text-sm leading-6 text-[hsl(var(--card)/.65)]">{profile?.role === 'child' && sharing ? 'Sharing is on, but there is no location update yet.' : 'This map stays intentionally empty until a child chooses to share a location.'}</p></div><div className="flex items-center gap-2 border-t border-[hsl(var(--card)/.15)] pt-5 text-xs text-[hsl(var(--card)/.6)]"><EyeOff size={15} /> No background tracking. No last-seen pin.</div></div>
        </section>
      </div>
    </>
  );
}

function SettingsPage() {
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
    if (window.confirm('Remove this local family profile from this device?')) {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem('amparo-location-sharing');
      setLocation('/');
    }
  }
  return (
    <>
      <PageIntro eyebrow="04 / settings" title="Your space, your say." description="See and change the profile and device permissions that shape this Amparo space." />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <form onSubmit={saveSettings} className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-4 border-b border-[hsl(var(--border))] pb-6"><Avatar name={name} /><div><h2 className="text-lg font-extrabold">Family profile</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Stored on this device only</p></div></div>
          <div className="mt-7 space-y-5"><Field label="Your name" value={name} onChange={setName} placeholder="Type your name" testId="input-settings-name" /><Field label="Family space name" value={family} onChange={setFamily} placeholder="Give your space a name" testId="input-settings-family" /></div>
          <div className="mt-7 flex flex-wrap items-center gap-4"><Button type="submit" testId="button-save-settings">Save changes <Check size={16} /></Button>{saved && <span className="text-xs font-bold text-[hsl(var(--primary))]" role="status" data-testid="status-settings-saved">Saved on this device.</span>}</div>
        </form>
        <div className="space-y-5">
          <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={Bell} tone="gold" /><div className="flex-1"><h2 className="text-lg font-extrabold">Notifications</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">A local preference for future approved updates.</p></div><button role="switch" aria-checked={notifications} onClick={() => { const next = !notifications; setNotifications(next); localStorage.setItem('amparo-notifications', String(next)); }} data-testid="switch-notifications" className={`relative h-7 w-12 rounded-full transition-colors ${notifications ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${notifications ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></section>
          <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-7"><div className="flex items-start gap-4"><IconBox icon={Smartphone} tone="teal" /><div><h2 className="text-lg font-extrabold">This device</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Amparo is running in local mode. There is no account sync or background collection.</p></div></div><div className="mt-5 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-4 text-xs font-bold text-[hsl(var(--primary))]"><Check size={14} /> Data stays in your browser</div></section>
          <section className="rounded-[26px] border border-[hsl(var(--destructive)/.2)] bg-[hsl(var(--destructive)/.04)] p-6 sm:p-7"><h2 className="text-sm font-extrabold text-[hsl(var(--destructive))]">Remove local profile</h2><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">This clears your profile and local sharing choices from this device.</p><button type="button" onClick={deleteProfile} data-testid="button-delete-profile" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[hsl(var(--destructive)/.3)] px-4 text-xs font-bold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]">Remove profile <X size={14} /></button></section>
        </div>
      </div>
    </>
  );
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Onboarding} /><Route path="/dashboard" component={DashboardRoute} /><Route path="/conversations" component={ConversationsRoute} /><Route path="/location" component={LocationRoute} /><Route path="/settings" component={SettingsRoute} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}
function DashboardRoute() { return <AppShell><Dashboard /></AppShell>; }
function ConversationsRoute() { return <AppShell><Conversations /></AppShell>; }
function LocationRoute() { return <AppShell><LocationPage /></AppShell>; }
function SettingsRoute() { return <AppShell><SettingsPage /></AppShell>; }

function NotFound() {
  return <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] p-6"><div className="max-w-md text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--primary))]"><RefreshCw size={26} /></span><h1 className="mt-6 font-display text-5xl tracking-[-.05em]">This page is not here.</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">The Amparo space you asked for does not exist.</p><Link href="/" data-testid="link-not-found-home" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))]">Back to Amparo <ArrowRight size={16} /></Link></div></main>;
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }, []);
  return <QueryClientProvider client={queryClient}><TooltipProvider><SwitchRouter /><Toaster /></TooltipProvider></QueryClientProvider>;
}

function SwitchRouter() {
  return <Router />;
}

export default App;
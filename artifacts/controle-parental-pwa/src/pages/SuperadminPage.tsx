import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@clerk/react';
import { ArrowRight, BadgePercent, Handshake, LayoutDashboard, LoaderCircle, Search, Users } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? '';
type AdminUser = { id: string; name: string; email: string | null; role: string; createdAt: string; plan: 'free' | 'paid' | null; subscriptionStatus: 'active' | 'past_due' | 'canceled' | null; childrenLimit: number | null };
type Voucher = { id: string; code: string; discountType: 'percent' | 'fixed'; discountValue: number; maxRedemptions: number | null; expiresAt: string | null; active: boolean };
type Ambassador = { id: string; name: string; email: string; referralCode: string; commissionBps: number; fixedBenefitCents: number; benefitDescription: string | null; active: boolean };
type Commission = { id: string; ambassadorId: string; stripeInvoiceId: string; amountCents: number; status: 'accrued' | 'paid' | 'reversed'; createdAt: string };
type Overview = { users: number; activeSubscriptions: number; activeVouchers: number; activeAmbassadors: number; accruedCommissionCents: number };

const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const input = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50';

export function SuperadminPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<'overview' | 'users' | 'vouchers' | 'ambassadors'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const request = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const token = await getToken();
    const response = await fetch(`${API_URL}/api/admin${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 ? 'Sua conta não tem acesso de superadmin.' : data.error ?? 'Não foi possível completar a operação.');
    return data as T;
  }, [getToken]);

  const load = useCallback(async () => {
    setError('');
    try {
      if (tab === 'overview') setOverview(await request<Overview>('/overview'));
      if (tab === 'users') setUsers((await request<{ users: AdminUser[] }>(`/users${search ? `?search=${encodeURIComponent(search)}` : ''}`)).users);
      if (tab === 'vouchers') setVouchers((await request<{ vouchers: Voucher[] }>('/vouchers')).vouchers);
      if (tab === 'ambassadors') {
        const data = await request<{ ambassadors: Ambassador[]; commissions: Commission[] }>('/ambassadors');
        setAmbassadors(data.ambassadors); setCommissions(data.commissions);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro ao carregar o portal.'); }
  }, [request, search, tab]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, path: string, onSuccess: () => void) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values = Object.fromEntries(form.entries()) as Record<string, string>;
    if (path === '/vouchers') {
      if (!values.maxRedemptions) delete values.maxRedemptions;
      if (values.expiresAt) values.expiresAt = new Date(values.expiresAt).toISOString();
      else delete values.expiresAt;
      if (values.discountType === 'fixed') values.discountValue = String(Math.round(Number(values.discountValue) * 100));
    }
    if (path === '/ambassadors') values.fixedBenefitCents = String(Math.round(Number(values.fixedBenefitCents || 0) * 100));
    try {
      await request(path, { method: 'POST', body: JSON.stringify(values) });
      formElement.reset(); setNotice('Salvo com sucesso.'); onSuccess(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  async function updateUser(user: AdminUser, form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      await request(`/users/${encodeURIComponent(user.id)}/subscription`, { method: 'PATCH', body: JSON.stringify({ plan: values.get('plan'), status: values.get('status'), childrenLimit: Number(values.get('childrenLimit')) }) });
      setNotice(`Acesso de ${user.name} atualizado.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar usuário.'); }
    finally { setBusy(false); }
  }

  async function toggle(path: string, active: boolean) {
    setBusy(true); setError('');
    try { await request(path, { method: 'PATCH', body: JSON.stringify({ active: !active }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar status.'); }
    finally { setBusy(false); }
  }

  async function updateCommission(commission: Commission) {
    const status = commission.status === 'accrued' ? 'paid' : commission.status === 'paid' ? 'reversed' : 'accrued';
    setBusy(true); setError('');
    try { await request(`/commissions/${commission.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar comissão.'); }
    finally { setBusy(false); }
  }

  const tabs = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'users', label: 'Usuários', icon: Users },
    { id: 'vouchers', label: 'Vouchers', icon: BadgePercent },
    { id: 'ambassadors', label: 'Embaixadores', icon: Handshake },
  ] as const;
  const title = tabs.find((item) => item.id === tab)?.label;

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
      <a href="/dashboard" className="flex items-center gap-3 font-extrabold"><span className="grid size-10 place-items-center rounded-xl bg-teal-800 text-white">A</span><span>Ampara <span className="font-medium text-slate-500">/ Superadmin</span></span></a>
      <a className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800" href="/dashboard">Voltar ao app <ArrowRight size={16} /></a>
    </div></header>
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:grid-cols-[220px_1fr]">
      <aside className={`${panel} h-fit p-2`}><nav className="grid gap-1">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold ${tab === id ? 'bg-teal-50 text-teal-900' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={18} />{label}</button>)}</nav></aside>
      <section className="min-w-0"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-800">Painel de gestão</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1></div><button className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-bold" onClick={() => void load()}>Atualizar</button></div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        {busy && <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} /> Salvando…</div>}
        {tab === 'overview' && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[
          ['Usuários cadastrados', overview?.users], ['Assinaturas ativas', overview?.activeSubscriptions], ['Vouchers ativos', overview?.activeVouchers], ['Embaixadores ativos', overview?.activeAmbassadors], ['Comissões a pagar', `R$ ${((overview?.accruedCommissionCents ?? 0) / 100).toFixed(2).replace('.', ',')}`],
        ].map(([label, value]) => <article className={panel} key={String(label)}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-extrabold">{value ?? '—'}</p></article>)}
          <article className={`${panel} sm:col-span-2 xl:col-span-3`}><h2 className="font-bold">Configuração do Stripe</h2><p className="mt-2 text-sm leading-6 text-slate-600">O checkout só ficará disponível após configurar as chaves de teste/produção, o segredo de webhook e os IDs de preço no ambiente da API. As chaves secretas ficam exclusivamente no backend.</p></article>
        </div>}
        {tab === 'users' && <div className={panel}><form onSubmit={(event) => { event.preventDefault(); void load(); }} className="mb-4 flex gap-2"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400"/><input className={`${input} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail ou ID" /></label><button className={button}>Buscar</button></form><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-3">Usuário</th><th>Tipo</th><th>Plano e acesso</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b last:border-0"><td className="py-3"><strong>{user.name}</strong><div className="text-xs text-slate-500">{user.email || user.id}</div></td><td>{user.role}</td><td><form id={`user-${user.id}`} className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void updateUser(user, event.currentTarget); }}><select name="plan" defaultValue={user.plan ?? 'free'} className="rounded-lg border p-2"><option value="free">Gratuito</option><option value="paid">Pago</option></select><select name="status" defaultValue={user.subscriptionStatus ?? 'active'} className="rounded-lg border p-2"><option value="active">Ativo</option><option value="past_due">Em atraso</option><option value="canceled">Cancelado</option></select><input name="childrenLimit" defaultValue={user.childrenLimit ?? 1} type="number" min="1" max="50" aria-label="Limite de crianças" className="w-20 rounded-lg border p-2" /></form></td><td><button form={`user-${user.id}`} className="rounded-lg bg-slate-900 px-3 py-2 font-bold text-white">Salvar</button></td></tr>)}</tbody></table></div></div>}
        {tab === 'vouchers' && <div className="grid gap-4 xl:grid-cols-[340px_1fr]"><form className={panel} onSubmit={(event) => void submit(event, '/vouchers', () => setNotice('Voucher criado.'))}><h2 className="mb-4 font-bold">Criar voucher</h2><div className="grid gap-3"><label className="grid gap-1 text-sm font-semibold">Código<input name="code" required minLength={3} maxLength={32} className={input} placeholder="BEMVINDO20" /></label><label className="grid gap-1 text-sm font-semibold">Tipo de desconto<select name="discountType" className={input}><option value="percent">Percentual</option><option value="fixed">Valor fixo em reais</option></select></label><label className="grid gap-1 text-sm font-semibold">Valor<input name="discountValue" required type="number" min="1" max="100000000" step="0.01" className={input} placeholder="20 ou 10,00" /><small className="font-normal text-slate-500">Percentual: 1–100. Para valor fixo, informe em reais.</small></label><label className="grid gap-1 text-sm font-semibold">Limite de usos<input name="maxRedemptions" type="number" min="1" className={input} placeholder="Sem limite" /></label><label className="grid gap-1 text-sm font-semibold">Validade<input name="expiresAt" type="datetime-local" className={input} /></label><button disabled={busy} className={button}>Criar voucher</button></div></form><div className={panel}><h2 className="mb-4 font-bold">Vouchers</h2><div className="grid gap-2">{vouchers.map((voucher) => <div key={voucher.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><strong>{voucher.code}</strong><p className="text-sm text-slate-500">{voucher.discountType === 'percent' ? `${voucher.discountValue}%` : `R$ ${(voucher.discountValue / 100).toFixed(2).replace('.', ',')}`} · {voucher.maxRedemptions ?? 'Sem limite'} usos</p></div><button disabled={busy} onClick={() => void toggle(`/vouchers/${voucher.id}`, voucher.active)} className={`rounded-lg px-3 py-2 text-sm font-bold ${voucher.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{voucher.active ? 'Ativo · desativar' : 'Inativo · ativar'}</button></div>)}</div></div></div>}
        {tab === 'ambassadors' && <div className="grid gap-4 xl:grid-cols-[360px_1fr]"><form className={panel} onSubmit={(event) => void submit(event, '/ambassadors', () => setNotice('Embaixador cadastrado.'))}><h2 className="mb-4 font-bold">Cadastrar embaixador</h2><div className="grid gap-3"><label className="grid gap-1 text-sm font-semibold">Nome<input name="name" required className={input} /></label><label className="grid gap-1 text-sm font-semibold">E-mail<input name="email" type="email" required className={input} /></label><label className="grid gap-1 text-sm font-semibold">Código de indicação<input name="referralCode" required minLength={3} className={input} /></label><label className="grid gap-1 text-sm font-semibold">Comissão por assinatura (%)<input name="commissionPercent" required type="number" min="0" max="100" step="0.1" defaultValue="10" className={input} /></label><label className="grid gap-1 text-sm font-semibold">Benefício fixo por pagamento (R$)<input name="fixedBenefitCents" type="number" min="0" step="0.01" defaultValue="0" className={input} /><small className="font-normal text-slate-500">Informe em reais; fica registrado para apuração.</small></label><label className="grid gap-1 text-sm font-semibold">Outros benefícios<textarea name="benefitDescription" maxLength={500} className={input} /></label><button disabled={busy} className={button}>Cadastrar</button></div></form><div className="grid gap-4"><div className={panel}><h2 className="mb-3 font-bold">Embaixadores</h2><div className="grid gap-2">{ambassadors.map((ambassador) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={ambassador.id}><div><strong>{ambassador.name}</strong><p className="text-sm text-slate-500">{ambassador.referralCode} · {ambassador.commissionBps / 100}% + R$ {(ambassador.fixedBenefitCents / 100).toFixed(2).replace('.', ',')}</p>{ambassador.benefitDescription && <p className="text-xs text-slate-500">{ambassador.benefitDescription}</p>}</div><button disabled={busy} onClick={() => void toggle(`/ambassadors/${ambassador.id}`, ambassador.active)} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">{ambassador.active ? 'Ativo · desativar' : 'Inativo · ativar'}</button></div>)}</div></div><div className={panel}><h2 className="mb-3 font-bold">Comissões registradas</h2><div className="grid gap-2">{commissions.map((commission) => <div key={commission.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span>{commission.status} · {commission.stripeInvoiceId}</span><strong>R$ {(commission.amountCents / 100).toFixed(2).replace('.', ',')}</strong><button disabled={busy} onClick={() => void updateCommission(commission)} className="rounded-lg border px-3 py-1.5 font-bold">{commission.status === 'accrued' ? 'Marcar como pago' : commission.status === 'paid' ? 'Reverter pagamento' : 'Reabrir comissão'}</button></div>)}{commissions.length === 0 && <p className="text-sm text-slate-500">As comissões aparecerão após pagamentos processados pelo Stripe.</p>}</div><p className="mt-3 text-xs text-slate-500">A marcação de pagamento é para conciliação manual; a transferência ao embaixador não é automática.</p></div></div></div>}
      </section>
    </div>
  </main>;
}

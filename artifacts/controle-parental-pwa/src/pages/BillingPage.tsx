import { useState } from 'react';
import { useAuth } from '@clerk/react';
import { ArrowLeft, Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const intervals = [
  { id: 'monthly', label: 'Mensal', suffix: '/ mês', discount: '' },
  { id: 'quarterly', label: 'Trimestral', suffix: '/ 3 meses', discount: '25% de desconto' },
  { id: 'annual', label: 'Anual', suffix: '/ ano', discount: '4% de desconto' },
] as const;
type Interval = (typeof intervals)[number]['id'];
const plans = [
  { id: 'kids_solo', name: 'Kids Solo', prices: { monthly: 'R$ 24,90', quarterly: 'R$ 56,03', annual: 'R$ 286,85' }, detail: '1 criança · até 2 responsáveis', parentBenefits: ['Espaço familiar para gerenciar o perfil e o pareamento', 'Conversa privada com a criança', 'Chamadas de voz e vídeo com os dois apps abertos'], childBenefits: ['Conversa com o responsável', 'Envio de fotos e figurinhas', 'Chamadas de voz e vídeo com os dois apps abertos'] },
  { id: 'kids_duo', name: 'Kids Duo', prices: { monthly: 'R$ 34,90', quarterly: 'R$ 78,53', annual: 'R$ 402,05' }, detail: '2 crianças · até 3 responsáveis', parentBenefits: ['Tudo do Kids Solo para até 2 crianças', 'Convide responsáveis para compartilhar o espaço familiar', 'Converse com cada criança no chat privado'], childBenefits: ['Cada criança tem seu espaço de conversa familiar', 'Envio de fotos e figurinhas', 'Chamadas de voz e vídeo com os dois apps abertos'] },
  { id: 'kids_family', name: 'Kids Family', prices: { monthly: 'R$ 44,90', quarterly: 'R$ 101,03', annual: 'R$ 517,25' }, detail: '3 ou mais crianças · até 4 responsáveis', parentBenefits: ['Espaço familiar para 3 ou mais crianças', 'Convide até 4 responsáveis', 'Conversa privada com cada criança'], childBenefits: ['Conversa com os responsáveis da família', 'Envio de fotos e figurinhas', 'Chamadas de voz e vídeo com os dois apps abertos'] },
] as const;

export function BillingPage() {
  const { getToken } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const initialPlan = params.get('plan');
  const [selected, setSelected] = useState<string>(plans.some((plan) => plan.id === initialPlan) ? initialPlan! : 'kids_solo');
  const initialInterval = params.get('interval');
  const [interval, setInterval] = useState<Interval>(intervals.some((option) => option.id === initialInterval) ? initialInterval as Interval : 'monthly');
  const [voucherCode, setVoucherCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const state = params.get('status');
  const activeInterval = intervals.find((option) => option.id === interval)!;

  async function checkout() {
    setBusy(true); setError('');
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/billing/checkout`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selected, interval, ...(voucherCode.trim() ? { voucherCode: voucherCode.trim() } : {}), ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error === 'billing_not_configured' ? 'Este período ainda não está configurado no Stripe. Tente novamente mais tarde.' : data.error === 'invalid_voucher' ? 'Esse voucher não é válido ou expirou.' : data.error === 'invalid_referral_code' ? 'Esse código de indicação não está ativo.' : 'Não foi possível iniciar o checkout.');
      window.location.assign(data.url as string);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao conectar com o Stripe.'); setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f7f2e8] px-4 py-8 text-slate-900"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-teal-900"><ArrowLeft size={16}/> Voltar ao app</Link>
    <div className="mx-auto mt-8 max-w-2xl text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-teal-900 text-white"><ShieldCheck size={27}/></span><p className="mt-5 text-xs font-extrabold uppercase tracking-[.18em] text-teal-800">Planos Ampara Kids</p><h1 className="mt-2 text-4xl font-extrabold tracking-tight">Cuidado próximo para toda a família</h1><p className="mt-3 text-slate-600">Recursos para responsáveis e crianças, com limites claros para cada família.</p></div>
    {state === 'success' && <div role="status" className="mx-auto mt-6 max-w-xl rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center font-semibold text-emerald-900">Pagamento recebido. Estamos confirmando sua assinatura.</div>}
    {state === 'cancelled' && <div role="status" className="mx-auto mt-6 max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-amber-900">Checkout cancelado. Você pode escolher um plano quando quiser.</div>}
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Período de cobrança">{intervals.map((option) => <button key={option.id} type="button" aria-pressed={interval === option.id} onClick={() => setInterval(option.id)} className={`rounded-full border px-5 py-2.5 text-sm font-bold ${interval === option.id ? 'border-teal-900 bg-teal-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{option.label}{option.discount && <span className="ml-2 text-xs">· {option.discount}</span>}</button>)}</div>
    <div className="mt-5 grid gap-4 lg:grid-cols-3">{plans.map((plan) => <article key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${selected === plan.id ? 'border-teal-800 ring-2 ring-teal-800' : 'border-slate-200'}`}><button type="button" onClick={() => setSelected(plan.id)} aria-pressed={selected === plan.id} className="w-full text-left"><span className="text-sm font-bold text-teal-800">{plan.name}</span><p className="mt-3 text-3xl font-extrabold">{plan.prices[interval]}<small className="text-sm font-semibold text-slate-500"> {activeInterval.suffix}</small></p><p className="mt-1 text-sm font-semibold text-slate-600">{plan.detail}</p>{activeInterval.discount && <p className="mt-2 text-xs font-bold text-emerald-800">{activeInterval.discount} em relação à cobrança mensal</p>}</button><div className="mt-5 grid gap-4 border-t pt-4 text-sm"><section><h2 className="mb-2 font-extrabold">Para responsáveis</h2><ul className="grid gap-2">{plan.parentBenefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check size={17} className="shrink-0 text-teal-800"/>{benefit}</li>)}</ul></section><section><h2 className="mb-2 font-extrabold">Para crianças</h2><ul className="grid gap-2">{plan.childBenefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check size={17} className="shrink-0 text-teal-800"/>{benefit}</li>)}</ul></section></div></article>)}</div>
    <div className="mx-auto mt-5 grid max-w-xl gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Voucher de desconto<input className="h-11 rounded-xl border px-3 uppercase" value={voucherCode} onChange={(event) => setVoucherCode(event.target.value)} placeholder="Opcional" /></label><label className="grid gap-1 text-sm font-semibold">Código do embaixador<input className="h-11 rounded-xl border px-3 uppercase" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="Opcional" /></label></div>
    {error && <p role="alert" className="mx-auto mt-4 max-w-xl rounded-xl bg-rose-50 p-3 text-center text-sm font-semibold text-rose-800">{error}</p>}
    <div className="mt-5 text-center"><button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-teal-900 px-8 font-extrabold text-white shadow-lg hover:bg-teal-800 disabled:opacity-60" disabled={busy} onClick={() => void checkout()}>{busy && <LoaderCircle className="animate-spin" size={18}/>} Continuar para pagamento seguro</button><p className="mt-3 text-xs text-slate-500">A cobrança recorrente é processada com segurança pelo Stripe. O período selecionado será renovado automaticamente.</p></div>
  </div></main>;
}

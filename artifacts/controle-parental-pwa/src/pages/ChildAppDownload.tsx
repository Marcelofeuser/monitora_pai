import { useEffect } from 'react';

const androidStoreUrl = import.meta.env.VITE_CHILD_ANDROID_STORE_URL?.trim();
const iosStoreUrl = import.meta.env.VITE_CHILD_IOS_STORE_URL?.trim();

function deviceStoreUrl(): string | null {
  const agent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return iosStoreUrl || null;
  if (/Android/i.test(agent)) return androidStoreUrl || null;
  return null;
}

export function ChildAppDownload() {
  const detectedStore = deviceStoreUrl();

  useEffect(() => {
    if (detectedStore) window.location.replace(detectedStore);
  }, [detectedStore]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-5 py-10 text-[hsl(var(--foreground))]">
      <section className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 text-center shadow-sm">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-2xl text-[hsl(var(--primary-foreground))]">♡</div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Ampara Criança</p>
        <h1 className="text-2xl font-semibold">Instale o app da criança</h1>
        <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Depois da instalação, abra o app e digite o código de 8 dígitos que o responsável gerou no Ampara Responsáveis.</p>
        <div className="mt-6 grid gap-3">
          {iosStoreUrl ? <a className="rounded-xl bg-[hsl(var(--primary))] px-5 py-3 font-semibold text-[hsl(var(--primary-foreground))]" href={iosStoreUrl}>Baixar na App Store</a> : <p className="rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">App iOS ainda não publicado na App Store.</p>}
          {androidStoreUrl ? <a className="rounded-xl bg-[hsl(var(--primary))] px-5 py-3 font-semibold text-[hsl(var(--primary-foreground))]" href={androidStoreUrl}>Baixar no Google Play</a> : <p className="rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">App Android ainda não publicado no Google Play.</p>}
        </div>
      </section>
    </main>
  );
}

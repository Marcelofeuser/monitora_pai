// Avatar de iniciais isolado pra UI de chamada -- mesma lógica de iniciais
// do Avatar em App.tsx, mas com tamanho maior (a tela de chamada precisa de
// um avatar grande, e o Avatar de lá é fixo em 40px) e sem importar de
// App.tsx (evita acoplar a UI de chamada -- que já é um arquivo novo -- de
// volta no arquivo que o plano pediu pra não crescer mais).
export function CallAvatar({ name, size = 112 }: { name?: string; size?: number }) {
  const initials = name?.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-[hsl(var(--accent))] font-extrabold text-[hsl(var(--foreground))]"
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {initials}
    </span>
  );
}

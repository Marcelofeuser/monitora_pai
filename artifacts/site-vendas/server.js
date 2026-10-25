// Servidor estatico simples pra landing page de vendas do Ampara, servida
// em amparakids.com (dominio raiz). Item 14 do pedido: separado do app
// (que agora vive em responsavel.amparakids.com / crianca.amparakids.com)
// pra nao misturar marketing com o SPA autenticado.
import express from "express";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");

// Serve the authenticated PWA's routes through the brand domain. This keeps
// /superadmin (and its sign-in flow) on amparakids.com instead of redirecting
// administrators to a Railway or app-subdomain URL.
const appPaths = [
  "/superadmin", "/billing", "/dashboard", "/conversations", "/invites",
  "/groups", "/meu-chat", "/location", "/screen-time", "/settings",
  "/pair", "/join", "/join-contact", "/aceitar-responsavel", "/contact",
  "/perfil", "/sign-in", "/sign-up", "/baixar/crianca", "/assets",
];

function isPwaPath(pathname) {
  return appPaths.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getPwaOrigin() {
  if (process.env.PWA_UPSTREAM_ORIGIN) return process.env.PWA_UPSTREAM_ORIGIN;
  return process.env.RAILWAY_ENVIRONMENT_NAME === "staging"
    ? "https://pwa-staging-fe26.up.railway.app"
    : "https://responsavel.amparakids.com";
}

app.use(async (req, res, next) => {
  if (!isPwaPath(req.path)) return next();

  try {
    const upstreamOrigin = getPwaOrigin().replace(/\/$/, "");
    const upstreamUrl = new URL(`${req.originalUrl}`, upstreamOrigin);
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("connection");
    // Avoid a compressed upstream body whose length/encoding would no longer
    // match after fetch transparently decompresses it.
    headers.set("accept-encoding", "identity");

    const init = { method: req.method, headers, redirect: "manual" };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = Readable.toWeb(req);
      init.duplex = "half";
    }

    const upstream = await fetch(upstreamUrl, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["connection", "transfer-encoding", "content-length", "content-encoding", "set-cookie"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    const cookies = upstream.headers.getSetCookie?.() ?? [];
    if (cookies.length) res.setHeader("set-cookie", cookies);

    const location = upstream.headers.get("location");
    if (location) {
      try {
        const redirected = new URL(location, upstreamOrigin);
        if (redirected.origin === upstreamOrigin) {
          res.setHeader("location", `${redirected.pathname}${redirected.search}${redirected.hash}`);
        } else {
          res.setHeader("location", location);
        }
      } catch {
        res.setHeader("location", location);
      }
    }

    if (req.method === "HEAD" || !upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error("Falha ao encaminhar rota do app para o PWA:", error instanceof Error ? error.message : "erro desconhecido");
    res.status(502).send("O portal está temporariamente indisponível. Tente novamente em instantes.");
  }
});

app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    maxAge: "1h",
  }),
);

// Pagina unica por enquanto -- qualquer rota desconhecida cai na home.
// OBS (07/09): Express 5 trocou o "path-to-regexp" pra uma versao que nao
// aceita mais "*" sozinho como rota (dava crash no boot: "Missing parameter
// name at index 1: *"). app.use sem path cobre a mesma coisa (qualquer
// requisicao que nao bateu no express.static acima) sem depender da sintaxe
// de wildcard do path-to-regexp.
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`site-vendas ouvindo na porta ${port}`);
});

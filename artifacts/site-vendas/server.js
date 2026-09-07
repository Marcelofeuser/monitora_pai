// Servidor estatico simples pra landing page de vendas do Ampara, servida
// em amparakids.com (dominio raiz). Item 14 do pedido: separado do app
// (que agora vive em responsavel.amparakids.com / crianca.amparakids.com)
// pra nao misturar marketing com o SPA autenticado.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");

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

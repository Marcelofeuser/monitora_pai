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
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`site-vendas ouvindo na porta ${port}`);
});

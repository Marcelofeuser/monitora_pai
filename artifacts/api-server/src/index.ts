// Precisa ser o primeiro import -- ver comentário em instrument.ts.
import "./instrument";
import { createServer } from "node:http";
import app from "./app";
import { attachSignaling } from "./signaling";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Trocado de app.listen(...) direto pra http.createServer(app) explícito --
// necessário pra anexar o servidor de sinalização (Socket.IO, ver
// signaling/index.ts) na MESMA porta do Express (Railway só expõe uma
// porta por serviço). app.listen faz exatamente isso por baixo dos panos
// hoje, então essa troca não muda nenhum comportamento HTTP existente.
const httpServer = createServer(app);
attachSignaling(httpServer);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

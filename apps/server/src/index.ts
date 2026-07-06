import { createServer } from "node:http";
import { Server } from "socket.io";
import { RoomManager } from "./rooms.js";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigin = process.env.CLIENT_ORIGIN ?? "*";

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
});

const io = new Server(httpServer, {
  cors: { origin: allowedOrigin },
  transports: ["websocket", "polling"],
});

const rooms = new RoomManager(io);
io.on("connection", (socket) => rooms.register(socket));
rooms.start();

httpServer.listen(port, () => {
  console.log(`Arena server listening on http://localhost:${port}`);
});

function shutdown(): void {
  rooms.stop();
  io.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


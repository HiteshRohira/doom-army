import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { RoomManager } from "./rooms.js";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigin = process.env.CLIENT_ORIGIN ?? "*";
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(serverDir, "../../client/dist");

const httpServer = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.url?.startsWith("/socket.io/")) return;

  const served = await serveStaticAsset(request.url ?? "/").catch(() => null);
  if (!served) {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, {
    "content-type": served.contentType,
    "cache-control": served.cacheControl,
  });
  response.end(served.body);
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

async function serveStaticAsset(requestUrl: string): Promise<{ body: Buffer; contentType: string; cacheControl: string } | null> {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const hasExtension = path.extname(pathname) !== "";
  const requestedPath = hasExtension ? pathname : "/index.html";
  const filePath = path.resolve(clientDist, `.${requestedPath}`);

  if (!filePath.startsWith(`${clientDist}${path.sep}`)) return null;

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) return null;

  return {
    body: await readFile(filePath),
    contentType: contentTypeFor(filePath),
    cacheControl: requestedPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  };
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

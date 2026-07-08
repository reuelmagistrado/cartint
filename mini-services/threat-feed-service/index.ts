// CARTINT Threat-Feed WebSocket mini-service.
//
// A standalone socket.io server on port 3003 that broadcasts real-time
// threat-intelligence events to connected dashboard clients.
//
// The Next.js app (POST /api/scrape) notifies this service via an internal
// HTTP POST to /notify whenever a scrape completes; the service then emits
// a "threats:new" event to all connected clients with the accepted threat
// count + per-source results.
//
// Clients connect with: io("/?XTransformPort=3003") (path MUST be "/").

import { createServer, type IncomingMessage } from "http";
import { Server } from "socket.io";

const PORT = 3003;

// Create the Socket.IO server FIRST, then attach the HTTP handler.
// This ensures Socket.IO's engine handles /socket.io/ requests before
// our custom routes intercept them.
const io = new Server({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const httpServer = createServer((req, res) => {
  // Set CORS headers on all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Let Socket.IO handle its own requests
  if (req.url?.startsWith("/socket.io/")) {
    return; // Socket.IO engine will handle this
  }

  if (req.method === "POST" && req.url === "/notify") {
    handleNotify(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

// Attach the HTTP server to Socket.IO AFTER defining the request handler
io.attach(httpServer);

interface NotifyPayload {
  source?: string;
  results?: Array<{
    source: string;
    status: string;
    fetched: number;
    accepted: number;
    rejected: number;
    error?: string;
    durationMs: number;
  }>;
  totalAccepted?: number;
  totalRejected?: number;
  timestamp?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

async function handleNotify(req: IncomingMessage, res: any) {
  try {
    const raw = await readBody(req);
    const payload: NotifyPayload = raw ? JSON.parse(raw) : {};
    const totalAccepted =
      payload.totalAccepted ??
      (payload.results ?? []).reduce((s, r) => s + (r.accepted || 0), 0);
    const totalRejected =
      payload.totalRejected ??
      (payload.results ?? []).reduce((s, r) => s + (r.rejected || 0), 0);

    const event = {
      type: payload.source ? "scrape:single" : "scrape:all",
      source: payload.source,
      results: payload.results,
      totalAccepted,
      totalRejected,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      clients: io.engine.clientsCount,
    };

    io.emit("threats:new", event);
    console.log(
      `[threat-feed] broadcast threats:new — ${totalAccepted} accepted / ${totalRejected} rejected to ${io.engine.clientsCount} client(s)`,
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, broadcast: true, clients: io.engine.clientsCount }));
  } catch (e) {
    console.error("[threat-feed] notify error:", e);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
  }
}

io.on("connection", (socket) => {
  console.log(`[threat-feed] client connected (${socket.id}) — total ${io.engine.clientsCount}`);
  socket.emit("connected", {
    id: socket.id,
    timestamp: new Date().toISOString(),
    clients: io.engine.clientsCount,
  });
  socket.on("disconnect", (reason) => {
    console.log(`[threat-feed] client disconnected (${socket.id}): ${reason}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[threat-feed] CARTINT threat-feed WebSocket service listening on port ${PORT}`);
  console.log(`[threat-feed] clients connect via io("/?XTransformPort=${PORT}")`);
  console.log(`[threat-feed] internal notify: POST http://localhost:${PORT}/notify`);
  console.log(`[threat-feed] health: GET http://localhost:${PORT}/health`);
});

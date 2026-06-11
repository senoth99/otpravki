const path = require("path");
const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const { parse } = require("url");
const { logSync } = require("./sync-log.js");

const dir = path.join(__dirname);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== "production";

function getDataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

async function readWorkspaceState() {
  try {
    const host = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
    const res = await fetch(`http://${host}:${port}/api/workspace`, {
      headers: { "Cache-Control": "no-store" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.workspace ?? null;
  } catch {
    return null;
  }
}

function attachWorkspaceSocket(httpServer) {
  const { Server } = require("socket.io");
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    transports: ["polling", "websocket"],
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });

  global.__workspaceIo = io;

  io.on("connection", async (socket) => {
    const workspace = await readWorkspaceState();
    void logSync("socket.connect", {
      socketId: socket.id,
      clients: io.engine.clientsCount,
      revision: workspace?.revision ?? null,
    });

    if (workspace) {
      socket.emit("workspace:sync", workspace);
      void logSync("socket.sync", {
        socketId: socket.id,
        revision: workspace.revision ?? null,
        orders: workspace.orders?.length ?? 0,
      });
    }

    socket.on("disconnect", (reason) => {
      void logSync("socket.disconnect", {
        socketId: socket.id,
        reason,
        clients: io.engine.clientsCount,
      });
    });

    socket.on("workspace:set", async (data) => {
      if (!data?.workspace) return;

      void logSync("socket.set", {
        socketId: socket.id,
        clientId: data.clientId ?? "unknown",
        orders: data.workspace.orders?.length ?? 0,
        updatedAt: data.workspace.updatedAt ?? null,
      });

      try {
        const host = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
        const res = await fetch(`http://${host}:${port}/api/workspace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          void logSync("socket.set.error", { socketId: socket.id, status: res.status });
          console.error("workspace:set API error", res.status);
          return;
        }

        const body = await res.json();
        if (body.workspace) {
          void logSync("socket.set.ok", {
            socketId: socket.id,
            revision: body.workspace.revision,
          });
        }
      } catch (err) {
        void logSync("socket.set.error", { socketId: socket.id, error: err.message });
        console.error("workspace:set failed", err.message);
      }
    });
  });

  return io;
}

async function startDev() {
  const next = require("next");
  const app = next({ dev: true, dir, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  attachWorkspaceSocket(server);

  server.listen(port, hostname, () => {
    console.log(`> Otpravki dev http://${hostname}:${port}`);
  });
}

async function startProd() {
  process.env.NODE_ENV = "production";
  process.chdir(__dirname);

  const required = JSON.parse(
    fs.readFileSync(path.join(dir, ".next", "required-server-files.json"), "utf8"),
  );
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(required.config);

  require("next");
  const { getRequestHandlers } = require("next/dist/server/lib/start-server");

  let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10);
  if (Number.isNaN(keepAliveTimeout) || !Number.isFinite(keepAliveTimeout) || keepAliveTimeout < 0) {
    keepAliveTimeout = undefined;
  }

  let handlersReady;
  let handlersError;
  const handlersPromise = new Promise((resolve, reject) => {
    handlersReady = resolve;
    handlersError = reject;
  });

  let requestHandler;
  let upgradeHandler;

  const server = http.createServer(async (req, res) => {
    try {
      await handlersPromise;
      await requestHandler(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.end("Internal Server Error");
      console.error(err);
    }
  });

  server.on("upgrade", async (req, socket, head) => {
    try {
      await handlersPromise;
      await upgradeHandler(req, socket, head);
    } catch (err) {
      socket.destroy();
      console.error(err);
    }
  });

  if (keepAliveTimeout) {
    server.keepAliveTimeout = keepAliveTimeout;
  }

  attachWorkspaceSocket(server);

  await new Promise((resolve, reject) => {
    server.on("listening", async () => {
      try {
        const initResult = await getRequestHandlers({
          dir,
          port,
          isDev: false,
          server,
          hostname,
          keepAliveTimeout,
        });
        requestHandler = initResult.requestHandler;
        upgradeHandler = initResult.upgradeHandler;
        handlersReady();
        console.log(`> Otpravki ready http://${hostname}:${port}`);
        resolve();
      } catch (err) {
        handlersError(err);
        reject(err);
      }
    });

    server.on("error", (err) => {
      console.error("Failed to start server", err);
      process.exit(1);
    });

    server.listen(port, hostname);
  });
}

if (dev) {
  startDev().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  startProd().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

import http from "http";
import { pushToGitHub } from "./utils/github.js";

const PORT = process.env.PORT || 3000;

// FIX: Optional push-endpoint secret. Set PUSH_SECRET env var to require
// Authorization: Bearer <secret> on POST /push. If unset, the endpoint
// still works (for backward-compat) but logs a warning at startup.
const PUSH_SECRET = process.env.PUSH_SECRET ?? "";
const BODY_LIMIT  = 1024 * 64; // 64 KB — enough for a commit message, blocks DoS

if (!PUSH_SECRET) {
  console.warn("[server] PUSH_SECRET env var is not set — /push endpoint is unauthenticated");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  }

  if (url.pathname === "/push" && req.method === "POST") {
    // FIX: Secret token check when PUSH_SECRET is configured
    if (PUSH_SECRET) {
      const auth = req.headers["authorization"] ?? "";
      const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (provided !== PUSH_SECRET) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
      }
    }

    // FIX: Enforce body size limit to prevent DoS
    let body = "";
    let bodySize = 0;
    req.on("data", chunk => {
      bodySize += chunk.length;
      if (bodySize > BODY_LIMIT) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Request body too large" }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", async () => {
      if (res.headersSent) return; // already rejected above
      try {
        let message = "Update from Yuzuki MD";
        try { message = JSON.parse(body).message || message; } catch {}
        const result = await pushToGitHub(message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("🐋 Yuzuki MD is running");
});

server.listen(PORT, () => {
  console.log(`Health server listening on port ${PORT}`);
});

export default server;

import http from "http";
import { pushToGitHub } from "./utils/github.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  }

  if (url.pathname === "/push" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
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

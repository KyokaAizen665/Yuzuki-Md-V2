import http from "http";

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Yuzuki MD is running");
  }
});

server.listen(PORT, () => {
  console.log(`Health server listening on port ${PORT}`);
});

export default server;

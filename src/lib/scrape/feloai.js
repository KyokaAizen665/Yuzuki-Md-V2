import https from "https";
import crypto from "crypto";

const BASE_URL = "https://felo.ai";
const ACCOUNT_URL = "https://account.felo.ai";
const API_URL = "https://api.felo.ai";

function request(method, baseUrl, urlPath, { body, headers: extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(urlPath, baseUrl);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...extra,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers }); }
          catch { resolve({ status: res.statusCode, data: body, headers: res.headers }); }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getAnonymousToken() {
  const deviceId = crypto.randomUUID();
  const res = await request("POST", ACCOUNT_URL, "/api/auth/anonymous", {
    body: { device_id: deviceId, language: "en" },
  });
  if (!res.data?.access_token) throw new Error("Failed to get Felo token.");
  return res.data.access_token;
}

export class FeloClient {
  constructor({ token } = {}) {
    this.token = token || null;
  }

  async ensureToken() {
    if (!this.token) this.token = await getAnonymousToken();
  }

  async search(query, { lang = "en", think = false } = {}) {
    await this.ensureToken();

    const res = await request("POST", API_URL, "/search", {
      body: { query, search_uuid: crypto.randomUUID(), lang, think },
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (res.status === 401) {
      this.token = await getAnonymousToken();
      return this.search(query, { lang, think });
    }

    return res.data?.data?.answer || res.data;
  }
}

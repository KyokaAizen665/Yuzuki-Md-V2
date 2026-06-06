import https from "https";

// ── Pinterest search — scrape internal API with auth cookies ──────────────
async function getAuth() {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.pinterest.com",
        path: "/",
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      },
      (res) => {
        const cookies = res.headers["set-cookie"] || [];
        const csrfCookie = cookies.find((c) => c.startsWith("csrftoken="));
        const sessCookie = cookies.find((c) =>
          c.startsWith("_pinterest_sess=")
        );
        if (csrfCookie && sessCookie) {
          const csrftoken = csrfCookie.split(";")[0].split("=")[1];
          const cookieHeader =
            csrfCookie.split(";")[0] + "; " + sessCookie.split(";")[0];
          resolve({ csrftoken, cookieHeader });
        } else if (csrfCookie) {
          const csrftoken = csrfCookie.split(";")[0].split("=")[1];
          resolve({ csrftoken, cookieHeader: csrfCookie.split(";")[0] });
        } else {
          reject(new Error("Could not get Pinterest auth cookies."));
        }
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Pinterest auth timed out."));
    });
    req.end();
  });
}

// ── DuckDuckGo image search fallback (site:pinterest.com) ─────────────────
async function ddgPinterestSearch(query, limit = 10) {
  const q = `site:pinterest.com ${query}`;
  // Step 1: get vqd token
  const tokenRes = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(q)}&ia=images`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  const html = await tokenRes.text();
  const vqd =
    html.match(/vqd=['"]([^'"]+)['"]/)?.[1] ||
    html.match(/vqd=([0-9-]+)/)?.[1];
  if (!vqd) throw new Error("Could not get DDG token.");

  // Step 2: fetch image results
  const imgRes = await fetch(
    `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,&p=1`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://duckduckgo.com/",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  const data = await imgRes.json();
  return (data.results || [])
    .filter((r) => r.image && !r.image.includes("gif"))
    .slice(0, limit)
    .map((r) => ({ url: r.image, title: r.title || "", id: r.image }));
}

// ── Main Pinterest search (tries Pinterest API first, DDG fallback) ─────────
export async function searchPinterestAPI(query, limit = 10) {
  // Try Pinterest internal API
  try {
    const { csrftoken, cookieHeader } = await getAuth();
    const results = [];
    let bookmark = null;
    let attempts = 0;

    while (results.length < limit && attempts < 3) {
      attempts++;
      const postData = {
        options: {
          query,
          scope: "pins",
          page_size: 25,
          bookmarks: bookmark ? [bookmark] : [],
        },
        context: {},
      };
      const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
      const body =
        `source_url=${encodeURIComponent(sourceUrl)}` +
        `&data=${encodeURIComponent(JSON.stringify(postData))}`;

      const data = await new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: "www.pinterest.com",
            path: "/resource/BaseSearchResource/get/",
            method: "POST",
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "X-CSRFToken": csrftoken,
              Cookie: cookieHeader,
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            let raw = "";
            res.on("data", (c) => (raw += c));
            res.on("end", () => {
              try {
                resolve(JSON.parse(raw));
              } catch {
                reject(new Error("Pinterest returned invalid JSON."));
              }
            });
          }
        );
        req.on("error", reject);
        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error("Pinterest request timed out."));
        });
        req.write(body);
        req.end();
      });

      const pins = data?.resource_response?.data?.results || [];
      for (const pin of pins) {
        const url =
          pin?.images?.orig?.url ||
          pin?.images?.["736x"]?.url ||
          pin?.image_medium_url;
        if (url) results.push({ url, title: pin?.title || "", id: pin?.id });
        if (results.length >= limit) break;
      }

      bookmark = data?.resource_response?.bookmark;
      if (!bookmark || pins.length === 0) break;
    }

    if (results.length > 0) return results.slice(0, limit);
  } catch { /* fall through to DDG */ }

  // Fallback: DuckDuckGo image search for Pinterest
  return ddgPinterestSearch(query, limit);
}

// ── Pinterest pin URL downloader ───────────────────────────────────────────
export async function downloadPin(pinUrl) {
  // Method 1: scrape og:image / og:video from pin page
  try {
    const r = await fetch(pinUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12000),
    });
    const html = await r.text();
    const vidMatch = html.match(/property="og:video(?::url)?"\s+content="([^"]+)"/);
    const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
    const title = html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] || "Pinterest";

    if (vidMatch?.[1]) return { url: vidMatch[1], type: "video", title };
    if (imgMatch?.[1]) {
      // Upgrade to originals: replace /236x/, /474x/, /736x/ with /originals/
      const origUrl = imgMatch[1].replace(/\/\d+x\d*\//, "/originals/");
      return { url: origUrl, type: "image", title };
    }
  } catch {}

  // Method 2: savepin.app
  try {
    const r = await fetch(
      `https://savepin.app/api.php?url=${encodeURIComponent(pinUrl)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      }
    );
    const d = await r.json();
    const url = d?.url || d?.media?.[0];
    if (url) return { url, type: url.includes(".mp4") ? "video" : "image", title: "Pinterest" };
  } catch {}

  throw new Error("Could not download this Pinterest pin. The post may be private.");
}

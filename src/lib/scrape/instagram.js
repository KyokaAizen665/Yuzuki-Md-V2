import axios from "axios";
import * as cheerio from "cheerio";

// ── Strategy 1: cobalt.tools (free, no key, handles carousels) ──────────────
async function fromCobalt(url) {
  const { data } = await axios.post(
    "https://api.cobalt.tools/api/json",
    { url, isAudioOnly: false },
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: 20000,
    }
  );
  if (data.status === "picker" && Array.isArray(data.picker)) {
    return data.picker.filter((i) => i.url).map((i) => ({
      url: i.url,
      type: i.type === "video" ? "video" : "image",
    }));
  }
  if ((data.status === "redirect" || data.status === "stream") && data.url) {
    return [{ url: data.url, type: data.url.includes(".mp4") ? "video" : "image" }];
  }
  throw new Error(`cobalt: ${data.status || "unknown"}`);
}

// ── Strategy 2: indown.io (original) ────────────────────────────────────────
async function fromIndown(url) {
  const { data: pageData, headers } = await axios.get("https://indown.io/en1", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/115.0.0.0 Safari/537.36" },
    timeout: 15000,
  });
  const $ = cheerio.load(pageData);
  const token = $('input[name="_token"]').val();
  const cookies = headers["set-cookie"]
    ? headers["set-cookie"].map((v) => v.split(";")[0]).join("; ")
    : "";
  if (!token) throw new Error("Token not found");

  const params = new URLSearchParams();
  params.append("referer", "https://indown.io/en1");
  params.append("locale", "en");
  params.append("_token", token);
  params.append("link", url);
  params.append("p", "i");

  const { data: resultData } = await axios.post("https://indown.io/download", params, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/115.0.0.0 Safari/537.36",
    },
    timeout: 20000,
  });

  const $r = cheerio.load(resultData);
  const resultUrls = [];
  $r("video source[src], a[href].btn-outline-primary").each((i, e) => {
    let link = $r(e).attr("src") || $r(e).attr("href");
    if (link) {
      if (link.includes("indown.io/fetch")) {
        try { link = decodeURIComponent(new URL(link).searchParams.get("url")); } catch {}
      }
      if (/cdninstagram\.com|fbcdn\.net/.test(link)) {
        resultUrls.push(link.replace(/&dl=1$/, ""));
      }
    }
  });
  const uniqueUrls = [...new Set(resultUrls)];
  if (!uniqueUrls.length) throw new Error("No media found");
  return uniqueUrls.map((u) => ({ url: u, type: u.includes(".mp4") ? "video" : "image" }));
}

// ── Strategy 3: SnapSave (free, no key) ─────────────────────────────────────
async function fromSnapSave(url) {
  const { data } = await axios.post(
    "https://snapsave.app/action.php",
    new URLSearchParams({ url }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://snapsave.app/",
        Origin: "https://snapsave.app",
      },
      timeout: 20000,
    }
  );
  const $f = cheerio.load(data);
  const links = [];
  $f("a.download__link, a[href*='instagram'], a[href*='fbcdn']").each((_, el) => {
    const href = $f(el).attr("href");
    if (href && href.startsWith("http")) {
      links.push({ url: href, type: href.includes(".mp4") ? "video" : "image" });
    }
  });
  if (!links.length) throw new Error("snapsave: no media found");
  return links;
}

export async function igdl(url) {
  for (const strategy of [fromCobalt, fromIndown, fromSnapSave]) {
    try {
      const items = await strategy(url);
      if (items?.length) return items;
    } catch {}
  }
  throw new Error("Instagram download failed. Try again later.");
}

import axios from "axios";
import * as cheerio from "cheerio";

export async function searchDafont(q) {
  const url = "https://www.dafont.com/search.php?q=" + encodeURIComponent(q);
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const result = [];

  $(".lv1left.dfbg").each((i, el) => {
    const base = $(el);
    const lv2 = base.nextAll(".lv2right").first();
    const dlbox = base.nextAll(".dlbox").first();
    const previewBox = base.nextAll(".preview").first();

    const raw = base.text().replace(/\s+/g, " ").trim();
    const author = base.find("a").first().text().trim();
    const name = raw.replace(/\s*by\s*.+$/i, "").trim();
    const info = lv2.find(".light").text().trim();
    const downloads = info.match(/[\d,]+ downloads/)?.[0] || "Unknown";

    const dl = dlbox.find("a.dl").attr("href");
    const download = dl ? "https:" + dl : null;

    const style = previewBox.attr("style");
    const preview = style
      ? "https://www.dafont.com" + (style.match(/url\((.*?)\)/)?.[1] || "")
      : null;

    if (download) result.push({ name, author, downloads, download, preview });
  });

  return result;
}

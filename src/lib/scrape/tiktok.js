import axios from "axios";

function formatNumber(integer) {
  let numb = parseInt(integer);
  return Number(numb).toLocaleString().replace(/,/g, ".");
}

function formatDate(n) {
  let d = new Date(Number(n) * 1000);
  return d.toLocaleDateString("en", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
}

function formatTikwmResponse(res) {
  let data = [];
  if (res?.duration === 0 && res.images) {
    res.images.forEach((v) => data.push({ type: "photo", url: v }));
  } else {
    let vidUrl = res.hdplay || res.play;
    data.push({
      type: "nowatermark",
      url: vidUrl
        ? vidUrl.startsWith("http")
          ? vidUrl
          : "https://www.tikwm.com" + vidUrl
        : null,
    });
  }

  let musicPlayUrl = res.music_info?.play || res.music || "";
  if (musicPlayUrl && !musicPlayUrl.startsWith("http")) {
    musicPlayUrl = "https://www.tikwm.com" + musicPlayUrl;
  }

  return {
    status: true,
    title: res.title || "No Title",
    taken_at: formatDate(res.create_time),
    region: res.region,
    duration: res.duration + " Seconds",
    data,
    music_info: {
      title: res.music_info?.title || "Original Audio",
      author: res.music_info?.author || "TikTok",
      url: musicPlayUrl,
      cover: res.music_info?.cover || "",
    },
    author: {
      nickname: res.author?.nickname || "Unknown",
      unique_id: res.author?.unique_id || "",
    },
    stats: {
      views: formatNumber(res.play_count || 0),
      likes: formatNumber(res.digg_count || 0),
      comment: formatNumber(res.comment_count || 0),
      share: formatNumber(res.share_count || 0),
    },
  };
}

export async function tiktokDl(url) {
  // Try tikwm API keys if available (set TIKWM_KEY env var, comma-separated)
  const keys = (process.env.TIKWM_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const tryKeys = keys.length ? keys : [null];

  for (const apiKey of tryKeys) {
    try {
      const params = new URLSearchParams({ url, hd: "1" });
      if (apiKey) params.append("api_key", apiKey);

      const { data: res } = await axios.post(
        "https://www.tikwm.com/api/",
        params.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000 }
      );

      if (res?.code === 0 && res?.data) {
        return formatTikwmResponse(res.data);
      }
    } catch {
      continue;
    }
  }

  // Fallback: ssstik
  try {
    const { data } = await axios.get(
      `https://api.ssstik.io/v1?url=${encodeURIComponent(url)}`,
      { timeout: 15000 }
    );
    if (data?.links?.video_hd || data?.links?.video) {
      return {
        status: true,
        title: data.title || "No Title",
        taken_at: "",
        region: "",
        duration: "",
        data: [{ type: "nowatermark", url: data.links?.video_hd || data.links?.video }],
        music_info: { title: "Original Audio", author: "TikTok", url: "", cover: "" },
        author: { nickname: data.author || "Unknown", unique_id: "" },
        stats: { views: "0", likes: "0", comment: "0", share: "0" },
      };
    }
  } catch {}

  throw new Error("Failed to download TikTok video. Try again later.");
}

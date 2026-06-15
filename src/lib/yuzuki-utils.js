export async function fetchBuffer(url, opts = {}) {
  const { default: axios } = await import("axios");
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, ...opts });
  return Buffer.from(res.data);
}

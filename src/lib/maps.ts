const MAP_HOSTS = [
  /(^|\.)google\.[a-z.]+$/i, // google.com/maps, google.com.sa/maps
  /^maps\.app\.goo\.gl$/i,
  /^goo\.gl$/i,
  /^g\.co$/i,
  /^maps\.apple\.com$/i,
  /^(www\.|ul\.)?waze\.com$/i,
];

export type MapUrlResult = { ok: true; url: string; isKnownMap: boolean } | { ok: false; error: string };

/** Validate a location link. Only https URLs are accepted; known map providers are flagged. */
export function validateMapUrl(input: string): MapUrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "الرابط فارغ" };
  if (/\s/.test(raw)) return { ok: false, error: "الرابط غير صالح" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "الرابط غير صالح" };
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return { ok: false, error: "يجب أن يبدأ الرابط بـ https" };
  if (!url.hostname.includes(".") || url.username || url.password) return { ok: false, error: "الرابط غير صالح" };
  const isGoogle = /(^|\.)google\.[a-z.]+$/i.test(url.hostname);
  const isKnownMap =
    MAP_HOSTS.some((re) => re.test(url.hostname)) &&
    (!isGoogle || url.hostname.startsWith("maps.") || url.pathname.startsWith("/maps")) &&
    (url.hostname !== "goo.gl" || url.pathname.startsWith("/maps"));
  const out = url.toString();
  if (out.length > 600) return { ok: false, error: "الرابط طويل جدًا" };
  return { ok: true, url: out, isKnownMap };
}

/* 읽어 주기 (POST /api/tts { text, kind? }) → { audio: base64 MP3 }
   구글 클라우드 Text-to-Speech(자연스러운 한국어 음성, 기본 Chirp 3 HD). 키는 Netlify 환경변수 GOOGLE_TTS_KEY에만 있고 브라우저로 나가지 않는다.
   - 로그인한 이용자(AI 상담 답변 읽기): 구글 ID 토큰을 확인하고 계정(해시)별 하루 글자 수를 센다. 글과 음성은 저장하지 않는다.
   - 로그인하지 않은 이용자(자료실 '음성으로 듣기' 등): 이 누리집 화면에서 보낸 요청만 받고, 접속 주소(IP 해시)별·손님 전체 하루 글자 수 상한을 둔다.
   - 자료실 공개 안내 자료(kind: "library")는 같은 글을 여러 사람이 다시 들을 수 있게 만든 음성을 보관해 두고 다시 쓴다(개인정보 없는 공개 자료만).
   키가 없거나 구글 쪽 오류·하루 한도 초과면 { fallback: true } 를 돌려주고, 화면은 기기(브라우저) 음성으로 대신 읽는다. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const MAX_CHARS = 1500; // 한 번에 읽는 글자(화면이 문장 단위로 나눠 보낸다)
const FALLBACK_VOICE = "ko-KR-Neural2-A";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function synth(key: string, voice: string, text: string) {
  const rate = Number(Netlify.env.get("TTS_RATE") || 0);
  const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "ko-KR", name: voice },
      audioConfig: { audioEncoding: "MP3", ...(rate ? { speakingRate: rate } : {}) },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { audioContent?: string; error?: { message?: string } };
  if (!r.ok || !j.audioContent) throw Object.assign(new Error(j.error?.message || `tts ${r.status}`), { status: r.status });
  return j.audioContent;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ message: "POST만 지원합니다." }, 405);

  /* 누가 듣는지: 로그인(구글 ID 토큰, AI 상담과 같은 확인) 또는 손님 */
  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID");
  const devBypass = context.deploy?.context === "dev" && Netlify.env.get("SEE_ALLOW_ANON") === "true";
  let subject = devBypass ? "dev-local" : "";
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!subject && token && clientId) {
    try {
      const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId,
      });
      if (payload.sub) subject = payload.sub;
    } catch {
      /* 로그인이 만료됐으면 손님으로 */
    }
  }
  const guest = !subject;
  // 손님은 이 누리집 화면에서 보낸 요청만 받는다(다른 사이트가 음성 합성을 끌어 쓰지 못하게)
  if (guest && req.headers.get("origin") !== new URL(req.url).origin) return json({ fallback: true }, 403);

  const key = Netlify.env.get("GOOGLE_TTS_KEY") || "";
  if (!key) return json({ fallback: true });
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!text) return json({ message: "읽을 글이 없습니다." }, 400);
  const voice = Netlify.env.get("TTS_VOICE") || "ko-KR-Chirp3-HD-Aoede";

  /* 자료실 공개 자료: 이미 만든 음성이 있으면 바로 돌려준다(구글 요금·하루 글자 수 없음) */
  let cache: ReturnType<typeof getStore> | null = null;
  let cacheKey = "";
  if (body?.kind === "library") {
    try {
      cache = getStore({ name: "see-tts" });
      cacheKey = `library/${await sha256(`${voice}|${Netlify.env.get("TTS_RATE") || ""}|${text}`)}`;
      const hit = await cache.get(cacheKey);
      if (hit) return json({ audio: hit, voice, cached: true });
    } catch (e) {
      console.warn("tts cache unavailable", e);
      cache = null;
    }
  }

  /* 하루 글자 수 (계정·접속 주소는 해시로만 기록) — 넘으면 기기 음성으로 */
  const perUser = Number(Netlify.env.get(guest ? "TTS_ANON_DAILY_CHARS" : "TTS_DAILY_CHARS") || (guest ? 20_000 : 30_000));
  const perDayTotal = Number(Netlify.env.get("TTS_DAILY_TOTAL") || 300_000);
  const guestTotal = Number(Netlify.env.get("TTS_ANON_DAILY_TOTAL") || 150_000);
  try {
    const store = getStore({ name: "see-usage", consistency: "strong" });
    const day = kstDay();
    const who = guest ? `ip:${context.ip || "unknown"}` : subject;
    const keys = [`tts/${day}/${await sha256(who + (clientId || ""))}`, `tts/${day}/_total`, ...(guest ? [`tts/${day}/_guest`] : [])];
    const used = (await Promise.all(keys.map((k) => store.get(k)))).map((v) => Number(v || 0));
    const n = text.length;
    if (used[0] + n > perUser || used[1] + n > perDayTotal || (guest && used[2] + n > guestTotal)) return json({ fallback: true, limited: true });
    await Promise.all(keys.map((k, i) => store.set(k, String(used[i] + n))));
  } catch (e) {
    console.warn("tts usage store unavailable", e);
  }

  try {
    let used = voice, audio: string;
    try {
      audio = await synth(key, voice, text);
    } catch (e) {
      // 고른 목소리를 못 쓰면 Neural2로 한 번 더
      if (voice === FALLBACK_VOICE || (e as { status?: number }).status !== 400) throw e;
      used = FALLBACK_VOICE;
      audio = await synth(key, FALLBACK_VOICE, text);
    }
    if (cache && used === voice) await cache.set(cacheKey, audio).catch((e) => console.warn("tts cache save", e));
    return json({ audio, voice: used });
  } catch (e) {
    console.error("tts", (e as Error).message);
    return json({ fallback: true });
  }
};

export const config: Config = { path: "/api/tts" };

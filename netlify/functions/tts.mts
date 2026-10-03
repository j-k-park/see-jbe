/* 답변 읽어 주기 (POST /api/tts { text }) → { audio: base64 MP3 }
   구글 클라우드 Text-to-Speech(자연스러운 한국어 음성). 키는 Netlify 환경변수 GOOGLE_TTS_KEY에만 있고 브라우저로 나가지 않는다.
   키가 없거나 구글 쪽 오류·하루 한도 초과면 { fallback: true } 를 돌려주고, 화면은 기기(브라우저) 음성으로 대신 읽는다.
   로그인은 /api/chat과 같이 구글 ID 토큰으로 확인한다. 글은 저장하지 않고 글자 수만 센다. */
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

  /* 로그인 확인 (AI 상담과 같은 구글 로그인) */
  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID");
  const devBypass = context.deploy?.context === "dev" && Netlify.env.get("SEE_ALLOW_ANON") === "true";
  let subject = "dev-local";
  if (!devBypass) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token || !clientId) return json({ message: "로그인이 필요합니다." }, 401);
    try {
      const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId,
      });
      if (!payload.sub) throw new Error("no sub");
      subject = payload.sub;
    } catch {
      return json({ message: "로그인이 만료되었습니다." }, 401);
    }
  }

  const key = Netlify.env.get("GOOGLE_TTS_KEY") || "";
  if (!key) return json({ fallback: true });
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!text) return json({ message: "읽을 글이 없습니다." }, 400);

  /* 하루 글자 수 (계정은 해시로만 기록) — 넘으면 기기 음성으로 */
  const perUser = Number(Netlify.env.get("TTS_DAILY_CHARS") || 30_000);
  const perDayTotal = Number(Netlify.env.get("TTS_DAILY_TOTAL") || 300_000);
  try {
    const store = getStore({ name: "see-usage", consistency: "strong" });
    const day = kstDay();
    const userKey = `tts/${day}/${await sha256(subject + (clientId || ""))}`;
    const [u, t] = await Promise.all([store.get(userKey), store.get(`tts/${day}/_total`)]);
    const used = Number(u || 0), total = Number(t || 0);
    if (used + text.length > perUser || total + text.length > perDayTotal) return json({ fallback: true, limited: true });
    await Promise.all([store.set(userKey, String(used + text.length)), store.set(`tts/${day}/_total`, String(total + text.length))]);
  } catch (e) {
    console.warn("tts usage store unavailable", e);
  }

  const voice = Netlify.env.get("TTS_VOICE") || "ko-KR-Chirp3-HD-Aoede";
  try {
    return json({ audio: await synth(key, voice, text), voice });
  } catch (e) {
    // 고른 목소리를 못 쓰면 Neural2로 한 번 더
    if (voice !== FALLBACK_VOICE && (e as { status?: number }).status === 400) {
      try {
        return json({ audio: await synth(key, FALLBACK_VOICE, text), voice: FALLBACK_VOICE });
      } catch (e2) {
        console.error("tts", (e2 as Error).message);
      }
    } else console.error("tts", (e as Error).message);
    return json({ fallback: true });
  }
};

export const config: Config = { path: "/api/tts" };

/* 구글 로그인 리디렉션 방식의 돌아오는 주소 (POST /api/google-callback)
   팝업을 막는 브라우저(앱 속 브라우저 등)에서도 로그인되도록, 구글이 ID 토큰을 이 주소로 보내면
   서명을 검증한 뒤 브라우저 탭(sessionStorage)에 저장하고 상담 화면으로 돌려보낸다. 서버에는 저장하지 않는다. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Config } from "@netlify/functions";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const page = (script: string) =>
  new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>로그인 중…</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">로그인 중입니다…<script>${script}</script></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

const back = (msg?: string) =>
  page(`${msg ? `alert(${JSON.stringify(msg).replace(/</g, "\\u003c")});` : ""}location.replace("/chat.html");`);

function cookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

export default async (req: Request) => {
  if (req.method !== "POST") return back();
  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return back("로그인 정보를 받지 못했습니다. 다시 시도해 주세요.");
  }
  const credential = String(form.get("credential") || "");
  const csrfBody = String(form.get("g_csrf_token") || "");
  const csrfCookie = cookie(req, "g_csrf_token");
  if (!credential || !clientId) return back("로그인 정보를 받지 못했습니다. 다시 시도해 주세요.");
  if (!csrfBody || csrfBody !== csrfCookie) return back("보안 확인에 실패했습니다. 다시 로그인해 주세요.");

  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (payload.email_verified === false) throw new Error("unverified");
    const session = {
      token: credential,
      exp: payload.exp,
      name: (payload.name as string) || (payload.email as string) || "",
      email: (payload.email as string) || "",
      picture: (payload.picture as string) || "",
    };
    const json = JSON.stringify(session).replace(/</g, "\\u003c");
    return page(`try{sessionStorage.setItem("see.auth",${JSON.stringify(json)});}catch(e){}location.replace("/chat.html");`);
  } catch {
    return back("로그인을 확인하지 못했습니다. 다시 시도해 주세요.");
  }
};

export const config: Config = { path: "/api/google-callback" };

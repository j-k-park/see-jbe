/* 화면에 필요한 공개 설정값 (GET /api/config). 구글 클라이언트 ID는 공개값이다. */
import type { Config, Context } from "@netlify/functions";

export default async (_req: Request, context: Context) => {
  const devBypass = context.deploy?.context === "dev" && Netlify.env.get("SEE_ALLOW_ANON") === "true";
  return Response.json(
    { googleClientId: Netlify.env.get("GOOGLE_CLIENT_ID") || "", devBypass },
    { headers: { "cache-control": "no-store" } }
  );
};

export const config: Config = { path: "/api/config" };

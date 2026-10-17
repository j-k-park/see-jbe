/* AI 연결 경로 — AI 상담(functions/chat.mts)과 같은 환경변수를 쓴다.
   GATEWAY_BASE_URL·GATEWAY_API_KEY가 있으면 게이트웨이를 먼저 쓰고(GATEWAY_MODEL), 실패하면 Anthropic 직접 연결(ANTHROPIC_API_KEY, SEE_MODEL).
   GATEWAY_OFF=true 이면 게이트웨이 설정을 남겨 둔 채 Anthropic만 쓴다. */
export type Route = { label: string; apiKey: string; baseURL?: string; model: string };

export function aiRoutes(): Route[] {
  const list: Route[] = [];
  const gwKey = Netlify.env.get("GATEWAY_API_KEY");
  const gwUrl = Netlify.env.get("GATEWAY_BASE_URL");
  if (gwKey && gwUrl && Netlify.env.get("GATEWAY_OFF") !== "true") {
    list.push({ label: "gateway", apiKey: gwKey, baseURL: gwUrl, model: Netlify.env.get("GATEWAY_MODEL") || "claude-haiku-4-5" });
  }
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (key) list.push({ label: "anthropic", apiKey: key, model: Netlify.env.get("SEE_MODEL") || "claude-haiku-4-5" });
  return list;
}

/* AI 연결 — AI 상담(functions/chat.mts) · 게시판 '말로 남기기' 정리(functions/board.mts) · 관리자 화면(functions/ai-admin.mts)이 함께 쓴다.
   1순위  BAZE 게이트웨이
          - 열쇠: 관리자 화면('담당자와 소통' → 관리자 메뉴 → AI 상담 연결)에서 저장한 열쇠(암호문으로 Blobs에 보관)가 먼저,
                  없으면 Netlify 환경변수 GATEWAY_API_KEY(+ GATEWAY_BASE_URL)
          - 모델: 관리자 화면에서 고른 모델이 먼저, 없으면 환경변수 GATEWAY_MODEL
                  Claude는 Claude 형식(/claude/v1/messages), GPT·Gemini 등은 OpenAI 형식(/chat/completions — shared/oai.mts)으로 부른다
   2순위  Anthropic 직접 연결(ANTHROPIC_API_KEY, SEE_MODEL) — 1순위가 답을 쓰기 전에 실패하면 자동으로 넘어온다
   GATEWAY_OFF=true 이면 게이트웨이 설정을 남겨 둔 채 Anthropic만 쓴다.
   열쇠 원문은 화면·기록·오류 글에 내보내지 않는다(화면에는 끝 네 글자만). */
import Anthropic from "@anthropic-ai/sdk";
import { getStore } from "@netlify/blobs";
import { openaiStream, AiHttpError, type OaiParams } from "./oai.mts";

/** BAZE 게이트웨이 주소. 배포판마다 주소가 달라 열쇠는 발급한 배포판에서만 통한다(2026-11-16 새 열쇠 baze_… 는 api.baze.co). 다른 배포판이면 환경변수 BAZE_ROOT */
export const bazeRoot = () => (Netlify.env.get("BAZE_ROOT") || "https://api.baze.co/v1/gateway").replace(/\/+$/, "");
const DEFAULT_GATEWAY_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_DIRECT_MODEL = "claude-haiku-4-5";

export type Api = "claude" | "openai";
export type ModelInfo = {
  id: string; vendor: string; api: Api; input: number | null; output: number | null;
  maxOut: number | null; context: number | null; lifecycle: string; deprecatedAt: string; replacement: string;
};
export type AiCfg = {
  keyEnc: string; keyTail: string; keyAt: string; keyBy: string;                              // 관리자 화면에서 저장한 BAZE 열쇠
  model: string; api: Api; vendor: string; maxOut: number | null; modelAt: string; modelBy: string; // 관리자 화면에서 고른 모델("" = 고르지 않음)
  updated: string;
};
export type Conn = { key: string; root: string; claudeURL: string; source: "admin" | "env" };
export type Route = {
  label: "gateway" | "anthropic"; apiKey: string; baseURL?: string; root?: string;
  model: string; api: Api; maxOut: number | null; cache: boolean; toolChoiceNone: boolean;
};

/** 회사(BAZE owned_by → 화면 이름)와 보이는 순서. 여기 없는 회사는 '그 밖'으로 묶는다 */
export const VENDORS: [string, string][] = [
  ["claude", "Anthropic Claude"], ["openai", "OpenAI GPT"], ["gemini", "Google Gemini"], ["x-ai", "xAI Grok"],
  ["upstage", "Upstage Solar"], ["perplexity", "Perplexity Sonar"],
];

/* ---------------- 설정 보관(Blobs see-config) ---------------- */
const store = () => getStore({ name: "see-config", consistency: "strong" });
const EMPTY: AiCfg = { keyEnc: "", keyTail: "", keyAt: "", keyBy: "", model: "", api: "claude", vendor: "claude", maxOut: null, modelAt: "", modelBy: "", updated: "" };
/** 저장소를 못 읽으면 빈 설정(= 환경변수만 쓰던 예전 동작)으로 */
export async function getCfg(): Promise<AiCfg> {
  try {
    return { ...EMPTY, ...(((await store().get("ai", { type: "json" })) as Partial<AiCfg> | null) || {}) };
  } catch (e) {
    console.warn("ai config store unavailable", (e as Error).message);
    return { ...EMPTY };
  }
}
export const setCfg = (cfg: AiCfg) => store().setJSON("ai", cfg);

/* ---------------- 열쇠 암호화(AES-256-GCM) ----------------
   암호 열쇠는 서버 비밀값에서 만든다: DATA_KEY가 있으면 그것, 없으면 GOOGLE_CLIENT_SECRET, 없으면 ANTHROPIC_API_KEY.
   그 비밀값을 바꾸면 저장한 BAZE 열쇠를 읽을 수 없으니 관리자 화면에서 다시 넣는다. */
const te = new TextEncoder(), td = new TextDecoder();
const localPreview = () => Netlify.env.get("SEE_ALLOW_ANON") === "true" && (Netlify.env.get("NETLIFY_DEV") === "true" || Netlify.env.get("CONTEXT") === "dev");
function secretSrc() {
  return Netlify.env.get("DATA_KEY") || Netlify.env.get("GOOGLE_CLIENT_SECRET") || Netlify.env.get("ANTHROPIC_API_KEY") || (localPreview() ? "see-local-preview-only" : "");
}
async function aesKey() {
  const src = secretSrc();
  if (!src) throw new Error("서버 비밀값 없음");
  const d = await crypto.subtle.digest("SHA-256", te.encode("see-jbe|ai-key|" + src));
  return crypto.subtle.importKey("raw", d, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
const b64u = (u: ArrayBuffer | Uint8Array) => Buffer.from(u instanceof Uint8Array ? u : new Uint8Array(u)).toString("base64url");
const unb64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
export const canSeal = () => !!secretSrc();
export async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), te.encode(text));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}
/** 못 풀면 "" */
export async function unseal(box: string): Promise<string> {
  try {
    const [v, iv, ct] = String(box || "").split(".");
    if (v !== "v1" || !iv || !ct) return "";
    return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(), unb64u(ct)));
  } catch {
    return "";
  }
}

/* ---------------- 게이트웨이 연결·모델 ---------------- */
export const gatewayOff = () => Netlify.env.get("GATEWAY_OFF") === "true";
export async function gatewayConn(cfg: AiCfg): Promise<Conn | null> {
  if (gatewayOff()) return null;
  const adminKey = cfg.keyEnc ? await unseal(cfg.keyEnc) : "";
  if (adminKey) return { key: adminKey, root: bazeRoot(), claudeURL: `${bazeRoot()}/claude`, source: "admin" };
  const key = Netlify.env.get("GATEWAY_API_KEY") || "";
  const url = (Netlify.env.get("GATEWAY_BASE_URL") || "").replace(/\/+$/, "");
  if (key && url) return { key, root: url.replace(/\/claude$/, ""), claudeURL: url, source: "env" };
  return null;
}
/** 게이트웨이에서 쓸 모델: 관리자가 고른 것 → 환경변수 GATEWAY_MODEL → 기본 */
export function modelOf(cfg: AiCfg) {
  if (cfg.model) return { id: cfg.model, api: cfg.api || ("claude" as Api), vendor: cfg.vendor || "claude", maxOut: cfg.maxOut ?? null, picked: true };
  return { id: Netlify.env.get("GATEWAY_MODEL") || DEFAULT_GATEWAY_MODEL, api: "claude" as Api, vendor: "claude", maxOut: null as number | null, picked: false };
}
export const directModel = () => Netlify.env.get("SEE_MODEL") || DEFAULT_DIRECT_MODEL;

export function gatewayRoute(conn: Conn, m: { id: string; api: Api; maxOut: number | null }): Route {
  return {
    label: "gateway", apiKey: conn.key, baseURL: conn.claudeURL, root: conn.root, model: m.id, api: m.api, maxOut: m.maxOut,
    cache: Netlify.env.get("GATEWAY_PROMPT_CACHE") !== "off", // 캐싱을 못 받는 중계라면 off
    toolChoiceNone: Netlify.env.get("GATEWAY_TOOL_CHOICE_NONE") !== "off",
  };
}

/** 부를 차례: 게이트웨이(있으면) → Anthropic 직접 연결(있으면) */
export async function aiRoutes(): Promise<Route[]> {
  const list: Route[] = [];
  const cfg = await getCfg();
  const conn = await gatewayConn(cfg).catch(() => null);
  if (conn) list.push(gatewayRoute(conn, modelOf(cfg)));
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (key) list.push({ label: "anthropic", apiKey: key, model: directModel(), api: "claude", maxOut: null, cache: true, toolChoiceNone: true });
  return list;
}

/* ---------------- 부르기 ---------------- */
export type StreamLike = { on(ev: "text", h: (t: string) => void): unknown; finalMessage(): Promise<Anthropic.Message> };
/** route에 맞는 스트리밍 함수: stream(params).on("text") / finalMessage() — params는 Claude 형식 */
export function streamFor(route: Route, timeout = 50_000) {
  if (route.api === "openai") {
    return (params: Record<string, unknown>) =>
      openaiStream({ root: route.root || bazeRoot(), apiKey: route.apiKey, timeout }, { id: route.model, maxOut: route.maxOut }, params as OaiParams) as unknown as StreamLike;
  }
  const client = new Anthropic({ apiKey: route.apiKey, baseURL: route.baseURL, maxRetries: 1, timeout });
  return (params: Record<string, unknown>) => client.messages.stream(params as unknown as Anthropic.MessageStreamParams) as unknown as StreamLike;
}
/** 도구 없이 한 번 묻고 글만 받기 */
export async function completeText(route: Route, params: { system: string; messages: { role: "user" | "assistant"; content: string }[]; max_tokens: number }, timeout = 45_000) {
  const msg = await streamFor(route, timeout)({ model: route.model, ...params }).finalMessage();
  return { text: msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""), msg };
}
/** 기록에 남길 짧은 오류 설명(열쇠는 들어 있지 않다) */
export const errorBrief = (e: unknown) =>
  e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e instanceof AiHttpError ? e.message : e instanceof Error ? e.message : String(e);
export const errorStatus = (e: unknown) => (e instanceof Anthropic.APIError ? e.status ?? 0 : e instanceof AiHttpError ? e.status : 0);

/* ---------------- BAZE 모델 목록·크레딧(관리자 화면) ---------------- */
const CHAT_EP = "/v1/gateway/chat/completions", CLAUDE_EP = "/v1/gateway/claude/v1/messages";
/** BAZE 모델 한 개 → 대화에 쓸 수 있으면 요약, 아니면 null(그림·음성·영상 등) */
function usable(m: Record<string, any>): ModelInfo | null {
  const id = String(m?.id || "");
  if (!id || m?.type !== "llm" || /audio|realtime|tts|embed|rerank/i.test(id)) return null;
  const vendor = String(m.owned_by || "");
  const eps: string[] | null = Array.isArray(m.endpoints) ? m.endpoints.map((e: unknown) => String(e).replace(/\/+$/, "")) : null;
  let api: Api | null;
  if (eps) api = vendor === "claude" && eps.includes(CLAUDE_EP) ? "claude" : eps.includes(CHAT_EP) ? "openai" : null;
  // 목록에 주소 정보가 없으면: Claude는 Claude 형식, 나머지는 OpenAI 형식(gpt-…-pro는 다른 주소 전용이라 뺀다)
  else api = vendor === "claude" ? "claude" : /^gpt-[\d.]+-pro$/.test(id) ? null : "openai";
  if (!api) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id, vendor, api, input: num(m.pricing?.input), output: num(m.pricing?.output),
    maxOut: num(m.max_output_tokens), context: num(m.context_limit),
    lifecycle: String(m.lifecycle || ""), deprecatedAt: String(m.deprecated_at || ""), replacement: String(m.replacement || ""),
  };
}
const headers = (key: string) => ({ Authorization: `Bearer ${key}`, "User-Agent": "see-jbe" });
/** BAZE에서 목록을 새로 받는다. 실패하면 status가 붙은 오류 */
export async function fetchModels(conn: { key: string; root: string }): Promise<ModelInfo[]> {
  let r: Response;
  try {
    r = await fetch(`${conn.root}/models/?type=llm`, { headers: headers(conn.key), signal: AbortSignal.timeout(8000) });
  } catch (e) {
    throw Object.assign(new Error(`models ${(e as Error).message}`), { status: 0 });
  }
  if (!r.ok) throw Object.assign(new Error(`models ${r.status}`), { status: r.status });
  const j = (await r.json().catch(() => ({}))) as { data?: Record<string, any>[] };
  const models = (j.data || []).map(usable).filter((x): x is ModelInfo => !!x);
  if (!models.length) throw Object.assign(new Error("models 빈 목록"), { status: 0 });
  return models;
}
async function tagOf(conn: { key: string; root: string }) {
  const d = await crypto.subtle.digest("SHA-256", te.encode(conn.root + "|" + conn.key));
  return b64u(d).slice(0, 16);
}
export async function saveModels(conn: { key: string; root: string }, models: ModelInfo[]) {
  const out = { tag: await tagOf(conn), models, fetchedAt: new Date().toISOString() };
  await store().setJSON("ai-models", out).catch(() => {});
  return out;
}
/** 고를 수 있는 모델 목록: BAZE에서 받아 하루 보관(refresh=true면 새로). 열쇠·주소가 바뀌면 새로 받는다 */
export async function modelList(conn: Conn | null, refresh = false): Promise<{ models: ModelInfo[]; fetchedAt: string; note: string }> {
  if (!conn) return { models: [], fetchedAt: "", note: "BAZE 열쇠를 저장하면 고를 수 있는 모델 목록을 받아 와요." };
  const tag = await tagOf(conn);
  const saved = (await store().get("ai-models", { type: "json" }).catch(() => null)) as { tag: string; models: ModelInfo[]; fetchedAt: string } | null;
  const mine = saved && saved.tag === tag && saved.models?.length ? saved : null;
  if (!refresh && mine && Date.now() - Date.parse(mine.fetchedAt) < 24 * 3600e3) return { models: mine.models, fetchedAt: mine.fetchedAt, note: "" };
  try {
    const out = await saveModels(conn, await fetchModels(conn));
    return { models: out.models, fetchedAt: out.fetchedAt, note: "" };
  } catch (e) {
    console.error("baze model list", (e as Error).message);
    if (mine) return { models: mine.models, fetchedAt: mine.fetchedAt, note: "BAZE에서 새 목록을 받지 못해 지난번 목록을 보여 줘요." };
    const st = (e as { status?: number }).status;
    return {
      models: [], fetchedAt: "",
      note: st === 401 ? "이 열쇠로는 BAZE에 들어갈 수 없어요(401). 열쇠가 맞는지, 이 주소에서 발급한 열쇠인지 확인해 주세요." : "BAZE에서 모델 목록을 받지 못했어요. 잠시 뒤 '목록 새로 받기'를 눌러 주세요.",
    };
  }
}
/** 남은 BAZE 크레딧 */
export async function credits(conn: Conn | null): Promise<{ remaining: number; quota: number; renewal: string } | { error: string } | null> {
  if (!conn) return null;
  try {
    const r = await fetch(`${conn.root}/credits/`, { headers: headers(conn.key), signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { error: r.status === 401 ? "열쇠가 올바르지 않아요." : `확인하지 못했어요(${r.status}).` };
    const d = (await r.json()) as Record<string, any>;
    const t = d.total || d;
    const remaining = Number(t.remaining), quota = Number(t.quota);
    if (!Number.isFinite(remaining)) return { error: "확인하지 못했어요." };
    return { remaining, quota: Number.isFinite(quota) ? quota : NaN, renewal: String(d.renewal_date || "") };
  } catch {
    return { error: "BAZE에 연결하지 못했어요." };
  }
}

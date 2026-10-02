/* AI 상담 SEE — 서버 함수 (POST /api/chat)
   1) 구글 ID 토큰 검증 → 2) 하루 이용 횟수 확인 → 3) Claude 호출(도구 사용 루프) → 4) SSE로 스트리밍
   API 키는 Netlify 환경변수(ANTHROPIC_API_KEY, 게이트웨이 사용 시 GATEWAY_API_KEY)에만 있고 브라우저로 나가지 않는다.
   대화 내용은 저장하지 않는다. 연결 경로는 aiRoutes() 참고 — 게이트웨이를 쓰더라도 실패하면 Anthropic 직접 연결로 되돌아간다. */
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { SYSTEM_PROMPT } from "../shared/knowledge.mts";
import institutions from "../../data/institutions.json";
import therapy from "../../data/therapy.json";

type Inst = (typeof institutions.items)[number] & Record<string, unknown>;

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const MAX_TURNS = 4;
const REGIONS = institutions.regions as string[];
const PAGES = ["step1", "step2", "step3", "step4", "step5", "library", "faq"] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_institutions",
    description:
      "전북 지역 특수교육 관련 기관을 검색한다. 특수학급이 설치된 공립유치원(kinder), 특수학교(special), 교육지원청 특수교육지원센터(center), 장애아전문·장애아통합 어린이집(daycare) 자료가 있다. 기관 이름·주소·전화·특수학급 수 질문에 사용한다.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", enum: REGIONS, description: "시·군 이름(예: 전주, 익산). 지역 구분이 없으면 생략" },
        types: { type: "array", items: { type: "string", enum: ["kinder", "special", "center", "daycare"] }, description: "찾을 기관 유형. 생략하면 전체" },
        keyword: { type: "string", description: "기관 이름이나 주소 일부(예: 문정, 효자로)" },
        preschool_only: { type: "boolean", description: "유치원 과정(유아)이 있는 곳만" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_therapy_providers",
    description:
      "교육청 치료지원(꿈활짝카드) 가맹 치료기관을 검색한다(2026.5.1. 기준 158곳). 언어·놀이·감각통합 등 치료를 어디서 받을 수 있는지, 지역별 치료기관·발달센터 질문에 사용한다. 기관별 제공 영역 정보는 없으므로 영역은 기관에 확인하도록 안내한다.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", enum: [...REGIONS, "도외"], description: "시·군 이름. 전북 밖은 '도외'. 생략하면 전체" },
        keyword: { type: "string", description: "기관 이름이나 주소 일부(예: 언어, 감각, 백제대로)" },
        rehab_only: { type: "boolean", description: "보건복지부 발달재활서비스 지정기관만" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_document",
    description:
      "보호자가 저장·인쇄할 수 있는 문서(체크리스트, 안내문, 상담 질문지, 요약본 등)를 만들어 화면에 파일 저장 카드로 보여 준다. 사용자가 무언가를 만들어 달라거나 정리해 달라거나 저장하고 싶다고 할 때 사용한다.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "문서 제목 (40자 이내)" },
        markdown: { type: "string", description: "문서 본문. ### 소제목, - 목록, 1. 번호, [ ] 체크칸을 쓴다. 개인정보 칸은 빈칸(____)으로 둔다." },
      },
      required: ["title", "markdown"],
      additionalProperties: false,
    },
  },
  {
    name: "open_page",
    description: "누리집의 관련 페이지 바로가기 버튼을 답변 아래에 붙인다. step1 발달 정보, step2 선별검사, step3 결과별 가이드, step4 선정 절차·지원, step5 기관 찾기 지도, library 자료실, faq 자주 묻는 질문.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "string", enum: [...PAGES] },
        label: { type: "string", description: "버튼 문구 (20자 이내)" },
      },
      required: ["page"],
      additionalProperties: false,
    },
  },
];

const TYPE_KO: Record<string, string> = { kinder: "특수학급 설치 유치원", special: "특수학교", center: "특수교육지원센터", daycare: "어린이집" };

function searchInstitutions(input: { region?: string; types?: string[]; keyword?: string; preschool_only?: boolean }) {
  const items = (institutions.items as Inst[]).filter((it) => {
    if (input.region && it.region !== input.region) return false;
    if (input.types?.length && !input.types.includes(it.type)) return false;
    if (input.keyword && !`${it.name} ${it.address ?? ""}`.includes(input.keyword)) return false;
    if (input.preschool_only) {
      const courses = (it.courses as string[] | undefined) ?? [];
      if (!(it.type === "kinder" || it.type === "daycare" || (it.type === "special" && courses.includes("유")))) return false;
    }
    return true;
  });
  const slim = items.map((it) => ({
    id: it.id,
    name: it.name,
    type: it.type,
    kind: it.type === "daycare" ? (it.daycareKind === "special" ? "장애아전문" : "장애아통합") : it.type === "kinder" ? it.kinderKind : undefined,
    region: it.region,
    address: it.address,
    phone: it.phone,
    classes: it.classes,
    courses: it.courses,
    area: it.area,
  }));
  return { total: items.length, items: slim };
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function cleanHistory(raw: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, m.role === "user" ? 1000 : 3000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ message: "POST만 지원합니다." }, 405);

  /* 1) 로그인 확인 */
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
      if (!payload.sub || payload.email_verified === false) throw new Error("unverified");
      subject = payload.sub;
    } catch {
      return json({ message: "로그인이 만료되었거나 확인되지 않았습니다. 다시 로그인해 주세요." }, 401);
    }
  }

  /* 2) 입력 검사 */
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ message: "요청 형식이 올바르지 않습니다." }, 400);
  }
  const history = cleanHistory(body.messages);
  if (!history) return json({ message: "질문을 입력해 주세요." }, 400);

  /* 3) 하루 이용 횟수 (계정은 해시로만 기록) */
  const perUser = Number(Netlify.env.get("DAILY_LIMIT") || 30);
  const perDayTotal = Number(Netlify.env.get("DAILY_TOTAL_LIMIT") || 2000);
  let remaining = perUser;
  try {
    const store = getStore({ name: "see-usage", consistency: "strong" });
    const day = kstDay();
    const userKey = `${day}/${await sha256(subject + (clientId || ""))}`;
    const [u, t] = await Promise.all([store.get(userKey), store.get(`${day}/_total`)]);
    const used = Number(u || 0), total = Number(t || 0);
    if (used >= perUser) return json({ message: `오늘 이용 가능한 질문 수(${perUser}회)를 모두 사용했어요. 내일 다시 이용해 주세요.` }, 429);
    if (total >= perDayTotal) return json({ message: "오늘 상담 이용량이 많아 잠시 멈췄어요. 내일 다시 이용해 주세요." }, 429);
    await Promise.all([store.set(userKey, String(used + 1)), store.set(`${day}/_total`, String(total + 1))]);
    remaining = perUser - used - 1;
  } catch (e) {
    console.warn("usage store unavailable", e);
  }

  const routes = aiRoutes();
  if (!routes.length) return json({ message: "AI 연결 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요." }, 503);

  /* 4) 스트리밍 응답 — 앞 경로가 실패하면 다음 경로(보통 Anthropic 직접 연결)로 자동 전환 */
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sse(event, data)));
      send("usage", { remaining });

      for (let r = 0; r < routes.length; r++) {
        const route = routes[r];
        const hasBackup = r < routes.length - 1;
        let wrote = false;
        try {
          await runConversation(route, history, send, () => (wrote = true));
          break;
        } catch (e) {
          const message = errorMessage(e, route);
          if (wrote || !hasBackup) {
            send("error", { message });
            break;
          }
          console.warn(`[${route.label}] 실패 → ${routes[r + 1].label}(으)로 전환`, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
          send("status", { label: "다른 연결로 다시 시도하고 있어요…" });
        }
      }
      send("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
};

/* ---------- AI 연결 경로 ----------
   기본은 Anthropic 직접 연결. GATEWAY_BASE_URL과 GATEWAY_API_KEY를 넣으면 게이트웨이를 먼저 쓰고,
   게이트웨이가 실패하면(응답 전이라면) 자동으로 Anthropic 직접 연결로 되돌아간다.
   환경변수를 지우면 즉시 지금처럼 Anthropic만 쓴다. */
type Route = { label: string; apiKey: string; baseURL?: string; model: string; cache: boolean; toolChoiceNone: boolean };

function aiRoutes(): Route[] {
  const list: Route[] = [];
  const gwKey = Netlify.env.get("GATEWAY_API_KEY");
  const gwUrl = Netlify.env.get("GATEWAY_BASE_URL");
  if (gwKey && gwUrl && Netlify.env.get("GATEWAY_OFF") !== "true") {
    list.push({
      label: "gateway",
      apiKey: gwKey,
      baseURL: gwUrl,
      model: Netlify.env.get("GATEWAY_MODEL") || "claude-haiku-4-5",
      cache: Netlify.env.get("GATEWAY_PROMPT_CACHE") !== "off", // 캐싱을 못 받는 중계라면 off
      toolChoiceNone: Netlify.env.get("GATEWAY_TOOL_CHOICE_NONE") !== "off",
    });
  }
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (key) {
    list.push({
      label: "anthropic",
      apiKey: key,
      model: Netlify.env.get("SEE_MODEL") || "claude-haiku-4-5",
      cache: true,
      toolChoiceNone: true,
    });
  }
  return list;
}

function errorMessage(e: unknown, route: Route): string {
  if (e instanceof Anthropic.RateLimitError) return "지금 이용자가 많아요. 1분 정도 뒤에 다시 물어봐 주세요.";
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "AI 연결 설정에 문제가 있어요. 관리자에게 알려 주세요.";
  if (e instanceof Anthropic.APIError) console.error(`[${route.label}]`, e.status, e.message);
  else console.error(`[${route.label}]`, e);
  return "SEE가 잠시 응답하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

async function runConversation(
  route: Route,
  history: Anthropic.MessageParam[],
  send: (e: string, d: unknown) => void,
  markWrote: () => void
) {
  const client = new Anthropic({ apiKey: route.apiKey, baseURL: route.baseURL, maxRetries: 1, timeout: 50_000 });
  const messages: Anthropic.MessageParam[] = [...history];
  let wrote = false;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const last = turn === MAX_TURNS - 1;
    const s = client.messages.stream({
      model: route.model,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, ...(route.cache ? { cache_control: { type: "ephemeral" as const } } : {}) }],
      tools: TOOLS,
      ...(last && route.toolChoiceNone ? { tool_choice: { type: "none" as const } } : turn === 0 ? {} : { tool_choice: { type: "auto" as const } }),
      messages,
    });
    let sep = wrote;
    s.on("text", (t) => {
      if (sep) { send("text", { t: "\n\n" }); sep = false; }
      wrote = true;
      markWrote();
      send("text", { t });
    });
    const msg = await s.finalMessage();

    if (msg.stop_reason === "refusal") {
      send("text", { t: (wrote ? "\n\n" : "") + "이 질문에는 답변드리기 어려워요. 영유아 발달이나 특수교육 지원에 관해 다시 물어봐 주세요." });
      markWrote();
      return;
    }
    if (msg.stop_reason !== "tool_use") break; // 답변이 비어 있으면 아래에서 오류로 보고 다음 경로로 넘어간다

    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      try {
        results.push({ type: "tool_result", tool_use_id: block.id, content: runTool(block.name, block.input as Record<string, unknown>, send) });
      } catch {
        results.push({ type: "tool_result", tool_use_id: block.id, content: "도구 실행 중 오류가 발생했습니다.", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  if (!wrote) throw new Error("답변 텍스트가 오지 않았습니다.");
}

function runTool(name: string, input: Record<string, unknown>, send: (e: string, d: unknown) => void): string {
  if (name === "search_institutions") {
    send("status", { label: "기관을 찾고 있어요…" });
    const q = input as { region?: string; types?: string[]; keyword?: string; preschool_only?: boolean };
    const r = searchInstitutions(q);
    if (r.total) {
      const filter: Record<string, string> = {};
      if (q.types?.length) filter.type = q.types.join(",");
      if (q.region) filter.region = q.region;
      if (q.keyword) filter.q = q.keyword;
      if (q.preschool_only) filter.preschool = "1";
      send("institutions", { total: r.total, items: r.items.slice(0, 8), filter });
    }
    const shown = r.items.slice(0, 15);
    return JSON.stringify({
      total: r.total,
      note: r.total ? "화면에 기관 카드(최대 8곳)와 지도 링크가 표시되었습니다. 답변에서 전체 목록을 반복하지 마세요." : "조건에 맞는 기관이 없습니다. 조건을 넓혀 다시 찾거나 관할 특수교육지원센터를 안내하세요.",
      items: shown.map((i) => ({ ...i, type: TYPE_KO[i.type] ?? i.type })),
    });
  }
  if (name === "search_therapy_providers") {
    send("status", { label: "치료지원 기관을 찾고 있어요…" });
    const q = input as { region?: string; keyword?: string; rehab_only?: boolean };
    const items = therapy.items.filter((i) =>
      (!q.region || (q.region === "도외" ? !i.local : i.local && i.region === q.region)) &&
      (!q.keyword || `${i.name} ${i.address}`.includes(q.keyword)) &&
      (!q.rehab_only || i.rehab)
    );
    if (items.length) {
      const filter: Record<string, string> = {};
      if (q.region && q.region !== "도외") filter.region = q.region;
      send("therapy", { total: items.length, items: items.slice(0, 8), filter });
    }
    return JSON.stringify({
      total: items.length,
      asOf: therapy.asOf,
      note: items.length
        ? "화면에 기관 카드(최대 8곳)와 전체 목록 링크가 표시되었습니다. 목록을 반복하지 말고, 제공 치료 영역과 꿈활짝카드 결제 가능 여부는 기관에 전화로 확인하도록 안내하세요."
        : "조건에 맞는 가맹점이 없습니다. 이웃 시·군을 찾아보거나 관할 특수교육지원센터 순회치료 지원을 안내하세요.",
      items: items.slice(0, 15).map(({ name, region, address, phone, rehab }) => ({ name, region, address, phone, 발달재활지정: rehab })),
    });
  }
  if (name === "create_document") {
    send("status", { label: "문서를 만들고 있어요…" });
    const title = String(input.title || "SEE 안내 자료").slice(0, 60);
    const markdown = String(input.markdown || "").slice(0, 8000);
    send("document", { title, markdown });
    return "문서 카드가 화면에 표시되었고, 보호자가 PDF·워드·텍스트로 저장할 수 있습니다. 답변에서는 문서 내용을 다시 옮겨 적지 말고 무엇을 담았는지 한두 문장으로 안내하세요.";
  }
  if (name === "open_page") {
    const page = String(input.page || "");
    if (!(PAGES as readonly string[]).includes(page)) return "알 수 없는 페이지입니다.";
    send("link", { page, label: input.label ? String(input.label).slice(0, 30) : undefined });
    return "바로가기 버튼을 표시했습니다.";
  }
  throw new Error("unknown tool");
}

export const config: Config = { path: "/api/chat" };

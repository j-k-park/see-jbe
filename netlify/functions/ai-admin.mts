/* 관리자 화면 'AI 상담 연결 · BAZE' ('담당자와 소통' 게시판의 관리자 메뉴) — 최고·협력관리자만
   GET  /api/admin/ai[?refresh=1]   지금 연결·열쇠 상태(끝 네 글자만)·쓰는 모델·BAZE 모델 목록·남은 크레딧
   POST /api/admin/ai {action}
        key    {key}      BAZE 열쇠 저장(BAZE에 물어 통하는 열쇠인지 먼저 확인, 암호문으로 보관)
        forget            저장한 열쇠 지우기 → Netlify 환경변수의 열쇠로 돌아감
        model  {model}    목록에서 고른 모델로 바꾸기("" = 고르기 전 기본으로)
        test   {model,q}  고른 모델(바꾸기 전이어도)로 시험 질문 하나 — 실제 상담과 같은 지침으로, 도구 없이
   열쇠 원문은 응답·기록에 내보내지 않는다. 연결 규칙은 netlify/shared/ai.mts */
import type { Config, Context } from "@netlify/functions";
import { getUser } from "../shared/user.mts";
import {
  getCfg, setCfg, gatewayConn, gatewayRoute, gatewayOff, modelOf, directModel, modelList, fetchModels, saveModels, credits,
  completeText, errorBrief, errorStatus, seal, canSeal, bazeRoot, VENDORS, type AiCfg,
} from "../shared/ai.mts";
import { AiHttpError } from "../shared/oai.mts";
import { SYSTEM_PROMPT } from "../shared/knowledge.mts";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, message: string) => json({ message }, status);
const hostOf = (root: string) => { try { return new URL(root).host; } catch { return root; } };

async function view(refresh = false) {
  const cfg = await getCfg();
  const conn = await gatewayConn(cfg).catch(() => null);
  const [list, cr] = await Promise.all([modelList(conn, refresh), credits(conn)]);
  const cur = modelOf(cfg);
  return {
    ready: !!conn,
    source: conn?.source || "none", // admin: 이 화면에서 저장한 열쇠 · env: Netlify 환경변수의 열쇠 · none: 없음
    host: hostOf(conn?.root || bazeRoot()),
    off: gatewayOff(),
    key: {
      saved: !!cfg.keyEnc, broken: !!cfg.keyEnc && conn?.source !== "admin" && !gatewayOff(), // 저장은 돼 있는데 풀지 못함(서버 비밀값이 바뀜)
      tail: cfg.keyTail, at: cfg.keyAt, by: cfg.keyBy, env: !!(Netlify.env.get("GATEWAY_API_KEY") && Netlify.env.get("GATEWAY_BASE_URL")),
    },
    current: { id: cur.id, api: cur.api, vendor: cur.vendor, picked: cur.picked, inList: list.models.some((m) => m.id === cur.id) },
    modelAt: cfg.modelAt, modelBy: cfg.modelBy,
    models: list.models, vendors: VENDORS, fetchedAt: list.fetchedAt, note: list.note,
    credits: cr,
    backup: { ready: !!Netlify.env.get("ANTHROPIC_API_KEY"), model: directModel() },
  };
}

export default async (req: Request, context: Context) => {
  const m = req.method;
  try {
    // 로컬 미리보기(netlify dev + SEE_ALLOW_ANON)에서는 로그인 없이 화면을 볼 수 있다 — AI 상담(chat.mts)과 같은 조건
    const devBypass = context.deploy?.context === "dev" && Netlify.env.get("SEE_ALLOW_ANON") === "true";
    const user = devBypass ? { name: "미리보기 관리자", admin: true } : await getUser(req);
    if (!user) return fail(401, "로그인이 필요해요.");
    if (!user.admin) return fail(403, "관리자만 쓸 수 있어요.");

    if (m === "GET") return json(await view(new URL(req.url).searchParams.get("refresh") === "1"));
    if (m !== "POST") return fail(405, "지원하지 않는 요청이에요.");

    const b = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    const action = String(b.action || "");
    const cfg = await getCfg();
    const now = new Date().toISOString();

    if (action === "key") {
      const key = String(b.key || "").trim();
      if (key.length < 12 || key.length > 300 || /\s/.test(key)) return fail(400, "열쇠 모양이 올바르지 않아요. BAZE 화면에서 복사한 열쇠를 그대로 붙여 넣어 주세요.");
      if (!canSeal()) return fail(500, "서버에 열쇠를 잠글 비밀값이 없어 저장할 수 없어요. Netlify 환경변수(DATA_KEY)를 확인해 주세요.");
      // 통하는 열쇠인지 BAZE에 먼저 물어본다(모델 목록 받기)
      const probe = { key, root: bazeRoot() };
      let models;
      try {
        models = await fetchModels(probe);
      } catch (e) {
        const st = (e as { status?: number }).status;
        if (st === 401 || st === 403) return fail(400, `이 열쇠는 BAZE(${hostOf(probe.root)})에서 통하지 않아요. BAZE 화면 왼쪽 아래 'API Gateway'에서 만든 열쇠를 그대로 붙여 넣어 주세요.`);
        return fail(502, "BAZE에 연결하지 못해 열쇠를 확인하지 못했어요. 잠시 뒤 다시 저장해 주세요.");
      }
      const next: AiCfg = { ...cfg, keyEnc: await seal(key), keyTail: key.slice(-4), keyAt: now, keyBy: user.name, updated: now };
      await setCfg(next);
      await saveModels(probe, models);
      return json({ ok: true, ...(await view()) });
    }

    if (action === "forget") {
      await setCfg({ ...cfg, keyEnc: "", keyTail: "", keyAt: "", keyBy: "", updated: now });
      return json({ ok: true, ...(await view()) });
    }

    if (action === "model") {
      const id = String(b.model || "");
      if (!id) {
        await setCfg({ ...cfg, model: "", api: "claude", vendor: "claude", maxOut: null, modelAt: "", modelBy: "", updated: now });
        return json({ ok: true, ...(await view()) });
      }
      const { models } = await modelList(await gatewayConn(cfg).catch(() => null));
      const pick = models.find((x) => x.id === id);
      if (!pick) return fail(400, "목록에 없는 모델이에요. '목록 새로 받기'를 누른 뒤 다시 골라 주세요.");
      await setCfg({ ...cfg, model: pick.id, api: pick.api, vendor: pick.vendor, maxOut: pick.maxOut, modelAt: now, modelBy: user.name, updated: now });
      return json({ ok: true, ...(await view()) });
    }

    if (action === "test") {
      const conn = await gatewayConn(cfg).catch(() => null);
      if (!conn) return fail(400, gatewayOff() ? "게이트웨이가 꺼져 있어요(GATEWAY_OFF)." : "연결할 열쇠가 없어요. BAZE 열쇠를 저장한 뒤 시험해 주세요.");
      let use = modelOf(cfg) as { id: string; api: "claude" | "openai"; maxOut: number | null };
      if (b.model) {
        const pick = (await modelList(conn)).models.find((x) => x.id === String(b.model));
        if (!pick) return fail(400, "목록에 없는 모델이에요. '목록 새로 받기'를 누른 뒤 다시 골라 주세요.");
        use = pick;
      }
      const q = String(b.q || "").replace(/\s+/g, " ").trim().slice(0, 300) || "특수교육대상자 진단·평가는 어디에 신청하나요? 두세 문장으로 알려 주세요.";
      const t0 = Date.now();
      try {
        const { text, msg } = await completeText(gatewayRoute(conn, use), { system: SYSTEM_PROMPT, messages: [{ role: "user", content: q }], max_tokens: 1200 }, 40_000);
        return json({
          ok: true, q, text: text.trim() || `(글 없이 끝남: ${msg.stop_reason})`, ms: Date.now() - t0,
          model: msg.model || use.id, api: use.api, usage: { input: msg.usage?.input_tokens ?? null, output: msg.usage?.output_tokens ?? null },
        });
      } catch (e) {
        console.error("ai test", errorBrief(e));
        const st = errorStatus(e);
        const why = e instanceof AiHttpError ? e.userMessage
          : st === 401 || st === 403 ? "열쇠나 모델 사용 권한에 문제가 있어요."
          : st === 402 ? "BAZE 크레딧이 모두 찼어요."
          : st === 404 || st === 400 ? "이 모델이 요청을 받지 않았어요. 다른 모델을 골라 주세요."
          : st === 429 ? "지금 요청이 몰려 있어요. 잠시 뒤 다시 해 주세요."
          : "BAZE가 응답하지 못했어요. 잠시 뒤 다시 해 주세요.";
        return fail(502, `${why}${st ? ` (상태 ${st})` : ""}`);
      }
    }

    return fail(400, "지원하지 않는 요청이에요.");
  } catch (e) {
    console.error("ai-admin", errorBrief(e));
    return fail(500, "잠시 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
  }
};

export const config: Config = { path: "/api/admin/ai" };

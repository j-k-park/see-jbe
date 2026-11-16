/* GPT·Gemini 등 Claude가 아닌 모델을 BAZE의 OpenAI 형식(chat/completions)으로 부르는 연결
   (동계 연수 신청 누리집 jbwinter의 shared/oai.mts를 옮김 — 관리자가 BAZE 모델 목록에서 Claude가 아닌 모델을 골랐을 때만 쓴다).
   chat.mts·board.mts는 Claude 형식으로 요청을 만들고 Claude 형식 응답을 읽는다. 여기서 요청은 OpenAI 형식으로 바꿔 보내고,
   응답은 Claude 형식(content 블록·stop_reason·usage)으로 돌려준다. stream(params).on("text") / finalMessage() 모양을 흉내 낸다.
   Gemini는 도구를 부를 때 finish_reason이 "stop"이라 도구 호출이 있는지로 판단하고, 도구 호출에 붙어 오는 생각 서명(extra_content)을 다음 요청에 그대로 돌려준다. */

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean; _extra?: unknown };
type Msg = { role: string; content: string | Block[] };
export type OaiParams = {
  system?: string | { text: string }[]; messages?: Msg[]; max_tokens?: number;
  tools?: { name: string; description?: string; input_schema: unknown }[]; tool_choice?: { type: string };
};
export type OaiModel = { id: string; maxOut?: number | null };
export type OaiConn = { root: string; apiKey: string; timeout?: number };

/** 게이트웨이가 돌려준 오류(상태 번호와 이용자에게 보일 말) */
export class AiHttpError extends Error {
  status: number;
  userMessage: string;
  constructor(status: number, userMessage: string, detail = "") {
    super(`gateway ${status} ${detail}`.trim());
    this.status = status;
    this.userMessage = userMessage;
  }
}

const textOf = (c: unknown) => (typeof c === "string" ? c : ((c as Block[]) || []).filter((b) => b.type === "text").map((b) => b.text || "").join(""));

/** Claude 형식 요청 → OpenAI chat/completions 요청 */
export function toOpenAI(p: OaiParams, model: OaiModel) {
  const messages: Record<string, unknown>[] = [];
  const sys = Array.isArray(p.system) ? p.system.map((b) => b.text).join("\n\n") : p.system;
  if (sys) messages.push({ role: "system", content: sys });
  for (const m of p.messages || []) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = textOf(m.content);
      const calls = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }, ...(b._extra ? { extra_content: b._extra } : {}) }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of m.content.filter((x) => x.type === "tool_result")) {
        messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: (b.is_error ? "[오류] " : "") + (textOf(b.content) || "") });
      }
      const text = textOf(m.content);
      if (text) messages.push({ role: "user", content: text });
    }
  }
  const body: Record<string, unknown> = { model: model.id, messages, stream: true, stream_options: { include_usage: true } };
  // 생각(추론)에 토큰을 먼저 쓰는 모델이 답을 못 쓰고 끝나지 않게 넉넉히 준다
  body.max_completion_tokens = Math.min(Math.max(4096, p.max_tokens || 4096), model.maxOut || 32000);
  if (p.tools?.length) {
    body.tools = p.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    if (p.tool_choice?.type === "none") body.tool_choice = "none";
  }
  return body;
}

function httpError(status: number, text: string) {
  const detail = String(text).slice(0, 300);
  if (status === 429) return new AiHttpError(429, "지금 이용자가 많아요. 1분 정도 뒤에 다시 물어봐 주세요.", detail);
  if (status === 402) return new AiHttpError(402, "이번 달 AI 이용량(BAZE 크레딧)이 모두 찼어요.", detail);
  if (status === 401 || status === 403) return new AiHttpError(status, "AI 열쇠나 모델 사용 권한에 문제가 있어요. 관리자 화면에서 확인해 주세요.", detail);
  if (status === 400 || status === 404 || status === 422) return new AiHttpError(status, "지금 고른 모델이 이 요청 형식을 받지 않았어요. 관리자 화면에서 다른 모델을 골라 주세요.", detail);
  return new AiHttpError(status || 502, "AI 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.", detail);
}

/** 스트리밍 한 번: 글자는 onText로 넘기고 Claude 형식 메시지를 돌려준다 */
async function run(conn: OaiConn, body: Record<string, unknown>, onText: (t: string) => void) {
  let r: Response;
  try {
    r = await fetch(`${conn.root}/chat/completions/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.apiKey}`, "Content-Type": "application/json", "User-Agent": "see-jbe" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(conn.timeout || 45_000),
    });
  } catch (e) {
    throw httpError(0, (e as Error).message);
  }
  if (!r.ok || !r.body) throw httpError(r.status, await r.text().catch(() => ""));
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", finish: string | null = null, modelName = String(body.model);
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  const calls: { id: string; name: string; args: string; extra?: Record<string, unknown> }[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      let j: Record<string, any>;
      try {
        j = JSON.parse(d);
      } catch {
        continue;
      }
      if (j.error) throw httpError(Number(j.error.code) || 502, JSON.stringify(j.error));
      if (j.model) modelName = j.model;
      if (j.usage) usage = j.usage;
      for (const c of j.choices || []) {
        const dl = c.delta || {};
        if (dl.content) {
          text += dl.content;
          onText(dl.content);
        }
        for (const tc of dl.tool_calls || []) {
          const o = (calls[tc.index ?? calls.length] ||= { id: "", name: "", args: "" });
          if (tc.id) o.id = tc.id;
          if (tc.function?.name) o.name += tc.function.name;
          if (tc.function?.arguments) o.args += tc.function.arguments;
          if (tc.extra_content) o.extra = { ...(o.extra || {}), ...tc.extra_content };
        }
        if (c.finish_reason) finish = c.finish_reason;
      }
    }
  }
  const content: Block[] = [];
  if (text) content.push({ type: "text", text });
  calls.filter(Boolean).forEach((c, n) => {
    let input = {};
    try {
      input = c.args ? JSON.parse(c.args) : {};
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: c.id || `call_${n}`, name: c.name, input, ...(c.extra ? { _extra: c.extra } : {}) });
  });
  const hasTools = content.some((b) => b.type === "tool_use");
  const stop_reason = hasTools ? "tool_use" : finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end_turn";
  return { role: "assistant", model: modelName, content, stop_reason, usage: { input_tokens: usage?.prompt_tokens ?? null, output_tokens: usage?.completion_tokens ?? null } };
}

/** Anthropic SDK의 client.messages.stream(params)과 같은 모양: { on("text"), finalMessage() } */
export function openaiStream(conn: OaiConn, model: OaiModel, params: OaiParams) {
  const handlers: ((t: string) => void)[] = [];
  const p = run(conn, toOpenAI(params, model), (t) => handlers.forEach((h) => h(t)));
  p.catch(() => {}); // finalMessage()에서 받는다
  return {
    on(ev: string, h: (t: string) => void) {
      if (ev === "text") handlers.push(h);
      return this;
    },
    finalMessage: () => p,
  };
}

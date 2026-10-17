/* 관리자·현장교사 지원단 지정 (게시판 화면의 '담당자 메뉴', 역할 판단은 netlify/shared/user.mts)
   최고관리자와 협력관리자는 같은 권한이다(모든 역할 지정·빼기, 신청 승인, 드라이브 연결).
   GET    /api/admin/roles             구성원과 현장교사 지원단 신청 목록 — 최고·협력관리자
   POST   /api/admin/roles             지정·바꾸기·이름 고치기 {email, role, name} — 최고·협력관리자
                                        (기본 최고관리자는 역할은 그대로, 이름만 고칠 수 있다. 자기 역할은 바꿀 수 없다)
   DELETE /api/admin/roles?email=      빼기 — 최고·협력관리자. 환경변수 ADMIN_EMAILS의 기본 최고관리자와 자기 자신은 뺄 수 없다
   GET    /api/admin/apply             내 역할과 현장교사 지원단 신청 상태 — 로그인
   POST   /api/admin/apply             현장교사 지원단 신청 {school, note} — 로그인한 누구나
   POST   /api/admin/apply/decide      신청 승인·거절 {email, approve} — 최고·협력관리자
   저장: Blobs "see-board" — config/roles(구성원), config/apply(신청). 동시에 고쳐도 덮어쓰지 않게 조건부 저장 */
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { getUser, envSupers, roleCfg, titled, ROLES, ROLE_LABEL, type Role, type RoleCfg } from "../shared/user.mts";

type Apply = { items: Record<string, { name: string; school: string; note: string; created: string }> };

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, message: string) => json({ message }, status);
const store = () => getStore({ name: "see-board", consistency: "strong" });
const text = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const emailOf = (v: unknown) => text(v, 120).toLowerCase();
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function edit<T>(key: string, empty: T, fn: (cur: T) => T | Response): Promise<T | Response> {
  const s = store();
  for (let i = 0; i < 6; i++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const out = fn(structuredClone((cur?.data as T) || empty));
    if (out instanceof Response) return out;
    const r = cur ? await s.setJSON(key, out, { onlyIfMatch: cur.etag }) : await s.setJSON(key, out, { onlyIfNew: true });
    if (r.modified) return out;
    await new Promise((res) => setTimeout(res, 60 + Math.random() * 140));
  }
  return fail(409, "다른 분이 동시에 고치고 있어요. 잠시 뒤 다시 시도해 주세요.");
}

async function listView() {
  const cfg = await roleCfg();
  const apply = ((await store().get("config/apply", { type: "json" })) as Apply | null) || { items: {} };
  const members = [
    ...envSupers().map((email) => ({ email, role: "super" as Role, name: cfg.names?.[email] || "", fixed: true })),
    ...Object.entries(cfg.members).filter(([e]) => !envSupers().includes(e)).map(([email, m]) => ({ email, role: m.role, name: m.name || "", addedBy: m.addedBy || "", addedAt: m.addedAt || "", fixed: false })),
  ].map((m) => ({ ...m, label: ROLE_LABEL[m.role], display: titled(m.name, m.role) })); // display: 이영미 장학사 · 김하늘 선생님
  const order: Record<Role, number> = { super: 0, manager: 1, teacher: 2 };
  members.sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
  const applications = Object.entries(apply.items).map(([email, a]) => ({ email, ...a })).sort((a, b) => a.created.localeCompare(b.created));
  return { members, applications };
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  try {
    const user = await getUser(req);
    if (!user) return fail(401, "로그인이 필요해요.");
    const body = async () => (m === "POST" ? await req.json().catch(() => ({})) : {}) as Record<string, unknown>;

    /* ---------- 현장교사 지원단 신청(누구나) ---------- */
    if (path === "/api/admin/apply") {
      if (m === "GET") {
        const apply = ((await store().get("config/apply", { type: "json" })) as Apply | null) || { items: {} };
        const a = apply.items[user.email];
        return json({ role: user.role, label: user.role ? ROLE_LABEL[user.role] : "", applied: a ? { school: a.school, created: a.created } : null });
      }
      if (m === "POST") {
        if (user.role) return fail(400, `이미 ${ROLE_LABEL[user.role]}이에요.`);
        const b = await body();
        const school = text(b.school, 60), note = text(b.note, 300);
        if (!school) return fail(400, "학교(기관) 이름을 써 주세요.");
        const out = await edit<Apply>("config/apply", { items: {} }, (cur) => {
          if (Object.keys(cur.items).length >= 300 && !cur.items[user.email]) return fail(429, "신청이 많아 잠시 받을 수 없어요. 담당자에게 문의해 주세요.");
          cur.items[user.email] = { name: user.name, school, note, created: new Date().toISOString() };
          return cur;
        });
        return out instanceof Response ? out : json({ ok: true });
      }
    }

    /* ---------- 여기부터 관리자(최고·협력)만 ---------- */
    if (!user.admin) return fail(403, "관리자만 쓸 수 있어요.");

    if (path === "/api/admin/roles") {
      if (m === "GET") {
        // 기본 최고관리자의 이름이 아직 없으면 구글 계정 이름으로 채워 둔다(목록에 이름이 보이도록, 화면에서 고칠 수 있다)
        if (envSupers().includes(user.email) && !(await roleCfg()).names?.[user.email]) {
          const out = await edit<RoleCfg>("config/roles", { members: {} }, (cur) => ({ ...cur, names: { ...cur.names, [user.email]: cur.names?.[user.email] || user.name } }));
          if (out instanceof Response) return out;
        }
        return json({ me: { role: user.role, label: ROLE_LABEL[user.role!] }, ...(await listView()) });
      }
      if (m === "POST") {
        const b = await body();
        const email = emailOf(b.email), role = String(b.role) as Role, name = text(b.name, 30);
        if (!isEmail(email)) return fail(400, "구글 계정(이메일) 주소를 확인해 주세요.");
        if (!ROLES.includes(role)) return fail(400, "역할을 골라 주세요.");
        if (envSupers().includes(email)) {
          // 기본 최고관리자: 역할은 환경변수가 정하므로 이름만 고친다
          if (role !== "super") return fail(400, "기본 최고관리자는 역할을 바꿀 수 없어요. 이름만 고칠 수 있어요.");
          if (!name) return fail(400, "이름을 써 주세요.");
          const out = await edit<RoleCfg>("config/roles", { members: {} }, (cur) => ({ ...cur, names: { ...cur.names, [email]: name } }));
          return out instanceof Response ? out : json({ ok: true, ...(await listView()) });
        }
        if (email === user.email && role !== user.role) return fail(400, "자기 역할은 바꿀 수 없어요. 다른 관리자에게 부탁해 주세요.");
        const out = await edit<RoleCfg>("config/roles", { members: {} }, (cur) => {
          cur.members[email] = { role, name: name || cur.members[email]?.name || "", addedBy: user.email, addedAt: new Date().toISOString() };
          return cur;
        });
        if (out instanceof Response) return out;
        // 신청한 분이면 신청 목록에서 뺀다
        await edit<Apply>("config/apply", { items: {} }, (cur) => { delete cur.items[email]; return cur; });
        return json({ ok: true, ...(await listView()) });
      }
      if (m === "DELETE") {
        const email = emailOf(url.searchParams.get("email"));
        if (envSupers().includes(email)) return fail(400, "기본 최고관리자는 뺄 수 없어요.");
        const cur0 = (await roleCfg()).members[email];
        if (!cur0) return fail(404, "등록되지 않은 계정이에요.");
        if (email === user.email) return fail(400, "자기 자신은 뺄 수 없어요. 다른 관리자에게 부탁해 주세요.");
        const out = await edit<RoleCfg>("config/roles", { members: {} }, (cur) => { delete cur.members[email]; return cur; });
        return out instanceof Response ? out : json({ ok: true, ...(await listView()) });
      }
    }

    if (path === "/api/admin/apply/decide" && m === "POST") {
      const b = await body();
      const email = emailOf(b.email);
      const apply = ((await store().get("config/apply", { type: "json" })) as Apply | null) || { items: {} };
      const a = apply.items[email];
      if (!a) return fail(404, "신청을 찾을 수 없어요.");
      if (b.approve === true) {
        const out = await edit<RoleCfg>("config/roles", { members: {} }, (cur) => {
          if (!cur.members[email]) cur.members[email] = { role: "teacher", name: a.name, addedBy: user.email, addedAt: new Date().toISOString() };
          return cur;
        });
        if (out instanceof Response) return out;
      }
      await edit<Apply>("config/apply", { items: {} }, (cur) => { delete cur.items[email]; return cur; });
      return json({ ok: true, ...(await listView()) });
    }

    return fail(404, "없는 주소예요.");
  } catch (e) {
    console.error("admin", e);
    return fail(500, "잠시 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
  }
};

export const config: Config = { path: ["/api/admin/roles", "/api/admin/apply", "/api/admin/apply/decide"] };

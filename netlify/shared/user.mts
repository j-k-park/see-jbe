/* 로그인한 사람과 역할 — AI 상담과 같은 구글 ID 토큰(Authorization: Bearer)을 검증한다.
   역할: super 최고관리자 · manager 협력관리자(최고관리자와 같은 권한) · teacher 현장교사 지원단
   - 최고관리자는 환경변수 ADMIN_EMAILS(쉼표로 구분한 구글 계정)가 기본이고, 화면에서 더 지정할 수 있다
   - 나머지 역할은 게시판 화면의 '담당자 메뉴'에서 지정하며 Blobs(see-board · config/roles)에 둔다
   - 관리자·현장교사 지원단은 지정할 때 적은 이름(없으면 구글 계정 이름)에 직함을 붙여 부른다: 관리자는 '장학사', 현장교사 지원단은 '선생님'
   작성자는 구글 계정 고유값의 해시(ah)로만 구분한다. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getStore } from "@netlify/blobs";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type Role = "super" | "manager" | "teacher";
export const ROLES: Role[] = ["super", "manager", "teacher"];
export const ROLE_LABEL: Record<Role, string> = { super: "최고관리자", manager: "협력관리자", teacher: "현장교사 지원단" };
export const ROLE_TITLE: Record<Role, string> = { super: "장학사", manager: "장학사", teacher: "선생님" };
export type User = {
  ah: string; name: string; email: string;
  role: Role | null;
  admin: boolean; // 최고·협력관리자(같은 권한): 남의 글·댓글·첨부 지우기, 이름 전체 보기, 역할 지정, 드라이브 연결
  staff: boolean; // 관리자 + 현장교사 지원단(담당자): 비밀글·첨부 보기와 답변, 모든 글·댓글 고치기, 공지 쓰기
};
// members: 화면에서 지정한 역할과 이름 · names: 환경변수로 정한 기본 최고관리자의 이름(역할은 환경변수가 정한다)
export type RoleCfg = { members: Record<string, { role: Role; name?: string; addedBy?: string; addedAt?: string }>; names?: Record<string, string> };

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export const envSupers = () => (Netlify.env.get("ADMIN_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const store = () => getStore({ name: "see-board", consistency: "strong" });
export const roleCfg = async () => ((await store().get("config/roles", { type: "json" })) as RoleCfg | null) || { members: {} };

/** 역할과 지정된 이름(없으면 "") */
export async function memberOf(email: string): Promise<{ role: Role | null; name: string }> {
  if (!email) return { role: null, name: "" };
  const cfg = await roleCfg();
  if (envSupers().includes(email)) return { role: "super", name: cfg.names?.[email] || "" };
  const m = cfg.members[email];
  return m && ROLES.includes(m.role) ? { role: m.role, name: m.name || "" } : { role: null, name: "" };
}
export const roleOf = async (email: string) => (await memberOf(email)).role;

/** 이름 뒤 직함: 이영미 → 이영미 장학사, 김하늘 → 김하늘 선생님(이미 적어 둔 직함은 겹치지 않게) */
export function titled(name: string, role: Role | null | undefined) {
  const n = String(name || "").trim();
  if (!n || !role) return n;
  return `${n.replace(/\s*(장학사님?|선생님|선생|교사)$/, "") || n} ${ROLE_TITLE[role]}`;
}
/** 부를 때: 김하늘 선생님 · 박정교 장학사님 · 김민지님 */
export function callName(name: string, role: Role | null | undefined) {
  const t = titled(name, role) || "이용자";
  return t.endsWith("님") ? t : t + "님";
}
const HINT: Record<Role | "guest", string> = {
  super: "게시판 관리자 메뉴에서 구글 드라이브와 관리자·현장교사 지원단을 관리할 수 있어요.",
  manager: "게시판 관리자 메뉴에서 구글 드라이브와 관리자·현장교사 지원단을 관리할 수 있어요.",
  teacher: "비밀글을 포함한 모든 글의 답변·고치기와 공지 쓰기를 할 수 있어요.",
  guest: "궁금한 점은 AI 상담 SEE나 '담당자와 소통'에 편하게 남겨 주세요.",
};
/** 로그인 환영 인사: '현장교사 지원단 김하늘 선생님 반갑습니다' */
export function greeting(u: Pick<User, "name" | "role">) {
  const call = callName(u.name, u.role);
  return { call, greet: `${u.role ? ROLE_LABEL[u.role] + " " : ""}${call} 반갑습니다`, hint: HINT[u.role || "guest"] };
}

export async function getUser(req: Request): Promise<User | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID");
  if (!token || !clientId) return null;
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId });
    if (!payload.sub || payload.email_verified === false) return null;
    const email = String(payload.email || "").toLowerCase();
    const { role, name } = await memberOf(email);
    return {
      ah: await sha256(`${payload.sub}|${clientId}`),
      name: String(name || payload.name || email.split("@")[0] || "이용자").replace(/\s+/g, " ").trim().slice(0, 30),
      email,
      role,
      admin: role === "super" || role === "manager",
      staff: !!role,
    };
  } catch {
    return null;
  }
}

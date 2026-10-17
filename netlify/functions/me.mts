/* 로그인한 사람의 부를 이름과 환영 인사 (GET /api/me) — 화면 위쪽 이름 표시와 로그인 직후 인사에 쓴다.
   예) 현장교사 지원단 → '현장교사 지원단 김하늘 선생님 반갑습니다', 관리자 → '최고관리자 박정교 장학사님 반갑습니다' */
import type { Config } from "@netlify/functions";
import { getUser, greeting, ROLE_LABEL } from "../shared/user.mts";

export default async (req: Request) => {
  const headers = { "cache-control": "no-store" };
  const u = await getUser(req);
  if (!u) return Response.json({ message: "로그인이 필요해요." }, { status: 401, headers });
  return Response.json({ name: u.name, role: u.role, label: u.role ? ROLE_LABEL[u.role] : "", ...greeting(u) }, { headers });
};

export const config: Config = { path: "/api/me" };

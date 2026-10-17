/* 담당자 구글 드라이브 연결 (게시판 화면의 '담당자 메뉴', 저장 방식은 netlify/shared/drive.mts)
   POST /api/drive/connect     구글 동의 화면 주소 받기 — 최고·협력관리자(같은 권한)
   GET  /api/drive/callback    구글에서 돌아오는 주소 — state(10분짜리 서명)로 담당자를 확인하고 연결을 저장
   GET  /api/drive/status      연결 상태, 누리집 폴더 링크, 거점 폴더(DRIVE_HUB_FOLDER_ID) 안에 있는지 — 최고·협력관리자
   POST /api/drive/disconnect  연결 끊기 — 최고·협력관리자 */
import type { Config } from "@netlify/functions";
import { getUser } from "../shared/user.mts";
import { DRIVE_SCOPE, DriveError, driveCfg, saveDriveCfg, encrypt, exchangeCode, oauthClient, signState, verifyState, ensureRoot, driveApi, folderLink } from "../shared/drive.mts";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, message: string) => json({ message }, status);

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const redirectUri = url.origin + "/api/drive/callback";
  try {
    if (path === "/api/drive/callback") {
      const back = (r: string) => Response.redirect(`${url.origin}/board.html?drive=${r}#drive`, 302);
      if (url.searchParams.get("error")) return back("denied");
      let st: Record<string, unknown>;
      try {
        st = await verifyState(url.searchParams.get("state") || "");
      } catch {
        return back("expired");
      }
      if (st.purpose !== "drive") return back("expired");
      const tok = await exchangeCode(url.searchParams.get("code") || "", redirectUri);
      if (!tok.refresh_token) return back("norefresh");
      if (!String(tok.scope || "").includes("drive.file")) return back("scope");
      const prev = (await driveCfg()) || {};
      await saveDriveCfg({ ...prev, refreshEnc: await encrypt(tok.refresh_token), connectedBy: String(st.email || ""), connectedAt: new Date().toISOString(), folders: {} });
      try {
        await ensureRoot();
      } catch (e) {
        console.error("drive root after connect", e);
      }
      return back("ok");
    }

    const user = await getUser(req);
    if (!user?.admin) return fail(403, "관리자만 쓸 수 있어요.");

    if (path === "/api/drive/connect" && req.method === "POST") {
      const { id } = oauthClient();
      const state = await signState({ purpose: "drive", email: user.email }, 10);
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: DRIVE_SCOPE,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "false",
        login_hint: user.email,
        state,
      }).toString();
      return json({ url: auth.toString() });
    }

    if (path === "/api/drive/status" && req.method === "GET") {
      const cfg = await driveCfg();
      const ready = !!Netlify.env.get("GOOGLE_CLIENT_SECRET");
      if (!cfg?.refreshEnc) return json({ connected: false, ready });
      const hub = Netlify.env.get("DRIVE_HUB_FOLDER_ID") || "";
      try {
        const rootId = await ensureRoot();
        const f = await driveApi("files/" + rootId, { query: { fields: "id,parents" } });
        return json({
          connected: true, ready, connectedBy: cfg.connectedBy, connectedAt: cfg.connectedAt,
          root: folderLink(rootId), hub: hub ? folderLink(hub) : "", inHub: hub ? (f?.parents || []).includes(hub) : null,
        });
      } catch (e) {
        return json({ connected: true, ready, connectedBy: cfg.connectedBy, connectedAt: cfg.connectedAt, error: e instanceof Error ? e.message : "확인하지 못했어요." });
      }
    }

    if (path === "/api/drive/disconnect" && req.method === "POST") {
      const cfg = (await driveCfg()) || {};
      delete cfg.refreshEnc;
      await saveDriveCfg(cfg);
      return json({ ok: true });
    }

    return fail(404, "없는 주소예요.");
  } catch (e) {
    if (e instanceof DriveError) return fail(e.status, e.message);
    console.error("drive", e);
    return fail(500, "잠시 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
  }
};

export const config: Config = { path: ["/api/drive/connect", "/api/drive/callback", "/api/drive/status", "/api/drive/disconnect"] };

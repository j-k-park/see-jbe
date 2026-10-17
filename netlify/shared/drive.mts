/* 구글드라이브 저장소 — 누리집에 올라온 글·사진·동영상·문서를 담당자의 드라이브 거점 폴더('유아특수 웹앱')에 모은다.
   담당자가 한 번 '드라이브 연결'을 하면 refresh token을 암호화해 Blobs(see-board · config/drive)에 보관하고,
   파일은 브라우저가 구글에 직접 올리도록 '재개 가능 업로드' 주소만 서버가 만들어 준다(큰 동영상도 서버를 거치지 않음).
   권한 범위는 drive.file(이 누리집이 만든 폴더·파일만 접근)로 최소화한다 — 담당자 드라이브의 다른 파일은 볼 수 없다.
   그래서 누리집 폴더('SEE 누리집 자료')는 드라이브 맨 위에 만들어지고, 담당자가 거점 폴더 안으로 한 번 옮겨 둔다.
   (연구학교 누리집 netlify/lib/google.mjs와 같은 방식) */
import { SignJWT, jwtVerify } from "jose";
import { getStore } from "@netlify/blobs";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const ROOT_NAME = "SEE 누리집 자료";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveCfg = {
  refreshEnc?: string;
  connectedBy?: string;
  connectedAt?: string;
  rootId?: string;
  folders?: Record<string, string>;
};

export class DriveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const store = () => getStore({ name: "see-board", consistency: "strong" });
export const driveCfg = async () => ((await store().get("config/drive", { type: "json" })) as DriveCfg | null) || null;
export const saveDriveCfg = (cfg: DriveCfg) => store().setJSON("config/drive", cfg);

/* ---------- 서명·암호화 비밀값(SESSION_SECRET 없으면 처음 한 번 만들어 Blobs에 보관) ---------- */
let secretCache: Uint8Array | null = null;
async function secret() {
  if (secretCache) return secretCache;
  let raw = Netlify.env.get("SESSION_SECRET") || "";
  if (!raw) {
    const saved = (await store().get("config/secret", { type: "json" })) as { value?: string } | null;
    raw = saved?.value || "";
    if (!raw) {
      raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(48))));
      const r = await store().setJSON("config/secret", { value: raw, created: new Date().toISOString() }, { onlyIfNew: true });
      if (!r.modified) raw = ((await store().get("config/secret", { type: "json" })) as { value: string }).value; // 동시에 만들어졌으면 먼저 것
    }
  }
  secretCache = new TextEncoder().encode(raw);
  return secretCache;
}

export async function signState(payload: Record<string, unknown>, minutes = 10) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${minutes}m`).sign(await secret());
}
export async function verifyState(token: string) {
  const { payload } = await jwtVerify(token, await secret(), { algorithms: ["HS256"] });
  return payload;
}

async function aesKey() {
  const hash = await crypto.subtle.digest("SHA-256", await secret());
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(text));
  return Buffer.from(iv).toString("base64") + "." + Buffer.from(ct).toString("base64");
}
async function decrypt(blob: string) {
  const [iv, ct] = blob.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64") }, await aesKey(), Buffer.from(ct, "base64"));
  return new TextDecoder().decode(pt);
}

/* ---------- OAuth ---------- */
export function oauthClient() {
  const id = Netlify.env.get("GOOGLE_CLIENT_ID"), sec = Netlify.env.get("GOOGLE_CLIENT_SECRET");
  if (!id || !sec) throw new DriveError(503, "구글 드라이브 연결 설정(GOOGLE_CLIENT_SECRET)이 아직 준비되지 않았어요.");
  return { id, secret: sec };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret: sec } = oauthClient();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: sec, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, string>;
  if (!r.ok) throw new DriveError(502, "구글 인증 코드를 바꾸지 못했어요: " + (data.error_description || data.error || r.status));
  return data;
}

let tokenCache = { token: "", exp: 0 };
export async function accessToken() {
  if (tokenCache.token && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const cfg = await driveCfg();
  if (!cfg?.refreshEnc) throw new DriveError(503, "담당자가 아직 구글 드라이브를 연결하지 않았어요.");
  const { id, secret: sec } = oauthClient();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: await decrypt(cfg.refreshEnc), client_id: id, client_secret: sec, grant_type: "refresh_token" }),
  });
  const data = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !data.access_token) {
    console.error("drive token refresh failed", data);
    throw new DriveError(503, "구글 드라이브 연결이 끊겼어요. 담당자가 다시 연결해 주세요.");
  }
  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

export async function driveApi(path: string, { method = "GET", query, body }: { method?: string; query?: Record<string, string>; body?: unknown } = {}) {
  const url = new URL("https://www.googleapis.com/drive/v3/" + path);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + (await accessToken()), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("drive api", path, r.status, data);
    throw new DriveError(r.status === 404 ? 404 : 502, "구글 드라이브 요청이 실패했어요(" + r.status + ").");
  }
  return data as Record<string, any>;
}

const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** 이름이 같은 폴더가 있으면 쓰고, 없으면 만든다(누리집이 만든 폴더 안에서만 찾을 수 있다) */
export async function ensureFolder(name: string, parentId?: string) {
  const cfg = (await driveCfg()) || {};
  const key = (parentId || "root") + "/" + name;
  const cached = cfg.folders?.[key];
  if (cached) {
    try {
      const f = await driveApi("files/" + cached, { query: { fields: "id,trashed" } });
      if (f && !f.trashed) return cached;
    } catch {
      /* 다시 찾기 */
    }
  }
  const found = await driveApi("files", {
    query: { q: `name='${quote(name)}' and mimeType='${FOLDER_MIME}' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : ""), fields: "files(id)", spaces: "drive" },
  });
  let id = found?.files?.[0]?.id as string | undefined;
  if (!id) id = (await driveApi("files", { method: "POST", query: { fields: "id" }, body: { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) } }))!.id;
  const fresh = (await driveCfg()) || {};
  fresh.folders = { ...(fresh.folders || {}), [key]: id! };
  await saveDriveCfg(fresh);
  return id!;
}

/** 누리집 폴더 — 처음 연결할 때 드라이브 맨 위에 만들고, 담당자가 거점 폴더 안으로 옮겨 둔다 */
export async function ensureRoot() {
  const id = await ensureFolder(ROOT_NAME);
  const cfg = (await driveCfg()) || {};
  if (cfg.rootId !== id) await saveDriveCfg({ ...cfg, rootId: id });
  return id;
}

export const folderLink = (id: string) => "https://drive.google.com/drive/folders/" + id;

/** 새 폴더(같은 이름이 있어도 새로) */
export async function createFolder(name: string, parentId: string) {
  const f = await driveApi("files", { method: "POST", query: { fields: "id" }, body: { name, mimeType: FOLDER_MIME, parents: [parentId] } });
  return f!.id as string;
}

/** 브라우저가 직접 파일을 올릴 재개 가능 업로드 세션. Origin을 넣어야 브라우저(CORS)에서 올릴 수 있다 */
export async function createUploadSession(o: { name: string; mimeType: string; size: number; parentId: string; appProperties?: Record<string, string>; origin: string }) {
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + (await accessToken()),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": o.mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(o.size),
      Origin: o.origin,
    },
    body: JSON.stringify({ name: o.name, mimeType: o.mimeType || "application/octet-stream", parents: [o.parentId], appProperties: o.appProperties }),
  });
  if (!r.ok) {
    console.error("resumable init failed", r.status, await r.text());
    throw new DriveError(502, "올릴 준비를 하지 못했어요(" + r.status + ").");
  }
  const location = r.headers.get("location");
  if (!location) throw new DriveError(502, "올릴 주소를 받지 못했어요.");
  return location;
}

/** 글 내용 같은 작은 텍스트 파일 만들기/바꾸기 */
export async function putText(name: string, text: string, parentId: string, fileId?: string) {
  const boundary = "see" + Math.random().toString(36).slice(2);
  const meta = fileId ? { name } : { name, parents: [parentId], mimeType: "text/plain" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
  const r = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { Authorization: "Bearer " + (await accessToken()), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = (await r.json().catch(() => ({}))) as { id?: string };
  if (!r.ok || !data.id) throw new DriveError(502, "글 내용을 드라이브에 저장하지 못했어요(" + r.status + ").");
  return data.id;
}

export const trash = (fileId: string) => driveApi("files/" + fileId, { method: "PATCH", query: { fields: "id" }, body: { trashed: true } });

/** 파일 내용 받기(화면에서 보기·내려받기) — fetch 응답을 그대로 돌려준다 */
export async function download(fileId: string) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: "Bearer " + (await accessToken()) } });
  if (!r.ok) throw new DriveError(r.status === 404 ? 404 : 502, "파일을 가져오지 못했어요(" + r.status + ").");
  return r;
}

/** 사진·동영상의 작은 미리보기(드라이브가 만든 썸네일) */
export async function thumbnail(fileId: string) {
  const meta = await driveApi("files/" + fileId, { query: { fields: "thumbnailLink" } });
  const link = String(meta?.thumbnailLink || "").replace(/=s\d+$/, "=s480");
  if (!link) return null;
  const r = await fetch(link, { headers: { Authorization: "Bearer " + (await accessToken()) } });
  return r.ok ? r : null;
}

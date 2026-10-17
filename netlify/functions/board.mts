/* 담당자와 소통 게시판 (화면: board.html · assets/js/board.js)
   GET    /api/board                    목록(비밀글은 제목만) + 로그인한 사람 정보 + 첨부 가능 여부
   POST   /api/board                    글 올리기 {title, content, secret, links, notice} — 로그인(공지는 관리자·현장교사 지원단)
   PATCH  /api/board/post?id=           글 고치기 {title, content, links} — 작성자·담당자(관리자·현장교사 지원단)
   GET    /api/board/post?id=           글 보기(비밀글의 내용·답변은 작성자와 담당자만)
   DELETE /api/board/post?id=           글 지우기 — 작성자·관리자(공지는 현장교사 지원단도) · 드라이브 폴더는 휴지통으로
   POST   /api/board/comment            답변·댓글 {id, text} — 비밀글은 작성자·담당자만, 공개글은 로그인한 누구나
   PATCH  /api/board/comment?id=&cid=   답변·댓글 고치기 {text} — 쓴 사람·담당자(관리자·현장교사 지원단)
   DELETE /api/board/comment?id=&cid=   답변·댓글 지우기 — 쓴 사람·관리자
   POST   /api/board/file/init          첨부 올릴 준비 {id, name, type, size} → 드라이브 업로드 주소 — 작성자
   POST   /api/board/file/done          올리기 끝 {id, fid, driveId} — 작성자(드라이브에 실제로 있는지 확인)
   POST   /api/board/file/fail          올리기 실패 표시 {id, fid}
   GET    /api/board/file?id=&fid=      첨부 보기(&thumb=1 미리보기) — 작성자·담당자만
   DELETE /api/board/file?id=&fid=      첨부 빼기 — 작성자·관리자
   POST   /api/board/draft              말로 남긴 내용을 AI로 제목·내용 정리 {text, notice} — 로그인(글은 저장하지 않음, notice는 공지 말투로·현장교사 지원단 이상)
   저장: 글·댓글은 Netlify Blobs "see-board"(index = 목록 요약, post/{id})에 두어 화면을 빠르게 띄우고,
   같은 내용과 첨부(사진·동영상·문서)는 담당자 구글 드라이브 거점 폴더에 글마다 폴더로 모은다(netlify/shared/drive.mts).
   첨부는 공개글이어도 작성자와 담당자만 볼 수 있다(담당자에게 '제출'). 이름은 본인·담당자가 아닌 사람에게 가려서(박*교) 보인다.
   역할(netlify/shared/user.mts): 담당자(최고·협력관리자·현장교사 지원단) = 비밀글·첨부 보기와 답변, 모든 글·댓글 고치기, 공지 쓰기
   / 최고·협력관리자만 = 남의 글·댓글·첨부 지우기, 이름 전체 보기, 드라이브 바로가기 */
import Anthropic from "@anthropic-ai/sdk";
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { aiRoutes } from "../shared/ai.mts";
import { getUser, titled, callName, type User, type Role } from "../shared/user.mts";
import { DriveError, driveCfg, ensureRoot, ensureFolder, createFolder, createUploadSession, putText, trash, download, thumbnail, driveApi } from "../shared/drive.mts";

const MAX = { title: 100, content: 5000, comment: 2000, speech: 6000, links: 10, files: 10 };
const PER_DAY = { post: 10, comment: 40, draft: 20, bytes: 1024 ** 3 };
const VIEW_LIMIT = 15 * 1024 ** 2; // 화면에서 바로 여는 파일 크기(넘으면 담당자는 드라이브에서)

/* 받을 수 있는 첨부 — 사진·동영상·문서(한글·PDF·워드·엑셀·파워포인트 등) */
const KINDS = {
  image: { max: 30 * 1024 ** 2, ext: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"] },
  video: { max: 300 * 1024 ** 2, ext: ["mp4", "mov", "m4v", "webm", "avi", "3gp", "mkv"] },
  doc: { max: 50 * 1024 ** 2, ext: ["pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp", "csv"] },
} as const;
type Kind = keyof typeof KINDS;

type Comment = { id: string; text: string; ah: string; name: string; admin: boolean; role?: Role | null; created: string; edited?: string };
type Link = { url: string; title: string };
type FileRec = { id: string; name: string; size: number; type: string; kind: Kind; status: "pending" | "done" | "failed"; driveId?: string; created: string };
type Post = {
  id: string; title: string; content: string; secret: boolean; ah: string; name: string; created: string;
  comments: Comment[]; answered: boolean; links?: Link[]; files?: FileRec[]; folderId?: string; textId?: string;
  notice?: boolean; role?: Role | null; edited?: string;
};
type Summary = { id: string; title: string; secret: boolean; ah: string; name: string; created: string; comments: number; answered: boolean; files?: number; links?: number; notice?: boolean; role?: Role | null };

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, message: string) => json({ message }, status);
// 첨부 응답 — 공용 PC에서 로그아웃한 뒤에도 브라우저에 남지 않도록 저장하지 않는다
const PRIVATE = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const store = () => getStore({ name: "see-board", consistency: "strong" });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
const text = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const fileName = (v: unknown) => text(v, 120).replace(/[\\/:*?"<>|\n]+/g, " ").trim() || "첨부파일";
const size = (n: number) => (n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");

/* 첨부를 내보낼 때의 형식은 올린 사람이 보낸 값이 아니라 확장자로만 정한다
   (형식을 속인 파일이 담당자 화면에서 웹 문서로 실행되지 않도록) */
const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", avi: "video/x-msvideo", "3gp": "video/3gpp", mkv: "video/x-matroska",
  pdf: "application/pdf", hwp: "application/x-hwp", hwpx: "application/hwp+zip", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain; charset=utf-8", rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  csv: "text/csv; charset=utf-8",
};
const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const mimeOf = (name: string) => MIME[extOf(name)] || "application/octet-stream";

function kindOf(name: string): Kind | null {
  const ext = extOf(name);
  for (const k of Object.keys(KINDS) as Kind[]) if ((KINDS[k].ext as readonly string[]).includes(ext)) return k;
  return null;
}
// 휴대폰 사진처럼 이름에 확장자가 없으면 사진·동영상 형식에 맞는 확장자를 붙인다(그 밖의 형식은 받지 않는다)
function withExt(name: string, type: string) {
  if (kindOf(name)) return name;
  const ext = Object.keys(MIME).find((e) => MIME[e] === type.toLowerCase() && /^(image|video)\//.test(type));
  return ext ? `${name}.${ext === "jpeg" ? "jpg" : ext}` : name;
}

function cleanLinks(v: unknown): Link[] {
  if (!Array.isArray(v)) return [];
  const out: Link[] = [];
  for (const l of v.slice(0, MAX.links)) {
    const raw = text(typeof l === "string" ? l : (l as Link)?.url, 500);
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) continue;
      out.push({ url: u.toString(), title: text(typeof l === "object" ? (l as Link)?.title : "", 80) });
    } catch {
      /* 주소가 아니면 버림 */
    }
  }
  return out;
}

/* ---------- 보여 줄 모양 ---------- */
// 이름 가리기: 박정교 → 박*교, 이영 → 이*
function mask(name: string) {
  const c = [...String(name || "").trim()];
  if (c.length <= 1) return c.join("") || "이용자";
  if (c.length === 2) return c[0] + "*";
  return c[0] + "*".repeat(Math.min(3, c.length - 2)) + c[c.length - 1];
}
const nameFor = (u: User | null, ah: string, name: string) => (u && (u.admin || u.ah === ah) ? name : mask(name));
// 관리자·현장교사 지원단이 쓴 공지·답변은 이름 대신 역할로(관리자에게는 '이영미 장학사'·'김하늘 선생님'처럼 이름도)
const staffName = (u: User | null, role: Role | null | undefined, name: string) =>
  role === "super" || role === "manager" ? "담당자" + (u?.admin ? ` (${titled(name, role)})` : "") : role === "teacher" ? "현장교사 지원단" + (u?.admin ? ` (${titled(name, role)})` : "") : "";
const isStaffRole = (r: Role | null | undefined) => r === "super" || r === "manager" || r === "teacher";
const answeredOf = (cs: Comment[]) => cs.some((c) => c.admin || c.role === "teacher");

const summaryView = (s: Summary, u: User | null) => ({
  id: s.id, title: s.title, secret: s.secret, notice: !!s.notice,
  author: s.notice && isStaffRole(s.role) ? staffName(u, s.role, s.name) : nameFor(u, s.ah, s.name), created: s.created,
  comments: s.comments, answered: s.answered, files: s.files || 0, links: s.links || 0, mine: !!u && u.ah === s.ah,
});

function postView(p: Post, u: User | null) {
  const owner = !!u && u.ah === p.ah;
  const canRead = !p.secret || owner || !!u?.staff; // 비밀글은 쓴 사람과 담당자(관리자·현장교사 지원단)
  const canSeeFiles = owner || !!u?.staff || !!p.notice; // 첨부는 '제출' — 공개글이어도 작성자와 담당자(관리자·현장교사 지원단)만(공지의 안내 자료는 누구나)
  const files = p.files || [];
  const canEdit = !!u && (u.staff || (!p.notice && owner)); // 고치기: 담당자(관리자·현장교사 지원단)는 모든 글, 쓴 사람은 자기 글
  return {
    id: p.id, title: p.title, secret: p.secret, notice: !!p.notice, created: p.created, edited: p.edited, answered: p.answered,
    author: p.notice && isStaffRole(p.role) ? staffName(u, p.role, p.name) : nameFor(u, p.ah, p.name), mine: owner, canRead,
    content: canRead ? p.content : null,
    links: canRead ? p.links || [] : [],
    fileCount: files.filter((f) => f.status === "done").length,
    canSeeFiles,
    files: canSeeFiles ? files.map((f) => ({ id: f.id, name: f.name, size: f.size, type: mimeOf(f.name), kind: f.kind, status: f.status, viewable: f.size <= VIEW_LIMIT, drive: u?.admin && f.driveId ? `https://drive.google.com/file/d/${f.driveId}/view` : undefined })) : [],
    folder: u?.admin && p.folderId ? `https://drive.google.com/drive/folders/${p.folderId}` : undefined,
    comments: canRead
      ? p.comments.map((c) => {
          const staff = c.admin ? "admin" : c.role === "teacher" ? "teacher" : "";
          return {
            id: c.id, text: c.text, created: c.created, edited: c.edited, admin: c.admin, staff,
            author: staff ? staffName(u, c.admin ? "manager" : "teacher", c.name) : nameFor(u, c.ah, c.name),
            mine: !!u && u.ah === c.ah, canDelete: !!u && (u.admin || u.ah === c.ah), canEdit: !!u && (u.staff || u.ah === c.ah),
          };
        })
      : [],
    commentCount: p.comments.length,
    canEdit,
    canDelete: !!u && (u.admin || owner || (!!p.notice && u.staff)),
    canComment: !!u && canRead, // 비밀글은 작성자·담당자만, 공개글은 로그인한 누구나
    canAttach: owner,
  };
}

const toSummary = (p: Post): Summary => ({
  id: p.id, title: p.title, secret: p.secret, ah: p.ah, name: p.name, created: p.created, comments: p.comments.length, answered: p.answered,
  notice: !!p.notice, role: p.role,
  files: (p.files || []).filter((f) => f.status === "done").length, links: (p.links || []).length,
});

/* ---------- 저장(조건부 쓰기로 동시에 써도 안전하게) ---------- */
async function editIndex(fn: (list: Summary[]) => Summary[]) {
  const s = store();
  for (let i = 0; i < 6; i++) {
    const cur = await s.getWithMetadata("index", { type: "json" });
    const next = fn(((cur?.data as Summary[]) || []).slice());
    const r = cur ? await s.setJSON("index", next, { onlyIfMatch: cur.etag }) : await s.setJSON("index", next, { onlyIfNew: true });
    if (r.modified) return;
    await wait(60 + Math.random() * 140);
  }
  throw new Error("index busy");
}

async function editPost(id: string, fn: (p: Post) => Post | Response | Promise<Post | Response>): Promise<Post | Response> {
  const s = store();
  for (let i = 0; i < 6; i++) {
    const cur = await s.getWithMetadata(`post/${id}`, { type: "json" });
    if (!cur) return fail(404, "글을 찾을 수 없어요. 지워졌을 수 있어요.");
    const out = await fn(structuredClone(cur.data as Post));
    if (out instanceof Response) return out;
    const r = await s.setJSON(`post/${id}`, out, { onlyIfMatch: cur.etag });
    if (r.modified) return out;
    await wait(60 + Math.random() * 140);
  }
  return fail(409, "다른 분이 동시에 글을 고치고 있어요. 잠시 뒤 다시 시도해 주세요.");
}
const getPost = async (id: string) => (await store().get(`post/${id}`, { type: "json" })) as Post | null;

// 하루 횟수(·바이트) — 넘으면 false
async function allow(kind: keyof typeof PER_DAY, u: User, amount = 1) {
  const s = store();
  const key = `limit/${kstDay()}/${kind}/${u.ah}`;
  const used = Number((await s.get(key)) || 0);
  if (!u.staff && used + amount > PER_DAY[kind]) return false;
  await s.set(key, String(used + amount));
  return true;
}

/* ---------- 구글 드라이브 거점 폴더에 모으기 ---------- */
const driveOn = async () => !!(await driveCfg())?.refreshEnc;

async function postFolder(p: Post) {
  if (p.folderId) return p.folderId;
  const board = await ensureFolder("담당자와 소통 게시판", await ensureRoot());
  return createFolder(`${kstTime(p.created).slice(0, 10)} ${p.notice ? "[공지] " : ""}${p.title.slice(0, 40)}${p.secret ? " [비밀글]" : ""} (${p.id})`, board);
}

function postText(p: Post, origin: string) {
  const files = (p.files || []).filter((f) => f.status === "done");
  return [
    `제목: ${p.title}`,
    `글쓴이: ${titled(p.name, p.role)} · ${p.notice ? "공지" : p.secret ? "비밀글" : "공개글"}`,
    `올린 때: ${kstTime(p.created)}${p.edited ? ` (고친 때 ${kstTime(p.edited)})` : ""}`,
    `누리집에서 보기: ${origin}/board.html#${p.id}`,
    "", "[내용]", p.content,
    ...(p.links?.length ? ["", "[링크]", ...p.links.map((l) => `- ${l.title ? l.title + " " : ""}${l.url}`)] : []),
    ...(files.length ? ["", "[첨부]", ...files.map((f) => `- ${f.name} (${size(f.size)})`)] : []),
    ...(p.comments.length ? ["", "[답변·댓글]", ...p.comments.map((c) => `- ${kstTime(c.created)} ${c.admin ? "담당자 " : c.role === "teacher" ? "현장교사 지원단 " : ""}${titled(c.name, c.admin ? c.role || "manager" : c.role)}: ${c.text}`)] : []),
    "",
  ].join("\n");
}

/** 글 폴더와 '글 내용.txt'를 드라이브에 맞춰 둔다(실패해도 게시판은 그대로 — 다음 저장 때 다시) */
async function mirror(id: string, origin: string) {
  try {
    if (!(await driveOn())) return;
    const p = await getPost(id);
    if (!p) return;
    const folderId = await postFolder(p);
    const textId = await putText("글 내용.txt", postText(p, origin), folderId, p.textId);
    if (folderId !== p.folderId || textId !== p.textId) {
      await editPost(id, (x) => ({ ...x, folderId, textId }));
    }
  } catch (e) {
    console.warn("board drive mirror", id, e instanceof Error ? e.message : e);
  }
}

/* ---------- 말로 남긴 내용을 AI로 정리 ---------- */
const DRAFT_SYSTEM = `너는 전북특별자치도교육청 'SEE 우리 아이 성장 길잡이' 누리집의 '담당자와 소통' 게시판 글쓰기 도우미다.
보호자가 특수교육 담당자에게 말로 남긴 내용(음성 인식 글이라 띄어쓰기·맞춤법이 틀리거나 같은 말이 되풀이될 수 있음)을 게시판에 올릴 제목과 내용으로 정리한다.

규칙
- 보호자가 말한 사실·질문·요청만 쓴다. 말하지 않은 내용(날짜, 기관, 진단명 등)을 지어내지 않고, 답을 대신 달지 않는다.
- '음, 어, 그러니까' 같은 군말과 되풀이를 덜어 내고 맞춤법·띄어쓰기를 바르게 고친다. 정중한 존댓말로 쓴다.
- 제목: 핵심 질문이나 요청이 드러나게 40자 이내로. 끝에 마침표를 붙이지 않는다.
- 내용: 담당자가 바로 이해하고 답할 수 있게 자세하게, 그러나 보호자가 말한 범위 안에서 쓴다. "안녕하세요."로 시작해 상황(아이 나이·지금 모습·지금까지 해 본 것) → 궁금한 점·요청 → 마무리 인사 순서로 문단을 나눈다. 궁금한 점이 여럿이면 "- "로 시작하는 목록으로 나눈다.
- 아이 이름, 주민등록번호, 전화번호, 자세한 주소처럼 사람을 알아볼 수 있는 정보는 "(개인정보 생략)"으로 바꾼다. 아이는 "저희 아이"라고 쓴다.
- 반드시 JSON 한 개만 출력한다. 다른 말은 쓰지 않는다: {"title": "제목", "content": "내용(줄바꿈은 \\n)"}`;

// 담당자·현장교사 지원단이 말로 쓰는 공지
const NOTICE_SYSTEM = `너는 전북특별자치도교육청 'SEE 우리 아이 성장 길잡이' 누리집의 '담당자와 소통' 게시판 공지 쓰기 도우미다.
특수교육 담당자나 현장 교사가 보호자들에게 알릴 내용을 말로 남긴 것(음성 인식 글이라 띄어쓰기·맞춤법이 틀리거나 같은 말이 되풀이될 수 있음)을 게시판 공지의 제목과 내용으로 정리한다.

규칙
- 말한 사실만 쓴다. 말하지 않은 날짜·장소·기관·연락처·절차를 지어내지 않는다.
- 군말과 되풀이를 덜어 내고 맞춤법·띄어쓰기를 바르게 고친다. 보호자가 읽기 쉬운 따뜻하고 정중한 존댓말로 쓴다.
- 제목: 무엇을 알리는지 드러나게 40자 이내로. 끝에 마침표를 붙이지 않는다.
- 내용: "안녕하세요."로 시작해 알릴 내용 → (말했다면) 대상·일정·방법·문의처 → 마무리 인사 순서로 문단을 나눈다. 일정이나 준비물처럼 항목이 여럿이면 "- "로 시작하는 목록으로 나눈다.
- 특정 아이나 보호자를 알아볼 수 있는 정보는 "(개인정보 생략)"으로 바꾼다.
- 반드시 JSON 한 개만 출력한다. 다른 말은 쓰지 않는다: {"title": "제목", "content": "내용(줄바꿈은 \\n)"}`;

function parseDraft(out: string, src: string) {
  const m = out.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : out);
    const title = text(j.title, MAX.title).replace(/[.。]$/, "");
    const content = text(j.content, MAX.content);
    if (title && content) return { title, content };
  } catch {
    /* 아래로 */
  }
  // 형식을 못 읽으면 말한 내용 그대로, 첫 문장을 제목으로
  const first = src.split(/(?<=[.?!])\s+/)[0] || src;
  return { title: text(first, 40).replace(/[.。]$/, ""), content: text(src, MAX.content) };
}

async function makeDraft(speech: string, notice = false) {
  const routes = aiRoutes();
  if (!routes.length) throw Object.assign(new Error("no-ai"), { status: 503 });
  let last: unknown;
  for (const route of routes) {
    try {
      const client = new Anthropic({ apiKey: route.apiKey, baseURL: route.baseURL, maxRetries: 1, timeout: 45_000 });
      const res = await client.messages.create({
        model: route.model,
        max_tokens: 2000,
        system: notice ? NOTICE_SYSTEM : DRAFT_SYSTEM,
        messages: [{ role: "user", content: `<말한_내용>\n${speech}\n</말한_내용>` }],
      });
      const out = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return parseDraft(out, speech);
    } catch (e) {
      last = e;
      console.warn(`[board draft ${route.label}] 실패`, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    }
  }
  throw last;
}

/* ---------- 요청 처리 ---------- */
export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  const origin = req.headers.get("origin") || url.origin;
  const body = async () => (m === "POST" ? await req.json().catch(() => ({})) : {}) as Record<string, unknown>;
  const idOf = (v: unknown) => String(v ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 40);

  try {
    const user = await getUser(req);
    const me = user && { name: user.name, call: callName(user.name, user.role), role: user.role, admin: user.admin, staff: user.staff };
    const needLogin = () => fail(401, "로그인이 필요해요. 구글 계정으로 로그인해 주세요.");

    if (path === "/api/board") {
      if (m === "GET") {
        const list = ((await store().get("index", { type: "json" })) as Summary[] | null) || [];
        return json({ me, attach: await driveOn(), items: list.map((s) => summaryView(s, user)) });
      }
      if (m === "POST") {
        if (!user) return needLogin();
        const b = await body();
        const title = text(b.title, MAX.title), content = text(b.content, MAX.content);
        if (!title || !content) return fail(400, "제목과 내용을 모두 써 주세요.");
        const notice = b.notice === true;
        if (notice && !user.staff) return fail(403, "공지는 관리자와 현장교사 지원단만 올릴 수 있어요.");
        if (!(await allow("post", user))) return fail(429, `글은 하루 ${PER_DAY.post}개까지 올릴 수 있어요.`);
        const post: Post = {
          id: uid("p"), title, content, secret: !notice && b.secret === true, ah: user.ah, name: user.name, created: new Date().toISOString(),
          comments: [], answered: false, links: cleanLinks(b.links), files: [], notice, role: user.role,
        };
        await store().setJSON(`post/${post.id}`, post);
        await editIndex((list) => [toSummary(post), ...list.filter((s) => s.id !== post.id)].slice(0, 3000));
        await mirror(post.id, origin);
        return json({ ok: true, id: post.id, post: postView((await getPost(post.id)) || post, user) });
      }
    }

    if (path === "/api/board/post") {
      const id = idOf(url.searchParams.get("id"));
      if (m === "GET") {
        const p = await getPost(id);
        if (!p) return fail(404, "글을 찾을 수 없어요. 지워졌을 수 있어요.");
        return json({ me, post: postView(p, user) });
      }
      if (m === "PATCH") {
        if (!user) return needLogin();
        const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const title = text(b.title, MAX.title), content = text(b.content, MAX.content);
        if (!title || !content) return fail(400, "제목과 내용을 모두 써 주세요.");
        const out = await editPost(id, (p) => {
          if (!(user.staff || (!p.notice && user.ah === p.ah))) return fail(403, p.notice ? "공지는 관리자와 현장교사 지원단만 고칠 수 있어요." : "글은 쓴 사람과 담당자만 고칠 수 있어요.");
          p.title = title;
          p.content = content;
          if (Array.isArray(b.links)) p.links = cleanLinks(b.links);
          p.edited = new Date().toISOString();
          return p;
        });
        if (out instanceof Response) return out;
        await editIndex((list) => list.map((s) => (s.id === id ? toSummary(out) : s)));
        await mirror(id, origin);
        return json({ ok: true, post: postView(out, user) });
      }
      if (m === "DELETE") {
        if (!user) return needLogin();
        const p = await getPost(id);
        if (!p) return fail(404, "글을 찾을 수 없어요. 이미 지워졌을 수 있어요.");
        if (!(user.admin || user.ah === p.ah || (p.notice && user.staff))) return fail(403, "글은 쓴 사람과 관리자만 지울 수 있어요.");
        await store().delete(`post/${id}`);
        await editIndex((list) => list.filter((s) => s.id !== id));
        if (p.folderId) await trash(p.folderId).catch((e) => console.warn("board trash folder", e)); // 드라이브 휴지통에서 되살릴 수 있다
        return json({ ok: true });
      }
    }

    if (path === "/api/board/comment") {
      if (!user) return needLogin();
      if (m === "POST") {
        const b = await body();
        const id = idOf(b.id), t = text(b.text, MAX.comment);
        if (!t) return fail(400, "남길 말을 써 주세요.");
        if (!(await allow("comment", user))) return fail(429, `댓글은 하루 ${PER_DAY.comment}개까지 남길 수 있어요.`);
        const out = await editPost(id, (p) => {
          if (p.secret && !user.staff && user.ah !== p.ah) return fail(403, "비밀글에는 쓴 사람과 담당자만 답할 수 있어요.");
          p.comments.push({ id: uid("c"), text: t, ah: user.ah, name: user.name, admin: user.admin, role: user.role, created: new Date().toISOString() });
          p.answered = answeredOf(p.comments);
          return p;
        });
        if (out instanceof Response) return out;
        await editIndex((list) => list.map((s) => (s.id === id ? toSummary(out) : s)));
        await mirror(id, origin);
        return json({ ok: true, post: postView(out, user) });
      }
      if (m === "PATCH") {
        const id = idOf(url.searchParams.get("id")), cid = idOf(url.searchParams.get("cid"));
        const t = text(((await req.json().catch(() => ({}))) as Record<string, unknown>).text, MAX.comment);
        if (!t) return fail(400, "남길 말을 써 주세요.");
        const out = await editPost(id, (p) => {
          const c = p.comments.find((x) => x.id === cid);
          if (!c) return fail(404, "댓글을 찾을 수 없어요.");
          if (!user.staff && c.ah !== user.ah) return fail(403, "댓글은 쓴 사람과 담당자만 고칠 수 있어요.");
          c.text = t;
          c.edited = new Date().toISOString();
          return p;
        });
        if (out instanceof Response) return out;
        await mirror(id, origin);
        return json({ ok: true, post: postView(out, user) });
      }
      if (m === "DELETE") {
        const id = idOf(url.searchParams.get("id")), cid = idOf(url.searchParams.get("cid"));
        const out = await editPost(id, (p) => {
          const c = p.comments.find((x) => x.id === cid);
          if (!c) return fail(404, "댓글을 찾을 수 없어요. 이미 지워졌을 수 있어요.");
          if (!user.admin && c.ah !== user.ah) return fail(403, "댓글은 쓴 사람과 관리자만 지울 수 있어요.");
          p.comments = p.comments.filter((x) => x.id !== cid);
          p.answered = answeredOf(p.comments);
          return p;
        });
        if (out instanceof Response) return out;
        await editIndex((list) => list.map((s) => (s.id === id ? toSummary(out) : s)));
        await mirror(id, origin);
        return json({ ok: true, post: postView(out, user) });
      }
    }

    /* ---------- 첨부(사진·동영상·문서) — 브라우저가 구글 드라이브에 직접 올린다 ---------- */
    if (path === "/api/board/file/init" && m === "POST") {
      if (!user) return needLogin();
      if (!(await driveOn())) return fail(409, "첨부 저장소(구글 드라이브)가 아직 연결되지 않았어요. 링크로 남기거나 잠시 뒤 다시 시도해 주세요.");
      const b = await body();
      const id = idOf(b.id), name = withExt(fileName(b.name), text(b.type, 100)), type = mimeOf(name), bytes = Math.floor(Number(b.size) || 0);
      const kind = kindOf(name);
      if (!kind) return fail(400, `'${name}'은(는) 올릴 수 없는 파일이에요. 사진·동영상·문서(한글·PDF·워드 등)만 올릴 수 있어요.`);
      if (bytes <= 0) return fail(400, "빈 파일은 올릴 수 없어요.");
      if (bytes > KINDS[kind].max) return fail(413, `'${name}'이(가) 너무 커요. ${kind === "video" ? "동영상" : kind === "image" ? "사진" : "문서"}은 ${size(KINDS[kind].max)}까지 올릴 수 있어요.`);
      const p0 = await getPost(id);
      if (!p0) return fail(404, "글을 찾을 수 없어요.");
      if (p0.ah !== user.ah) return fail(403, "첨부는 글쓴이만 올릴 수 있어요.");
      if ((p0.files || []).filter((f) => f.status !== "failed").length >= MAX.files) return fail(400, `첨부는 글 하나에 ${MAX.files}개까지 올릴 수 있어요.`);
      if (!(await allow("bytes", user, bytes))) return fail(429, "오늘 올릴 수 있는 첨부 용량(1GB)을 넘었어요. 내일 다시 올려 주세요.");
      const folderId = await postFolder(p0);
      const fid = uid("f");
      const uploadUrl = await createUploadSession({ name, mimeType: type, size: bytes, parentId: folderId, appProperties: { post: id, fid }, origin });
      const out = await editPost(id, (p) => {
        p.folderId ||= folderId;
        p.files = [...(p.files || []), { id: fid, name, size: bytes, type, kind, status: "pending", created: new Date().toISOString() }];
        return p;
      });
      if (out instanceof Response) return out;
      return json({ fid, uploadUrl, type });
    }

    if (path === "/api/board/file/done" && m === "POST") {
      if (!user) return needLogin();
      const b = await body();
      const id = idOf(b.id), fid = idOf(b.fid), driveId = String(b.driveId ?? "").replace(/[^\w-]/g, "").slice(0, 100);
      const p0 = await getPost(id);
      if (!p0) return fail(404, "글을 찾을 수 없어요.");
      if (p0.ah !== user.ah && !user.admin) return fail(403, "첨부는 글쓴이만 올릴 수 있어요.");
      // 드라이브에 정말 그 글의 폴더로 올라갔는지 확인한다
      const meta = await driveApi("files/" + driveId, { query: { fields: "id,size,mimeType,parents,appProperties" } });
      if (meta?.appProperties?.fid !== fid || !(meta?.parents || []).includes(p0.folderId)) return fail(400, "올린 파일을 확인하지 못했어요. 다시 올려 주세요.");
      const out = await editPost(id, (p) => {
        const f = (p.files || []).find((x) => x.id === fid);
        if (!f) return fail(404, "첨부를 찾을 수 없어요.");
        Object.assign(f, { status: "done", driveId, size: Number(meta.size) || f.size });
        return p;
      });
      if (out instanceof Response) return out;
      await editIndex((list) => list.map((s) => (s.id === id ? toSummary(out) : s)));
      await mirror(id, origin);
      return json({ ok: true, post: postView(out, user) });
    }

    if (path === "/api/board/file/fail" && m === "POST") {
      if (!user) return needLogin();
      const b = await body();
      const id = idOf(b.id), fid = idOf(b.fid);
      const out = await editPost(id, (p) => {
        if (p.ah !== user.ah && !user.admin) return fail(403, "첨부는 글쓴이만 올릴 수 있어요.");
        const f = (p.files || []).find((x) => x.id === fid);
        if (f && f.status === "pending") f.status = "failed";
        return p;
      });
      return out instanceof Response ? out : json({ ok: true, post: postView(out, user) });
    }

    if (path === "/api/board/file") {
      const id = idOf(url.searchParams.get("id")), fid = idOf(url.searchParams.get("fid"));
      const p = await getPost(id);
      if (!p) return fail(404, "글을 찾을 수 없어요.");
      const owner = !!user && p.ah === user.ah;
      // 공지의 첨부(안내 자료)는 누구나, 그 밖의 첨부는 글쓴이와 관리자만
      if (!p.notice && !(owner || user?.staff)) return user ? fail(403, "첨부는 글쓴이와 담당자만 볼 수 있어요.") : needLogin();
      const f = (p.files || []).find((x) => x.id === fid);
      if (!f) return fail(404, "첨부를 찾을 수 없어요.");
      if (m === "DELETE") {
        if (!user || !(owner || user.admin || (p.notice && user.staff))) return user ? fail(403, "첨부는 글쓴이와 관리자만 뺄 수 있어요.") : needLogin();
        if (f.driveId) await trash(f.driveId).catch((e) => console.warn("board trash file", e));
        const out = await editPost(id, (x) => ({ ...x, files: (x.files || []).filter((y) => y.id !== fid) }));
        if (out instanceof Response) return out;
        await editIndex((list) => list.map((s) => (s.id === id ? toSummary(out) : s)));
        await mirror(id, origin);
        return json({ ok: true, post: postView(out, user) });
      }
      if (m === "GET") {
        if (f.status !== "done" || !f.driveId) return fail(409, "아직 올라가지 않은 첨부예요.");
        if (url.searchParams.get("thumb")) {
          const t = await thumbnail(f.driveId).catch(() => null);
          // 썸네일은 구글이 만든 사진(jpeg·png)만 내보낸다
          const tt = t?.headers.get("content-type") || "";
          if (t?.body && /^image\/(jpeg|png|webp)\b/.test(tt)) return new Response(t.body, { headers: { "content-type": tt, ...PRIVATE } });
          if (f.kind !== "image" || f.size > VIEW_LIMIT) return fail(404, "미리보기가 없어요.");
        }
        if (f.size > VIEW_LIMIT) return fail(413, "파일이 커서 화면에서 바로 열 수 없어요. 담당자는 드라이브에서 열 수 있어요.");
        const r = await download(f.driveId);
        const pdf = extOf(f.name) === "pdf";
        const inline = f.kind !== "doc" || pdf;
        return new Response(r.body, {
          headers: {
            "content-type": mimeOf(f.name),
            "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
            ...PRIVATE,
            // PDF는 브라우저 PDF 보기가 막히지 않도록 빼고, 나머지는 문서로 열려도 스크립트가 돌지 않게
            ...(pdf ? {} : { "content-security-policy": "sandbox; default-src 'none'; img-src data: blob:; media-src blob:; style-src 'unsafe-inline'" }),
          },
        });
      }
    }

    if (path === "/api/board/draft" && m === "POST") {
      if (!user) return needLogin();
      const b = await body();
      const speech = text(b.text, MAX.speech);
      if (speech.length < 5) return fail(400, "정리할 말이 너무 짧아요. 조금 더 말씀해 주세요.");
      if (!(await allow("draft", user))) return fail(429, `AI 정리는 하루 ${PER_DAY.draft}번까지 쓸 수 있어요. 직접 고쳐서 올려 주세요.`);
      try {
        return json(await makeDraft(speech, b.notice === true && user.staff)); // 공지 정리는 담당자·현장교사 지원단만
      } catch (e) {
        if ((e as { status?: number }).status === 503) return fail(503, "AI 연결 설정이 아직 완료되지 않았어요. 직접 고쳐서 올려 주세요.");
        return fail(502, "AI가 잠시 정리하지 못했어요. 다시 누르거나 직접 고쳐서 올려 주세요.");
      }
    }

    return fail(404, "없는 주소예요.");
  } catch (e) {
    if (e instanceof DriveError) return fail(e.status, e.message);
    console.error("board", e);
    return fail(500, "잠시 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
  }
};

export const config: Config = { path: ["/api/board", "/api/board/*"] };

/* 담당자와 소통 게시판 (서버: netlify/functions/board.mts · drive.mts)
   - 글쓰기는 구글 로그인 뒤. 직접 쓰기, 칸마다 마이크로 말해서 쓰기, '말로 남기기'(길게 말하고 멈추면 AI가 제목·내용을 정리)
   - 첨부: 사진·동영상·문서(한글·PDF·워드 등)는 브라우저가 담당자 구글 드라이브에 바로 올리고, 링크는 글과 함께 저장
     첨부는 공개글이어도 쓴 사람과 담당자만 볼 수 있다(담당자에게 '제출')
   - 게시 전 확인 창에서 '게시 승인'을 눌러야 올라간다. 쓰던 글은 이 탭에 잠시 보관(다른 화면에 다녀와도 그대로)
   - 비밀글은 제목만 보이고 내용·답변은 쓴 사람과 담당자(관리자·현장교사 지원단)만. 지우기는 쓴 사람·관리자. 담당자는 답변, 공개글에는 로그인한 누구나 댓글
   - 역할: 최고관리자·협력관리자(같은 권한: 모든 권한) · 현장교사 지원단(비밀글 보기·답변, 모든 글 고치기, 공지 쓰기)
     관리자에게는 위쪽에 '관리자 메뉴'(구글 드라이브 연결, 관리자·현장교사 지원단 지정)가 보인다
   - 로그인한 일반 이용자는 아래쪽에서 현장교사 지원단을 신청할 수 있다 */
(function () {
  "use strict";
  const { esc, icon, toast } = SEE;
  const voice = SEE.voice;
  const auth = window.SEEAuth;
  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = "see.board.draft";

  /* 서버와 같은 첨부 규칙(서버가 다시 확인한다) */
  const KINDS = {
    image: { label: "사진", max: 30 * 1024 ** 2, ext: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"] },
    video: { label: "동영상", max: 300 * 1024 ** 2, ext: ["mp4", "mov", "m4v", "webm", "avi", "3gp", "mkv"] },
    doc: { label: "문서", max: 50 * 1024 ** 2, ext: ["pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp", "csv"] },
  };
  const MAX_FILES = 10, MAX_LINKS = 10;

  let me = null;            // 서버가 확인한 로그인 정보 { name, role, admin, staff }
  const ROLE_NAME = { super: "최고관리자", manager: "협력관리자", teacher: "현장교사 지원단" };
  let attachOn = false;     // 담당자가 드라이브를 연결했는지
  let items = [];
  let filter = "all";
  const open = new Set();   // 펼쳐 둔 글
  let queue = [];           // 올릴 첨부 [{ file, kind, url(미리보기) }]

  /* ---------- 서버 ---------- */
  async function api(path, opt = {}) {
    const tk = auth?.token?.();
    const res = await fetch(path, {
      method: opt.method || "GET",
      headers: { ...(opt.body ? { "content-type": "application/json" } : {}), ...(tk ? { Authorization: "Bearer " + tk } : {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && tk) auth.signOut?.(); // 로그인이 끝난 경우 — 다시 로그인하도록
      throw Object.assign(new Error(j.message || "잠시 문제가 생겼어요. 다시 시도해 주세요."), { status: res.status });
    }
    return j;
  }
  // 첨부 파일 받기(로그인 확인이 필요해 fetch로 받아 화면 주소로 바꾼다)
  async function fileBlob(id, fid, thumb) {
    const res = await fetch(`/api/board/file?id=${encodeURIComponent(id)}&fid=${encodeURIComponent(fid)}${thumb ? "&thumb=1" : ""}`, { headers: { Authorization: "Bearer " + (auth?.token?.() || "") } });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw Object.assign(new Error(j.message || "첨부를 열지 못했어요."), { status: res.status });
    }
    return res.blob();
  }

  const pad = (n) => String(n).padStart(2, "0");
  function when(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const same = d.toDateString() === new Date().toDateString();
    return same ? `오늘 ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }
  const size = (n) => (n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const kindIcon = (k) => icon(k === "image" ? "camera" : k === "video" ? "video" : "file");
  function kindOf(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    for (const k of Object.keys(KINDS)) if (KINDS[k].ext.includes(ext)) return k;
    if ((f.type || "").startsWith("image/")) return "image";
    if ((f.type || "").startsWith("video/")) return "video";
    return null;
  }

  /* ---------- 목록 ---------- */
  const rowInner = (p) =>
    `<span class="b-badges">${p.notice ? `<span class="b-notice">${icon("info")}공지</span>` : ""}${p.secret ? `<span class="b-lock">${icon("lock")}비밀글</span>` : ""}${p.notice ? "" : `<span class="b-state${p.answered ? " done" : ""}">${p.answered ? "답변 완료" : "답변 대기"}</span>`}` +
    `${p.files ? `<span class="b-clip" title="첨부 ${p.files}개">${icon("file")}${p.files}</span>` : ""}${p.links ? `<span class="b-clip" title="링크 ${p.links}개">${icon("link")}${p.links}</span>` : ""}</span>` +
    `<span class="b-title">${esc(p.title)}</span>` +
    `<span class="b-meta">${esc(p.author)}${p.mine ? " (나)" : ""} · ${when(p.created)}${p.comments ? ` · 댓글 ${p.comments}` : ""}</span>`;

  function renderList() {
    // 공지는 맨 위에(같은 묶음 안에서는 최근 글이 먼저)
    const shown = items
      .filter((p) => (filter === "wait" ? !p.notice && !p.answered : filter === "mine" ? p.mine : true))
      .sort((a, b) => (b.notice ? 1 : 0) - (a.notice ? 1 : 0));
    $("b-count").innerHTML = `글 <b>${items.length}</b>개` + (me ? ` · <span class="b-me">${esc(me.call || me.name + "님")}${me.role ? ` <span class="tag ${me.admin ? "navy" : "teal"}">${ROLE_NAME[me.role]}</span>` : ""}</span>` : "");
    $("b-empty").hidden = shown.length > 0;
    $("b-empty").textContent = items.length ? (filter === "mine" ? (me ? "내가 쓴 글이 없어요." : "로그인하면 내가 쓴 글을 모아 볼 수 있어요.") : "답변을 기다리는 글이 없어요.") : "아직 남겨진 글이 없어요. 첫 의견을 남겨 주세요.";
    $("b-list").innerHTML = shown.map((p) => `
      <li class="b-item${p.mine ? " mine" : ""}${p.notice ? " is-notice" : ""}" data-id="${esc(p.id)}">
        <button type="button" class="b-row" aria-expanded="${open.has(p.id)}" aria-controls="bd-${esc(p.id)}">${rowInner(p)}</button>
        <div class="b-detail" id="bd-${esc(p.id)}"${open.has(p.id) ? "" : " hidden"}></div>
      </li>`).join("");
    shown.forEach((p) => open.has(p.id) && loadDetail(p.id));
  }

  async function loadList() {
    try {
      const r = await api("/api/board");
      me = r.me;
      attachOn = !!r.attach;
      items = r.items || [];
      renderList();
      attachUi();
      $("b-notice").hidden = !me?.staff;
      if (me?.admin) { driveStatus(); rolesLoad(); }
      else $("drive").hidden = true;
      applyLoad();
    } catch (e) {
      $("b-list").innerHTML = `<li class="b-wait">${esc(e.message)}</li>`;
    }
  }

  function updateRow(p) {
    const it = items.find((x) => x.id === p.id);
    if (!it) return;
    it.answered = p.answered;
    it.comments = p.commentCount;
    it.files = p.fileCount;
    it.links = p.links?.length ?? it.links;
    it.title = p.title;
    const row = document.querySelector(`.b-item[data-id="${CSS.escape(p.id)}"] .b-row`);
    if (row) row.innerHTML = rowInner(it);
  }

  /* ---------- 글 보기 ---------- */
  async function loadDetail(id) {
    const box = $("bd-" + id);
    if (!box) return;
    box.innerHTML = `<p class="b-wait">불러오는 중…</p>`;
    try {
      const { post } = await api("/api/board/post?id=" + encodeURIComponent(id));
      renderDetail(box, post);
    } catch (e) {
      box.innerHTML = `<p class="b-wait">${esc(e.message)}</p>`;
      if (e.status === 404) loadList();
    }
  }

  function filesHtml(p) {
    if (!p.canSeeFiles) {
      return p.fileCount ? `<p class="b-files-note">${icon("file")}첨부 ${p.fileCount}개 · 담당자에게 제출됨</p>` : "";
    }
    const admin = !!me?.admin;
    if (!p.files.length && !p.canAttach) return "";
    return `<div class="b-files">
      <h4>${icon("file")}첨부 ${p.files.length}개 <small>${p.notice ? "누구나 받을 수 있어요" : "쓴 분과 담당자만 볼 수 있어요"}</small>${admin && p.folder ? ` <a class="b-link" href="${esc(p.folder)}" target="_blank" rel="noopener">${icon("folder")}드라이브 폴더</a>` : ""}</h4>
      ${p.files.length ? `<ul>${p.files.map((f) => `
        <li class="b-file ${f.status}" data-fid="${esc(f.id)}">
          <span class="b-thumb" data-kind="${f.kind}">${kindIcon(f.kind)}</span>
          <span class="b-fname"><b>${esc(f.name)}</b><small>${size(f.size)} · ${f.status === "done" ? "제출됨" : f.status === "pending" ? "올리는 중이거나 멈춤" : "올리지 못함"}</small></span>
          <span class="b-facts">
            ${f.status === "done" && f.viewable ? `<button type="button" class="btn btn-line btn-sm" data-act="fopen" data-fid="${esc(f.id)}">${f.kind === "doc" && !/pdf/i.test(f.type) ? `${icon("download")}내려받기` : `${icon("eye")}보기`}</button>` : ""}
            ${f.drive ? `<a class="btn btn-line btn-sm" href="${esc(f.drive)}" target="_blank" rel="noopener">${icon("external")}드라이브</a>` : ""}
            ${p.canDelete ? `<button type="button" class="b-cmt-del" data-act="fdel" data-fid="${esc(f.id)}" aria-label="${esc(f.name)} 첨부 빼기">${icon("trash")}</button>` : ""}
          </span>
        </li>`).join("")}</ul>` : ""}
      ${p.canAttach && attachOn ? `<button type="button" class="btn btn-line btn-sm" data-act="fadd">${icon("camera")}첨부 더 올리기</button>` : ""}
    </div>`;
  }

  function renderDetail(box, p) {
    box._post = p;
    if (!p.canRead) {
      box.innerHTML = `<div class="b-locked">${icon("lock")}<p><b>비밀글이에요.</b> 내용과 답변은 쓴 분과 담당자만 볼 수 있어요.${me ? "" : " 쓴 분이라면 로그인해 주세요."}</p>${me ? "" : `<button type="button" class="btn btn-line btn-sm" data-act="login">로그인</button>`}</div>${filesHtml(p)}`;
      return;
    }
    const admin = !!me?.admin, staff = !!me?.staff;
    box.innerHTML = `
      <div class="b-body">${esc(p.content)}</div>
      ${p.edited ? `<p class="b-edited">${icon("pen")}고친 때 ${when(p.edited)}</p>` : ""}
      ${p.links.length ? `<ul class="b-links">${p.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">${icon("link")}<span>${esc(l.title || host(l.url))}</span><small>${esc(host(l.url))}</small></a></li>`).join("")}</ul>` : ""}
      ${filesHtml(p)}
      <div class="b-tools">
        ${voice?.canSpeak ? `<button type="button" class="btn btn-line btn-sm" data-act="read" aria-pressed="false">${icon("sound")}듣기</button>` : ""}
        ${p.canEdit ? `<button type="button" class="btn btn-line btn-sm" data-act="edit">${icon("pen")}고치기</button>` : ""}
        ${p.canDelete ? `<button type="button" class="btn btn-line btn-sm b-del" data-act="del">${icon("trash")}글 지우기</button>` : ""}
      </div>
      ${p.comments.length ? `<div class="b-comments">${p.comments.map((c) => `
        <div class="b-cmt${c.staff ? " " + c.staff : ""}" data-cid="${esc(c.id)}">
          <div class="b-cmt-head">
            ${c.staff ? `<span class="b-ans ${c.staff}">${icon("reply")}${esc(c.author)} 답변</span>` : `<b>${esc(c.author)}${c.mine ? " (나)" : ""}</b>`}
            <span class="b-cmt-time">${when(c.created)}${c.edited ? " · 고침" : ""}</span>
            ${c.canEdit ? `<button type="button" class="b-cmt-del b-cmt-edit" data-act="cedit" data-cid="${esc(c.id)}" aria-label="이 글 고치기">${icon("pen")}</button>` : ""}
            ${c.canDelete ? `<button type="button" class="b-cmt-del" data-act="cdel" data-cid="${esc(c.id)}" aria-label="이 ${c.staff ? "답변" : "댓글"} 지우기">${icon("trash")}</button>` : ""}
          </div>
          <div class="b-cmt-body">${esc(c.text)}</div>
        </div>`).join("")}</div>` : p.secret || p.notice || staff ? "" : `<p class="b-hint">아직 답변이 없어요. 담당자나 현장교사 지원단이 확인 후 답변해 드려요.</p>`}
      ${p.canComment ? `
        <form class="b-cform">
          <label class="b-label" for="bc-${esc(p.id)}">${p.notice ? "댓글 쓰기" : admin ? "담당자 답변 쓰기" : staff ? "현장교사 지원단 답변 쓰기" : p.secret ? "담당자에게 더 남길 말" : "댓글 쓰기"}</label>
          <div class="b-field">
            <textarea id="bc-${esc(p.id)}" rows="3" maxlength="2000" placeholder="${staff && !p.notice ? "답변을 써 주세요. 말로 하려면 마이크를 누르세요." : "남길 말을 써 주세요. 말로 하려면 마이크를 누르세요."}"></textarea>
            <button type="button" class="mic" data-mic="bc-${esc(p.id)}"></button>
          </div>
          <div class="b-cform-acts"><button type="submit" class="btn btn-navy btn-sm">${staff && !p.notice ? "답변 남기기" : "남기기"}</button></div>
        </form>` : !me && !p.secret ? `<p class="b-hint">로그인하면 댓글을 남길 수 있어요. <button type="button" class="b-link" data-act="login">로그인</button></p>` : ""}`;
    box.querySelectorAll("[data-mic]").forEach((b) => {
      const ta = $(b.dataset.mic);
      voice?.bindMic(b, ta, (t) => { ta.value = t; }, { append: true });
    });
    loadThumbs(box, p);
  }

  // 사진·동영상 미리보기(드라이브 썸네일)
  function loadThumbs(box, p) {
    if (!p.canSeeFiles) return;
    p.files.filter((f) => f.status === "done" && f.kind !== "doc").forEach(async (f) => {
      const el = box.querySelector(`.b-file[data-fid="${CSS.escape(f.id)}"] .b-thumb`);
      try {
        const url = URL.createObjectURL(await fileBlob(p.id, f.id, true));
        if (el) el.innerHTML = `<img src="${url}" alt="">`;
      } catch { /* 미리보기가 없으면 아이콘 그대로 */ }
    });
  }

  async function openFile(p, f) {
    try {
      toast("여는 중이에요…");
      const blob = await fileBlob(p.id, f.id);
      const pdf = /\.pdf$/i.test(f.name);
      if (f.kind === "doc" && !pdf) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      // 화면에 띄우는 형식은 확장자로 정한다(PDF 칸에는 PDF로만)
      const url = URL.createObjectURL(pdf ? new Blob([blob], { type: "application/pdf" }) : blob);
      $("bv-title").textContent = f.name;
      $("bv-body").innerHTML = f.kind === "image" ? `<img src="${url}" alt="${esc(f.name)}">`
        : f.kind === "video" ? `<video src="${url}" controls playsinline></video>`
        : `<iframe src="${url}" title="${esc(f.name)}"></iframe>`;
      $("b-viewer").showModal();
    } catch (e) {
      toast(e.message);
    }
  }
  $("bv-close").addEventListener("click", () => $("b-viewer").close());
  $("b-viewer").addEventListener("close", () => { $("bv-body").innerHTML = ""; });

  /* 글 듣기(시각장애·저시력 이용자) */
  let reading = null;
  function read(btn, p) {
    if (reading) {
      voice.stop();
      const was = reading;
      reading = null;
      setRead(was, false);
      if (was === btn) return;
    }
    const txt = [p.title + ".", p.content, ...p.comments.map((c) => (c.staff ? c.author + " 답변. " : c.author + "님 댓글. ") + c.text)].join("\n");
    voice.unlock?.();
    reading = btn;
    setRead(btn, true);
    voice.speak(txt, (r) => {
      if (r === "stopped") return;
      if (reading === btn) { reading = null; setRead(btn, false); }
      if (r !== "ok") toast("소리를 낼 수 없어요. 기기의 소리(음량)를 확인해 주세요.");
    });
  }
  const setRead = (btn, on) => {
    if (!btn?.isConnected) return;
    btn.setAttribute("aria-pressed", String(on));
    btn.innerHTML = on ? `${icon("stop")}멈추기` : `${icon("sound")}듣기`;
  };

  /* 글 고치기(작성자·관리자, 공지는 현장교사 지원단도) */
  function editPostUi(box, p) {
    const n = esc(p.id);
    box.innerHTML = `<form class="b-edit" data-edit="post">
      <label class="b-label" for="be-t-${n}">제목</label>
      <div class="b-field"><input id="be-t-${n}" maxlength="100" value="${esc(p.title)}"></div>
      <label class="b-label" for="be-c-${n}">내용</label>
      <div class="b-field"><textarea id="be-c-${n}" rows="8" maxlength="5000">${esc(p.content)}</textarea><button type="button" class="mic" data-mic="be-c-${n}"></button></div>
      <div class="b-cform-acts"><button type="button" class="btn btn-line btn-sm" data-act="ecancel">취소</button><button type="submit" class="btn btn-navy btn-sm">고친 내용 저장</button></div>
    </form>`;
    const ta = $("be-c-" + p.id);
    voice?.bindMic(box.querySelector("[data-mic]"), ta, (t) => { ta.value = t; }, { append: true });
    $("be-t-" + p.id).focus();
  }
  function editCommentUi(box, p, cid) {
    const c = p.comments.find((x) => x.id === cid);
    const el = box.querySelector(`.b-cmt[data-cid="${CSS.escape(cid)}"] .b-cmt-body`);
    if (!c || !el) return;
    el.innerHTML = `<form class="b-edit" data-edit="comment" data-cid="${esc(cid)}">
      <div class="b-field"><textarea rows="3" maxlength="2000" aria-label="고칠 내용">${esc(c.text)}</textarea></div>
      <div class="b-cform-acts"><button type="button" class="btn btn-line btn-sm" data-act="ecancel">취소</button><button type="submit" class="btn btn-navy btn-sm">저장</button></div>
    </form>`;
    el.querySelector("textarea").focus();
  }

  let addTo = null; // '첨부 더 올리기' 대상 글
  $("b-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".b-row");
    if (row) {
      const id = row.closest(".b-item").dataset.id, box = $("bd-" + id);
      const on = box.hidden;
      box.hidden = !on;
      row.setAttribute("aria-expanded", String(on));
      if (on) { open.add(id); loadDetail(id); } else open.delete(id);
      return;
    }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const li = act.closest(".b-item"), id = li?.dataset.id, box = id && $("bd-" + id), p = box?._post;
    const kind = act.dataset.act;
    if (kind === "login") return showLogin(true);
    if (kind === "read" && p) return read(act, p);
    if (kind === "fopen" && p) return openFile(p, p.files.find((f) => f.id === act.dataset.fid));
    if (kind === "fadd" && p) { addTo = p; return pickFor("any"); }
    if (kind === "edit" && p) return editPostUi(box, p);
    if (kind === "cedit" && p) return editCommentUi(box, p, act.dataset.cid);
    if (kind === "ecancel" && p) return renderDetail(box, p);
    if (kind === "fdel") {
      if (!confirm("이 첨부를 뺄까요? 드라이브에서는 휴지통으로 옮겨져요.")) return;
      try {
        const r = await api(`/api/board/file?id=${encodeURIComponent(id)}&fid=${encodeURIComponent(act.dataset.fid)}`, { method: "DELETE" });
        renderDetail(box, r.post);
        updateRow(r.post);
      } catch (err) { toast(err.message); }
      return;
    }
    if (kind === "del") {
      if (!confirm("이 글을 지울까요? 지운 글과 답변·첨부는 되돌릴 수 없어요.")) return;
      try {
        await api("/api/board/post?id=" + encodeURIComponent(id), { method: "DELETE" });
        open.delete(id);
        toast("글을 지웠어요.");
        await loadList();
      } catch (err) { toast(err.message); }
      return;
    }
    if (kind === "cdel") {
      if (!confirm("이 글을 지울까요?")) return;
      try {
        const { post } = await api(`/api/board/comment?id=${encodeURIComponent(id)}&cid=${encodeURIComponent(act.dataset.cid)}`, { method: "DELETE" });
        renderDetail(box, post);
        updateRow(post);
      } catch (err) { toast(err.message); }
    }
  });

  $("b-list").addEventListener("submit", async (e) => {
    const ed = e.target.closest(".b-edit");
    if (ed) {
      e.preventDefault();
      const id = ed.closest(".b-item").dataset.id, box = $("bd-" + id), p = box._post;
      const btn = ed.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        if (ed.dataset.edit === "post") {
          const t = $("be-t-" + id).value.trim(), c = $("be-c-" + id).value.trim();
          if (!t || !c) { toast("제목과 내용을 모두 써 주세요."); btn.disabled = false; return; }
          const { post } = await api("/api/board/post?id=" + encodeURIComponent(id), { method: "PATCH", body: { title: t, content: c, links: p.links } });
          renderDetail(box, post);
          updateRow(post);
        } else {
          const t = ed.querySelector("textarea").value.trim();
          if (!t) { toast("남길 말을 써 주세요."); btn.disabled = false; return; }
          const { post } = await api(`/api/board/comment?id=${encodeURIComponent(id)}&cid=${encodeURIComponent(ed.dataset.cid)}`, { method: "PATCH", body: { text: t } });
          renderDetail(box, post);
        }
        toast("고쳤어요.");
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
      return;
    }
    const f = e.target.closest(".b-cform");
    if (!f) return;
    e.preventDefault();
    const id = f.closest(".b-item").dataset.id, ta = f.querySelector("textarea"), t = ta.value.trim();
    if (!t) return ta.focus();
    const btn = f.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const { post } = await api("/api/board/comment", { method: "POST", body: { id, text: t } });
      renderDetail($("bd-" + id), post);
      updateRow(post);
      toast(me?.staff ? "답변을 남겼어요." : "남겼어요.");
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });

  document.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderList();
    })
  );

  /* ---------- 로그인 ---------- */
  function showLogin(scroll) {
    const box = $("b-login");
    box.hidden = false;
    if (scroll) box.scrollIntoView({ behavior: "smooth", block: "center" });
    if (auth?.inApp) {
      $("b-login-msg").innerHTML = `카카오톡·네이버 앱 안의 화면에서는 구글 로그인이 막혀 있어요. <button type="button" class="b-link" id="b-ext">다른 브라우저로 열기</button>`;
      $("b-ext")?.addEventListener("click", () => auth.openExternal());
      return;
    }
    auth?.renderButton($("b-gbtn")).then((ok) => { if (!ok) $("b-login-msg").textContent = "로그인 단추를 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요."; });
  }

  /* ---------- 담당자 메뉴: 저장소(구글 드라이브) ---------- */
  async function driveStatus() {
    const box = $("drive");
    box.hidden = false;
    const st = $("b-drive-state"), acts = $("b-drive-acts");
    try {
      const d = await api("/api/drive/status");
      if (!d.connected) {
        st.innerHTML = d.ready
          ? "아직 연결되지 않았어요. <b>드라이브 연결</b>을 눌러 담당자 구글 계정으로 한 번 승인해 주세요. 연결하면 글과 사진·동영상·문서가 드라이브에 모이고, 첨부 올리기가 열려요."
          : "드라이브 연결 설정(구글 클라우드의 비밀값)이 아직 누리집에 들어가지 않았어요. 설정이 끝나면 여기서 연결할 수 있어요.";
        acts.innerHTML = d.ready ? `<button type="button" class="btn btn-navy btn-sm" id="b-drive-go">${icon("folder")}드라이브 연결</button>` : "";
      } else if (d.error) {
        st.innerHTML = `연결은 되어 있지만 드라이브를 확인하지 못했어요: ${esc(d.error)} <br>필요하면 다시 연결해 주세요.`;
        acts.innerHTML = `<button type="button" class="btn btn-navy btn-sm" id="b-drive-go">다시 연결</button>`;
      } else {
        st.innerHTML = `<b>연결됨</b> · ${esc(d.connectedBy || "")} · ${when(d.connectedAt)}부터. 게시판의 글과 첨부는 드라이브의 <b>'SEE 누리집 자료'</b> 폴더에 글마다 모여요.` +
          (d.inHub === false ? `<br><span class="b-warn">이 폴더를 거점 폴더('유아특수 웹앱') 안으로 끌어다 옮겨 주세요. 옮겨도 계속 그 안에 저장돼요.</span>` : d.inHub ? " 거점 폴더('유아특수 웹앱') 안에 있어요." : "");
        acts.innerHTML = `<a class="btn btn-navy btn-sm" href="${esc(d.root)}" target="_blank" rel="noopener">${icon("folder")}누리집 폴더 열기</a>` +
          (d.hub ? `<a class="btn btn-line btn-sm" href="${esc(d.hub)}" target="_blank" rel="noopener">거점 폴더 열기</a>` : "") +
          `<button type="button" class="btn btn-line btn-sm" id="b-drive-go">다시 연결</button><button type="button" class="btn btn-line btn-sm" id="b-drive-off">연결 끊기</button>`;
      }
      $("b-drive-go")?.addEventListener("click", async () => {
        // 다른 관리자 계정으로 다시 연결하면 새 자료가 그 계정의 드라이브에 쌓이므로 한 번 확인한다
        const mine = (auth?.user?.()?.email || "").toLowerCase();
        if (d.connected && d.connectedBy && mine && d.connectedBy.toLowerCase() !== mine &&
          !confirm(`지금은 ${d.connectedBy} 계정의 드라이브에 연결돼 있어요.\n${mine} 계정으로 다시 연결하면 앞으로 올라오는 자료는 이 계정의 드라이브에 쌓이고, 지금까지 자료는 원래 드라이브에 그대로 남아요.\n그래도 다시 연결할까요?`)) return;
        try { const r = await api("/api/drive/connect", { method: "POST" }); location.href = r.url; } catch (e) { toast(e.message); }
      });
      $("b-drive-off")?.addEventListener("click", async () => {
        if (!confirm("드라이브 연결을 끊을까요? 이미 모인 파일은 드라이브에 그대로 남고, 새 첨부 올리기만 멈춰요.")) return;
        try { await api("/api/drive/disconnect", { method: "POST" }); toast("연결을 끊었어요."); loadList(); } catch (e) { toast(e.message); }
      });
    } catch (e) {
      st.textContent = e.message;
      acts.innerHTML = "";
    }
  }
  /* 관리자와 현장교사 지원단 지정(최고·협력관리자는 같은 권한: 모든 역할 지정·빼기, 이름 고치기) */
  const canManage = () => !!me?.admin;
  // 토글 펼침 상태 기억(노션처럼)
  const ROLES_OPEN = "see.board.rolesOpen";
  try { $("b-roles").open = localStorage.getItem(ROLES_OPEN) === "1"; } catch {}
  $("b-roles").addEventListener("toggle", () => { try { localStorage.setItem(ROLES_OPEN, $("b-roles").open ? "1" : "0"); } catch {} });
  function drawMembers(r) {
    // 접혀 있어도 몇 명인지, 기다리는 신청이 있는지 보이게
    $("b-roles-count").innerHTML = `${r.members.length}명` + (r.applications.length ? ` · <b>신청 ${r.applications.length}건 기다리는 중</b>` : "");
    // 이름에는 직함이 붙어 보인다(이영미 장학사 · 김하늘 선생님). 기본 최고관리자는 이름만 고칠 수 있다
    $("b-members").innerHTML = r.members.map((m) => {
      const canName = canManage();
      return `
      <li>
        <span class="b-role ${m.role}">${esc(m.label)}</span>
        <span class="b-mname"><b>${esc(m.display || m.name || m.email)}</b>${m.display || m.name ? `<small>${esc(m.email)}</small>` : ""}</span>
        ${m.fixed ? `<small class="b-fixed">기본</small>` : ""}
        ${canName ? `<button type="button" class="b-cmt-del b-cmt-edit" data-name-role="${esc(m.email)}" data-role="${esc(m.role)}" data-name="${esc(m.name)}" aria-label="${esc(m.display || m.email)} 이름 고치기" title="이름 고치기">${icon("pen")}</button>` : ""}
        ${!m.fixed && canManage() && m.email !== auth?.user?.()?.email?.toLowerCase() ? `<button type="button" class="b-cmt-del" data-rm-role="${esc(m.email)}" aria-label="${esc(m.email)} 빼기" title="빼기">${icon("trash")}</button>` : ""}
      </li>`;
    }).join("");
    $("b-apps").innerHTML = r.applications.length
      ? `<h3>현장교사 지원단 신청 ${r.applications.length}건</h3><ul>${r.applications.map((a) => `
          <li><span class="b-mname"><b>${esc(a.name)}</b><small>${esc(a.email)} · ${esc(a.school)}${a.note ? " · " + esc(a.note) : ""}</small></span>
          <button type="button" class="btn btn-navy btn-sm" data-app="${esc(a.email)}" data-ok="1">승인</button>
          <button type="button" class="btn btn-line btn-sm" data-app="${esc(a.email)}" data-ok="0">거절</button></li>`).join("")}</ul>`
      : "";
  }
  async function rolesLoad() {
    const opts = [["teacher", "현장교사 지원단"], ["manager", "협력관리자"], ["super", "최고관리자"]];
    $("br-role").innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    try { drawMembers(await api("/api/admin/roles")); } catch (e) { $("b-members").innerHTML = `<li>${esc(e.message)}</li>`; }
  }
  $("b-role-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await api("/api/admin/roles", { method: "POST", body: { email: $("br-email").value.trim(), name: $("br-name").value.trim(), role: $("br-role").value } });
      drawMembers(r);
      const role = $("br-role").value;
      $("br-email").value = $("br-name").value = "";
      toast(role === "teacher" ? "지정했어요. 그분이 다시 로그인하면 바로 적용돼요." : "지정했어요. 구글 드라이브의 거점 폴더도 이 계정과 '편집자'로 공유해 주세요.");
    } catch (err) { toast(err.message); }
  });
  $("b-roles").addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-rm-role]"), app = e.target.closest("[data-app]"), nm = e.target.closest("[data-name-role]");
    try {
      if (nm) {
        const name = prompt(`${nm.dataset.nameRole}\n화면에 보일 이름을 써 주세요. 직함(장학사·선생님)은 저절로 붙어요.`, nm.dataset.name || "");
        if (name === null || !name.trim()) return;
        drawMembers(await api("/api/admin/roles", { method: "POST", body: { email: nm.dataset.nameRole, role: nm.dataset.role, name: name.trim() } }));
        if (auth?.user?.()?.email?.toLowerCase() === nm.dataset.nameRole) { // 내 이름을 고쳤으면 위쪽 이름도 바로
          try { sessionStorage.removeItem("see.me"); } catch {}
          auth.renderUtil?.();
          loadList();
          toast("이름을 고쳤어요.");
        } else toast("이름을 고쳤어요. 그분이 다음에 로그인할 때 인사말에도 반영돼요.");
      }
      if (rm) {
        if (!confirm(`${rm.dataset.rmRole} 계정의 역할을 뺄까요?`)) return;
        drawMembers(await api("/api/admin/roles?email=" + encodeURIComponent(rm.dataset.rmRole), { method: "DELETE" }));
        toast("뺐어요.");
      }
      if (app) {
        drawMembers(await api("/api/admin/apply/decide", { method: "POST", body: { email: app.dataset.app, approve: app.dataset.ok === "1" } }));
        toast(app.dataset.ok === "1" ? "현장교사 지원단으로 승인했어요." : "신청을 거절했어요.");
      }
    } catch (err) { toast(err.message); }
  });

  /* 현장교사 지원단 신청(로그인한 일반 이용자) */
  async function applyLoad() {
    const card = $("b-apply");
    if (!me || me.staff) { card.hidden = true; return; }
    try {
      const r = await api("/api/admin/apply");
      card.hidden = false;
      $("b-apply-form").hidden = !!r.applied;
      $("b-apply-state").hidden = !r.applied;
      if (r.applied) $("b-apply-state").textContent = `${r.applied.school}(으)로 신청했어요. 관리자가 확인하면 답글·공지 권한이 생겨요.`;
    } catch { card.hidden = true; }
  }
  $("b-apply-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/apply", { method: "POST", body: { school: $("ba-school").value.trim(), note: $("ba-note").value.trim() } });
      toast("신청했어요. 관리자가 확인한 뒤 알려 드려요.");
      applyLoad();
    } catch (err) { toast(err.message); }
  });

  // 구글 동의 화면에서 돌아왔을 때
  const back = new URLSearchParams(location.search).get("drive");
  if (back) {
    const MSG = { ok: "구글 드라이브를 연결했어요.", denied: "드라이브 연결을 취소했어요.", expired: "연결 시간이 지났어요. 다시 눌러 주세요.", norefresh: "연결 정보를 받지 못했어요. 다시 연결해 주세요.", scope: "드라이브 권한을 받지 못했어요. 동의 화면에서 드라이브 항목을 허용해 주세요." };
    setTimeout(() => toast(MSG[back] || "드라이브 연결을 마쳤어요."), 600);
    history.replaceState(null, "", location.pathname + location.hash);
  }

  /* ---------- 글쓰기 ---------- */
  const title = $("b-title"), content = $("b-content"), secret = $("b-secret");
  const updateLen = () => { $("b-len").textContent = `${content.value.length.toLocaleString()} / 5,000자`; };
  const linkRows = () => [...$("b-linkset").querySelectorAll(".b-linkrow")];
  const linkValues = () => linkRows().map((r) => ({ url: r.querySelector("[data-l=url]").value.trim(), title: r.querySelector("[data-l=title]").value.trim() })).filter((l) => l.url);
  const saveDraft = () => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ t: title.value, c: content.value, s: secret.checked, l: linkValues() })); } catch {} };
  function restoreDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      if (d) {
        title.value = d.t || "";
        content.value = d.c || "";
        secret.checked = !!d.s;
        $("b-linkset").innerHTML = "";
        (d.l || []).forEach((l) => addLinkRow(l));
      }
    } catch {}
    updateLen();
  }
  [title, content].forEach((el) => el.addEventListener("input", () => { updateLen(); saveDraft(); }));
  secret.addEventListener("change", saveDraft);

  /* 링크 */
  function addLinkRow(l = {}) {
    if (linkRows().length >= MAX_LINKS) return toast(`링크는 ${MAX_LINKS}개까지 남길 수 있어요.`);
    const row = document.createElement("div");
    row.className = "b-linkrow";
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    row.innerHTML = `<span class="b-link-ico">${icon("link")}</span>
      <label class="sr-only" for="lu-${n}">링크 주소</label><input id="lu-${n}" data-l="url" type="url" inputmode="url" placeholder="https://… (영상·사진 공유 주소, 기관 누리집 등)" value="${esc(l.url || "")}">
      <label class="sr-only" for="lt-${n}">링크 설명</label><input id="lt-${n}" data-l="title" maxlength="80" placeholder="설명(선택) 예) 아이 놀이 영상" value="${esc(l.title || "")}">
      <button type="button" class="b-cmt-del" aria-label="이 링크 빼기">${icon("close")}</button>`;
    row.querySelector("button").addEventListener("click", () => { row.remove(); saveDraft(); });
    row.querySelectorAll("input").forEach((i) => i.addEventListener("input", saveDraft));
    $("b-linkset").appendChild(row);
    if (!l.url) row.querySelector("[data-l=url]").focus();
  }
  $("b-link-add").addEventListener("click", () => addLinkRow());

  /* 사진·동영상·문서 고르기 */
  function attachUi() {
    document.querySelectorAll("[data-pick]").forEach((b) => (b.disabled = !attachOn));
    $("b-attach-off").hidden = attachOn;
  }
  function pickFor(kind) {
    const input = kind === "any" ? null : $("b-pick-" + kind);
    if (input) return input.click();
    // '첨부 더 올리기'는 종류를 가리지 않고 고른다
    const any = document.createElement("input");
    any.type = "file";
    any.multiple = true;
    any.accept = "image/*,video/*," + KINDS.doc.ext.map((x) => "." + x).join(",");
    any.addEventListener("change", () => { addMore(addTo, [...any.files]); });
    any.click();
  }
  document.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => pickFor(b.dataset.pick)));
  ["image", "video", "doc"].forEach((k) => $("b-pick-" + k).addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; }));

  function checkFile(f, already) {
    const kind = kindOf(f);
    if (!kind) return `'${f.name}'은(는) 올릴 수 없는 파일이에요. 사진·동영상·문서만 올릴 수 있어요.`;
    if (f.size > KINDS[kind].max) return `'${f.name}'이(가) 너무 커요. ${KINDS[kind].label}은 ${size(KINDS[kind].max)}까지 올릴 수 있어요.`;
    if (already >= MAX_FILES) return `첨부는 글 하나에 ${MAX_FILES}개까지 올릴 수 있어요.`;
    return "";
  }
  function addFiles(files) {
    for (const f of files) {
      const err = checkFile(f, queue.length);
      if (err) { toast(err); continue; }
      const kind = kindOf(f);
      queue.push({ file: f, kind, url: kind === "image" ? URL.createObjectURL(f) : "" });
    }
    drawQueue();
  }
  function drawQueue() {
    $("b-queue").innerHTML = queue.map((q, i) => `
      <li class="b-qi">
        <span class="b-thumb">${q.url ? `<img src="${q.url}" alt="">` : kindIcon(q.kind)}</span>
        <span class="b-fname"><b>${esc(q.file.name)}</b><small>${KINDS[q.kind].label} · ${size(q.file.size)}</small></span>
        <button type="button" class="b-cmt-del" data-rm="${i}" aria-label="${esc(q.file.name)} 빼기">${icon("close")}</button>
      </li>`).join("");
    $("b-queue").querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const q = queue.splice(+b.dataset.rm, 1)[0];
      if (q?.url) URL.revokeObjectURL(q.url);
      drawQueue();
    }));
  }

  /* 드라이브로 바로 올리기(서버가 만든 업로드 주소로) */
  function putFile(url, file, type, onPct) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("PUT", url);
      x.setRequestHeader("Content-Type", type || "application/octet-stream");  // 서버가 확장자로 정한 형식
      x.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) {
          try { res(JSON.parse(x.responseText)); } catch { rej(new Error("올린 결과를 읽지 못했어요.")); }
        } else rej(new Error("올리지 못했어요(" + x.status + ")."));
      };
      x.onerror = () => rej(new Error("인터넷 연결이 끊겨 올리지 못했어요."));
      x.send(file);
    });
  }
  async function uploadAll(postId, list, box) {
    let ok = 0;
    box.hidden = false;
    const draw = () => {
      box.innerHTML = list.map((q) => `
        <li class="b-qi ${q.state === "완료" ? "done" : q.state?.startsWith("실패") ? "failed" : ""}">
          <span class="b-thumb">${kindIcon(q.kind)}</span>
          <span class="b-fname"><b>${esc(q.file.name)}</b><small>${esc(q.state || "기다리는 중")}</small>
          ${q.pct > 0 && q.pct < 100 ? `<span class="b-bar"><i style="width:${q.pct}%"></i></span>` : ""}</span>
        </li>`).join("");
    };
    for (const q of list) {
      q.state = "올릴 준비"; q.pct = 0; draw();
      let fid = "";
      try {
        const init = await api("/api/board/file/init", { method: "POST", body: { id: postId, name: q.file.name, type: q.file.type, size: q.file.size } });
        fid = init.fid;
        q.state = "올리는 중";
        draw();
        const up = await putFile(init.uploadUrl, q.file, init.type, (pct) => { q.pct = pct; q.state = `올리는 중 ${pct}%`; draw(); });
        q.state = "확인 중"; q.pct = 100; draw();
        await api("/api/board/file/done", { method: "POST", body: { id: postId, fid, driveId: up.id } });
        q.state = "완료";
        ok++;
      } catch (e) {
        q.state = "실패: " + e.message;
        if (fid) api("/api/board/file/fail", { method: "POST", body: { id: postId, fid } }).catch(() => {});
      }
      draw();
    }
    return ok;
  }
  // 이미 올린 글에 첨부 더 올리기
  async function addMore(p, files) {
    if (!p || !files.length) return;
    const already = p.files.filter((f) => f.status !== "failed").length;
    const list = [];
    for (const f of files) {
      const err = checkFile(f, already + list.length);
      if (err) { toast(err); continue; }
      list.push({ file: f, kind: kindOf(f) });
    }
    if (!list.length) return;
    const box = $("bd-" + p.id);
    const prog = document.createElement("ul");
    prog.className = "b-queue b-progress";
    box.prepend(prog);
    const ok = await uploadAll(p.id, list, prog);
    toast(ok === list.length ? "첨부를 올렸어요." : `${list.length - ok}개는 올리지 못했어요.`);
    loadDetail(p.id);
    loadList();
  }

  /* 글쓰기 열고 닫기(notice: 공지 쓰기) */
  let writeNotice = false;
  function openWrite(notice = false) {
    writeNotice = !!notice;
    $("b-write-title").textContent = writeNotice ? "공지 쓰기" : "의견 남기기";
    $("b-secret-wrap").hidden = writeNotice;
    document.querySelector(".b-attach-head span").textContent = writeNotice
      ? "공지에 붙인 사진·동영상·문서는 누구나 받을 수 있어요."
      : "사진·동영상·문서는 담당자(장학사·현장교사 지원단)에게만 전달돼요. 공개글이어도 다른 분께는 보이지 않아요.";
    // 안내 문구도 공지에 맞게
    if (voice?.canListen) $("b-voice").querySelector(".b-voice-text span").textContent = writeNotice
      ? "보호자께 알릴 내용을 편하게 말씀해 주세요. 말을 마치고 잠시 기다리면 AI가 공지 제목과 내용을 정리해 드려요."
      : "담당자에게 하고 싶은 말을 편하게 말씀해 주세요. 말을 마치고 잠시 기다리면 AI가 제목과 내용을 자세히 정리해 드려요.";
    title.placeholder = writeNotice ? "예) 11월 특수교육대상자 선정 신청 안내" : "예) 진단·평가는 언제 신청하면 되나요?";
    content.placeholder = writeNotice
      ? "알릴 내용을 적어 주세요. 대상·일정·방법·문의처를 함께 적으면 보호자가 이해하기 쉬워요."
      : "아이의 나이와 지금 모습, 궁금한 점이나 바라는 점을 적어 주세요. 아이 이름·전화번호 같은 개인정보는 적지 말아 주세요.";
    $("b-login").hidden = true;
    $("b-write").hidden = false;
    $("b-open").hidden = true;
    $("b-notice").hidden = true;
    restoreDraft();
    if (writeNotice) secret.checked = false;
    attachUi();
    $("b-write").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => (voice?.canListen ? $("b-talk") : title).focus({ preventScroll: true }), 350);
  }
  function closeWrite() {
    talk?.stop?.();
    $("b-write").hidden = true;
    $("b-open").hidden = false;
    $("b-notice").hidden = !me?.staff;
  }
  function resetWrite() {
    title.value = content.value = "";
    secret.checked = false;
    $("b-live").hidden = true;
    $("b-ai").hidden = true;
    $("b-linkset").innerHTML = "";
    queue.forEach((q) => q.url && URL.revokeObjectURL(q.url));
    queue = [];
    drawQueue();
    updateLen();
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
  }

  $("b-open").addEventListener("click", () => {
    if (!auth?.token?.()) {
      try { sessionStorage.setItem("see.board.write", "1"); } catch {}
      return showLogin(true);
    }
    openWrite(false);
  });
  $("b-notice").addEventListener("click", () => openWrite(true));
  $("b-close").addEventListener("click", closeWrite);
  $("b-cancel").addEventListener("click", () => {
    if ((title.value.trim() || content.value.trim() || queue.length) && !confirm("쓰던 글을 지우고 닫을까요?")) return;
    resetWrite();
    closeWrite();
  });

  // 칸마다 마이크(제목은 바꿔 쓰기, 내용은 이어 쓰기)
  voice?.bindMic($("b-title-mic"), title, (t) => { title.value = t.replace(/[.。]$/, ""); saveDraft(); });
  voice?.bindMic($("b-content-mic"), content, (t) => { content.value = t; updateLen(); saveDraft(); }, { append: true });

  /* 말로 남기기 → 말이 끝나면 AI가 제목·내용 정리 */
  let talk = null;
  const talkUi = (on) => {
    const b = $("b-talk");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = on
      ? `<span class="b-talk-ico">${icon("micOff")}</span><span class="b-talk-label">듣는 중이에요<small>다시 누르면 끝내요</small></span>`
      : `<span class="b-talk-ico">${icon("mic")}</span><span class="b-talk-label">말하기 시작<small>누르고 편하게 말씀하세요</small></span>`;
  };
  talkUi(false);
  if (!voice?.canListen) {
    $("b-talk").disabled = true;
    $("b-voice").classList.add("off");
    $("b-voice").querySelector(".b-voice-text span").textContent = "이 브라우저는 말로 쓰기를 지원하지 않아요. 크롬·엣지·사파리에서 열거나, 휴대폰 자판의 마이크 키로 말해 입력해 주세요.";
  }

  $("b-talk").addEventListener("click", () => {
    if (talk) return talk.stop();
    if ((title.value.trim() || content.value.trim()) && !confirm("지금 쓴 제목과 내용을 말한 내용으로 새로 정리할까요?")) return;
    voice.stop(); // 읽어 주던 소리가 마이크에 들어가지 않게
    $("b-ai").hidden = true;
    $("b-live").hidden = false;
    $("b-live-text").textContent = "";
    $("b-live-text").classList.add("empty");
    try {
      talk = voice.listenLong({
        silenceMs: 4000,
        onText: (t) => {
          $("b-live-text").textContent = t;
          $("b-live-text").classList.toggle("empty", !t);
        },
        onEnd: (t, err, code) => {
          talk = null;
          talkUi(false);
          if (!t) {
            $("b-live").hidden = true;
            if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") voice.showMicHelp(err);
            else if (err) toast(err);
            return;
          }
          $("b-live-text").textContent = t;
          organize(voice.punctuate(t), true);
        },
      });
      talkUi(true);
    } catch {
      talk = null;
      talkUi(false);
      $("b-live").hidden = true;
      toast("음성 입력을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  });
  $("b-talk-done").addEventListener("click", () => talk?.stop());

  async function organize(text, fromSpeech) {
    const ai = $("b-ai");
    ai.hidden = false;
    ai.className = "b-ai busy";
    ai.innerHTML = `${icon("spark")}<span>AI가 제목과 내용을 자세히 정리하고 있어요…</span>`;
    $("b-write").classList.add("busy");
    try {
      const d = await api("/api/board/draft", { method: "POST", body: { text, notice: writeNotice } });
      title.value = d.title;
      content.value = d.content;
      updateLen();
      saveDraft();
      ai.className = "b-ai ok";
      ai.innerHTML = `${icon("check")}<span>정리했어요. 아래 제목과 내용을 확인하고, 고칠 곳은 고친 뒤 <b>확인하고 게시하기</b>를 눌러 주세요.${d.preview ? " <small>(미리보기에서는 실제 AI 대신 간단히 정리해 보여 드려요.)</small>" : ""}</span>`;
      [title, content].forEach((el) => { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
      title.focus({ preventScroll: true });
      title.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      ai.className = "b-ai err";
      ai.innerHTML = `<span>${esc(e.message)}</span>`;
      if (fromSpeech && !content.value.trim()) { content.value = text; updateLen(); saveDraft(); } // 정리를 못 해도 말한 글은 남겨 둔다
      if (e.status === 401) showLogin(true);
    } finally {
      $("b-write").classList.remove("busy");
    }
  }

  $("b-polish").addEventListener("click", () => {
    const t = title.value.trim(), c = content.value.trim();
    if (!c && !t) { toast("다듬을 글을 먼저 쓰거나 말로 남겨 주세요."); return content.focus(); }
    organize((t ? `제목: ${t}\n` : "") + c, false);
  });

  /* 게시 전 확인 → 게시 승인 → (첨부가 있으면) 드라이브로 올리기 */
  $("b-write").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast("제목을 써 주세요."); return title.focus(); }
    if (!content.value.trim()) { toast("내용을 써 주세요."); return content.focus(); }
    const bad = linkRows().find((r) => { const v = r.querySelector("[data-l=url]").value.trim(); return v && !/^(https?:\/\/)?[^\s/]+\.[^\s]+/i.test(v); });
    if (bad) { toast("링크 주소를 확인해 주세요."); return bad.querySelector("[data-l=url]").focus(); }
    $("bc-kind").innerHTML = writeNotice
      ? `<span class="b-notice">${icon("info")}공지</span> 게시판 맨 위에 보이고 누구나 볼 수 있어요. 첨부도 누구나 받을 수 있어요.`
      : secret.checked
      ? `<span class="b-lock">${icon("lock")}비밀글</span> 제목만 보이고 내용과 답변은 나와 담당자(장학사·현장교사 지원단)만 봐요.`
      : `<span class="b-pub">공개글</span> 누구나 내용을 볼 수 있고, 로그인한 분은 댓글을 남길 수 있어요.`;
    $("bc-title").textContent = title.value.trim();
    $("bc-body").textContent = content.value.trim();
    const links = linkValues();
    $("bc-more").innerHTML = (links.length ? `<p>${icon("link")}링크 ${links.length}개: ${links.map((l) => esc(l.title || host(l.url))).join(", ")}</p>` : "") +
      (queue.length ? `<p>${icon("file")}첨부 ${queue.length}개(${writeNotice ? "누구나 받을 수 있음" : "담당자에게만 전달"}): ${queue.map((q) => esc(q.file.name)).join(", ")}</p>` : "");
    $("bc-progress").hidden = true;
    $("bc-progress").innerHTML = "";
    $("bc-ok").hidden = false;
    $("bc-edit").textContent = "고치기";
    $("b-confirm").showModal();
  });
  $("bc-edit").addEventListener("click", () => { $("b-confirm").close(); });
  $("bc-ok").addEventListener("click", async () => {
    const btn = $("bc-ok");
    btn.disabled = true;
    $("bc-edit").disabled = true;
    try {
      const r = await api("/api/board", { method: "POST", body: { title: title.value.trim(), content: content.value.trim(), secret: !writeNotice && secret.checked, links: linkValues(), notice: writeNotice } });
      let note = writeNotice ? "공지를 올렸어요." : "게시했어요. 담당자가 확인한 뒤 답변해 드려요.";
      if (queue.length) {
        $("bc-head").textContent = "첨부를 올리고 있어요";
        btn.hidden = true;
        const list = queue.map((q) => ({ file: q.file, kind: q.kind }));
        const ok = await uploadAll(r.id, list, $("bc-progress"));
        if (ok < list.length) note = `글은 올렸지만 첨부 ${list.length - ok}개는 올리지 못했어요. 글을 열어 '첨부 더 올리기'로 다시 올려 주세요.`;
      }
      $("b-confirm").close();
      resetWrite();
      closeWrite();
      toast(note);
      open.add(r.id);
      filter = "all";
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.filter === "all")));
      await loadList();
      document.querySelector(`.b-item[data-id="${CSS.escape(r.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      toast(e.message);
      if (e.status === 401) { $("b-confirm").close(); showLogin(true); }
    } finally {
      btn.disabled = false;
      btn.hidden = false;
      $("bc-edit").disabled = false;
      $("bc-head").textContent = "이대로 게시할까요?";
    }
  });

  /* ---------- 시작 ---------- */
  window.addEventListener("see-auth", () => { loadList(); if (!auth?.token?.()) closeWrite(); });
  loadList().then(() => {
    // 로그인하러 갔다가 돌아오면 글쓰기를 바로 연다
    let want = false;
    try { want = sessionStorage.getItem("see.board.write") === "1"; sessionStorage.removeItem("see.board.write"); } catch {}
    if (want && auth?.token?.()) openWrite(false);
    // board.html#글번호 로 들어오면 그 글을 펼친다(드라이브 '글 내용.txt'의 바로가기)
    const hid = decodeURIComponent(location.hash.slice(1));
    if (hid && items.some((x) => x.id === hid)) {
      open.add(hid);
      renderList();
      document.querySelector(`.b-item[data-id="${CSS.escape(hid)}"]`)?.scrollIntoView({ block: "center" });
    }
  });
})();

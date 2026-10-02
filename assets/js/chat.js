/* AI 상담 SEE — 화면 쪽. 서버(/api/chat)와 SSE 스트림으로 주고받는다.
   대화 내용은 이 브라우저 탭(sessionStorage)에만 보관하고 서버에는 저장하지 않는다. */
(function () {
  "use strict";
  const { esc, icon, md, mdToBlocks, saveAs, saveButtons, toast, SEE_LOGO } = SEE;
  const $ = (id) => document.getElementById(id);
  const log = $("log"), gate = $("gate"), inputArea = $("input-area"), ta = $("q");
  const HKEY = "see.chat";
  const PAGES = {
    step1: ["step1.html", "1단계 발달 정보"], step2: ["step2.html", "2단계 선별검사"], step3: ["step3.html", "3단계 결과별 가이드"],
    step4: ["step4.html", "4단계 선정 절차·지원"], step5: ["step5.html", "5단계 기관 찾기"], library: ["library.html", "자료실"], faq: ["faq.html", "자주 묻는 질문"],
  };
  const TYPE_NAME = { kinder: "특수학급 유치원", special: "특수학교", center: "특수교육지원센터", daycare: "어린이집" };

  let history = [];  // {role, content, attachments?}
  let busy = false;
  let devMode = false;

  try { history = JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch {}
  const persist = () => { try { sessionStorage.setItem(HKEY, JSON.stringify(history.slice(-30))); } catch {} };

  /* ---------- 로그인 상태에 따라 화면 전환 ---------- */
  async function boot() {
    const cfg = await SEEAuth.config();
    devMode = !!cfg.devBypass;
    if (SEEAuth.user() || devMode) return open();
    gate.hidden = false;
    log.hidden = inputArea.hidden = true;
    // 로그인하러 다녀오는 동안 질문을 잃지 않도록 보관
    const pq = new URLSearchParams(location.search).get("q");
    if (pq) try { sessionStorage.setItem("see.pendingQ", pq); } catch {}
    if (SEEAuth.inApp) {
      $("gate-msg").innerHTML = '카카오톡 등 앱 안의 브라우저에서는 구글 로그인이 되지 않아요. <button type="button" class="btn btn-navy btn-sm" id="ext">다른 브라우저로 열기</button><br>또는 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.';
      $("ext").addEventListener("click", () => SEEAuth.openExternal());
    }
    if (!cfg.googleClientId) {
      $("gate-msg").textContent = "로그인 설정을 준비하고 있습니다. 잠시 후 다시 이용해 주세요.";
      return;
    }
    const ok = await SEEAuth.renderButton($("gbtn"));
    if (!ok && !SEEAuth.inApp) $("gate-msg").textContent = "구글 로그인을 불러오지 못했습니다. 브라우저의 팝업·쿠키 차단을 확인해 주세요.";
  }

  function open() {
    gate.hidden = true;
    log.hidden = inputArea.hidden = false;
    renderAll();
    let q = new URLSearchParams(location.search).get("q");
    try { q = q || sessionStorage.getItem("see.pendingQ"); sessionStorage.removeItem("see.pendingQ"); } catch {}
    if (q) {
      window.history.replaceState(null, "", "chat.html");
      send(q);
    } else ta.focus();
  }

  window.addEventListener("see-auth", (e) => (e.detail ? open() : boot()));

  /* ---------- 렌더링 ---------- */
  const welcome = () => `
    <div class="msg ai"><div class="bubble">
      <p>안녕하세요, 저는 <strong>SEE</strong>예요. 아이 발달이 걱정될 때 무엇을 해야 하는지, 특수교육 지원은 어떻게 받는지 함께 찾아볼게요.</p>
      <p>예를 들어 "익산에 특수학급 있는 유치원 알려 줘", "진단·평가 신청 절차를 정리해서 파일로 만들어 줘"처럼 물어보세요.</p>
      <p class="src">개인정보(아이 이름, 주민번호, 주소 등)는 입력하지 말아 주세요.</p>
    </div></div>`;

  function renderAll() {
    log.innerHTML = welcome() + history.map((m, i) => msgHtml(m, i)).join("");
    bindMsgTools(log);
    log.scrollTop = log.scrollHeight;
  }

  function msgHtml(m, i) {
    if (m.role === "user") return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
    return `<div class="msg ai" data-i="${i}">
      <div class="bubble">${md(m.content || "")}</div>
      ${(m.attachments || []).map(attachHtml).join("")}
      ${m.content ? `<div class="tools">
        <button type="button" data-act="copy">${icon("copy")} 복사</button>
        <button type="button" data-act="pdf">${icon("print")} PDF</button>
        <button type="button" data-act="docx">${icon("file")} 워드</button>
        <button type="button" data-act="txt">${icon("download")} 텍스트</button>
      </div>` : ""}
    </div>`;
  }

  function attachHtml(a, k) {
    if (a.kind === "institutions") {
      const rows = a.items.map((it) => `<div class="row"><span><b>${esc(it.name)}</b><br>${esc(TYPE_NAME[it.type] || "")} · ${esc(it.region)}${it.classes ? ` · 특수학급 ${it.classes}학급` : ""}${it.phone ? ` · ${esc(it.phone)}` : ""}</span><a href="step5.html?id=${encodeURIComponent(it.id)}">지도 보기</a></div>`).join("");
      return `<div class="attach"><h4>${icon("map")}찾은 기관 ${a.total}곳${a.total > a.items.length ? ` (상위 ${a.items.length}곳 표시)` : ""}</h4><div class="rows">${rows}</div>
        <div class="acts"><a class="btn btn-line btn-sm" href="step5.html?${new URLSearchParams(a.filter).toString()}">${icon("map")}지도에서 모두 보기</a></div></div>`;
    }
    if (a.kind === "therapy") {
      const rows = a.items.map((it) => `<div class="row"><span><b>${esc(it.name)}</b><br>${esc(it.region)}${it.phone ? ` · ${esc(it.phone)}` : ""}${it.rehab ? " · 발달재활 지정" : ""}<br><span class="src">${esc(it.address)}</span></span><a href="https://map.kakao.com/?q=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">지도</a></div>`).join("");
      const qs = new URLSearchParams(a.filter || {}).toString();
      return `<div class="attach"><h4>${icon("stetho")}치료지원 가맹점 ${a.total}곳${a.total > a.items.length ? ` (상위 ${a.items.length}곳 표시)` : ""}</h4><div class="rows">${rows}</div>
        <div class="acts"><a class="btn btn-line btn-sm" href="step5.html${qs ? "?" + qs : ""}#therapy">${icon("map")}전체 목록 보기</a></div></div>`;
    }
    if (a.kind === "document") {
      return `<div class="attach doc" data-doc="${k}"><h4>${icon("file")}${esc(a.title)}</h4>
        <div class="doc-prev">${md(a.markdown)}</div>
        <div class="acts">${saveButtons("d" + k)}</div></div>`;
    }
    if (a.kind === "link") {
      const p = PAGES[a.page];
      return p ? `<div class="acts"><a class="btn btn-navy btn-sm" href="${p[0]}">${icon("arrow")}${esc(a.label || p[1])} 바로가기</a></div>` : "";
    }
    return "";
  }

  function bindMsgTools(root) {
    root.querySelectorAll(".msg.ai[data-i]").forEach((el) => {
      if (el._bound) return;
      el._bound = true;
      const m = () => history[+el.dataset.i];
      el.querySelectorAll(".tools [data-act]").forEach((b) =>
        b.addEventListener("click", async () => {
          const msg = m();
          if (!msg) return;
          const title = "SEE 상담 답변 " + SEE.today();
          if (b.dataset.act === "copy") {
            try { await navigator.clipboard.writeText(msg.content); toast("답변을 복사했습니다."); } catch { toast("복사하지 못했습니다."); }
            return;
          }
          const q = history[+el.dataset.i - 1]?.content;
          saveAs(b.dataset.act, title, [...(q ? [{ h: "질문" }, { p: q }, { h: "답변" }] : []), ...mdToBlocks(msg.content)]);
        })
      );
      el.querySelectorAll(".attach.doc").forEach((d) => {
        const a = (m().attachments || [])[+d.dataset.doc];
        d.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => saveAs(b.dataset.save, a.title, mdToBlocks(a.markdown))));
      });
    });
  }

  /* ---------- 보내기 ---------- */
  $("form").addEventListener("submit", (e) => { e.preventDefault(); send(ta.value); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); }
  });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; });
  document.querySelectorAll(".side-card .q").forEach((b) => b.addEventListener("click", () => (gate.hidden ? send(b.textContent) : (toast("먼저 로그인해 주세요."), null))));

  $("reset").addEventListener("click", () => {
    if (busy) return;
    if (history.length && !confirm("지금까지의 대화를 지우고 새로 시작할까요?")) return;
    history = [];
    persist();
    renderAll();
  });
  $("save-all").addEventListener("click", () => {
    if (!history.length) return toast("저장할 대화가 없습니다.");
    const blocks = [];
    history.forEach((m) => {
      if (m.role === "user") blocks.push({ h: "질문" }, { p: m.content });
      else {
        blocks.push({ h: "SEE 답변" }, ...mdToBlocks(m.content));
        (m.attachments || []).forEach((a) => {
          if (a.kind === "document") blocks.push({ h: a.title }, ...mdToBlocks(a.markdown));
          if (a.kind === "therapy") blocks.push({ table: { head: ["기관", "지역", "전화", "주소"], rows: a.items.map((i) => [i.name, i.region, i.phone || "", i.address]) } });
          if (a.kind === "institutions") blocks.push({ table: { head: ["기관", "유형", "지역", "전화", "주소"], rows: a.items.map((i) => [i.name, TYPE_NAME[i.type] || "", i.region, i.phone || "", i.address || ""]) } });
        });
      }
    });
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `<div class="dlg-head"><h2>대화 전체 저장</h2></div><div class="dlg-body"><p>저장 형식을 고르세요.</p></div><div class="dlg-foot">${saveButtons("all")}<button class="btn btn-sm btn-navy" type="button" value="close">닫기</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => { saveAs(b.dataset.save, "SEE 상담 기록 " + SEE.today(), blocks); dlg.close(); }));
    dlg.querySelector('[value="close"]').addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  });

  async function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    if (!SEEAuth.token() && !devMode) { toast("로그인이 만료되었습니다. 다시 로그인해 주세요."); return boot(); }
    busy = true;
    ta.value = "";
    ta.style.height = "auto";
    history.push({ role: "user", content: text });
    const ai = { role: "assistant", content: "", attachments: [] };
    history.push(ai);
    const idx = history.length - 1;
    log.insertAdjacentHTML("beforeend", msgHtml(history[idx - 1], idx - 1));
    log.insertAdjacentHTML("beforeend", `<div class="msg ai" id="pending"><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div><div class="src" id="status"></div></div>`);
    log.scrollTop = log.scrollHeight;

    const payload = history.slice(0, -1).slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, m.role === "user" ? 1000 : 3000) })).filter((m) => m.content);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(SEEAuth.token() ? { Authorization: "Bearer " + SEEAuth.token() } : {}) },
        body: JSON.stringify({ messages: payload }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) { SEEAuth.signOut(); }
        throw new Error(err.message || "SEE와 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      await readStream(res.body, ai);
    } catch (e) {
      ai.content = ai.content || `죄송해요. ${e.message}`;
    } finally {
      busy = false;
      if (!ai.content && !ai.attachments.length) ai.content = "답변을 만들지 못했어요. 질문을 조금 바꿔 다시 물어봐 주세요.";
      persist();
      const p = $("pending");
      if (p) p.outerHTML = msgHtml(ai, idx);
      bindMsgTools(log);
      log.scrollTop = log.scrollHeight;
      ta.focus();
    }
  }

  async function readStream(body, ai) {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let raf = 0;
    const paint = () => {
      raf = 0;
      const p = $("pending");
      if (!p) return;
      p.querySelector(".bubble").innerHTML = md(ai.content) || '<span class="typing"><i></i><i></i><i></i></span>';
      log.scrollTop = log.scrollHeight;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const ev = /^event: (.*)$/m.exec(chunk)?.[1] || "message";
        const dataLine = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        let data = {};
        try { data = JSON.parse(dataLine || "{}"); } catch {}
        if (ev === "text") { ai.content += data.t || ""; if (!raf) raf = requestAnimationFrame(paint); }
        else if (ev === "status") { const s = $("status"); if (s) s.textContent = data.label || ""; }
        else if (ev === "institutions") ai.attachments.push({ kind: "institutions", ...data });
        else if (ev === "document") ai.attachments.push({ kind: "document", ...data });
        else if (ev === "therapy") ai.attachments.push({ kind: "therapy", ...data });
        else if (ev === "link") ai.attachments.push({ kind: "link", ...data });
        else if (ev === "usage") $("remain").textContent = `오늘 남은 질문 ${data.remaining}회`;
        else if (ev === "error") { ai.content += (ai.content ? "\n\n" : "") + (data.message || "오류가 발생했습니다."); }
      }
    }
  }

  /* 음성 입력 */
  (function voiceSetup() {
    const hintEl = $("voice-hint");
    const defaultHint = hintEl ? hintEl.textContent : "";
    const ok = SEE.voice?.attach($("mic"), ta, { hint: hintEl, hintText: defaultHint });
    const tip = $("voice-tip");
    if (ok && tip) tip.hidden = false;
  })();

  boot();
})();

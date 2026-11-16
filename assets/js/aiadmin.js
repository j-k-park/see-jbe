/* 관리자 메뉴 'AI 상담 연결 · BAZE' ('담당자와 소통' 게시판 위쪽, 최고·협력관리자만 보인다 — 서버: netlify/functions/ai-admin.mts)
   - 지금 연결: BAZE 게이트웨이인지 Claude 직접 연결인지, 쓰는 모델, 남은 BAZE 크레딧
   - BAZE 열쇠: 새 열쇠 저장(서버가 BAZE에 물어 확인한 뒤 암호문으로 보관) · 저장한 열쇠 지우기. 화면에는 끝 네 글자만
   - 사용 모델: BAZE가 주는 대화 모델 목록에서 고르기 → '이 모델로 시험' → '이 모델로 바꾸기'
   게시판(board.js)이 로그인한 사람이 관리자인지 알려 주면(SEE.aiAdmin.sync) 불러온다. 로컬 미리보기에서는 로그인 없이 보인다. */
(function () {
  "use strict";
  const { esc, toast } = SEE;
  const auth = window.SEEAuth;
  const $ = (id) => document.getElementById(id);
  const box = $("ai-admin");
  if (!box) return;

  let v = null;      // 서버가 준 화면 자료
  let pick = "";     // 목록에서 고른 모델
  let dev = false;   // 로컬 미리보기
  let busy = false;
  let scrolled = false; // #admin-menu 로 들어왔을 때 한 번만 내려가기

  async function call(method, body, qs = "") {
    const tk = auth?.token?.();
    const res = await fetch("/api/admin/ai" + qs, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(tk ? { Authorization: "Bearer " + tk } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.message || "잠시 문제가 생겼어요. 다시 시도해 주세요."), { status: res.status });
    return j;
  }
  const num = (n, d = 0) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: d });
  const p2 = (n) => String(n).padStart(2, "0");
  const when = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}` : ""; };
  const modelOf = (id) => v?.models.find((m) => m.id === id);
  const price = (m) => (m && m.input != null && m.output != null ? `입력 ${num(m.input, 3)} · 출력 ${num(m.output, 3)}` : "");

  /* 열쇠 칸 위 상태 글, 시험·되돌리기에 쓸 자리 — 한 번만 만든다 */
  const keyState = document.createElement("p");
  keyState.className = "ai-key-state";
  $("ai-key-form").before(keyState);
  const keyErr = document.createElement("p");
  keyErr.className = "ai-err";
  keyErr.hidden = true;
  $("ai-key-form").after(keyErr);
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn btn-line btn-sm";
  resetBtn.textContent = "기본 모델로 되돌리기";
  resetBtn.hidden = true;
  $("ai-refresh").after(resetBtn);

  /* 펼침 상태 기억(관리자·현장교사 지원단 토글과 같은 방식) */
  [["ai-key-box", "see.ai.keyOpen"], ["ai-model-box", "see.ai.modelOpen"]].forEach(([id, key]) => {
    try { $(id).open = localStorage.getItem(key) === "1"; } catch {}
    $(id).addEventListener("toggle", () => { try { localStorage.setItem(key, $(id).open ? "1" : "0"); } catch {} });
  });

  function renderNow() {
    const now = $("ai-now");
    let cls, head;
    const chips = [];
    if (v.off) {
      cls = "off"; head = "게이트웨이가 꺼져 있어요(Netlify 환경변수 GATEWAY_OFF). 지금은 Claude 직접 연결로만 답해요.";
    } else if (!v.ready) {
      cls = "warn";
      head = v.key.broken ? "저장한 열쇠를 읽지 못했어요. 열쇠를 다시 저장해 주세요." : "BAZE 열쇠가 없어요. 아래에서 열쇠를 저장하면 BAZE로 답해요.";
    } else {
      cls = "ok"; head = "BAZE 게이트웨이로 답하고 있어요";
      chips.push(`<span class="ai-chip"><small>주소</small><b>${esc(v.host)}</b></span>`);
      chips.push(`<span class="ai-chip"><small>모델</small><b>${esc(v.current.id)}</b></span>`);
      if (v.credits) {
        chips.push(v.credits.error
          ? `<span class="ai-chip"><small>남은 크레딧</small><b class="ai-bad">${esc(v.credits.error)}</b></span>`
          : `<span class="ai-chip"><small>남은 크레딧</small><b>${num(v.credits.remaining, 1)}${isFinite(v.credits.quota) ? ` / ${num(v.credits.quota)}` : ""}</b>${v.credits.renewal ? `<small>${esc(String(v.credits.renewal).slice(0, 10))} 다시 채움</small>` : ""}</span>`);
      }
    }
    const backup = v.backup.ready
      ? (v.ready && !v.off ? `BAZE가 답하지 못하면(크레딧 소진·열쇠 오류 등) <b>Claude 직접 연결</b>(${esc(v.backup.model)})로 저절로 넘어가요.` : `지금은 <b>Claude 직접 연결</b>(${esc(v.backup.model)})로 답하고 있어요.`)
      : (v.ready && !v.off ? "Claude 직접 연결(예비)이 없어요. BAZE가 답하지 못하면 AI 상담이 멈춰요." : "<b class=\"ai-bad\">AI 연결이 하나도 없어요. AI 상담이 답하지 못해요.</b>");
    now.className = "ai-now " + cls;
    now.innerHTML = `<p class="ai-now-head"><span class="ai-dot" aria-hidden="true"></span>${esc(head)}</p>${chips.length ? `<div class="ai-chips">${chips.join("")}</div>` : ""}<p class="ai-backup">${backup}</p>`;
  }

  function renderKey() {
    const k = v.key;
    const tail = k.tail ? `<code>····${esc(k.tail)}</code>` : "";
    $("ai-key-sum").textContent = v.source === "admin" ? `이 화면에서 저장한 열쇠 ····${k.tail || ""}` : v.source === "env" ? "Netlify에 넣어 둔 열쇠 사용 중" : k.broken ? "다시 저장 필요" : "없음";
    keyState.innerHTML = v.source === "admin"
      ? `지금 쓰는 열쇠: 이 화면에서 저장한 열쇠 ${tail}${k.at ? ` · ${esc(when(k.at))}${k.by ? " " + esc(k.by) : ""} 저장` : ""}`
      : v.source === "env"
        ? "지금 쓰는 열쇠: Netlify 환경변수(GATEWAY_API_KEY)에 넣어 둔 열쇠. 여기에 새 열쇠를 저장하면 이 화면의 열쇠가 먼저 쓰여요."
        : k.broken
          ? `저장한 열쇠 ${tail}를 읽지 못했어요(서버 비밀값이 바뀜). 열쇠를 다시 저장해 주세요.`
          : "저장한 열쇠가 없어요.";
    $("ai-key-forget").hidden = !k.saved;
    $("ai-key-forget").title = k.env ? "지우면 Netlify에 넣어 둔 열쇠로 돌아가요" : "지우면 BAZE 연결이 끊기고 Claude 직접 연결로만 답해요";
  }

  function renderModels() {
    const q = $("ai-filter").value.trim().toLowerCase();
    const names = new Map(v.vendors);
    const groups = new Map([...v.vendors.map(([id]) => [id, []]), ["etc", []]]);
    for (const m of v.models) {
      const vn = names.get(m.vendor) || m.vendor;
      if (q && !(m.id.toLowerCase().includes(q) || vn.toLowerCase().includes(q))) continue;
      groups.get(names.has(m.vendor) ? m.vendor : "etc").push(m);
    }
    const anyPrice = v.models.some((m) => price(m));
    const html = [...groups].filter(([, list]) => list.length).map(([g, list]) => `
      <section class="ai-group"><h3>${esc(g === "etc" ? "그 밖의 모델" : names.get(g))} <small>${list.length}개</small></h3>
        <div class="ai-group-list">${list.map((m) => {
          const cur = m.id === v.current.id;
          const meta = [g === "etc" ? m.vendor : "", price(m)].filter(Boolean).join(" · ");
          return `<label class="ai-m${cur ? " cur" : ""}"><input type="radio" name="ai-model" value="${esc(m.id)}"${m.id === pick ? " checked" : ""}>
            <span class="ai-m-txt"><span class="ai-m-id">${esc(m.id)}${cur ? '<span class="ai-badge">지금 사용 중</span>' : ""}${m.deprecatedAt ? `<span class="ai-badge old">${esc(String(m.deprecatedAt).slice(0, 10))} 종료 예정</span>` : m.lifecycle === "legacy" ? '<span class="ai-badge old">이전 모델</span>' : ""}</span>${meta ? `<span class="ai-m-meta">${esc(meta)}</span>` : ""}</span></label>`;
        }).join("")}</div></section>`).join("");
    $("ai-models").hidden = !v.models.length;
    $("ai-models").innerHTML = (anyPrice ? `<p class="ai-legend">숫자는 1천 토큰당 BAZE 크레딧(입력 · 출력)이에요. 작을수록 크레딧이 덜 들어요.</p>` : "") + (html || `<p class="ai-legend">찾는 이름의 모델이 없어요.</p>`);
    $("ai-filter").hidden = $("ai-refresh").hidden = !v.ready;
    const note = [v.note, v.ready && v.models.length && !v.current.inList ? `지금 쓰는 모델(${v.current.id})이 BAZE 목록에 없어요. 목록에서 모델을 골라 바꿔 주세요.` : ""].filter(Boolean).join(" ");
    $("ai-note").hidden = !note;
    $("ai-note").textContent = note;
    $("ai-model-sum").textContent = `지금: ${v.current.id}${v.current.picked ? "" : "(기본)"}${v.models.length ? ` · 고를 수 있는 모델 ${v.models.length}개` : ""}`;
    resetBtn.hidden = !v.current.picked;
    renderPick();
  }

  function renderPick() {
    const m = modelOf(pick);
    $("ai-pick").hidden = !m;
    if (!m) return;
    const same = m.id === v.current.id;
    $("ai-pick-msg").innerHTML = `<b>${esc(m.id)}</b> 선택${same ? " — 지금 쓰는 모델이에요." : ""}` +
      (m.api !== "claude" ? `<br><span class="ai-warn">Claude가 아닌 모델이에요. SEE는 Claude에 맞춰 만들어서 기관 찾기·문서 만들기나 말투가 다를 수 있어요. 꼭 시험해 본 뒤 바꿔 주세요.</span>` : "");
    $("ai-apply").disabled = same || busy;
    $("ai-test").disabled = busy;
  }

  function render() {
    box.hidden = false;
    if (pick && !modelOf(pick)) pick = "";
    renderNow();
    renderKey();
    renderModels();
  }

  async function load(refresh) {
    try {
      v = await call("GET", null, refresh ? "?refresh=1" : "");
      render();
      // 위쪽 '관리자 메뉴' 단추(board.html#admin-menu)로 들어오면, 관리자 칸이 보인 뒤 그 자리로 내려간다
      if (location.hash === "#admin-menu" && !scrolled) {
        scrolled = true;
        setTimeout(() => $("admin-menu")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) { box.hidden = true; return; }
      box.hidden = false;
      $("ai-now").className = "ai-now warn";
      $("ai-now").innerHTML = `<p class="ai-now-head"><span class="ai-dot" aria-hidden="true"></span>${esc(e.message)}</p>`;
    }
  }

  /** 하는 동안 단추를 잠그고, 서버가 돌려준 새 화면 자료로 다시 그린다 */
  async function act(btn, label, body, okMsg) {
    if (busy) return null;
    busy = true;
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      const r = await call("POST", body);
      if (r.models) { v = r; }
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      toast(e.message);
      return { error: e.message };
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = old;
      if (v) render();
    }
  }

  $("ai-key-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("ai-key").value.trim();
    if (!key) return;
    keyErr.hidden = true;
    const r = await act($("ai-key-save"), "BAZE에 확인하는 중…", { action: "key", key }, "");
    if (r?.error) { keyErr.textContent = r.error; keyErr.hidden = false; return; }
    if (r?.ok) { $("ai-key").value = ""; toast("열쇠를 저장했어요. 이제 이 열쇠로 답해요."); }
  });
  $("ai-key-forget").addEventListener("click", async () => {
    if (!confirm(v?.key.env ? "저장한 열쇠를 지울까요?\nNetlify에 넣어 둔 열쇠로 돌아가요." : "저장한 열쇠를 지울까요?\nBAZE 연결이 끊기고 Claude 직접 연결로만 답해요.")) return;
    await act($("ai-key-forget"), "지우는 중…", { action: "forget" }, "저장한 열쇠를 지웠어요.");
  });

  $("ai-filter").addEventListener("input", renderModels);
  $("ai-models").addEventListener("change", (e) => {
    if (e.target.name !== "ai-model") return;
    pick = e.target.value;
    $("ai-test-out").hidden = true;
    renderPick();
  });
  $("ai-refresh").addEventListener("click", async () => {
    const b = $("ai-refresh");
    b.disabled = true; b.textContent = "받는 중…";
    await load(true);
    b.disabled = false; b.textContent = "목록 새로 받기";
    if (v?.fetchedAt && !v.note) toast(`모델 목록을 새로 받았어요(${v.models.length}개).`);
  });
  resetBtn.addEventListener("click", async () => {
    if (!confirm("고른 모델을 지우고 기본 모델로 되돌릴까요?")) return;
    pick = "";
    await act(resetBtn, "되돌리는 중…", { action: "model", model: "" }, "기본 모델로 되돌렸어요.");
  });
  $("ai-apply").addEventListener("click", async () => {
    const m = modelOf(pick);
    if (!m) return;
    if (!confirm(`AI 상담 SEE와 게시판 '말로 남기기 정리'에 이 모델을 쓸까요?\n\n${m.id}${m.api !== "claude" ? "\n\nClaude가 아닌 모델이에요. 시험 답변을 확인하셨나요?" : ""}`)) return;
    await act($("ai-apply"), "바꾸는 중…", { action: "model", model: m.id }, `사용 모델을 ${m.id}(으)로 바꿨어요.`);
  });
  $("ai-test").addEventListener("click", async () => {
    const m = modelOf(pick);
    if (!m) return;
    const out = $("ai-test-out");
    out.hidden = false;
    out.innerHTML = `<p class="ai-legend">${esc(m.id)}에게 시험 질문을 보내고 있어요… (길면 40초쯤 걸려요)</p>`;
    const r = await act($("ai-test"), "시험하는 중…", { action: "test", model: m.id }, "");
    if (!r || r.error) { out.innerHTML = `<p class="ai-err">${esc(r?.error || "시험하지 못했어요.")}</p>`; return; }
    const cost = r.usage.input != null && r.usage.output != null && m.input != null && m.output != null ? (r.usage.input * m.input + r.usage.output * m.output) / 1000 : null;
    out.innerHTML = `
      <h3>시험 결과 <small>${esc(r.model)}</small></h3>
      <p class="ai-q"><b>질문</b> ${esc(r.q)}</p>
      <div class="ai-a">${SEE.md(r.text)}</div>
      <p class="ai-legend">${num(r.ms / 1000, 1)}초${r.usage.input != null ? ` · 입력 ${num(r.usage.input)} · 출력 ${num(r.usage.output)} 토큰` : ""}${cost != null ? ` · 이 질문에 약 ${num(cost, 2)}크레딧` : ""} · 실제 상담과 같은 지침으로 물었어요(기관 찾기 같은 도구는 빼고).</p>`;
  });

  SEE.aiAdmin = {
    /** 게시판이 로그인 상태를 확인할 때마다 부른다 */
    sync(isAdmin) {
      if (isAdmin || dev) load();
      else box.hidden = true;
    },
  };
  // 로컬 미리보기(netlify dev)에서는 로그인 없이 화면을 본다
  auth?.config?.().then((cfg) => { if (cfg?.devBypass) { dev = true; load(); } }).catch(() => {});
})();

/* 음성으로 입력하기 — 브라우저 음성 인식(Web Speech API, 한국어)
   손으로 타이핑하기 어려운 보호자를 위한 보조 입력. 말소리는 브라우저가 처리하며 우리 서버에 저장하지 않는다.
   지원하지 않는 브라우저에서는 버튼을 숨긴다. */
(function () {
  "use strict";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function attach(btn, field, opts = {}) {
    if (!btn || !field) return false;
    if (!SR) { btn.hidden = true; return false; }

    let rec = null, listening = false, base = "";
    const setState = (on) => {
      listening = on;
      btn.classList.toggle("listening", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "음성 입력 멈추기" : "음성으로 입력하기");
      btn.innerHTML = SEE.icon(on ? "micOff" : "mic");
      if (opts.hint) opts.hint.textContent = on ? "듣고 있어요. 편하게 말씀하세요." : opts.hintText || "";
    };

    function start() {
      rec = new SR();
      rec.lang = "ko-KR";
      rec.interimResults = true;
      rec.continuous = true;
      base = field.value.trim();
      rec.onresult = (e) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
        field.value = (base ? base + " " : "") + text.trim();
        if (e.results[e.results.length - 1].isFinal) base = field.value.trim();
        field.dispatchEvent(new Event("input", { bubbles: true }));
      };
      rec.onerror = (e) => {
        setState(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") showMicHelp({ retry: askAndStart });
        else if (e.error === "no-speech") SEE.toast("소리가 들리지 않았어요. 다시 눌러 말씀해 주세요.");
        else if (e.error === "audio-capture") SEE.toast("마이크를 찾지 못했어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.");
        else if (e.error === "network") SEE.toast("인터넷 연결이 끊겨 음성 인식을 못 했어요.");
        else if (e.error !== "aborted") SEE.toast("음성 인식을 사용할 수 없어요. 글로 입력해 주세요.");
      };
      rec.onend = () => { if (listening) setState(false); };
      try {
        rec.start();
        setState(true);
        field.focus();
      } catch {
        setState(false);
        SEE.toast("마이크 버튼을 한 번 더 눌러 주세요.");
      }
    }

    // 브라우저의 '마이크 허용' 창을 바로 띄우고, 허용되면 듣기 시작
    async function askAndStart() {
      const r = await requestMic();
      if (r === "granted" || r === "unknown") start();
      else if (r === "denied") showMicHelp({ blocked: true, retry: askAndStart });
      else SEE.toast("마이크를 찾지 못했어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.");
    }

    btn.addEventListener("click", async () => {
      if (listening) { rec && rec.stop(); setState(false); return; }
      const state = await micState();
      if (state === "granted") return start();
      if (state === "denied") return showMicHelp({ blocked: true, retry: askAndStart });
      // 아직 묻지 않은 상태: 무엇을 눌러야 하는지 먼저 알려 주고, 바로 브라우저 허용 창을 띄운다
      showPrimer(askAndStart);
    });
    setState(false);
    return true;
  }

  /* ---------- 마이크 권한 ----------
     웹사이트는 마이크를 스스로 켤 수 없다(보안 규칙). 대신 이용자가 누른 순간 브라우저의 '허용' 창을 바로 띄운다. */
  async function micState() {
    try {
      const s = await navigator.permissions.query({ name: "microphone" });
      return s.state; // granted | denied | prompt
    } catch {
      return "unknown"; // 아이폰 일부 버전 등은 상태 확인을 지원하지 않는다
    }
  }

  async function requestMic() {
    if (!navigator.mediaDevices?.getUserMedia) return "unknown";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // 허용만 받고 바로 끈다
      return "granted";
    } catch (e) {
      return e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error";
    }
  }

  function dialog(html) {
    const dlg = document.createElement("dialog");
    dlg.className = "mic-help";
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
    return dlg;
  }

  // 처음 쓸 때: 다음에 뜨는 창에서 '허용'을 누르라고 미리 알려 준다
  function showPrimer(onGo) {
    const ua = navigator.userAgent;
    const allowWord = /iPhone|iPad|iPod/.test(ua) ? "허용" : "허용(또는 '이번만 허용')";
    const dlg = dialog(`<div class="dlg-head"><h2>마이크를 켜 주세요</h2></div>
      <div class="dlg-body" style="text-align:center">
        <div class="mic-big">${SEE.icon("mic")}</div>
        <p>말로 질문하려면 마이크가 필요해요.<br>아래 버튼을 누르면 휴대폰이 마이크 사용을 묻습니다.</p>
        <p class="big">그때 <strong>'${allowWord}'</strong>을 눌러 주세요</p>
        <p class="src">말소리는 글자로 바꾸는 데에만 쓰고 저장하지 않아요.</p>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-line btn-sm" type="button" value="no">글로 입력할게요</button>
        <button class="btn btn-navy" type="button" value="go">${SEE.icon("mic")}마이크 켜기</button>
      </div>`);
    dlg.querySelector("[value=no]").addEventListener("click", () => dlg.close());
    dlg.querySelector("[value=go]").addEventListener("click", () => { dlg.close(); onGo(); });
  }

  /* 마이크가 막혔을 때 기기에 맞는 방법을 안내한다 */
  function showMicHelp(opts = {}) {
    const ua = navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
    let steps;
    if (inApp) {
      steps = ["카카오톡·네이버 앱 안의 화면에서는 마이크를 쓸 수 없어요.", "오른쪽 위 메뉴에서 <strong>다른 브라우저로 열기</strong>를 누른 뒤 다시 시도해 주세요."];
    } else if (iOS) {
      steps = ["아이폰 <strong>설정</strong> 앱을 엽니다.", "<strong>Safari → 마이크</strong>를 '허용' 또는 '확인'으로 바꿉니다.", "또는 주소창 왼쪽 <strong>'ᴀA'</strong>를 누르고 <strong>웹사이트 설정 → 마이크</strong>에서 허용합니다.", "설정을 바꾼 뒤 이 화면을 새로 고쳐 주세요."];
    } else if (android) {
      steps = ["주소창 왼쪽의 <strong>자물쇠나 ⓘ 아이콘</strong>을 누릅니다.", "<strong>권한</strong> 또는 <strong>사이트 설정 → 마이크</strong>를 '허용'으로 바꿉니다.", "휴대폰 <strong>설정 → 앱 → 브라우저 → 권한 → 마이크</strong>도 허용인지 확인해 주세요.", "바꾼 뒤 이 화면을 새로 고쳐 주세요."];
    } else {
      steps = ["주소창 왼쪽의 <strong>자물쇠 아이콘</strong>을 누릅니다.", "<strong>마이크</strong>를 '허용'으로 바꿉니다.", "바꾼 뒤 이 화면을 새로 고쳐 주세요."];
    }
    const canRetry = typeof opts.retry === "function" && !inApp;
    const dlg = dialog(`<div class="dlg-head"><h2>${opts.blocked ? "마이크가 꺼져 있어요" : "마이크 사용을 허용해 주세요"}</h2></div>
      <div class="dlg-body">
        ${canRetry ? `<p>먼저 <strong>'다시 시도'</strong>를 눌러 보세요. 허용 창이 뜨면 <strong>'허용'</strong>을 누르면 됩니다.</p>
        <p class="src">창이 뜨지 않으면 예전에 '차단'을 눌러 둔 상태예요. 이때는 아래 방법으로 한 번만 바꿔 주시면 됩니다.</p>` : ""}
        <ol style="padding-left:20px;display:grid;gap:8px">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
        <p class="notice blue" style="margin-top:4px"><span>휴대폰 자판(키보드)에 있는 <strong>마이크 모양 키</strong>를 눌러 말해도 글자가 입력됩니다. 이 방법은 허용 설정 없이 바로 쓸 수 있어요.</span></p>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-line btn-sm" type="button" value="close">닫기</button>
        ${canRetry ? `<button class="btn btn-navy" type="button" value="retry">${SEE.icon("mic")}다시 시도</button>` : ""}
      </div>`);
    dlg.querySelector("[value=close]").addEventListener("click", () => dlg.close());
    dlg.querySelector("[value=retry]")?.addEventListener("click", () => { dlg.close(); opts.retry(); });
  }

  /* ---------- 답변을 소리로 읽어 주기 ---------- */
  const synth = window.speechSynthesis;
  let onDone = null, keepAlive = 0, parts = [], idx = 0, playing = false;

  // 한국어 목소리 중 가장 자연스러운 것을 고른다(기기에 있는 것 우선순위)
  function pickVoice() {
    const ko = synth.getVoices().filter((v) => /^ko([-_]|$)/i.test(v.lang));
    const prefer = [/Google/i, /Yuna/i, /Siri/i, /SunHi|선히/i, /Heami|해미/i, /Nara/i, /Natural|Neural/i];
    for (const p of prefer) {
      const hit = ko.find((v) => p.test(v.name));
      if (hit) return hit;
    }
    return ko[0] || null;
  }

  // 마크다운·기호를 빼고 읽기 좋은 문장으로 다듬는다
  function toSpeech(md) {
    return String(md || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "링크")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*\[\s?\]\s*/gm, "")
      .replace(/[□■▸▪◦]/g, " ")
      .replace(/(\d{2,4})-(\d{3,4})-(\d{4})/g, "$1에 $2에 $3")  // 전화번호를 또박또박
      .replace(/·/g, ", ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 길면 중간에 끊기므로 짧은 문장 단위로 나눈다
  function toParts(text) {
    const out = [];
    let buf = "";
    const push = (s) => { const t = s.trim(); if (t) out.push(t); };
    for (const s of text.split(/(?<=[.!?。])\s+|(?<=(?:요|다|죠|까)\.)\s+|\n+/)) {
      let piece = (s || "").trim();
      if (!piece) continue;
      while (piece.length > 110) {            // 너무 긴 문장은 쉼표에서 한 번 더 자른다
        let cut = piece.lastIndexOf(", ", 110);
        if (cut < 40) cut = piece.lastIndexOf(" ", 110);
        if (cut < 40) cut = 110;
        push(buf); buf = "";
        push(piece.slice(0, cut + 1));
        piece = piece.slice(cut + 1).trim();
      }
      if ((buf + " " + piece).trim().length > 110) { push(buf); buf = piece; }
      else buf += " " + piece;
    }
    push(buf);
    return out;
  }

  function stop() {
    const was = playing;
    playing = false;
    parts = [];
    idx = 0;
    clearInterval(keepAlive);
    try { synth.cancel(); } catch {}
    const cb = onDone;
    onDone = null;
    if (was) cb && cb();
  }

  function speakPart(i) {
    const u = new SpeechSynthesisUtterance(parts[i]);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = "ko-KR";
    u.rate = 0.98;   // 편안한 속도
    u.pitch = 1;
    u.volume = 1;
    u.onstart = () => { idx = i; };
    u.onend = () => { if (playing && i === parts.length - 1) finish(); };
    u.onerror = (e) => { if (playing && e.error !== "interrupted" && e.error !== "canceled" && i === parts.length - 1) finish(); };
    synth.speak(u);
  }

  function finish() {
    const cb = onDone;
    playing = false;
    parts = [];
    onDone = null;
    clearInterval(keepAlive);
    cb && cb();
  }

  // 아이폰은 이용자가 직접 누른 동작에서만 소리를 낼 수 있어, 보내기를 누를 때 미리 한 번 열어 둔다
  let unlocked = false;
  function unlock() {
    if (unlocked || !synth) return;
    unlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      synth.speak(u);
    } catch {}
  }

  function speak(text, done) {
    if (!synth) return false;
    stop();
    const clean = toSpeech(text);
    if (!clean) return false;
    parts = toParts(clean);
    if (!parts.length) return false;
    idx = 0;
    playing = true;
    onDone = done;
    // cancel() 직후 바로 말하면 첫 문장이 잘리는 기기가 있어 잠깐 뒤에 시작한다
    setTimeout(() => {
      if (!playing) return;
      parts.forEach((_, i) => speakPart(i));
      // 중간에 조용히 멈추는 기기가 있어, 멈춘 것이 확인되면 남은 문장부터 다시 읽는다
      let idle = 0;
      keepAlive = setInterval(() => {
        if (!playing) return clearInterval(keepAlive);
        if (synth.speaking || synth.pending) { idle = 0; return; }
        if (++idle < 2) return;              // 2초 동안 아무 소리도 없으면 멈춘 것으로 본다
        idle = 0;
        const rest = parts.slice(idx + 1);
        if (!rest.length) return finish();
        parts = rest;
        idx = 0;
        try { synth.resume(); } catch {}
        parts.forEach((_, i) => speakPart(i));
      }, 1000);
    }, 120);
    return true;
  }

  if (synth) {
    synth.getVoices();
    synth.addEventListener?.("voiceschanged", () => synth.getVoices());
    window.addEventListener("beforeunload", stop);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && playing) stop(); });
  }

  window.SEE = window.SEE || {};
  window.SEE.voice = { supported: !!SR, attach };
  window.SEE.speech = { supported: !!synth, speak, stop, unlock, get playing() { return playing; }, voiceName: () => pickVoice()?.name || "" };
})();

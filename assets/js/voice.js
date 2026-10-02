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
        if (e.error === "not-allowed" || e.error === "service-not-allowed") SEE.toast("마이크 사용을 허용해 주세요. 주소창 옆 자물쇠에서 바꿀 수 있어요.");
        else if (e.error === "no-speech") SEE.toast("소리가 들리지 않았어요. 다시 눌러 말씀해 주세요.");
        else if (e.error !== "aborted") SEE.toast("음성 인식을 사용할 수 없어요. 글로 입력해 주세요.");
      };
      rec.onend = () => { if (listening) setState(false); };
      try {
        rec.start();
        setState(true);
        field.focus();
      } catch {
        setState(false);
      }
    }

    btn.addEventListener("click", () => {
      if (listening) { rec && rec.stop(); setState(false); return; }
      start();
    });
    setState(false);
    return true;
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

  // 길면 중간에 끊기므로 문장 단위로 잘라 차례로 읽는다
  function toParts(text) {
    const out = [];
    let buf = "";
    for (const s of text.split(/(?<=[.!?。]|요|니다|세요)\s+/)) {
      if ((buf + " " + s).trim().length > 150) { if (buf) out.push(buf.trim()); buf = s; }
      else buf += " " + s;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }

  function stop() {
    playing = false;
    parts = [];
    idx = 0;
    clearInterval(keepAlive);
    try { synth.cancel(); } catch {}
    const cb = onDone;
    onDone = null;
    cb && cb();
  }

  function next() {
    if (!playing) return;
    if (idx >= parts.length) { const cb = onDone; playing = false; onDone = null; clearInterval(keepAlive); cb && cb(); return; }
    const u = new SpeechSynthesisUtterance(parts[idx++]);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = "ko-KR";
    u.rate = 0.98;   // 편안한 속도
    u.pitch = 1;
    u.volume = 1;
    u.onend = next;
    u.onerror = () => { if (playing) next(); };
    synth.speak(u);
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
    idx = 0;
    playing = true;
    onDone = done;
    // 크롬에서 오래 읽으면 멈추는 문제를 막는다
    keepAlive = setInterval(() => { if (playing && synth.speaking) { synth.pause(); synth.resume(); } }, 9000);
    next();
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

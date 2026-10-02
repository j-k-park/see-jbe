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

  window.SEE = window.SEE || {};
  window.SEE.voice = { supported: !!SR, attach };
})();

/* SEE 음성 기능 — 선도학교 소통지원 누리집(leading.jbedu.ai.kr) AI 도우미에서 휴대폰·PC 모두 잘 작동한 방식을 옮김
   - 말로 묻기: 브라우저 음성 인식(크롬·엣지·사파리, ko-KR). 마이크 버튼을 누른 순간 바로 시작(휴대폰은 누른 순간에만 허용)
     말이 끝나면 문장부호를 붙여 자동으로 보내고, 답변은 자동으로 읽어 준다
   - 답변 읽어 주기: /api/tts(구글 클라우드 자연스러운 한국어 음성, MP3). 서버가 fallback이라 하면 브라우저 음성으로
   말소리와 답변 글은 저장하지 않는다. */
(function () {
  "use strict";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canListen = !!SR;

  const LISTEN_ERR = {
    "not-allowed": "마이크 사용이 막혀 있어요.",
    "service-not-allowed": "이 브라우저에서는 음성 입력을 쓸 수 없어요. 크롬이나 사파리에서 열어 주세요.",
    "no-speech": "말소리가 들리지 않았어요. 마이크 버튼을 누르고 다시 말씀해 주세요.",
    "audio-capture": "마이크를 찾지 못했어요.",
    network: "음성 인식 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.",
  };

  /** 말로 묻기 — onText(말하는 동안 글자), onEnd(최종 글자, 오류 문구, 오류 코드) */
  function listen({ onText, onEnd }) {
    const r = new SR();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = false; // 휴대폰에서 가장 안정적: 한 번 말하고 멈추면 끝
    let final = "", err = "", code = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      onText((final + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      code = e.error;
      err = LISTEN_ERR[e.error] || "음성을 알아듣지 못했어요. 다시 말씀해 주세요.";
    };
    r.onend = async () => {
      if (final.trim()) return onEnd(final.trim(), "", "");
      if (code === "not-allowed" || code === "audio-capture") err = (await micCause()) || err;
      onEnd("", err, code);
    };
    r.start(); // 반드시 누른 동작 안에서 바로 시작해야 휴대폰에서 허용 창이 뜬다
    return r;
  }

  /** 음성 인식은 문장부호를 거의 안 붙여서, 말끝을 보고 ? 또는 . 을 붙인다 */
  const Q_END = /(까|까요|니|냐|냐고|나요|가요|는가|던가|인가|건가|하나|되나|있나|없나|맞나|을래|ㄹ래|을래요|줄래|줄래요|래요|죠|지요|습니까|입니까|는지|은지|는지요|은지요|할지|일지|할지요|일지요|어때|어때요|어떤가요|되나요|있나요|없나요|수\s*있어|수\s*있어요|수\s*없어|수\s*없어요|수\s*있을까|수\s*있습니까)$/;
  const REQ_END = /(줘|줘요|주세요|주십시오|주셔요|해라|하세요|하십시오|보세요|봐|봐요|바랍니다|부탁해|부탁해요|부탁드립니다|드려요|알려|해 봐)$/;
  const Q_WORD = /(뭐|뭘|무엇|무슨|어떻게|어떤|어때|어떡|언제|어디|누구|누가|왜|몇|얼마|어느)/;
  function punctuate(t) {
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (!t || /[.?!。…~]$/.test(t)) return t;
    const end = t.replace(/[\s"'’”)]+$/, "");
    if (Q_END.test(end)) return t + "?";
    if (REQ_END.test(end)) return t + ".";
    if (Q_WORD.test(t) && /(요|야|어|아|지|래|대|해|돼|게|니|나|가|데)$/.test(end)) return t + "?";
    return t + ".";
  }

  /** 마이크가 막힌 진짜 이유(없으면 "") */
  async function micCause() {
    if (!navigator.mediaDevices?.getUserMedia) return "";
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
      return "마이크는 열렸는데 음성 인식이 시작되지 않았어요. 마이크 버튼을 한 번 더 눌러 주세요.";
    } catch (e) {
      const n = e?.name || "", m = String(e?.message || "");
      if (n === "NotFoundError" || n === "OverconstrainedError") return "마이크가 연결되어 있지 않아요. 마이크(또는 마이크 달린 이어폰)를 연결한 뒤 다시 눌러 주세요.";
      if (n === "NotReadableError") return "다른 앱(통화·화상회의 등)이 마이크를 쓰고 있어요. 그 앱을 끈 뒤 다시 눌러 주세요.";
      if (n === "NotAllowedError" && /system/i.test(m)) return "기기 설정에서 마이크가 막혀 있어요.";
      if (n === "NotAllowedError") return "브라우저에서 마이크가 막혀 있어요.";
      return "";
    }
  }

  /** 마이크가 막혔을 때 기기에 맞는 설정 방법 */
  function showMicHelp(reason) {
    const ua = navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
    let steps;
    if (inApp) steps = ["카카오톡·네이버 앱 안의 화면에서는 마이크를 쓸 수 없어요.", "오른쪽 위 메뉴에서 <strong>다른 브라우저로 열기</strong>를 누른 뒤 다시 해 주세요."];
    else if (iOS) steps = ["아이폰 <strong>설정</strong> 앱 → <strong>Safari → 마이크</strong>를 '확인' 또는 '허용'으로 바꿉니다.", "주소창의 <strong>'ᴀA'</strong> → <strong>웹사이트 설정 → 마이크</strong>에서도 허용할 수 있어요.", "<strong>설정 → 개인정보 보호 → 음성 인식</strong>에서 Safari가 켜져 있는지도 확인해 주세요.", "바꾼 뒤 이 화면을 새로 고쳐 주세요."];
    else if (android) steps = ["주소창 왼쪽의 <strong>자물쇠(또는 ⓘ) 아이콘</strong> → <strong>권한</strong>에서 마이크를 '허용'으로 바꿉니다.", "휴대폰 <strong>설정 → 애플리케이션 → (크롬·삼성 인터넷) → 권한 → 마이크</strong>도 허용인지 확인해 주세요.", "바꾼 뒤 이 화면을 새로 고쳐 주세요."];
    else steps = ["주소창 왼쪽 아이콘(자물쇠)을 누릅니다.", "<strong>마이크</strong>를 '허용'으로 바꾸고 새로 고칩니다."];
    const dlg = document.createElement("dialog");
    dlg.className = "mic-help";
    dlg.innerHTML = `<div class="dlg-head"><h2>마이크를 켜 주세요</h2></div>
      <div class="dlg-body">
        ${reason ? `<p><strong>${SEE.esc(reason)}</strong></p>` : ""}
        <ol style="padding-left:20px;display:grid;gap:8px">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
        <p class="notice blue" style="margin-top:4px"><span>휴대폰 자판(키보드)의 <strong>마이크 모양 키</strong>를 눌러 말해도 글자가 입력됩니다. 이 방법은 설정 없이 바로 쓸 수 있어요.</span></p>
      </div>
      <div class="dlg-foot"><button class="btn btn-navy btn-sm" type="button" value="close">알겠습니다</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector("[value=close]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }

  /* ---------- 답변 읽어 주기 ---------- */

  /** 화면용 마크다운 → 읽기용 글 */
  function speechText(src) {
    return String(src || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/^\s*\|?\s*:?-{2,}[-:| ]*$/gm, "")
      .replace(/[ \t]*\|[ \t]*/g, ", ")
      .replace(/^\s*#{1,6}\s*/gm, "")
      .replace(/^\s*(?:[-*•◦○□■▶]|\d+[.)]|\[\s?\])\s+/gm, "")
      .replace(/[*_`~>#]/g, "")
      .replace(/※\s*/g, "참고로, ")
      .replace(/[→⇒]/g, ", ")
      .replace(/(\d{2,4})-(\d{3,4})-(\d{4})/g, "$1 $2 $3")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .split("\n")
      .map((l) => l.replace(/(,\s*){2,}/g, ", ").replace(/[ \t]{2,}/g, " ").replace(/^[,\s]+|[,\s]+$/g, ""))
      .filter(Boolean)
      .map((l) => (/[.!?。…:)]$/.test(l) ? l : l + "."))
      .join("\n");
  }

  /** 문장 단위로 묶기 — 첫 묶음은 짧게(빨리 시작), 뒤는 길게 */
  function chunks(text) {
    const sents = text.split(/(?<=[.!?。…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    let cur = "";
    for (const s of sents) {
      const lim = out.length ? 900 : 220;
      if (cur && (cur + " " + s).length > lim) { out.push(cur); cur = s; }
      else cur = cur ? cur + " " + s : s;
    }
    if (cur) out.push(cur);
    return out.flatMap((c) => (c.length > 1400 ? c.match(/[\s\S]{1,1400}/g) : [c]));
  }

  const player = new Audio();
  player.preload = "auto";
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  let token = 0;
  let release = null;        // 재생 중인 조각을 끝내는 함수
  let browserOnly = false;   // 서버가 fallback을 알려 주면 이 화면에서는 브라우저 음성만
  const cache = new Map();   // 같은 글 다시 듣기는 서버를 다시 부르지 않음

  /** 휴대폰은 사용자가 누른 순간에만 소리를 낼 수 있어, 누를 때 미리 재생 권한을 열어 둔다 */
  function unlock() {
    try {
      if (player.paused) { player.src = SILENT; player.play().catch(() => {}); }
      if (window.speechSynthesis) speechSynthesis.getVoices();
    } catch {}
  }

  function stop() {
    token++;
    try { player.pause(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
    release?.();
    release = null;
  }

  async function fetchAudio(text) {
    if (browserOnly) return null;
    if (cache.has(text)) return cache.get(text);
    const p = (async () => {
      const tk = window.SEEAuth?.token?.();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json", ...(tk ? { Authorization: "Bearer " + tk } : {}) },
        body: JSON.stringify({ text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.audio) { if (j.fallback || res.status === 401) browserOnly = true; return null; }
      const bin = Uint8Array.from(atob(j.audio), (c) => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bin], { type: "audio/mpeg" }));
    })().catch(() => null);
    cache.set(text, p);
    p.then((u) => { if (!u) cache.delete(text); });
    return p;
  }

  function playUrl(url) {
    return new Promise((resolve) => {
      release = () => resolve("stopped");
      player.onended = () => resolve("ok");
      player.onerror = () => resolve("error");
      player.src = url;
      player.play().catch((e) => resolve(e?.name === "NotAllowedError" ? "blocked" : "error"));
    });
  }

  function bestVoice() {
    const vs = (window.speechSynthesis?.getVoices() || []).filter((v) => /^ko/i.test(v.lang));
    const score = (v) => (/Natural|Online|Neural|Premium|Enhanced/i.test(v.name) ? 4 : 0) + (/SunHi|InJoon|Yuna|Sora|Jian/i.test(v.name) ? 2 : 0) + (/Google/i.test(v.name) ? 1 : 0);
    return vs.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function browserSay(text, my) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve("error");
      const u = new SpeechSynthesisUtterance(text);
      const v = bestVoice();
      if (v) u.voice = v;
      u.lang = "ko-KR";
      u.rate = 1.0;
      release = () => resolve("stopped");
      u.onend = () => resolve("ok");
      u.onerror = () => resolve("error");
      if (my === token) speechSynthesis.speak(u);
    });
  }

  /** 읽어 주기. onDone(결과: "ok" | "stopped" | "blocked" | "error") */
  async function speak(src, onDone) {
    stop();
    const my = token;
    const parts = chunks(speechText(src));
    let result = parts.length ? "ok" : "error";
    for (let i = 0; i < parts.length; i++) {
      if (my !== token) { result = "stopped"; break; }
      const url = await fetchAudio(parts[i]);
      if (parts[i + 1]) fetchAudio(parts[i + 1]); // 다음 조각 미리 받기
      if (my !== token) { result = "stopped"; break; }
      // 구글 음성을 못 받으면 남은 글은 브라우저 음성으로(크롬은 긴 글을 끊어 먹어 문장별로)
      const r = url ? await playUrl(url) : await (async () => {
        for (const s of parts.slice(i).join(" ").split(/(?<=[.!?。…])\s+/)) {
          const x = await browserSay(s, my);
          if (x !== "ok") return x;
        }
        return "ok";
      })();
      if (!url) { result = r; break; }
      if (r !== "ok") { result = r; break; }
    }
    if (my === token) release = null;
    onDone?.(result);
  }

  /** 마이크 버튼 연결 — 누르면 바로 듣기 시작, 다시 누르면 멈춤. 말이 끝나면 onFinal(문장부호 붙인 글) */
  function bindMic(btn, field, onFinal) {
    if (!btn) return false;
    if (!canListen) { btn.hidden = true; return false; }
    let rec = null;
    const ph = field?.placeholder || "";
    const ui = (on) => {
      btn.classList.toggle("listening", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "듣기 멈추기" : "음성으로 입력하기");
      btn.innerHTML = SEE.icon(on ? "micOff" : "mic");
      if (field) field.placeholder = on ? "듣고 있어요… 말씀하세요" : ph;
    };
    ui(false);
    btn.addEventListener("click", () => {
      if (rec) { try { rec.stop(); } catch {} return; }
      stop();   // 읽어 주던 소리 멈춤(마이크가 그 소리를 듣지 않게)
      unlock(); // 이어서 답변을 읽어 줄 수 있게 소리 재생 권한을 미리 연다
      try {
        rec = listen({
          onText: (t) => { if (field) field.value = t; },
          onEnd: (t, err, code) => {
            rec = null;
            ui(false);
            if (t) return onFinal(punctuate(t));
            if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") showMicHelp(err);
            else if (err) SEE.toast(err);
          },
        });
        ui(true);
      } catch {
        rec = null;
        ui(false);
        SEE.toast("음성 입력을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      }
    });
    return true;
  }

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") stop(); });

  window.SEE = window.SEE || {};
  window.SEE.voice = { canListen, listen, punctuate, bindMic, showMicHelp, speak, stop, unlock, canSpeak: !!(window.Audio || window.speechSynthesis) };
  window.addEventListener("pagehide", stop);
})();

/* 구글 로그인(Google Identity Services) — AI 상담·담당자와 소통에서 사용
   구글이 발급한 ID 토큰을 세션 동안만 보관하고, 서버가 매 요청마다 서명을 검증한다.
   로그인하면 부를 이름(김하늘 선생님·박정교 장학사님)을 /api/me에서 받아 위쪽에 보이고, 처음 한 번 환영 인사를 띄운다. */
(function () {
  "use strict";
  const KEY = "see.auth";
  const ME = "see.me"; // {email, call, greet, hint, role} — 이 탭 동안만
  const WELCOME = "see.welcome"; // 로그인 직후 표시(/api/google-callback이 남긴다)
  let config = null;
  let gisLoading = null;

  const decode = (jwt) => {
    try {
      const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b + "===".slice((b.length + 3) % 4));
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    } catch {
      return null;
    }
  };

  const read = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (s && s.exp * 1000 > Date.now() + 60000) return s;
    } catch {}
    return null;
  };
  const write = (v) => {
    try {
      v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY);
    } catch {}
  };
  const forget = (...keys) => { try { keys.forEach((k) => sessionStorage.removeItem(k)); } catch {} };

  /* 부를 이름과 환영 인사(역할은 서버만 알기 때문에 한 번 받아 둔다) */
  const readMe = (u) => {
    try {
      const m = JSON.parse(sessionStorage.getItem(ME) || "null");
      return m && u && m.email === u.email ? m : null;
    } catch {
      return null;
    }
  };
  let meLoading = null;
  function loadMe(u) {
    const cached = readMe(u);
    if (cached) return Promise.resolve(cached);
    meLoading ||= fetch("/api/me", { headers: { Authorization: "Bearer " + u.token }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return null;
        m.email = u.email;
        try { sessionStorage.setItem(ME, JSON.stringify(m)); } catch {}
        return m;
      })
      .catch(() => null)
      .finally(() => { meLoading = null; });
    return meLoading;
  }

  let welcomed = false;
  function showWelcome(m) {
    const role = m.role === "super" || m.role === "manager" ? "admin" : m.role === "teacher" ? "teacher" : "guest";
    const box = document.createElement("div");
    box.className = "see-welcome " + role;
    box.setAttribute("role", "status");
    const icon = window.SEE?.icon || (() => "");
    box.innerHTML = `<span class="sw-ico">${icon("hand")}</span><span class="sw-text"><b></b><small></small></span><button type="button" aria-label="인사 닫기">${icon("close")}</button>`;
    box.querySelector("b").textContent = m.greet;
    box.querySelector("small").textContent = m.hint || "";
    document.body.appendChild(box);
    const close = () => {
      if (!box.isConnected || box.classList.contains("out")) return;
      box.classList.add("out");
      setTimeout(() => box.remove(), 350);
    };
    box.querySelector("button").addEventListener("click", close);
    let timer = setTimeout(close, 7000);
    // 읽는 동안(마우스·키보드 초점)은 닫지 않는다
    box.addEventListener("mouseenter", () => clearTimeout(timer));
    box.addEventListener("mouseleave", () => { clearTimeout(timer); timer = setTimeout(close, 3000); });
    box.addEventListener("focusin", () => clearTimeout(timer));
  }
  async function maybeWelcome(u) {
    let want = false;
    try { want = sessionStorage.getItem(WELCOME) === "1"; } catch {}
    if (!want || welcomed) return;
    welcomed = true;
    const m = await loadMe(u);
    forget(WELCOME);
    if (m?.greet) showWelcome(m);
  }

  async function getConfig() {
    if (config) return config;
    try {
      const r = await fetch("/api/config", { cache: "no-store" });
      config = r.ok ? await r.json() : {};
    } catch {
      config = {};
    }
    return config;
  }

  function loadGis() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!gisLoading) {
      gisLoading = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = res;
        s.onerror = () => { gisLoading = null; rej(new Error("구글 로그인을 불러오지 못했습니다.")); };
        document.head.appendChild(s);
      });
    }
    return gisLoading;
  }

  function onCredential(resp) {
    const p = decode(resp.credential);
    if (!p) return;
    write({ token: resp.credential, exp: p.exp, name: p.name || p.email, email: p.email, picture: p.picture });
    forget(ME);
    try { sessionStorage.setItem(WELCOME, "1"); } catch {}
    welcomed = false;
    window.dispatchEvent(new CustomEvent("see-auth", { detail: api.user() }));
    api.renderUtil();
  }

  let initialized = false;
  async function init() {
    // 로그인 뒤 돌아올 화면(/api/google-callback이 읽는다) — 게시판에서 로그인하면 게시판으로
    try { sessionStorage.setItem("see.next", /\.html$/.test(location.pathname) ? location.pathname : "/index.html"); } catch {}
    const c = await getConfig();
    if (!c.googleClientId) return false;
    await loadGis();
    if (!initialized) {
      google.accounts.id.initialize({
        client_id: c.googleClientId,
        callback: onCredential,
        auto_select: true,
        cancel_on_tap_outside: true,
        context: "signin",
        // 팝업을 막는 브라우저가 많아 페이지 이동 방식 사용 → /api/google-callback 이 토큰을 검증해 탭에 저장
        ux_mode: "redirect",
        login_uri: location.origin + "/api/google-callback",
        itp_support: true,
      });
      initialized = true;
    }
    return true;
  }

  // 카카오톡·네이버 등 앱 속 브라우저에서는 구글이 로그인을 막으므로 바깥 브라우저로 연다
  const ua = navigator.userAgent || "";
  const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);

  const api = {
    inApp,
    openExternal() {
      if (/KAKAOTALK/i.test(ua)) location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
      else if (/Android/i.test(ua)) location.href = "intent://" + location.href.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end";
    },
    user: () => read(),
    token: () => read()?.token || null,
    config: getConfig,
    async renderButton(el) {
      const ok = await init().catch(() => false);
      if (!ok) return false;
      el.innerHTML = "";
      google.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", locale: "ko", width: 260 });
      return true;
    },
    async prompt() {
      if (await init().catch(() => false)) google.accounts.id.prompt();
    },
    signOut() {
      write(null);
      forget(ME, WELCOME);
      try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
      window.dispatchEvent(new CustomEvent("see-auth", { detail: null }));
      api.renderUtil();
    },
    renderUtil() {
      const box = document.getElementById("util-user");
      if (!box) return;
      const u = read();
      const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      if (u) {
        const me = readMe(u);
        const call = me?.call || `${u.name}님`; // 관리자는 '박정교 장학사님', 현장교사 지원단은 '김하늘 선생님'
        box.innerHTML = `${u.picture ? `<img src="${esc(u.picture)}" alt="${esc(call)}" title="${esc(call)} 로그인 중" referrerpolicy="no-referrer">` : ""}<span>${esc(call)}</span><button type="button" id="util-logout">로그아웃</button>`;
        box.querySelector("#util-logout").addEventListener("click", api.signOut);
        if (!me) loadMe(u).then((m) => m && read()?.email === m.email && api.renderUtil());
        maybeWelcome(u);
      } else {
        box.innerHTML = `<a href="chat.html">AI 상담 로그인</a>`;
      }
    },
  };
  window.SEEAuth = api;
})();

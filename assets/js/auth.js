/* 구글 로그인(Google Identity Services) — AI 상담에서만 사용
   구글이 발급한 ID 토큰을 세션 동안만 보관하고, 서버가 매 요청마다 서명을 검증한다. */
(function () {
  "use strict";
  const KEY = "see.auth";
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
    window.dispatchEvent(new CustomEvent("see-auth", { detail: api.user() }));
    api.renderUtil();
  }

  let initialized = false;
  async function init() {
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
        box.innerHTML = `${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : ""}<span>${esc(u.name)}님</span><button type="button" id="util-logout">로그아웃</button>`;
        box.querySelector("#util-logout").addEventListener("click", api.signOut);
      } else {
        box.innerHTML = `<a href="chat.html">AI 상담 로그인</a>`;
      }
    },
  };
  window.SEEAuth = api;
})();

/* 공통: 머리글·바닥글·아이콘·파일 저장 도우미 */
(function () {
  "use strict";

  const SEE_LOGO = `<svg viewBox="0 0 120 98" aria-hidden="true" focusable="false"><path d="M30 77c-14 0-22-11-17-22-8-9-2-24 11-24 1-13 16-20 27-13 7-11 25-11 31 1 13-4 26 5 24 18 11 5 11 22-1 26-2 10-12 15-22 14h-4c-2 8-8 14-16 17 3-5 4-10 3-15z" fill="#FBF6EC" stroke="#8CBDE6" stroke-width="3.2" stroke-linejoin="round"/><text x="61" y="61" text-anchor="middle" font-family="Pretendard Variable, Pretendard, sans-serif" font-weight="900" font-size="31" letter-spacing="-.5"><tspan fill="#F0874A">S</tspan><tspan fill="#5E9ED8">E</tspan><tspan fill="#3F86CC">E</tspan></text></svg>`;

  const I = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    send: '<path d="m4 12 16-8-6 16-2.5-6.5L4 12Z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.5"/>',
    sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-7 8-7 0 5-3 7-8 7Z"/><path d="M12 11C12 8 9.5 5 5 5c0 4 2.5 6 7 6Z"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    steps: '<path d="M4 20h4v-4h4v-4h4V8h4"/><path d="M4 20V4"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.5"/>',
    home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z"/>',
    school: '<path d="M3 10 12 5l9 5-9 5-9-5Z"/><path d="M7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4"/>',
    heart: '<path d="M12 20s-8-4.6-8-10.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8 2.7C20 15.4 12 20 12 20Z"/>',
    hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V7a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 6.5-6 6.5-2.6 0-4.2-1.3-5.4-3.4L3.8 13.5a1.5 1.5 0 0 1 2.6-1.5L8 14"/>',
    bus: '<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M8 20v-3M16 20v-3M8 14h.5M15.5 14h.5"/>',
    stetho: '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.4 5 2.8 5 5.8"/>',
    tool: '<path d="M14.5 5.5a4 4 0 0 0 5 5L12 18a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2Z"/><path d="m5 19 2-2"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 1.7-3 2-3 .8-3 2 1.3 2 3 2 3-.8 3-2M12 6v1.5M12 16.5V18"/>',
    baby: '<circle cx="12" cy="8" r="4"/><path d="M6 21c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M10.5 8h.01M13.5 8h.01"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M9 21h6"/>',
    micOff: '<path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M15 12.5V13a3 3 0 0 1-5.1 2.1"/><path d="M5 11a7 7 0 0 0 10.9 5.8M19 11a7 7 0 0 1-.6 2.8"/><path d="M12 18v3M9 21h6M4 4l16 16"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  };
  const icon = (name, extra = "") =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[name] || ""}</svg>`;

  const STEPS = [
    { n: 1, href: "step1.html", label: "발달 정보", c: "var(--coral)" },
    { n: 2, href: "step2.html", label: "선별검사", c: "#e0a800" },
    { n: 3, href: "step3.html", label: "결과 가이드", c: "var(--teal)" },
    { n: 4, href: "step4.html", label: "선정·지원", c: "var(--blue)" },
    { n: 5, href: "step5.html", label: "기관 찾기", c: "var(--navy)" },
  ];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderChrome() {
    const page = document.body.dataset.page || "";
    const head = document.getElementById("site-head");
    if (head) {
      head.innerHTML = `
      <a class="skip" href="#main">본문 바로가기</a>
      <div class="util"><div class="wrap">
        <div class="util-links">
          <a href="https://www.jbe.go.kr/" target="_blank" rel="noopener">전북특별자치도교육청</a>
          <a href="https://www.jbe.go.kr/special/" target="_blank" rel="noopener">특수교육지원센터</a>
          <a href="https://www.nise.go.kr/onmam/front/main.do" target="_blank" rel="noopener">장애자녀 부모지원(온맘)</a>
        </div>
        <div class="util-user" id="util-user"></div>
      </div></div>
      <header class="masthead">
        <div class="wrap masthead-row">
          <a class="brand" href="index.html" aria-label="SEE 우리 아이 성장 길잡이 홈">
            <img class="jbe" src="assets/img/jbe-logo.png" alt="전북특별자치도교육청 JEONBUK STATE OFFICE OF EDUCATION" width="640" height="116">
            <span class="bar"></span>
            <span class="see">${SEE_LOGO}<span><b>우리 아이 성장 길잡이</b><small>영유아 특수교육 조기지원</small></span></span>
          </a>
          <div class="mast-actions">
            <a class="btn-ai" href="chat.html">${icon("chat")}<span>AI 상담 SEE</span></a>
            <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="gnb" aria-label="메뉴 열기">${icon("menu")}</button>
          </div>
        </div>
        <nav class="gnb" id="gnb" aria-label="주 메뉴"><div class="wrap"><ul>
          ${STEPS.map((s) => `<li><a href="${s.href}" style="--c:${s.c}" ${page === "step" + s.n ? 'aria-current="page"' : ""}><span class="n">${s.n}</span>${s.label}</a></li>`).join("")}
          <li><a href="library.html" ${page === "library" ? 'aria-current="page"' : ""}>자료실</a></li>
          <li><a href="faq.html" ${page === "faq" ? 'aria-current="page"' : ""}>자주 묻는 질문</a></li>
        </ul></div></nav>
      </header>`;
      const t = head.querySelector(".menu-toggle");
      const g = head.querySelector(".gnb");
      t.addEventListener("click", () => {
        const open = g.classList.toggle("open");
        t.setAttribute("aria-expanded", String(open));
        t.innerHTML = icon(open ? "close" : "menu");
      });
    }
    const foot = document.getElementById("site-foot");
    if (foot) {
      foot.innerHTML = `
      <footer class="site-foot"><div class="wrap">
        <div class="foot-grid">
          <div>
            <img src="assets/img/jbe-logo-white.png" alt="전북특별자치도교육청 JEONBUK STATE OFFICE OF EDUCATION" width="640" height="116">
            <address>(55065) 전북특별자치도 전주시 완산구 홍산로 111 전북특별자치도교육청<br>
            대표전화 063-1396 (평일 9:00~18:00) · 담당 유초등특수교육과</address>
          </div>
          <div class="foot-links">
            <a href="https://www.jbe.go.kr/" target="_blank" rel="noopener">교육청 누리집</a>
            <a href="https://www.jbe.go.kr/special/" target="_blank" rel="noopener">특수교육지원센터</a>
            <a href="library.html">자료실</a>
            <a href="privacy.html">개인정보 처리 안내</a>
          </div>
        </div>
        <p class="foot-note">이 서비스의 안내와 AI 답변은 참고용이며 의학적 진단을 대신하지 않습니다. 특수교육대상자 선정·지원에 관한 정확한 내용은 거주지 교육지원청 특수교육지원센터에 문의해 주세요.<br>
        COPYRIGHT © 전북특별자치도교육청. ALL RIGHTS RESERVED.</p>
      </div></footer>`;
    }
    if (page !== "chat" && !document.querySelector(".fab")) {
      const a = document.createElement("a");
      a.className = "fab";
      a.href = "chat.html";
      a.innerHTML = `${SEE_LOGO}<span class="t"><b>SEE에게 물어보기</b><small>AI 상담</small></span>`;
      a.setAttribute("aria-label", "AI 상담 SEE에게 물어보기");
      document.body.appendChild(a);
    }
    document.querySelectorAll("[data-icon]").forEach((el) => {
      el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    });
    document.querySelectorAll("[data-see-logo]").forEach((el) => (el.innerHTML = SEE_LOGO));
    window.SEEAuth?.renderUtil?.();
  }

  /* ---------- 파일 저장 ---------- */
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };
  const fileSafe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "SEE자료";

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // 문서 블록: {h:"제목"} {p:"문단"} {ul:[...]} {ol:[...]} {table:{head:[], rows:[[]]}} {note:"작은 글"}
  function blocksToText(title, blocks) {
    const out = [title, "=".repeat(Math.min(40, title.length * 2)), ""];
    for (const b of blocks) {
      if (b.h) out.push("", "■ " + b.h);
      if (b.p) out.push(b.p);
      if (b.note) out.push("※ " + b.note);
      if (b.ul) b.ul.forEach((x) => out.push("  - " + x));
      if (b.ol) b.ol.forEach((x, i) => out.push(`  ${i + 1}. ${x}`));
      if (b.table) {
        out.push(b.table.head.join(" | "));
        b.table.rows.forEach((r) => out.push(r.join(" | ")));
      }
    }
    out.push("", `출처: SEE 우리 아이 성장 길잡이 (전북특별자치도교육청) · 저장일 ${today()}`);
    return out.join("\n");
  }

  function blocksToHtml(blocks) {
    return blocks
      .map((b) => {
        if (b.h) return `<h2>${esc(b.h)}</h2>`;
        if (b.p) return `<p>${esc(b.p)}</p>`;
        if (b.note) return `<p style="font-size:9.5pt;color:#555">※ ${esc(b.note)}</p>`;
        if (b.ul) return `<ul>${b.ul.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
        if (b.ol) return `<ol>${b.ol.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
        if (b.table)
          return `<table><thead><tr>${b.table.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.table.rows
            .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`;
        return "";
      })
      .join("");
  }

  function printDoc(title, blocks) {
    let area = document.getElementById("print-area");
    if (!area) {
      area = document.createElement("div");
      area.id = "print-area";
      document.body.appendChild(area);
    }
    area.innerHTML = `<div class="p-meta"><img src="assets/img/jbe-logo.png" alt="전북특별자치도교육청"><span>SEE 우리 아이 성장 길잡이 · ${today()}</span></div>
      <h1>${esc(title)}</h1>${blocksToHtml(blocks)}
      <p class="p-foot">이 자료는 참고용이며 정확한 내용은 거주지 교육지원청 특수교육지원센터에 문의해 주세요. · see.jbedu.ai.kr</p>`;
    const imgs = [...area.querySelectorAll("img")];
    Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => (im.onload = im.onerror = r))))).then(() => window.print());
  }

  let docxLoading = null;
  function loadDocx() {
    if (window.docx) return Promise.resolve(window.docx);
    if (!docxLoading) {
      docxLoading = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js";
        s.onload = () => res(window.docx);
        s.onerror = () => { docxLoading = null; rej(new Error("docx 라이브러리를 불러오지 못했습니다.")); };
        document.head.appendChild(s);
      });
    }
    return docxLoading;
  }

  async function saveDocx(title, blocks) {
    const d = await loadDocx();
    const font = "맑은 고딕";
    const run = (text, o = {}) => new d.TextRun({ text, font, size: o.size || 22, bold: o.bold, color: o.color });
    const children = [
      new d.Paragraph({ children: [run("전북특별자치도교육청 · SEE 우리 아이 성장 길잡이", { size: 18, color: "6B7486" })], spacing: { after: 120 } }),
      new d.Paragraph({ children: [run(title, { size: 36, bold: true, color: "012D63" })], spacing: { after: 240 } }),
    ];
    const cell = (t, head) =>
      new d.TableCell({
        children: [new d.Paragraph({ children: [run(String(t), { size: 20, bold: head })] })],
        shading: head ? { fill: "EEF2F8" } : undefined,
      });
    for (const b of blocks) {
      if (b.h) children.push(new d.Paragraph({ children: [run(b.h, { size: 28, bold: true, color: "012D63" })], spacing: { before: 240, after: 100 } }));
      if (b.p) children.push(new d.Paragraph({ children: [run(b.p)], spacing: { after: 100 } }));
      if (b.note) children.push(new d.Paragraph({ children: [run("※ " + b.note, { size: 19, color: "555555" })], spacing: { after: 100 } }));
      if (b.ul) b.ul.forEach((x) => children.push(new d.Paragraph({ children: [run(x)], bullet: { level: 0 } })));
      if (b.ol) b.ol.forEach((x, i) => children.push(new d.Paragraph({ children: [run(`${i + 1}. ${x}`)], spacing: { after: 60 } })));
      if (b.table)
        children.push(
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: [new d.TableRow({ children: b.table.head.map((h) => cell(h, true)), tableHeader: true }), ...b.table.rows.map((r) => new d.TableRow({ children: r.map((c) => cell(c)) }))],
          }),
          new d.Paragraph({ children: [] })
        );
    }
    children.push(new d.Paragraph({ children: [run(`이 자료는 참고용이며 정확한 내용은 거주지 교육지원청 특수교육지원센터에 문의해 주세요. (저장일 ${today()})`, { size: 18, color: "6B7486" })], spacing: { before: 300 } }));
    const doc = new d.Document({ creator: "전북특별자치도교육청 SEE", title, sections: [{ properties: {}, children }] });
    const blob = await d.Packer.toBlob(doc);
    saveBlob(blob, fileSafe(title) + ".docx");
  }

  function saveTxt(title, blocks) {
    saveBlob(new Blob(["﻿" + blocksToText(title, blocks)], { type: "text/plain;charset=utf-8" }), fileSafe(title) + ".txt");
  }

  function saveCsv(title, head, rows) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
    saveBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), fileSafe(title) + ".csv");
  }

  /* 간단하고 안전한 마크다운 → HTML (먼저 모두 이스케이프) */
  function md(src) {
    const lines = esc(src).split(/\r?\n/);
    let html = "", list = null;
    const inline = (s) =>
      s
        .replace(/^\[ \]\s*/, "□ ")
        .replace(/^\[[xX]\]\s*/, "■ ")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[a-z0-9]+\.html[^\s)]*)\)/g, (m, t, u) => `<a href="${u}"${u.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`);
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { close(); continue; }
      if ((m = line.match(/^#{1,4}\s+(.*)/))) { close(); html += `<h4>${inline(m[1])}</h4>`; continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; continue; }
      close();
      html += `<p>${inline(line)}</p>`;
    }
    close();
    return html;
  }

  // 마크다운 텍스트를 문서 블록으로 (AI가 만든 문서 저장용)
  function mdToBlocks(src) {
    const blocks = [];
    let cur = null;
    const strip = (s) => s.replace(/^\[ \]\s*/, "□ ").replace(/^\[[xX]\]\s*/, "■ ").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    for (const raw of String(src).split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if (!line) { cur = null; continue; }
      if ((m = line.match(/^#{1,4}\s+(.*)/))) { blocks.push({ h: strip(m[1]) }); cur = null; continue; }
      if ((m = line.match(/^[-*•]\s+(.*)/))) { if (!cur || !cur.ul) { cur = { ul: [] }; blocks.push(cur); } cur.ul.push(strip(m[1])); continue; }
      if ((m = line.match(/^\d+[.)]\s+(.*)/))) { if (!cur || !cur.ol) { cur = { ol: [] }; blocks.push(cur); } cur.ol.push(strip(m[1])); continue; }
      if ((m = line.match(/^\[ \]\s*(.*)/))) { if (!cur || !cur.ul) { cur = { ul: [] }; blocks.push(cur); } cur.ul.push("□ " + strip(m[1])); continue; }
      blocks.push({ p: strip(line) });
      cur = null;
    }
    return blocks;
  }

  function toast(msg) {
    let t = document.getElementById("see-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "see-toast";
      t.setAttribute("role", "status");
      t.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#012d63;color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;z-index:99;opacity:0;transition:opacity .2s;max-width:calc(100% - 32px)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.style.opacity = "0"), 2400);
  }

  async function saveAs(kind, title, blocks) {
    try {
      if (kind === "pdf") return printDoc(title, blocks);
      if (kind === "txt") return saveTxt(title, blocks);
      if (kind === "docx") { toast("워드 파일을 만드는 중입니다…"); await saveDocx(title, blocks); toast("워드 파일을 저장했습니다."); }
    } catch (e) {
      console.error(e);
      toast("파일을 만들지 못했습니다. PDF 저장이나 텍스트 저장을 이용해 주세요.");
    }
  }

  // 저장 버튼 묶음 HTML
  const saveButtons = (id) => `
    <button class="btn btn-line btn-sm" type="button" data-save="pdf" data-doc="${id}">${icon("print")}PDF·인쇄</button>
    <button class="btn btn-line btn-sm" type="button" data-save="docx" data-doc="${id}">${icon("file")}워드(.docx)</button>
    <button class="btn btn-line btn-sm" type="button" data-save="txt" data-doc="${id}">${icon("download")}텍스트</button>`;

  window.SEE = { icon, esc, SEE_LOGO, STEPS, md, mdToBlocks, saveAs, saveCsv, saveButtons, toast, today };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderChrome);
  else renderChrome();
})();

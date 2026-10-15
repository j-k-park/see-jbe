/* SEE 그림 — 유치원 아이(여·남), 엄마·아빠, 유치원 선생님, 아기와 메뉴별 장면을 SVG로 직접 그린다(사진·외부 그림 없음).
   쓰는 곳: 첫 화면(SEE 구름 옆 아이들, 5단계 길잡이 선생님, 도움이 필요한 아기) · 메뉴 화면 머리(1~5단계, 자료실, 자주 묻는 질문).
   자리와 움직임은 assets/css/art.css. 기기의 '동작 줄이기' 설정과 상관없이 처음부터 움직이고,
   멈춤(❚❚)을 누르면 html.mo-still 로 모두 멈춘다(첫 화면 비전 문구 옆 단추와 같은 기억 값 see.vision.still).
   그리는 법: 사람은 발 가운데가 (0,0)이고 위쪽이 -y. 팔·앞팔·머리·눈·머리카락처럼 움직이는 부품은
   축이 되는 점을 원점으로 둔 <g> 안에 그려, CSS transform-origin 0 0 이 곧 그 축이 되게 한다. */
(function () {
  "use strict";

  const KEY = "see.vision.still";
  const root = document.documentElement;
  try { if (localStorage.getItem(KEY) === "1") root.classList.add("mo-still"); } catch { /* 저장소 막힘 */ }

  const r = (n) => Math.round(n * 100) / 100;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (a) => (a * 180) / Math.PI;
  let SEQ = 0;

  /* ---------- 색 ---------- */
  const INK = "#2b2233", MOUTH = "#a6433f", TONGUE = "#ff9c97", BLUSH = "#ff8a8a";
  const SKIN = "#ffe3cf", SKIN_LINE = "#eba98b", NOSE = "#eba386", SKIN_SH = "#f3b998";

  /* 그러데이션·자르기 정의는 그림(SVG)마다 따로 모은다 — 한 화면에 그림이 여럿이어도 id가 겹치지 않게 */
  function Paint() {
    const u = "ar" + (++SEQ).toString(36) + Math.random().toString(36).slice(2, 5);
    const defs = [], seen = new Map();
    let n = 0;
    const add = (key, make) => {
      if (!seen.has(key)) { const id = `${u}-${++n}`; seen.set(key, id); defs.push(make(id)); }
      return `url(#${seen.get(key)})`;
    };
    return {
      v: (a, b) => add("v" + a + b, (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`),
      skin: () => add("skin", (id) => `<radialGradient id="${id}" cx=".42" cy=".36" r=".74"><stop offset="0" stop-color="#fff6ee"/><stop offset=".6" stop-color="${SKIN}"/><stop offset="1" stop-color="#f7c8ab"/></radialGradient>`),
      glow: (c, o = 0.9) => add("glow" + c + o, (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`),
      clip: (d) => add("clip" + d, (id) => `<clipPath id="${id}"><path d="${d}"/></clipPath>`),
      defs: () => (defs.length ? `<defs>${defs.join("")}</defs>` : ""),
    };
  }

  /* ---------- 몸 비율 ---------- */
  // head: 얼굴 가운데 높이, neck: 고개 돌리는 축, eye: [가로 위치, 세로 위치, 반지름 x, y], sh: 어깨(팔 축), L1·L2: 위팔·아래팔
  const AGE = {
    kid: { head: -88, neck: -63, R: 30, Ry: 27.5, eye: [11.4, 3.8, 4.6, 5.8], brow: -7.4, bw: 4.8, blush: [18.8, 12.4, 5.6, 3.3], nose: 9.4, mouth: 14.8, mw: 4.6, sh: [12.4, -54], L1: 11.5, L2: 10.5, w: 8.2, hand: 4.6, kid: true, shadow: 17 },
    adult: { head: -165, neck: -139, R: 25, Ry: 27, eye: [9.4, 2.8, 3.7, 4.7], brow: -7.4, bw: 4.4, blush: [15.4, 11.6, 4.8, 2.7], nose: 8.8, mouth: 14.2, mw: 4.1, sh: [20, -126], L1: 27, L2: 25, w: 9.6, hand: 5.3, shadow: 22 },
    tod: { head: -66, neck: -44, R: 26, Ry: 24, eye: [10, 4.2, 4.3, 5.3], brow: -6.2, bw: 4.4, blush: [16.4, 11.2, 5.2, 3], nose: 8.6, mouth: 12.8, mw: 3.8, sh: [10.6, -36.5], L1: 9, L2: 8.4, w: 7.2, hand: 4.1, kid: true, shadow: 14 },
  };

  const KIND = {
    girl: { age: "kid", female: true, hair: ["#5e3c2f", "#3b251d"], brow: "#4e3328", sleeve: { c: "#ffb3c5", line: "#f0809b", cap: 5.6, puff: true } },
    boy: { age: "kid", hair: ["#4b3329", "#2d1e18"], brow: "#3a2820", sleeve: { c: "#97d2f7", line: "#5aa8dc", cap: 6.2 } },
    mom: { age: "adult", female: true, hair: ["#6e4636", "#46291e"], brow: "#5a3a2d", sleeve: { c: "#ffb18e", line: "#e8845b", long: true, cuff: "#fff7ea" } },
    dad: { age: "adult", hair: ["#3b2e2b", "#1f1817"], brow: "#2e2422", shoulder: 22.4, sleeve: { c: "#73b1e8", line: "#4384c6", long: true, cuff: "#ffffff" } },
    teacher: { age: "adult", female: true, hair: ["#7a4733", "#4b2a1e"], brow: "#5e3829", shoulder: 19.4, sleeve: { c: "#ffd3de", line: "#f0a2b5", three: true } },
    baby: { age: "tod", hair: ["#7a5240", "#54382b"], brow: "#6a4838", sleeve: { c: "#ffe27a", line: "#e9be3f", cap: 4.6 } },
  };

  /* ---------- 얼굴 ---------- */
  function facePath(R, Ry, kid) {
    // 아이는 둥글고 볼이 통통하게, 어른은 턱을 조금 좁게
    const k = kid ? 0.6 : 0.5, cx = kid ? 0.6 : 0.46, cy = kid ? 1 : 0.98;
    return `M${-R},0C${-R},${r(-Ry * 0.56)} ${r(-R * 0.56)},${-Ry} 0,${-Ry}C${r(R * 0.56)},${-Ry} ${R},${r(-Ry * 0.56)} ${R},0` +
      `C${R},${r(Ry * k)} ${r(R * cx)},${r(Ry * cy)} 0,${Ry}C${r(-R * cx)},${r(Ry * cy)} ${-R},${r(Ry * k)} ${-R},0Z`;
  }

  function eyes(A, female, ex) {
    const [x, y, rx, ry] = A.eye;
    if (ex === "joy") {
      const w = rx * 1.15;
      const arc = (cx) => `<path d="M${r(cx - w)},${r(y + 1.2)}Q${cx},${r(y - ry * 1.05)} ${r(cx + w)},${r(y + 1.2)}" fill="none" stroke="${INK}" stroke-width="${r(rx * 0.52)}" stroke-linecap="round"/>`;
      return arc(-x) + arc(x);
    }
    const k = ex === "wonder" ? 1.1 : 1;
    const X = rx * k, Y = ry * k;
    const one = (cx, side) =>
      `<g transform="translate(${cx} ${y})"><g class="ar-blink">` +
      `<ellipse rx="${r(X)}" ry="${r(Y)}" fill="${INK}"/>` +
      `<ellipse cy="${r(Y * 0.42)}" rx="${r(X * 0.7)}" ry="${r(Y * 0.4)}" fill="#a06a52" opacity=".55"/>` +
      `<circle cx="${r(-X * 0.3)}" cy="${r(-Y * 0.36)}" r="${r(X * 0.44)}" fill="#fff"/>` +
      `<circle cx="${r(X * 0.38)}" cy="${r(Y * 0.36)}" r="${r(X * 0.2)}" fill="#fff" opacity=".9"/>` +
      (female
        ? `<path d="M${r(-X * 1.1)},${r(-Y * 0.16)}Q0,${r(-Y * 1.36)} ${r(X * 1.1)},${r(-Y * 0.16)}" fill="none" stroke="${INK}" stroke-width="${r(X * 0.34)}" stroke-linecap="round"/>` +
          `<path d="M${r(side * X * 0.94)},${r(-Y * 0.5)}L${r(side * X * 1.52)},${r(-Y * 0.98)}" stroke="${INK}" stroke-width="${r(X * 0.28)}" stroke-linecap="round"/>`
        : "") +
      `</g></g>`;
    return one(-x, -1) + one(x, 1);
  }

  function brows(A, ex, col) {
    const [x] = A.eye, y = A.brow, w = A.bw;
    const one = (cx, side) => {
      // side: 눈 바깥쪽(-1 왼눈, 1 오른눈). 바깥 끝 o, 안쪽 끝 i
      const ox = cx + side * w, ix = cx - side * w;
      let oy = y, iy = y, cy = y - 2.2;
      if (ex === "worried") { oy = y + 1.2; iy = y - 2.6; cy = y - 1.4; }
      else if (ex === "wonder") { oy = y - 1.2; iy = y - 1.2; cy = y - 3.8; }
      else if (ex === "joy" || ex === "open") { oy = y - 0.6; iy = y - 0.6; cy = y - 3; }
      return `M${r(ox)},${r(oy)}Q${r(cx)},${r(cy)} ${r(ix)},${r(iy)}`;
    };
    return `<path d="${one(-x, -1)}${one(x, 1)}" fill="none" stroke="${col}" stroke-width="${A.kid ? 1.9 : 1.7}" stroke-linecap="round"/>`;
  }

  function mouth(A, ex) {
    const y = A.mouth, w = A.mw;
    const open = (W, H) =>
      `<path d="M${r(-W)},${y}Q0,${r(y + 1.2)} ${r(W)},${y}Q${r(W * 0.92)},${r(y + H * 1.6)} 0,${r(y + H * 1.7)}Q${r(-W * 0.92)},${r(y + H * 1.6)} ${r(-W)},${y}Z" fill="${MOUTH}"/>` +
      `<ellipse cy="${r(y + H * 1.2)}" rx="${r(W * 0.52)}" ry="${r(H * 0.36)}" fill="${TONGUE}"/>`;
    const smile = `<path d="M${r(-w)},${y}Q0,${r(y + w * 0.95)} ${r(w)},${y}" fill="none" stroke="${MOUTH}" stroke-width="${A.kid ? 2 : 1.8}" stroke-linecap="round"/>`;
    switch (ex) {
      case "joy": case "open": return open(w * 1.12, w * 1.2);
      case "talk": return `<g class="ar-talk">${open(w * 0.95, w * 1.05)}</g><g class="ar-talk2">${smile}</g>`;
      case "wonder": return `<ellipse cy="${r(y + 1.6)}" rx="${r(w * 0.48)}" ry="${r(w * 0.6)}" fill="${MOUTH}"/>`;
      case "worried": return `<path d="M${r(-w * 0.78)},${r(y + 2.2)}Q0,${r(y - 0.9)} ${r(w * 0.78)},${r(y + 2.2)}" fill="none" stroke="${MOUTH}" stroke-width="1.8" stroke-linecap="round"/>`;
      default: return smile;
    }
  }

  function faceParts(A, K, ex) {
    const [bx, by, brx, bry] = A.blush;
    return `<ellipse cx="${-bx}" cy="${by}" rx="${brx}" ry="${bry}" fill="${BLUSH}" opacity=".34"/>` +
      `<ellipse cx="${bx}" cy="${by}" rx="${brx}" ry="${bry}" fill="${BLUSH}" opacity=".34"/>` +
      `<ellipse cx="0" cy="${A.nose}" rx="${A.kid ? 1.7 : 1.5}" ry="1.1" fill="${NOSE}"/>` +
      brows(A, ex, K.brow) + eyes(A, K.female, ex) + mouth(A, ex);
  }

  /* ---------- 머리카락 (머리 가운데가 원점) ---------- */
  // behind: 몸 뒤로 내려오는 머리, back: 얼굴 뒤, bangs: 앞머리 경로, extra: 앞머리 위 장식, shine: 윤기
  const HAIR = {
    girl(g, K) {
      const fill = g.v(K.hair[0], K.hair[1]);
      const tail =
        `<path d="M-3,-7C8,-12.5 19.5,-4.5 19.8,8C20,17 15,24 9,24.3C11.4,19 10.4,13 6.4,9.4C3.6,6.8 .4,5.6 -3,6.2Z" fill="${fill}"/>` +
        `<path d="M4.5,-6.5C10.5,-6.6 15.4,-1.8 16.4,4.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".22"/>` +
        `<circle r="3.9" fill="#ffd54a" stroke="#efb100" stroke-width=".8"/><circle cx="-1.2" cy="-1.3" r="1.1" fill="#fff" opacity=".7"/>`;
      return {
        back: `<path d="M-33,5C-35.5,-22 -21,-34 0,-34C21,-34 35.5,-22 33,5Q0,13 -33,5Z" fill="${fill}"/>`,
        bangs: "M-30.5,9C-33,-6 -32,-22 -20,-30C-10,-36 10,-36 20,-30C32,-22 33,-6 30.5,9C28,4 26.5,-1 25.5,-5Q19.5,-3.5 12.5,-10Q6.3,-6 0,-11Q-6.3,-6 -12.5,-10Q-19.5,-3.5 -25.5,-5C-26.5,-1 -28,4 -30.5,9Z",
        // 양 갈래 머리(흔들림 축 = 머리끈)
        extra: `<g transform="translate(31.4 -6)"><g class="ar-swing">${tail}</g></g>` +
          `<g transform="translate(-31.4 -6) scale(-1 1)"><g class="ar-swing">${tail}</g></g>`,
        shine: "M-17,-27Q-6,-32.5 6,-31.6M12.5,-30Q19.5,-27.6 23.4,-23",
      };
    },
    boy(g, K, o) {
      const fill = g.v(K.hair[0], K.hair[1]);
      const ears = `<g fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width=".9"><circle cx="-30" cy="4" r="5.4"/><circle cx="30" cy="4" r="5.4"/></g>`;
      const hat = o.hat
        ? `<path d="M-26.5,-14C-27.5,-39 27.5,-39 26.5,-14Z" fill="${g.v("#ffe36e", "#f9c51f")}" stroke="#e5ab00" stroke-width=".8"/>` +
          `<path d="M-26.6,-18.6Q0,-14 26.6,-18.6L26.5,-14.2Q0,-9.6 -26.5,-14.2Z" fill="#ff9636"/>` +
          `<path d="M-35.5,-12.4Q0,-3 35.5,-12.4Q33.6,-19 25.6,-16.6Q0,-11.2 -25.6,-16.6Q-33.6,-19 -35.5,-12.4Z" fill="${g.v("#ffe36e", "#f6bf12")}" stroke="#e5ab00" stroke-width=".8"/>` +
          `<circle cx="0" cy="-36.6" r="2.4" fill="#ff9636"/>` +
          `<path d="M-16,-31Q-6,-35 6,-34.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".45"/>`
        : `<path d="M2,-33C.6,-41.5 9.6,-44.6 12.6,-38.6" fill="none" stroke="${K.hair[0]}" stroke-width="2.6" stroke-linecap="round"/>`;
      return {
        back: `<path d="M-32,2C-34,-22 -20,-33 0,-33C20,-33 34,-22 32,2Q0,9 -32,2Z" fill="${fill}"/>` + ears,
        bangs: "M-30.5,4C-33,-12 -29,-27 -14,-32C-2,-35.5 14,-34 24,-27C31,-21 33,-9 30.5,4C29,-1 27.5,-5 25,-8L23.5,-3.5C21,-8.5 17,-11 13,-11.5L12,-6C9,-10 4.5,-12 0,-12L-2,-6.5C-5,-10 -9.5,-12 -14,-11.5L-15,-5.5C-18.5,-9 -23,-9 -26,-6C-27.5,-3 -29,0 -30.5,4Z",
        extra: hat,
        shine: o.hat ? "" : "M-16,-28.6Q-5,-33 6,-32.4",
      };
    },
    mom(g, K) {
      const fill = g.v(K.hair[0], K.hair[1]);
      return {
        back: `<path d="M-28.5,-2C-31.5,-22 -20,-33.5 0,-33.5C20,-33.5 31.5,-22 28.5,-2C29.5,10 31,20 35,27C29.5,32.5 21,31 17.5,25.5L-17.5,25.5C-21,31 -29.5,32.5 -35,27C-31,20 -29.5,10 -28.5,-2Z" fill="${fill}"/>`,
        bangs: "M-27.5,10C-31,-8 -27,-28 -10,-32.5C5,-36 22,-31 27.5,-17C30.5,-9 29.5,2 27.5,10C26,2 24.5,-5 21,-10C17,-14 12,-16.5 8.5,-19C3,-11 -8,-7 -19,-8C-22,-4 -25,2 -27.5,10Z",
        extra: `<circle cx="-25.4" cy="13.4" r="2.1" fill="#fff8ec" stroke="#e8d6b8" stroke-width=".7"/><circle cx="25.4" cy="13.4" r="2.1" fill="#fff8ec" stroke="#e8d6b8" stroke-width=".7"/>`,
        shine: "M-16,-28Q-4,-33 8,-31.5M14,-29.4Q21,-26 24.6,-21",
      };
    },
    dad(g, K) {
      const fill = g.v(K.hair[0], K.hair[1]);
      const ears = `<g fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width=".9"><circle cx="-25" cy="3" r="4.6"/><circle cx="25" cy="3" r="4.6"/></g>`;
      return {
        back: `<path d="M-27,-2C-29,-23 -17,-32.5 0,-32.5C17,-32.5 29,-23 27,-2Q0,4 -27,-2Z" fill="${fill}"/>` + ears,
        bangs: "M-26,-1C-28,-17 -21,-30 -4,-32C13,-33.5 26,-25 26.5,-10C26.5,-6 26,-3 25.5,-1C24,-7 21.5,-11 17,-13C10,-17 1,-19 -8,-17.5C-14,-16 -19,-12 -21.5,-7C-23.5,-5 -25,-3 -26,-1Z",
        extra: "",
        shine: "M-14,-27.6Q-2,-32 10,-30.4",
      };
    },
    teacher(g, K) {
      const fill = g.v(K.hair[0], K.hair[1]);
      const tail =
        `<path d="M-4,-3C10,-12 26,-4 27,12C28,26 20,38 12,44C15,33 14,21 8,13C4,8 0,5 -5,4Z" fill="${fill}"/>` +
        `<path d="M6,-5C15,-5 22,3 23.4,13" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".2"/>`;
      return {
        // 높이 묶은 머리 — 몸 뒤로 흔들린다
        behind: `<g transform="translate(15 -27)"><g class="ar-swing">${tail}</g></g>`,
        back: `<path d="M-28,2C-30,-22 -18,-33 0,-33C18,-33 30,-22 28,2Q0,8 -28,2Z" fill="${fill}"/>`,
        bangs: "M-27.5,24C-31.5,4 -30.5,-18 -19,-28C-9,-35.5 11,-35.5 20,-28C30.5,-19 31.5,4 27.5,24C25,16 23.5,6 22.5,-3Q18,-6 15,-11.5Q9.5,-7 4,-13Q-1,-7.5 -6,-12.5Q-11,-6.5 -16,-11Q-19,-5 -22.5,-3C-23.5,6 -25,16 -27.5,24Z",
        // 곱창 머리끈 + 별 머리핀
        extra: `<g transform="translate(15 -27) rotate(-28)"><ellipse rx="6.2" ry="4.6" fill="#ff8fab" stroke="#ec6f90" stroke-width=".8"/><path d="M-3.6,-2.6Q0,-.6 3.6,-2.6M-4,1.6Q0,3.4 4,1.6" fill="none" stroke="#ec6f90" stroke-width=".8"/></g>` +
          `<path d="${starPath(-17, -22, 4.4, 1.9)}" fill="#ffd54a" stroke="#efb100" stroke-width=".6"/>`,
        shine: "M-16,-28.6Q-4,-33.4 9,-31.6",
      };
    },
    baby(g, K) {
      const fill = g.v(K.hair[0], K.hair[1]);
      const ears = `<g fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width=".9"><circle cx="-26" cy="3.6" r="5"/><circle cx="26" cy="3.6" r="5"/></g>`;
      return {
        back: `<path d="M-27,0C-28.5,-20 -16,-29.5 0,-29.5C16,-29.5 28.5,-20 27,0Q0,6 -27,0Z" fill="${fill}"/>` + ears,
        bangs: "M-25.4,-4C-27,-18 -16,-28 0,-28C16,-28 27,-18 25.4,-4C23,-10 18,-13.5 12,-14C8,-10.5 3,-10.5 -1,-13.5C-6,-10 -12,-10.5 -16.5,-13C-20,-11 -23.4,-8 -25.4,-4Z",
        extra: `<path d="M-1,-27.6C-3.4,-35.6 5,-39 7.4,-33.6C8.6,-30.6 5.6,-28.2 3.2,-30" fill="none" stroke="${K.hair[0]}" stroke-width="2.4" stroke-linecap="round"/>`,
        shine: "M-13,-24Q-3,-28.4 7,-27.6",
      };
    },
  };

  function head(H, A, K, ex, g) {
    const fp = facePath(A.R, A.Ry, A.kid);
    const hairFill = g.v(K.hair[0], K.hair[1]);
    // 표정이 둘인 경우(ph): 걱정 → 웃음으로 바뀌는 아기
    const parts = ex === "help"
      ? `<g class="ar-ph1">${faceParts(A, K, "worried")}</g><g class="ar-ph2">${faceParts(A, K, "open")}</g>`
      : faceParts(A, K, ex);
    return H.back +
      `<path d="${fp}" fill="${g.skin()}"/>` +
      `<g clip-path="${g.clip(fp)}"><path d="${H.bangs}" transform="translate(0 2.6)" fill="#d98f72" opacity=".22"/></g>` +
      parts +
      `<path d="${H.bangs}" fill="${hairFill}"/>` +
      (H.shine ? `<path d="${H.shine}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".2"/>` : "") +
      (H.extra || "");
  }

  /* ---------- 몸 ---------- */
  const legs = (xs, top, bottom, w, fill = SKIN) => xs.map((x) => `<rect x="${r(x - w / 2)}" y="${top}" width="${w}" height="${r(bottom - top)}" rx="${r(w / 2)}" fill="${fill}"/>`).join("");
  const socks = (xs, top, h, w) => xs.map((x) => `<rect x="${r(x - w / 2)}" y="${top}" width="${w}" height="${h}" rx="${r(w * 0.32)}" fill="#fff" stroke="#e3e8f1" stroke-width=".7"/>`).join("");
  const shoes = (xs, rx, ry, cy, fill) => xs.map((x) => `<ellipse cx="${x}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/><ellipse cx="${r(x - rx * 0.3)}" cy="${r(cy - ry * 0.4)}" rx="${r(rx * 0.34)}" ry="${r(ry * 0.26)}" fill="#fff" opacity=".42"/>`).join("");
  const neck = () => `<rect x="-4.6" y="-145" width="9.2" height="14.6" rx="3.6" fill="${SKIN}"/><path d="M-4.6,-139.6Q0,-137 4.6,-139.6" fill="none" stroke="${SKIN_SH}" stroke-width="2.4" opacity=".6"/>`;
  function flower(x, y, s = 1, c = "#ffd54a") {
    let p = "";
    for (let i = 0; i < 5; i++) { const a = rad(i * 72); p += `<circle cx="${r(Math.sin(a) * 2.6)}" cy="${r(-Math.cos(a) * 2.6)}" r="2.1" fill="${c}"/>`; }
    return `<g transform="translate(${x} ${y}) scale(${s})">${p}<circle r="1.9" fill="#fff"/><circle r="1" fill="#ff9a3c"/></g>`;
  }
  const straps = `<path d="M-9.4,-58.4L-10.8,-43.4M9.4,-58.4L10.8,-43.4" stroke="#f08a2e" stroke-width="3.2" stroke-linecap="round"/>`;

  const BODY = {
    girl: (g) => ({
      behind: `<rect x="-18.6" y="-57.4" width="37.2" height="25.6" rx="8" fill="${g.v("#ffc27e", "#f99a42")}"/>`,
      body:
        legs([-7.2, 7.2], -29, -8, 6.8) + socks([-7.2, 7.2], -13, 8.6, 7.4) + shoes([-7.4, 7.4], 7.4, 3.9, -3.5, "#ef5d78") +
        `<path d="M-11.5,-59C-14.6,-59 -16.4,-57.4 -16.7,-54L-22.6,-28.4C-22.9,-26.6 -21.9,-25.4 -20.2,-25.2C-7,-23.4 7,-23.4 20.2,-25.2C21.9,-25.4 22.9,-26.6 22.6,-28.4L16.7,-54C16.4,-57.4 14.6,-59 11.5,-59Z" fill="${g.v("#ffc1cf", "#ff8fab")}"/>` +
        `<path d="M-21.8,-28.4Q-18.2,-24.6 -14.6,-27.2Q-11,-24 -7.3,-26.6Q-3.6,-23.6 0,-26.4Q3.6,-23.6 7.3,-26.6Q11,-24 14.6,-27.2Q18.2,-24.6 21.8,-28.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>` +
        straps +
        `<path d="M0,-57.6C-3.2,-59.8 -10.8,-60 -11.2,-55.4C-11.4,-51.8 -5,-50.8 0,-55Z" fill="#fff" stroke="#f4c3cf" stroke-width=".7"/>` +
        `<path d="M0,-57.6C3.2,-59.8 10.8,-60 11.2,-55.4C11.4,-51.8 5,-50.8 0,-55Z" fill="#fff" stroke="#f4c3cf" stroke-width=".7"/>` +
        flower(5.4, -46),
    }),
    boy: (g) => ({
      behind: `<rect x="-18.6" y="-57.4" width="37.2" height="25.6" rx="8" fill="${g.v("#86dccf", "#38b4a6")}"/>`,
      body:
        legs([-7.4, 7.4], -27, -8, 6.8) + socks([-7.4, 7.4], -12.6, 8, 7.4) + shoes([-7.6, 7.6], 7.8, 4, -3.6, "#3d8ee0") +
        `<path d="M-15.6,-38.6L-16.8,-23.6C-16.9,-22.6 -16.2,-22 -15.3,-22L-2.6,-22C-1.9,-22 -1.4,-22.5 -1.3,-23.2L0,-28L1.3,-23.2C1.4,-22.5 1.9,-22 2.6,-22L15.3,-22C16.2,-22 16.9,-22.6 16.8,-23.6L15.6,-38.6Z" fill="${g.v("#4466a8", "#2a4278")}"/>` +
        `<path d="M-11.6,-59C-14.9,-59 -16.7,-57.4 -16.8,-54L-16.3,-37.4C-16.2,-35.6 -15.1,-34.8 -13.5,-34.8L13.5,-34.8C15.1,-34.8 16.2,-35.6 16.3,-37.4L16.8,-54C16.7,-57.4 14.9,-59 11.6,-59Z" fill="${g.v("#aadcfa", "#74bdee")}"/>` +
        `<path d="M-6.4,-58.8Q0,-54.2 6.4,-58.8" fill="none" stroke="#4f9fd6" stroke-width="1.4" stroke-linecap="round"/>` +
        straps + flower(5.4, -46),
    }),
    mom: (g) => ({
      body:
        legs([-8.4, 8.4], -31, -5, 7) + shoes([-8.6, 8.6], 7.8, 3.7, -3.5, "#d9785b") +
        `<path d="M-15.8,-90L-26.2,-26.4C-26.5,-24.4 -25.3,-22.8 -23.4,-22.6C-8,-20.8 8,-20.8 23.4,-22.6C25.3,-22.8 26.5,-24.4 26.2,-26.4L15.8,-90Z" fill="${g.v("#b6ddc3", "#86c39f")}"/>` +
        `<path d="M-6.2,-86L-9.4,-23.6M6.2,-86L9.4,-23.6" stroke="#5fa47c" stroke-width="1.1" opacity=".35"/>` +
        neck() +
        `<path d="M-15,-133C-20.6,-133 -22.9,-130 -23.3,-125L-20.6,-88C-20.4,-85.4 -18.7,-84 -16,-84L16,-84C18.7,-84 20.4,-85.4 20.6,-88L23.3,-125C22.9,-130 20.6,-133 15,-133Z" fill="${g.v("#ffbe9e", "#f69a72")}"/>` +
        `<path d="M-7.6,-133.2C-5,-127.6 5,-127.6 7.6,-133.2L5.6,-84H-5.6Z" fill="#fff7ea"/>` +
        `<path d="M-7.6,-133.2L-5.6,-84M7.6,-133.2L5.6,-84" stroke="#e9845d" stroke-width="1.3" stroke-linecap="round"/>` +
        `<g fill="#fff"><circle cx="-8.6" cy="-116" r="1.3"/><circle cx="-8.2" cy="-104" r="1.3"/><circle cx="-7.8" cy="-92" r="1.3"/></g>` +
        `<path d="M-4.6,-131.4Q0,-125.6 4.6,-131.4" fill="none" stroke="#e8b04a" stroke-width=".9"/><circle cx="0" cy="-126.2" r="1.7" fill="#ffd54a"/>`,
    }),
    dad: (g) => ({
      body:
        `<path d="M-17,-86L-18.4,-7.6C-18.4,-6.4 -17.6,-5.6 -16.5,-5.6L-3,-5.6C-2,-5.6 -1.3,-6.3 -1.2,-7.3L0,-62L1.2,-7.3C1.3,-6.3 2,-5.6 3,-5.6L16.5,-5.6C17.6,-5.6 18.4,-6.4 18.4,-7.6L17,-86Z" fill="${g.v("#e4c79f", "#c9a676")}"/>` +
        shoes([-10, 10], 9.8, 4.3, -3.6, "#7a5140") +
        neck() +
        `<path d="M-17,-133C-23.8,-133 -26.4,-129.6 -26.6,-124L-23.6,-86C-23.4,-83.2 -21.6,-81.6 -18.8,-81.6L18.8,-81.6C21.6,-81.6 23.4,-83.2 23.6,-86L26.6,-124C26.4,-129.6 23.8,-133 17,-133Z" fill="${g.v("#82bbec", "#5293d2")}"/>` +
        `<path d="M-23.4,-88.4H23.4" stroke="#3f7fc0" stroke-width="3" opacity=".4"/>` +
        `<path d="M-8.4,-133.2Q0,-125.4 8.4,-133.2" fill="none" stroke="#3f7fc0" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="M-1,-132.4L-8.6,-133.4L-5.4,-125.6ZM1,-132.4L8.6,-133.4L5.4,-125.6Z" fill="#fff" stroke="#d6dfeb" stroke-width=".7" stroke-linejoin="round"/>`,
    }),
    teacher: (g) => ({
      body:
        `<path d="M-14.6,-86L-15.6,-7.6C-15.6,-6.4 -14.8,-5.6 -13.7,-5.6L-2.8,-5.6C-1.9,-5.6 -1.2,-6.3 -1.1,-7.3L0,-64L1.1,-7.3C1.2,-6.3 1.9,-5.6 2.8,-5.6L13.7,-5.6C14.8,-5.6 15.6,-6.4 15.6,-7.6L14.6,-86Z" fill="${g.v("#acccf2", "#82a9dd")}"/>` +
        `<g fill="#fff" stroke="#d9dee8" stroke-width=".8"><ellipse cx="-8.4" cy="-3.6" rx="8.4" ry="4"/><ellipse cx="8.4" cy="-3.6" rx="8.4" ry="4"/></g>` +
        `<path d="M-14,-4.6H-3M3,-4.6H14" stroke="#ff8fab" stroke-width="1.6" stroke-linecap="round"/>` +
        neck() +
        `<path d="M-14.6,-133C-19.9,-133 -22.1,-130 -22.5,-125L-19.7,-88C-19.5,-85.5 -17.9,-84 -15.4,-84L15.4,-84C17.9,-84 19.5,-85.5 19.7,-88L22.5,-125C22.1,-130 19.9,-133 14.6,-133Z" fill="${g.v("#ffdde6", "#ffc2d2")}"/>` +
        `<path d="M-7.4,-133.2Q0,-126.6 7.4,-133.2" fill="none" stroke="#f0a2b5" stroke-width="1.4" stroke-linecap="round"/>` +
        // 노란 앞치마(목끈·주머니·하트)
        `<path d="M-9.6,-126L-6.4,-136.4M9.6,-126L6.4,-136.4" stroke="#f7c531" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="M-10.6,-126.4H10.6L11.8,-100C17,-99 19.8,-96 20,-91L21.6,-56C21.7,-54.3 20.5,-53 18.8,-52.8C6,-51.4 -6,-51.4 -18.8,-52.8C-20.5,-53 -21.7,-54.3 -21.6,-56L-20,-91C-19.8,-96 -17,-99 -11.8,-100Z" fill="${g.v("#ffe581", "#ffcd3a")}"/>` +
        `<path d="M-21.3,-55.8C-7,-53.2 7,-53.2 21.3,-55.8" fill="none" stroke="#f2a900" stroke-width="1.4"/>` +
        `<path d="M-19.4,-92.8C-6,-90.6 6,-90.6 19.4,-92.8" fill="none" stroke="#f2b600" stroke-width="1" opacity=".7"/>` +
        `<rect x="-9.4" y="-81" width="18.8" height="13.4" rx="3.6" fill="#fff4c9" stroke="#efb500" stroke-width=".8"/>` +
        `<path d="M0,-71.2C-1,-72.4 -4,-74.4 -4,-76.4C-4,-78 -2.9,-79 -1.8,-79C-1,-79 -.3,-78.5 0,-77.8C.3,-78.5 1,-79 1.8,-79C2.9,-79 4,-78 4,-76.4C4,-74.4 1,-72.4 0,-71.2Z" fill="#ff7f97"/>` +
        flower(5.6, -114, 1.05, "#ff9bb3"),
    }),
    baby: (g) => ({
      body:
        legs([-5.6, 5.6], -18, -5, 6.6) + shoes([-5.8, 5.8], 6.6, 3.7, -3.4, "#5aa5e8") +
        `<path d="M-9.6,-45.4C-12.8,-45.4 -14.2,-43.8 -14.2,-40.8L-13.6,-27C-13.5,-25.6 -12.6,-24.8 -11.2,-24.8L11.2,-24.8C12.6,-24.8 13.5,-25.6 13.6,-27L14.2,-40.8C14.2,-43.8 12.8,-45.4 9.6,-45.4Z" fill="${g.v("#ffe98f", "#ffd54a")}"/>` +
        `<path d="M-12.6,-31L-13.4,-12.6C-13.4,-11.2 -12.4,-10.4 -11,-10.4L-1.8,-10.4C-1,-10.4 -.4,-11 -.3,-11.8L0,-16L.3,-11.8C.4,-11 1,-10.4 1.8,-10.4L11,-10.4C12.4,-10.4 13.4,-11.2 13.4,-12.6L12.6,-31Z" fill="${g.v("#a3e4d6", "#6cc8b5")}"/>` +
        `<path d="M-7.6,-36.6H7.6L8.4,-28H-8.4Z" fill="${g.v("#a3e4d6", "#86d6c4")}"/>` +
        `<path d="M-7,-36.4L-9.6,-44.6M7,-36.4L9.6,-44.6" stroke="#6cc8b5" stroke-width="2.2" stroke-linecap="round"/>` +
        `<g fill="#fff"><circle cx="-5.8" cy="-34.4" r="1.2"/><circle cx="5.8" cy="-34.4" r="1.2"/></g>`,
    }),
  };

  /* ---------- 팔 ---------- */
  // a: 위팔 각도(아래로 내린 상태 0°, 바깥으로 들수록 +), b: 앞팔을 위팔에서 더 꺾는 각도(+는 바깥, -는 몸 안쪽)
  const POSE = {
    down: { a: 8, b: 4 },
    wave: { a: 132, b: 26, fa: "ar-wave" },
    up: { a: 166, b: 4 },
    point: { a: 84, b: 4 },
    reach: { a: 58, b: 14 },
    front: { a: 16, b: -96 },
    chest: { a: 10, b: -122 },
    clap: { a: 22, b: -104, ua: "ar-clap" },
    present: { a: 64, b: 38 },
    help: { a: 126, b: 30, fa: "ar-wave-slow" },
  };
  // 아이(머리가 큰 2등신)는 팔이 짧아 위팔을 옆으로, 앞팔을 세워 머리 옆에서 흔든다
  // k: 팔 길이 배율(든 팔은 조금 길게 그려야 머리 옆으로 보인다)
  const POSE_KID = {
    wave: { a: 98, b: 70, fa: "ar-wave", k: 1.22 },
    up: { a: 100, b: 66, fa: "ar-wave-slow", k: 1.22 },
    point: { a: 100, b: 20, ua: "ar-point", k: 1.15 },
    help: { a: 98, b: 62, fa: "ar-wave-slow", k: 1.2 },
  };

  function arm(K, A, side, pose, o = {}) {
    const P = typeof pose === "string" ? (A.kid && POSE_KID[pose]) || POSE[pose] || POSE.down : pose;
    const sg = side === "l" ? 1 : -1; // 왼쪽(보는 사람 기준) 팔은 + 회전이 바깥쪽
    const sx = (K.shoulder || A.sh[0]) * -sg, sy = A.sh[1];
    const S = K.sleeve, w = A.w, L1 = r(A.L1 * (P.k || 1)), L2 = r(A.L2 * (P.k || 1));
    const line = (d, c, wd) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${r(wd)}" stroke-linecap="round"/>`;
    const up = `M0,0L0,${L1}`;
    const fore = `M0,0L0,${r(L2 - A.hand * 0.4)}`;
    let under, over, foreSvg;
    if (S.long) {
      under = line(up, S.line, w + 2);
      over = line(up, S.c, w);
      foreSvg = line(fore, S.line, w + 2) + line(fore, S.c, w) + (S.cuff ? line(`M0,${r(L2 - A.hand * 1.5)}L0,${r(L2 - A.hand * 0.6)}`, S.cuff, w * 0.86) : "");
    } else if (S.three) {
      // 칠부 소매: 앞팔 반쯤까지 소매
      const sk = w * 0.84;
      under = line(up, S.line, w + 2);
      over = line(up, S.c, w);
      foreSvg = line(fore, SKIN_LINE, sk + 1.8) + line(fore, SKIN, sk) + line(`M0,0L0,${r(L2 * 0.4)}`, S.line, w + 2) + line(`M0,0L0,${r(L2 * 0.4)}`, S.c, w);
    } else {
      const sk = w * 0.86;
      under = line(up, SKIN_LINE, sk + 1.8);
      over = line(up, SKIN, sk) + line(`M0,0L0,${S.cap}`, S.line, w + 2) + line(`M0,0L0,${S.cap}`, S.c, w) +
        (S.puff ? `<circle cx="0" cy="1.6" r="${r(w * 0.74)}" fill="${S.c}" stroke="${S.line}" stroke-width="1"/>` : "");
      foreSvg = line(fore, SKIN_LINE, sk + 1.8) + line(fore, SKIN, sk);
    }
    const hand = `<circle cx="0" cy="${L2}" r="${A.hand}" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width=".9"/>`;
    const tot = sg * (P.a + P.b);
    const prop = o.prop ? `<g transform="translate(0 ${L2}) rotate(${r(-tot)})">${o.prop}</g>` : "";
    const foreG = `<g transform="translate(0 ${L1}) rotate(${r(sg * P.b)})"><g class="${P.fa || ""}">${foreSvg}${prop}${hand}</g></g>`;
    return `<g transform="translate(${r(sx)} ${sy}) rotate(${r(sg * P.a)})"><g class="ar-arm ar-arm-${side} ${P.ua || ""}">${under}${foreG}${over}</g></g>`;
  }

  /* 손이 (tx,ty)에 닿도록 팔 각도 구하기(장면 좌표). 사람 위치 px,py, 크기 s */
  function reach(kind, side, px, py, s, tx, ty, extra = {}) {
    const K = KIND[kind], A = AGE[K.age];
    const sg = side === "l" ? 1 : -1;
    const sx = px + s * (K.shoulder || A.sh[0]) * -sg, sy = py + s * A.sh[1];
    const dx = (tx - sx) / s, dy = (ty - sy) / s;
    const L1 = A.L1, L2 = A.L2;
    const D = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.01);
    const th = deg(Math.atan2(-sg * dx, dy));
    const al = deg(Math.acos((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
    const be = deg(Math.acos((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)));
    // 기본은 팔꿈치를 바깥(위)으로, down이면 팔꿈치를 아래로 두고 앞팔을 뻗는다
    return Object.assign(extra.down ? { a: r(th - al), b: r(180 - be) } : { a: r(th + al), b: r(-(180 - be)) }, extra);
  }

  /* 손잡기: 두 사람(어깨)의 손이 만나는 점 — 두 팔 길이 안에서 가장 자연스러운 곳 */
  function meet(a, b) {
    const sh = ([kind, side, x, s]) => {
      const K = KIND[kind], A = AGE[K.age];
      return [x + s * (K.shoulder || A.sh[0]) * (side === "l" ? -1 : 1), GY + s * A.sh[1], s * (A.L1 + A.L2)];
    };
    const [ax, ay, la] = sh(a), [bx, by, lb] = sh(b);
    const D = Math.hypot(bx - ax, by - ay);
    const da = Math.min(Math.max(D - lb + 1.5, 0), la - 1);
    return [ax + ((bx - ax) * da) / D, ay + ((by - ay) * da) / D];
  }

  /* ---------- 사람 ---------- */
  // o: x, y, s(크기), l·r(팔 자세), ex(표정), propL·propR(손에 든 것), front(몸 앞에 드는 것), d(움직임 엇갈림), motion(몸 움직임)
  function person(kind, o) {
    const g = o.g, K = KIND[kind], A = AGE[K.age];
    const H = HAIR[kind](g, K, o);
    const B = BODY[kind](g, o);
    const lift = (layer) => `<g transform="translate(0 ${A.neck})"><g class="ar-head ${o.headMotion || ""}"><g transform="translate(0 ${A.head - A.neck})">${layer}</g></g></g>`;
    const fig =
      (H.behind ? lift(H.behind) : "") +
      (B.behind || "") +
      B.body +
      lift(head(H, A, K, o.ex || "smile", g)) +
      (o.front || "") +
      arm(K, A, "l", o.l || "down", { prop: o.propL }) +
      arm(K, A, "r", o.r || "down", { prop: o.propR });
    const s = o.s || 1;
    return `<g transform="translate(${r(o.x || 0)} ${r(o.y || 0)}) scale(${s})"${o.d ? ` style="--d:${o.d}"` : ""}>` +
      `<ellipse cx="0" cy="0" rx="${A.shadow}" ry="3.4" fill="#4a3566" opacity=".1"/>` +
      `<g class="ar-body ${o.motion || "ar-bob"}">${fig}</g></g>`;
  }

  /* ---------- 소품·장식 ---------- */
  function starPath(cx, cy, R, ri, n = 5) {
    let d = "";
    for (let i = 0; i < n * 2; i++) {
      const a = rad(-90 + (i * 180) / n), rr = i % 2 ? ri : R;
      d += (i ? "L" : "M") + r(cx + rr * Math.cos(a)) + "," + r(cy + rr * Math.sin(a));
    }
    return d + "Z";
  }
  const HEART = "M0,3.4C-1.3,1.8 -5.2,-.8 -5.2,-3.4C-5.2,-5.4 -3.8,-6.6 -2.3,-6.6C-1.2,-6.6 -.4,-6 0,-5.1C.4,-6 1.2,-6.6 2.3,-6.6C3.8,-6.6 5.2,-5.4 5.2,-3.4C5.2,-.8 1.3,1.8 0,3.4Z";
  const SPARK = "M0,-7C.9,-2 2,-.9 7,0C2,.9 .9,2 0,7C-.9,2 -2,.9 -7,0C-2,-.9 -.9,-2 0,-7Z";
  // 자리(translate) 안에 움직이는 g — 움직임 축이 그 자리
  const at = (x, y, inner, cls = "", d = "", s = 1) =>
    `<g transform="translate(${r(x)} ${r(y)})${s !== 1 ? ` scale(${s})` : ""}"><g class="${cls}"${d ? ` style="--d:${d}"` : ""}>${inner}</g></g>`;
  const heart = (x, y, s, c, cls = "ar-float", d = "") => at(x, y, `<path d="${HEART}" fill="${c}"/>`, cls, d, s);
  const spark = (x, y, s, c, d = "", cls = "ar-twinkle") => at(x, y, `<path d="${SPARK}" fill="${c}"/>`, cls, d, s);
  const dot = (x, y, rr, c, op = 1) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${c}" opacity="${op}"/>`;
  const CLOUD = "M-30,8C-38,8 -40,-2 -32,-5C-33,-14 -21,-18 -15,-11C-12,-21 4,-23 8,-13C14,-19 26,-15 24,-6C33,-6 34,8 26,8Z";
  const cloud = (x, y, s, c = "#fff", op = 1, cls = "", d = "") => at(x, y, `<path d="${CLOUD}" fill="${c}" opacity="${op}"/>`, cls, d, s);
  const ground = (g, c1, c2) => `<path d="M0,250C18,232 52,222 104,222C170,222 214,230 280,222C350,213 410,222 490,212V250Z" fill="${g.v(c1, c2)}"/>`;
  const glow = (g, cx, cy, R, c, o) => `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${g.glow(c, o)}"/>`;
  const flowerBit = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0,0V-8" stroke="#8cc79a" stroke-width="1.4"/>${flower(0, -9, 0.8, c)}</g>`;

  // 말풍선(가운데 아래 꼬리) — inner는 (0,0) 가운데
  const bubble = (w, h, fill, stroke, inner) =>
    `<path d="M${-w / 2 + 8},${-h / 2}H${w / 2 - 8}Q${w / 2},${-h / 2} ${w / 2},${-h / 2 + 8}V${h / 2 - 8}Q${w / 2},${h / 2} ${w / 2 - 8},${h / 2}H5L0,${h / 2 + 7}L-5,${h / 2}H${-w / 2 + 8}Q${-w / 2},${h / 2} ${-w / 2},${h / 2 - 8}V${-h / 2 + 8}Q${-w / 2},${-h / 2} ${-w / 2 + 8},${-h / 2}Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>` + inner;
  const QMARK = (c) => `<path d="M-4,-5.4C-4,-9 -1.2,-11 2,-11C5.2,-11 7.4,-8.8 7.4,-6.2C7.4,-2.8 4,-2 2.6,-.2C2,.6 2,1.8 2,2.8" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" transform="translate(-1.6 1)"/><circle cx=".4" cy="9" r="2" fill="${c}"/>`;
  const EXCL = (c) => `<path d="M0,-10V2" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/><circle cx="0" cy="8.4" r="2.1" fill="${c}"/>`;

  const PROP = {
    pencil: `<g transform="rotate(-30)"><rect x="-1.9" y="-17" width="3.8" height="15" rx=".6" fill="#ffc83d"/><path d="M-1.9,-2L0,3L1.9,-2Z" fill="#f7d8b0"/><path d="M-.6,1.6L0,3L.6,1.6Z" fill="#3a3a48"/><rect x="-1.9" y="-19.4" width="3.8" height="2.8" rx=".9" fill="#ff8fa8"/></g>`,
    flag: `<path d="M0,6V-34" stroke="#b7835a" stroke-width="2.2" stroke-linecap="round"/><g transform="translate(0 -33)"><g class="ar-flag"><path d="M0,0C7,-3 13,3 22,0V13C13,16 7,10 0,13Z" fill="#ffd54a" stroke="#efb100" stroke-width=".8"/><path d="${starPath(10.6, 6.6, 3.6, 1.5)}" fill="#ff8a5c"/></g></g>`,
    block: (c) => `<rect x="-7.5" y="-15" width="15" height="13" rx="2.4" fill="${c}"/><rect x="-5" y="-12.6" width="10" height="8" rx="1.6" fill="#fff" opacity=".35"/>`,
    thumb: `<rect x="-2.4" y="-10.6" width="4.8" height="9" rx="2.4" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width=".9"/>`,
    phone: `<rect x="-6.4" y="-19" width="12.8" height="21" rx="2.6" fill="#2a3346"/><rect x="-5" y="-17" width="10" height="15.6" rx="1.4" fill="#e9f3ff"/><path d="M0,-7.2C-1.6,-9.2 -3.6,-10.6 -3.6,-12.6C-3.6,-14.6 -2,-16 0,-16C2,-16 3.6,-14.6 3.6,-12.6C3.6,-10.6 1.6,-9.2 0,-7.2Z" fill="#ff7a6b"/><circle cx="0" cy="-12.6" r="1.3" fill="#fff"/>`,
  };

  // 기린 키 재기 자(1단계)
  function giraffe(x, top, bottom) {
    const w = 26;
    let s = `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${bottom - top}" rx="11" fill="#ffd97f" stroke="#efb64a" stroke-width="1.2"/>`;
    for (let y = bottom - 12, i = 0; y > top + 14; y -= 11, i++) {
      s += `<path d="M${x - w / 2},${y}h${i % 2 ? 6 : 9}" stroke="#c98a2c" stroke-width="1.4" stroke-linecap="round"/>`;
    }
    [[x + 5, top + 34, 4.4], [x + 3, top + 70, 5], [x + 6, top + 104, 4], [x + 2, top + 140, 4.6]].forEach(([cx, cy, rr]) => (s += `<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr * 0.8}" fill="#f2a94a" opacity=".55"/>`));
    s += `<g transform="translate(${x} ${top - 2})">` +
      `<path d="M-6,-14V-22M6,-14V-22" stroke="#e0a043" stroke-width="2.2" stroke-linecap="round"/><circle cx="-6" cy="-23" r="2.6" fill="#c98a2c"/><circle cx="6" cy="-23" r="2.6" fill="#c98a2c"/>` +
      `<ellipse cx="-14" cy="-8" rx="6" ry="3" fill="#ffd97f" stroke="#efb64a" transform="rotate(-24 -14 -8)"/><ellipse cx="14" cy="-8" rx="6" ry="3" fill="#ffd97f" stroke="#efb64a" transform="rotate(24 14 -8)"/>` +
      `<ellipse cx="0" cy="-4" rx="14" ry="12" fill="#ffd97f" stroke="#efb64a" stroke-width="1.2"/>` +
      `<ellipse cx="0" cy="2" rx="9" ry="6" fill="#ffe8b4"/>` +
      `<circle cx="-5.4" cy="-6.4" r="1.8" fill="${INK}"/><circle cx="5.4" cy="-6.4" r="1.8" fill="${INK}"/>` +
      `<path d="M-3,2.6Q0,5 3,2.6" fill="none" stroke="#b5762d" stroke-width="1.2" stroke-linecap="round"/>` +
      `<ellipse cx="-9" cy="-1" rx="2.6" ry="1.6" fill="${BLUSH}" opacity=".35"/><ellipse cx="9" cy="-1" rx="2.6" ry="1.6" fill="${BLUSH}" opacity=".35"/></g>`;
    return s;
  }

  // 새싹 화분(자라는 움직임 축 = 흙)
  const sprout = (x, y) =>
    `<g transform="translate(${x} ${y})"><path d="M-12,-18H12L9,0H-9Z" fill="#f0a27a"/><rect x="-13.5" y="-21" width="27" height="5" rx="2" fill="#e4875c"/>` +
    `<g transform="translate(0 -21)"><g class="ar-grow"><path d="M0,0V-20" stroke="#5fb36f" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M0,-14C-2,-22 -12,-24 -15,-19C-11,-14 -4,-13 0,-14Z" fill="#7fcb8a"/><path d="M0,-18C2,-27 13,-29 16,-23C12,-18 4,-17 0,-18Z" fill="#8fd69a"/></g></g></g>`;

  // 쌓기 나무
  const block = (x, y, c, mark) =>
    `<g transform="translate(${x} ${y})"><rect x="-10" y="-17" width="20" height="17" rx="3" fill="${c}"/><rect x="-10" y="-17" width="20" height="5" rx="2.5" fill="#fff" opacity=".22"/>${mark || ""}</g>`;

  /* ---------- 장면 ---------- */
  const GY = 236; // 장면의 땅(발) 높이
  const KS = 1.07; // 장면 속 아이 크기

  const SCENES = {
    /* 첫 화면: SEE 구름 옆에서 손 흔드는 유치원 아이들 */
    "kid-girl"(g) {
      const body = at(0, 0,
        `<path d="M-40,8C-48,8 -49,-3 -40,-5C-41,-13 -29,-17 -23,-11C-19,-19 -4,-20 1,-12C7,-18 20,-16 22,-8C32,-11 41,-4 37,8Z" fill="#fff" opacity=".96"/>` +
        `<path d="M-38,8H36" stroke="#d7e9f5" stroke-width="2" stroke-linecap="round"/>` +
        person("girl", { g, x: 0, y: 1, l: "wave", ex: "open", motion: "ar-hop", d: "-.3s" }),
        "ar-float", "-1s") +
        spark(-38, -112, 0.9, "#fff6c2", "-.4s") + spark(40, -86, 0.7, "#ffffff", "-1.4s");
      return { vb: "-58 -150 116 168", body };
    },
    "kid-boy"(g) {
      const body = at(0, 0,
        `<path d="M-37,8C-41,-4 -32,-11 -22,-8C-20,-16 -7,-18 -1,-12C4,-20 19,-19 23,-11C29,-17 41,-13 40,-5C49,-3 48,8 40,8Z" fill="#fff" opacity=".96"/>` +
        `<path d="M-36,8H38" stroke="#d7e9f5" stroke-width="2" stroke-linecap="round"/>` +
        person("boy", { g, x: 0, y: 1, r: "wave", ex: "open", hat: true, motion: "ar-hop", d: "-1.5s" }),
        "ar-float", "-2.6s") +
        spark(38, -118, 0.9, "#fff6c2", "-1.2s") + spark(-40, -80, 0.7, "#ffffff", "-2s");
      return { vb: "-58 -150 116 168", body };
    },

    /* 첫 화면 5단계 길잡이: 깃발을 흔들며 오른쪽 단계들을 안내하는 유치원 선생님 */
    teacher(g) {
      const body =
        glow(g, 6, -100, 92, "#fff1c7", 0.85) +
        person("teacher", { g, l: "wave", r: "present", ex: "open", propL: PROP.flag, motion: "ar-sway" }) +
        spark(-62, -168, 1, "#ffc94d", "-.2s") + spark(70, -150, 0.8, "#ff9bb3", "-1.1s") + spark(76, -84, 0.7, "#7fd1c7", "-1.8s") +
        heart(-66, -96, 0.9, "#ffb3c5", "ar-float", "-.6s");
      return { vb: "-92 -232 196 244", body };
    },

    /* 첫 화면 '가까운 곳에 도움이 있습니다': 곰 인형을 안고 도움을 청하는 아기 → 가까이 하트 표시가 나타나면 방긋 */
    help(g) {
      const teddy =
        `<g transform="translate(-2 -30)"><circle cx="-7.6" cy="-13" r="4.2" fill="#c98f62"/><circle cx="7.6" cy="-13" r="4.2" fill="#c98f62"/>` +
        `<ellipse cx="0" cy="2" rx="11" ry="10" fill="#d9a273"/><circle cx="0" cy="-8" r="9" fill="#d9a273"/>` +
        `<ellipse cx="0" cy="-5.2" rx="4" ry="3" fill="#f3d2b3"/><circle cx="0" cy="-6.4" r="1.2" fill="#5a3a2a"/>` +
        `<circle cx="-3.4" cy="-10" r="1.2" fill="#5a3a2a"/><circle cx="3.4" cy="-10" r="1.2" fill="#5a3a2a"/>` +
        `<path d="M-3,5Q0,1 3,5" fill="none" stroke="#f3d2b3" stroke-width="2.6" stroke-linecap="round"/></g>`;
      const pin =
        `<path d="M0,0C-6,-8 -13,-14 -13,-23C-13,-31 -7,-37 0,-37C7,-37 13,-31 13,-23C13,-14 6,-8 0,0Z" fill="#ff7a6b"/>` +
        `<circle cx="0" cy="-23" r="8.4" fill="#fff"/><path d="${HEART}" transform="translate(0 -22.4) scale(1.05)" fill="#ff7a6b"/>` +
        `<ellipse cx="0" cy="2" rx="9" ry="2.4" fill="#4a3566" opacity=".12"/>`;
      const body =
        glow(g, 10, -64, 70, "#ffe9d6", 0.9) +
        person("baby", { g, l: { a: 18, b: -112 }, r: "help", ex: "help", front: teddy, headMotion: "ar-look", d: "-.2s" }) +
        at(30, -118, bubble(30, 28, "#fff", "#d8deea", QMARK("#ff7a6b")), "ar-ph1 ar-pop-q") +
        at(64, -14, `<g class="ar-bounce">${pin}</g>`, "ar-ph2") +
        spark(48, -66, 0.8, "#ffc94d", "-.3s", "ar-ph2 ar-twinkle") + spark(80, -58, 0.6, "#ff9bb3", "-1s", "ar-ph2 ar-twinkle");
      return { vb: "-50 -146 146 158", body };
    },

    /* 1단계: 키 재기 — 기린 자 앞에 선 아이, 머리에 손을 얹어 재는 엄마, 박수 치는 아빠, 쑥쑥 자라는 새싹 */
    step1(g) {
      const kidX = 288, momX = 204, dadX = 372;
      const top = GY - 122 * KS;
      const body =
        glow(g, 300, 120, 130, "#fff1e6", 0.9) +
        ground(g, "#ffe4d9", "#ffd5c6") +
        heart(118, 82, 1.4, "#ffc2b6", "ar-float", "-.5s") + heart(424, 74, 1.1, "#ffb0a2", "ar-float", "-2s") +
        spark(150, 56, 0.9, "#ffd54a", "-.8s") + spark(250, 40, 0.7, "#ff9e8f", "-1.6s") +
        giraffe(kidX + 22, 52, GY - 6) +
        at(kidX + 22, top + 2, `<path d="${starPath(0, 0, 8, 3.4)}" fill="#ff8f6b" stroke="#fff" stroke-width="1.4"/>`, "ar-pop", "-.4s") +
        `<path d="M${kidX - 4},${r(top + 2)}H${kidX + 12}" stroke="#ff8f6b" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"/>` +
        person("mom", { g, x: momX, y: GY, ex: "joy", l: "chest", r: reach("mom", "r", momX, GY, 1, kidX - 14, top + 6), d: "-.8s" }) +
        person("dad", { g, x: dadX, y: GY, ex: "open", l: "clap", r: "clap", d: "-1.6s" }) +
        person("girl", { g, x: kidX, y: GY, s: KS, ex: "open", motion: "ar-stretch" }) +
        sprout(428, GY - 4) + flowerBit(150, GY - 4, "#ff9bb3") + flowerBit(166, GY - 2, "#ffd54a", 0.8);
      return { vb: "0 0 460 250", body };
    },

    /* 2단계: 간단한 체크 — 태블릿으로 함께 체크하는 엄마·아빠, 쌓기 놀이하는 아이 */
    step2(g) {
      const momX = 166, dadX = 228, kidX = 338, towerX = 394;
      const tab =
        `<g transform="translate(0 -104)"><rect x="-21" y="-15" width="42" height="30" rx="4" fill="#2f3a52"/><rect x="-18" y="-12.4" width="36" height="24.8" rx="2.4" fill="#fffdf6"/>` +
        [0, 1, 2].map((i) =>
          `<rect x="-14.6" y="${-9.6 + i * 7.6}" width="5.4" height="5.4" rx="1.2" fill="#fff" stroke="#c9d3e3" stroke-width=".9"/>` +
          `<path d="M-6.4,${-6.9 + i * 7.6}H${i === 1 ? 8 : 12}" stroke="#d6dde9" stroke-width="2" stroke-linecap="round"/>` +
          at(-11.9, -6.9 + i * 7.6, `<path d="M-2.4,0L-.6,1.9L2.8,-2.2" fill="none" stroke="#18a058" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, `ar-chk ar-chk${i + 1}`)
        ).join("") + `</g>`;
      const body =
        glow(g, 270, 110, 140, "#fff6d8", 0.95) +
        ground(g, "#fff0c4", "#ffe6a6") +
        at(116, 70, `<circle r="13" fill="#fff" stroke="#f1d27a" stroke-width="1.4"/><path d="M-5.6,.2L-1.6,4.2L6,-4.4" fill="none" stroke="#18a058" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`, "ar-float", "-.4s") +
        at(300, 46, `<circle r="10" fill="#fff" stroke="#f1d27a" stroke-width="1.2"/><path d="M-4.4,.2L-1.2,3.4L4.8,-3.4" fill="none" stroke="#18a058" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`, "ar-float", "-2.2s") +
        spark(208, 40, 0.8, "#ffc94d", "-1s") + spark(430, 96, 0.7, "#ff9bb3", "-.3s") +
        person("mom", { g, x: momX, y: GY, ex: "smile", front: tab, l: reach("mom", "l", momX, GY, 1, momX - 19, GY - 98), r: reach("mom", "r", momX, GY, 1, momX + 19, GY - 98), headMotion: "ar-nod", d: "-.5s" }) +
        person("dad", { g, x: dadX, y: GY, ex: "open", l: reach("dad", "l", dadX, GY, 1, momX + 17, GY - 112, { fa: "ar-tap", down: true }), d: "-1.4s" }) +
        block(towerX, GY - 2, "#ff9e9e", `<circle cx="0" cy="-8.5" r="3.6" fill="#fff" opacity=".8"/>`) +
        block(towerX + 1, GY - 19, "#ffd54a", `<path d="M0,-12.6L4,-4.6H-4Z" fill="#fff" opacity=".85"/>`) +
        block(towerX - 1, GY - 36, "#8ccdf5", `<rect x="-3.4" y="-11.6" width="6.8" height="6.8" rx="1" fill="#fff" opacity=".85"/>`) +
        person("boy", { g, x: kidX, y: GY, s: KS, ex: "open", l: "down", r: reach("boy", "r", kidX, GY, KS, towerX - 4, GY - 58, { ua: "ar-place" }), propR: `<g transform="translate(0 4)">${PROP.block("#9bdc8f")}</g>`, d: "-.9s" });
      return { vb: "0 0 460 250", body };
    },

    /* 3단계: 다음 단계 — 손잡고 이정표를 향해 걸어가는 가족 */
    step3(g) {
      const momX = 172, kidX = 234, dadX = 296, postX = 410;
      const m1 = meet(["mom", "r", momX, 1], ["girl", "l", kidX, KS]), m2 = meet(["dad", "l", dadX, 1], ["girl", "r", kidX, KS]);
      const sign = (y, c, dir, ic, dl) =>
        at(postX, y, `<path d="${dir > 0 ? "M-4,-9H22L30,0L22,9H-4Z" : "M4,-9H-22L-30,0L-22,9H4Z"}" fill="${c}"/>${ic}`, "ar-wiggle", dl);
      const body =
        glow(g, 400, 54, 70, "#fff6cf", 0.95) +
        at(400, 54, `<g class="ar-spin">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0,-30V-38" stroke="#ffd36b" stroke-width="3" stroke-linecap="round" transform="rotate(${a})"/>`).join("")}</g><circle r="20" fill="#ffe08a"/><circle r="15" fill="#ffd25a"/>`) +
        cloud(96, 64, 0.9, "#fff", 0.95, "ar-drift", "-3s") + cloud(260, 40, 0.7, "#fff", 0.85, "ar-drift", "-9s") +
        ground(g, "#dbf3e8", "#c6ecdc") +
        `<path d="M30,250C110,236 220,248 300,238C350,232 384,236 420,236" fill="none" stroke="#fffaf0" stroke-width="18" stroke-linecap="round" opacity=".9"/>` +
        `<path class="ar-dash" d="M30,250C110,236 220,248 300,238C350,232 384,236 420,236" fill="none" stroke="#f3d38f" stroke-width="2.4" stroke-dasharray="6 8" stroke-linecap="round"/>` +
        `<rect x="${postX - 3}" y="${GY - 122}" width="6" height="122" rx="3" fill="#c79566"/>` +
        sign(GY - 110, "#ff9e8f", 1, `<path d="M6,0H18M14,-4L18,0L14,4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, "-.2s") +
        sign(GY - 86, "#5fc9b9", -1, `<path d="${HEART}" transform="translate(-12 .6) scale(.9)" fill="#fff"/>`, "-1s") +
        sign(GY - 62, "#7fb2ee", 1, `<circle cx="12" cy="0" r="4" fill="none" stroke="#fff" stroke-width="2"/>`, "-1.7s") +
        flowerBit(70, GY - 2, "#ff9bb3") + flowerBit(356, GY + 2, "#ffd54a", 0.9) + flowerBit(372, GY + 4, "#ff9bb3", 0.7) +
        person("mom", { g, x: momX, y: GY, ex: "smile", l: "down", r: reach("mom", "r", momX, GY, 1, m1[0], m1[1]), motion: "ar-walk", d: "-.5s" }) +
        person("dad", { g, x: dadX, y: GY, ex: "smile", r: "down", l: reach("dad", "l", dadX, GY, 1, m2[0], m2[1]), motion: "ar-walk", d: "0s" }) +
        person("girl", { g, x: kidX, y: GY, s: KS, ex: "open", l: reach("girl", "l", kidX, GY, KS, m1[0], m1[1]), r: reach("girl", "r", kidX, GY, KS, m2[0], m2[1]), motion: "ar-walk", d: "-.25s" });
      return { vb: "0 0 460 250", body };
    },

    /* 4단계: 받을 수 있는 지원 — 아이에게 우산을 씌워 주는 아빠, 아이 머리를 쓰다듬는 엄마, 하트를 꼭 안은 아이 */
    step4(g) {
      const momX = 184, kidX = 252, dadX = 350;
      const ux = 291, top = 38, hy = 118; // 우산 꼭대기(ux, top), 아빠 손 높이
      const canopy =
        `<path d="M-68,44C-64,8 -35,-4 0,-4C35,-4 64,8 68,44Q51,36 34,44Q17,36 0,44Q-17,36 -34,44Q-51,36 -68,44Z" fill="${g.v("#ffc2cf", "#ff95ad")}"/>` +
        `<path d="M-34,44C-31,16 -16,-2 0,-4C-9,8 -15,26 -17,38ZM34,44C31,16 16,-2 0,-4C9,8 15,26 17,38Z" fill="#fff" opacity=".45"/>` +
        `<path d="M0,-4V-12" stroke="#c97b8f" stroke-width="2.4" stroke-linecap="round"/><circle cx="0" cy="-13" r="2.6" fill="#ffd54a"/>`;
      const hug = `<g transform="translate(0 -40)"><g class="ar-beat"><path d="${HEART}" transform="scale(2.4)" fill="#ff7f97"/><path d="M-7,-10Q-9.6,-6.6 -8.4,-3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".7"/></g></g>`;
      const body =
        glow(g, 280, 110, 150, "#ffffff", 0.75) +
        ground(g, "#e2edfc", "#d0e2fa") +
        [[118, 24, "0s", "#ff9db0"], [150, 4, "-1.8s", "#ffc0cd"], [404, 14, "-.9s", "#ff9db0"], [432, 44, "-2.7s", "#ffb3c5"], [96, 64, "-3.6s", "#ffc0cd"], [372, -4, "-4.4s", "#ffb3c5"]]
          .map(([x, y, d, c]) => heart(x, y, 1.3, c, "ar-fall", d)).join("") +
        `<path d="M${ux},${top}V${hy + 13}" stroke="#9a6b54" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="M${ux},${hy + 13}c0,6 -9,6 -9,0" fill="none" stroke="#9a6b54" stroke-width="2.6" stroke-linecap="round"/>` +
        at(ux, top, canopy, "ar-sway-s") +
        spark(ux - 84, top + 10, 0.8, "#ffc94d", "-.4s") + spark(ux + 86, top + 30, 0.7, "#ff9bb3", "-1.3s") +
        person("mom", { g, x: momX, y: GY, ex: "joy", l: "down", r: reach("mom", "r", momX, GY, 1, kidX - 21, GY - 126, { fa: "ar-pat" }), d: "-.6s" }) +
        person("boy", { g, x: kidX, y: GY, s: KS, ex: "joy", front: hug, l: reach("boy", "l", kidX, GY, KS, kidX - 11.8, GY - 40.6), r: reach("boy", "r", kidX, GY, KS, kidX + 11.8, GY - 40.6), d: "-.3s" }) +
        person("dad", { g, x: dadX, y: GY, ex: "open", r: "down", l: reach("dad", "l", dadX, GY, 1, ux, hy), d: "-1.5s" });
      return { vb: "0 0 460 250", body };
    },

    /* 5단계: 어디로 가야 할까 — 지도를 보는 엄마, 휴대전화로 찾는 아빠, 유치원을 가리키는 아이 */
    step5(g) {
      const dadX = 160, momX = 234, kidX = 310, hx = 404;
      const map =
        `<g transform="translate(0 -102)"><path d="M-24,-14L-8,-18L8,-14L24,-18V14L8,18L-8,14L-24,18Z" fill="#fffdf4" stroke="#d9cfae" stroke-width="1"/>` +
        `<path d="M-8,-18V14M8,-14V18" stroke="#e7dfc3" stroke-width="1"/>` +
        `<path d="M-18,8C-10,2 -4,10 4,2S14,-6 18,-8" fill="none" stroke="#7fb2ee" stroke-width="1.8" stroke-dasharray="3 2.6" stroke-linecap="round"/>` +
        `<path d="M18,-6C16,-8.6 13.6,-10.4 13.6,-12.8C13.6,-15.2 15.6,-17 18,-17C20.4,-17 22.4,-15.2 22.4,-12.8C22.4,-10.4 20,-8.6 18,-6Z" fill="#ff7a6b"/></g>`;
      const house =
        `<g transform="translate(${hx} ${GY - 2})"><rect x="-30" y="-50" width="60" height="50" rx="4" fill="#fff8ee" stroke="#ecd9c2" stroke-width="1.2"/>` +
        `<path d="M-38,-48L0,-80L38,-48Z" fill="#ff9e8f" stroke="#f08573" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<rect x="-8" y="-26" width="16" height="26" rx="7" fill="#9fd3f5"/><circle cx="4" cy="-12" r="1.4" fill="#fff"/>` +
        `<rect x="-24" y="-40" width="12" height="11" rx="2.4" fill="#ffe59a"/><rect x="12" y="-40" width="12" height="11" rx="2.4" fill="#ffe59a"/>` +
        `<path d="M0,-80V-98" stroke="#b7835a" stroke-width="1.8" stroke-linecap="round"/><g transform="translate(0 -98)"><g class="ar-flag"><path d="M0,0C5,-2 9,2 15,0V9C9,11 5,7 0,9Z" fill="#5fc9b9"/></g></g></g>`;
      const pin =
        `<path d="M0,0C-7,-9 -15,-16 -15,-26C-15,-35 -8,-42 0,-42C8,-42 15,-35 15,-26C15,-16 7,-9 0,0Z" fill="#7a6ff0"/>` +
        `<circle cx="0" cy="-26" r="9.5" fill="#fff"/><path d="${HEART}" transform="translate(0 -25.4) scale(1.15)" fill="#ff7f97"/>`;
      const body =
        glow(g, 300, 100, 150, "#fbf7ff", 0.95) +
        ground(g, "#ebe6fb", "#ddd5f6") +
        cloud(120, 54, 0.8, "#fff", 0.9, "ar-drift", "-4s") +
        `<path class="ar-dash" d="M${kidX + 20},${GY - 2}C${kidX + 40},${GY + 6} ${hx - 40},${GY + 8} ${hx - 10},${GY - 2}" fill="none" stroke="#b9aef2" stroke-width="2.4" stroke-dasharray="5 7" stroke-linecap="round"/>` +
        house +
        at(hx, GY - 118, `<g class="ar-bounce">${pin}</g>`) +
        spark(hx - 30, GY - 150, 0.8, "#ffc94d", "-.5s") + spark(hx + 30, GY - 130, 0.7, "#ff9bb3", "-1.4s") +
        person("dad", { g, x: dadX, y: GY, ex: "smile", l: "down", r: reach("dad", "r", dadX, GY, 1, dadX + 8, GY - 112), propR: PROP.phone, headMotion: "ar-nod", d: "-1.1s" }) +
        person("mom", { g, x: momX, y: GY, ex: "smile", front: map, l: reach("mom", "l", momX, GY, 1, momX - 22, GY - 108), r: reach("mom", "r", momX, GY, 1, momX + 22, GY - 108), d: "-.4s" }) +
        person("girl", { g, x: kidX, y: GY, s: KS, ex: "open", l: "down", r: "point", d: "-.8s" });
      return { vb: "0 0 460 250", body };
    },

    /* 자료실: 그림책을 함께 보는 가족과 책장, 내려받는 자료 */
    library(g) {
      const momX = 150, dadX = 232, kidX = 300;
      const book =
        `<g transform="translate(0 -96)"><path d="M0,-14C-10,-19 -24,-19 -34,-15V15C-24,11 -10,11 0,16Z" fill="#fff" stroke="#d9e2d0" stroke-width="1"/>` +
        `<path d="M0,-14C10,-19 24,-19 34,-15V15C24,11 10,11 0,16Z" fill="#fffdf6" stroke="#d9e2d0" stroke-width="1"/>` +
        `<circle cx="-20" cy="-4" r="6" fill="#ffd25a"/><path d="M-30,8C-24,0 -18,6 -12,0S-4,6 -2,4V10H-30Z" fill="#9fd8a8"/>` +
        `<path d="M8,-6H28M8,0H26M8,6H22" stroke="#d9e0ec" stroke-width="2" stroke-linecap="round"/>` +
        `<g class="ar-page"><path d="M0,-14C10,-19 24,-19 34,-15V15C24,11 10,11 0,16Z" fill="#fffaf0" stroke="#e5dcc6" stroke-width=".8"/></g>` +
        `<path d="M-34,-15V15C-24,11 -10,11 0,16C10,11 24,11 34,15V-15" fill="none" stroke="#7fc08b" stroke-width="2.4" stroke-linejoin="round"/></g>`;
      const books =
        `<g transform="translate(0 -96)"><rect x="-15" y="-2" width="30" height="8" rx="2" fill="#ff9e8f"/><rect x="-13" y="-10" width="27" height="8" rx="2" fill="#7fb2ee"/><rect x="-14" y="-18" width="28" height="8" rx="2" fill="#ffd25a"/>` +
        `<path d="M-11,2H11M-9,-6H10M-10,-14H10" stroke="#fff" stroke-width="1.2" opacity=".6"/></g>`;
      const doc = (x, y, c, lab, d) =>
        at(x, y, `<rect x="-14" y="-17" width="28" height="34" rx="4" fill="#fff" stroke="#d5e3c8" stroke-width="1.2"/><rect x="-14" y="-17" width="28" height="9" rx="4" fill="${c}"/>` +
          `<path d="M-8,-1H8M-8,4H6" stroke="#dfe7d6" stroke-width="2" stroke-linecap="round"/>` +
          `<circle cx="8" cy="12" r="7" fill="${c}"/><path d="M8,8.4V15M5.2,12.4L8,15.4L10.8,12.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` + (lab || ""), "ar-float", d);
      const shelf =
        `<g transform="translate(424 ${GY})"><rect x="-30" y="-126" width="60" height="126" rx="4" fill="#e9d2b4"/><rect x="-26" y="-122" width="52" height="118" rx="2" fill="#f7ead7"/>` +
        `<path d="M-26,-82H26M-26,-42H26" stroke="#e1c49f" stroke-width="3"/>` +
        [[-22, -120, 8, "#ff9e8f"], [-13, -116, 7, "#7fb2ee"], [-5, -120, 9, "#ffd25a"], [5, -112, 7, "#9fd8a8"], [13, -118, 8, "#c4b5f5"],
          [-22, -80, 9, "#7fd1c7"], [-12, -76, 7, "#ffb3c5"], [-4, -80, 8, "#ffd25a"], [10, -78, 9, "#ff9e8f"],
          [-21, -40, 8, "#c4b5f5"], [-12, -38, 9, "#9fd8a8"], [-2, -36, 7, "#7fb2ee"], [7, -40, 8, "#ffb3c5"]]
          .map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${-((y + 4) % 40 === 0 ? 34 : 0) || (y <= -112 ? -84 - y : y <= -76 ? -44 - y : -4 - y)}" rx="1.6" fill="${c}"/>`).join("") + `</g>`;
      const body =
        glow(g, 250, 110, 150, "#fbfff2", 0.95) +
        ground(g, "#e6f2da", "#d6eac6") +
        shelf +
        doc(88, 76, "#ff9e8f", "", "-.6s") + doc(126, 46, "#7fb2ee", "", "-2s") +
        spark(184, 40, 0.8, "#ffc94d", "-1s") + spark(346, 52, 0.7, "#ff9bb3", "-.2s") +
        person("mom", { g, x: momX, y: GY, ex: "smile", front: books, l: reach("mom", "l", momX, GY, 1, momX - 13, GY - 96), r: reach("mom", "r", momX, GY, 1, momX + 13, GY - 96), d: "-.9s" }) +
        person("dad", { g, x: dadX, y: GY, ex: "open", front: book, l: reach("dad", "l", dadX, GY, 1, dadX - 30, GY - 90), r: reach("dad", "r", dadX, GY, 1, dadX + 30, GY - 90), headMotion: "ar-nod", d: "-.3s" }) +
        person("boy", { g, x: kidX, y: GY, s: KS, ex: "wonder", r: "down", l: reach("boy", "l", kidX, GY, KS, dadX + 30, GY - 88), headMotion: "ar-look", d: "-1.4s" });
      return { vb: "0 0 460 250", body };
    },

    /* 자주 묻는 질문: 손 들고 묻는 아이, 웃으며 답하는 엄마, 고개 끄덕이는 아빠 */
    faq(g) {
      const dadX = 162, momX = 240, kidX = 322;
      const body =
        glow(g, 270, 110, 150, "#fff7ec", 0.95) +
        ground(g, "#ffe9d4", "#ffdcbf") +
        at(kidX + 36, GY - 166, bubble(38, 34, "#fff", "#f2cfb0", `<g transform="scale(1.2)">${QMARK("#ff7a6b")}</g>`), "ar-pop", "0s") +
        at(momX + 30, GY - 214, bubble(38, 34, "#fff7d6", "#f2d27a",
          `<circle cx="0" cy="-2" r="8" fill="#ffd54a"/><rect x="-4" y="5" width="8" height="5" rx="1.6" fill="#c7b9a0"/><path d="M-3,-2.4Q0,1 3,-2.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` +
          `<path d="M0,-15V-12.6M-10,-9L-8.2,-7.6M10,-9L8.2,-7.6" stroke="#f2b600" stroke-width="1.6" stroke-linecap="round"/>`), "ar-pop", "-2.4s") +
        at(70, 96, `<circle r="15" fill="#fff" stroke="#f6d3b6" stroke-width="1.2"/><path d="M-5,-6H5M-5,-1H3M-5,4H5" stroke="#ffb28a" stroke-width="2" stroke-linecap="round"/>`, "ar-float", "-1s") +
        spark(120, 56, 0.9, "#ffc94d", "-.4s") + spark(430, 80, 0.8, "#ff9bb3", "-1.2s") + heart(206, 40, 1, "#ffb3a7", "ar-float", "-2.4s") +
        person("dad", { g, x: dadX, y: GY, ex: "smile", l: "down", r: { a: 26, b: -100, fa: "ar-tap" }, propR: PROP.thumb, headMotion: "ar-nod", d: "-.7s" }) +
        person("mom", { g, x: momX, y: GY, ex: "talk", l: "down", r: "present", d: "-1.5s" }) +
        person("girl", { g, x: kidX, y: GY, s: KS, ex: "wonder", l: "down", r: "up", d: "-.2s" });
      return { vb: "0 0 460 250", body };
    },
  };

  /* ---------- 그리기·붙이기 ---------- */
  function render(name) {
    const S = SCENES[name];
    if (!S) return "";
    const g = Paint();
    const { vb, body } = S(g);
    return `<svg class="ar ar-${name}" viewBox="${vb}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${g.defs()}${body}</svg>`;
  }

  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  function syncToggles() {
    const still = root.classList.contains("mo-still");
    document.querySelectorAll(".ar-toggle").forEach((b) => {
      b.setAttribute("aria-pressed", String(still));
      b.title = still ? "그림 움직임 다시 재생" : "그림 움직임 멈추기";
      b.setAttribute("aria-label", b.title);
      b.innerHTML = still ? ICON_PLAY : ICON_PAUSE;
    });
  }
  function setStill(still) {
    root.classList.toggle("mo-still", still);
    try { localStorage.setItem(KEY, still ? "1" : "0"); } catch { /* 저장소 막힘 */ }
    syncToggles();
  }

  function mount() {
    // 자리 표시(data-art)에 그림 넣기
    document.querySelectorAll("[data-art]").forEach((el) => { el.innerHTML = render(el.dataset.art); });
    // 메뉴 화면 머리: 글은 왼쪽, 장면 그림은 오른쪽(좁은 화면은 글 아래)
    const page = document.body.dataset.page;
    const hero = document.querySelector(".page-hero");
    if (hero && SCENES[page] && !hero.classList.contains("ph-art-on")) {
      const wrap = hero.querySelector(".wrap");
      const copy = document.createElement("div");
      copy.className = "ph-copy";
      while (wrap.firstChild) copy.appendChild(wrap.firstChild);
      const art = document.createElement("div");
      art.className = "ph-art";
      art.innerHTML = render(page) + `<button type="button" class="ar-toggle"></button>`;
      wrap.classList.add("ph-grid");
      wrap.append(copy, art);
      hero.classList.add("ph-art-on");
      art.querySelector(".ar-toggle").addEventListener("click", () => setStill(!root.classList.contains("mo-still")));
      syncToggles();
    }
    // 화면 밖 그림은 잠시 멈춰 배터리를 아낀다
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("ar-off", !e.isIntersecting)), { rootMargin: "120px" });
      document.querySelectorAll("svg.ar").forEach((s) => io.observe(s));
    }
  }

  window.SEEArt = { render, mount, setStill, scenes: Object.keys(SCENES) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();

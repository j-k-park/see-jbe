/* 5단계: 지도 기반 기관 찾기 */
(function () {
  "use strict";
  const { esc, icon } = SEE;
  const TYPE = {
    kinder: { name: "특수학급 유치원", c: "#00a9a6", tag: "teal" },
    special: { name: "특수학교", c: "#2479f7", tag: "blue" },
    center: { name: "특수교육지원센터", c: "#012d63", tag: "navy" },
    "daycare-special": { name: "장애아전문 어린이집", c: "#ea5a48", tag: "coral" },
    "daycare-inclusive": { name: "장애아통합 어린이집", c: "#f07d00", tag: "orange" },
  };
  const typeOf = (it) => (it.type === "daycare" ? `daycare-${it.daycareKind}` : it.type);

  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  let items = [];
  let map, layer;
  const markers = new Map();
  let selected = null;

  fetch("data/institutions.json")
    .then((r) => r.json())
    .then((data) => {
      items = data.items;
      $("f-region").insertAdjacentHTML("beforeend", data.regions.map((r) => `<option value="${r}">${r}</option>`).join(""));
      applyParams();
      initMap();
      update();
      const id = params.get("id");
      if (id) select(items.find((i) => i.id === id || i.name === id), true);
    })
    .catch(() => ($("list").innerHTML = '<li class="notice">기관 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</li>'));

  function applyParams() {
    const t = params.get("type");
    if (t) document.querySelectorAll('input[name="type"]').forEach((c) => (c.checked = t.split(",").some((x) => c.value === x || c.value.startsWith(x + "-"))));
    const r = params.get("region");
    if (r) $("f-region").value = r;
    const q = params.get("q");
    if (q) $("f-q").value = q;
    if (params.get("preschool")) $("f-preschool").checked = true;
  }

  function initMap() {
    if (!window.L) { $("map").innerHTML = '<p class="notice" style="margin:16px">지도를 불러오지 못했습니다. 아래 목록을 이용해 주세요.</p>'; return; }
    map = L.map("map", { scrollWheelZoom: false }).setView([35.72, 127.1], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("click", () => map.scrollWheelZoom.enable());
  }

  const filters = () => ({
    types: [...document.querySelectorAll('input[name="type"]:checked')].map((c) => c.value),
    region: $("f-region").value,
    preschool: $("f-preschool").checked,
    multi: $("f-multi").checked,
    q: $("f-q").value.trim(),
  });

  function matches(it, f) {
    if (!f.types.includes(typeOf(it))) return false;
    if (f.region && it.region !== f.region) return false;
    if (f.preschool && !(it.type === "kinder" || (it.type === "special" && it.courses?.includes("유")) || it.type === "daycare")) return false;
    if (f.multi && !(it.type === "kinder" && it.classes >= 2)) return false;
    if (f.q && !`${it.name} ${it.address || ""} ${it.region}`.includes(f.q)) return false;
    return true;
  }

  function update() {
    const f = filters();
    const shown = items.filter((it) => matches(it, f));
    const order = { center: 0, special: 1, kinder: 2, "daycare-special": 3, "daycare-inclusive": 4 };
    shown.sort((a, b) => (a.region === b.region ? order[typeOf(a)] - order[typeOf(b)] || a.name.localeCompare(b.name, "ko") : REGION_ORDER(a.region) - REGION_ORDER(b.region)));
    $("count").innerHTML = `검색 결과 <b>${shown.length}</b>곳 · 지도 표시 ${shown.filter((i) => i.latlng).length}곳`;
    $("list").innerHTML = shown.map(card).join("") || '<li class="notice">조건에 맞는 기관이 없습니다. 조건을 바꿔 보세요.</li>';
    $("list").querySelectorAll(".inst").forEach((el) => el.addEventListener("click", () => select(items.find((i) => i.id === el.dataset.id), true)));
    drawMarkers(shown);
    window._seeShown = shown;
  }
  const REGIONS = ["전주", "군산", "익산", "정읍", "남원", "김제", "완주", "진안", "무주", "장수", "임실", "순창", "고창", "부안"];
  const REGION_ORDER = (r) => REGIONS.indexOf(r);

  function subline(it) {
    if (it.type === "kinder") return `${it.kinderKind === "병설" ? "공립 병설" : "공립 단설"} · 특수학급 ${it.classes}학급`;
    if (it.type === "special") return `${it.founding} · ${it.area} · ${it.courses.join("·")} 과정`;
    if (it.type === "center") return "진단·평가 의뢰, 선정·배치 상담, 순회교육";
    if (it.type === "daycare") return `${it.founding} · ${TYPE[typeOf(it)].name}`;
    return "";
  }

  function card(it) {
    const t = TYPE[typeOf(it)];
    return `<li><button type="button" class="inst ${selected === it.id ? "on" : ""}" data-id="${esc(it.id)}">
      <span class="top"><span class="tag ${t.tag}">${t.name}</span><span class="tag">${esc(it.region)}</span>${it.latlng ? "" : '<span class="tag">지도 위치 준비 중</span>'}</span>
      <b>${esc(it.name)}</b>
      <span class="meta">${esc(subline(it))}</span>
      ${it.address ? `<span class="meta">${esc(it.address)}</span>` : ""}
    </button></li>`;
  }

  function drawMarkers(shown) {
    if (!map) return;
    layer.clearLayers();
    markers.clear();
    const pts = [];
    shown.forEach((it) => {
      if (!it.latlng) return;
      const t = TYPE[typeOf(it)];
      const m = L.marker(it.latlng, {
        title: it.name,
        icon: L.divIcon({ className: "", html: `<div class="pin ${it.type === "center" ? "center" : ""}" style="--c:${t.c}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
      });
      m.bindPopup(`<b>${esc(it.name)}</b><br>${esc(subline(it))}${it.approx ? "<br><small>※ 도로 기준 대략 위치</small>" : ""}`);
      m.on("click", () => select(it, false));
      m.addTo(layer);
      markers.set(it.id, m);
      pts.push(it.latlng);
    });
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
  }

  function select(it, fly) {
    if (!it) return;
    selected = it.id;
    document.querySelectorAll(".inst").forEach((el) => el.classList.toggle("on", el.dataset.id === it.id));
    const t = TYPE[typeOf(it)];
    const rows = [
      ["유형", t.name + (it.kinderKind ? ` (${it.kinderKind})` : "")],
      ["지역", it.region],
      it.address && ["주소", it.address],
      it.phone && ["전화", `<a href="tel:${esc(it.phone)}">${esc(it.phone)}</a>${it.phoneLabel ? ` <span class="src">(${esc(it.phoneLabel)})</span>` : ""}`],
      it.classes && ["특수학급", `${it.classes}학급 (2026학년도)`],
      it.courses && ["설치 과정", it.courses.join(", ")],
      it.area && ["주 장애영역", it.area],
      it.services && ["지원 내용", it.services.join(", ")],
      it.note && ["안내", it.note],
      ["출처", it.source],
    ].filter(Boolean);
    const d = $("detail");
    d.hidden = false;
    d.innerHTML = `<span class="tag ${t.tag}">${t.name}</span><h3>${esc(it.name)}</h3>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${k === "전화" ? v : esc(v)}</dd>`).join("")}</dl>
      ${it.approx ? '<p class="src" style="margin-bottom:10px">※ 지도의 점은 도로 기준 대략 위치입니다. 정확한 위치는 길찾기로 확인하세요.</p>' : ""}
      <div class="acts">
        <a class="btn btn-navy btn-sm" href="https://map.kakao.com/?q=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">${icon("pin")}카카오맵 길찾기</a>
        ${it.url ? `<a class="btn btn-line btn-sm" href="${esc(it.url)}" target="_blank" rel="noopener">${icon("external")}누리집</a>` : ""}
        <a class="btn btn-line btn-sm" href="chat.html?q=${encodeURIComponent(it.name + "에 대해 알려주세요. 입학이나 상담은 어떻게 하나요?")}">${icon("chat")}SEE에게 묻기</a>
      </div>`;
    if (fly && map && it.latlng) {
      map.setView(it.latlng, 15);
      markers.get(it.id)?.openPopup();
    }
    if (fly) d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  document.querySelectorAll(".filters input, .filters select").forEach((el) => el.addEventListener(el.type === "search" ? "input" : "change", update));

  // 작은 화면에서는 검색 조건을 접어 두고, 조건이 지정된 상태로 들어오면 펼쳐 둔다
  const acc = $("filter-acc");
  if (acc && window.matchMedia("(max-width: 640px)").matches && !location.search) acc.open = false;

  $("save-list").addEventListener("click", () => {
    const shown = window._seeShown || [];
    SEE.saveCsv(`전북 특수교육 기관 목록 ${SEE.today()}`, ["유형", "기관명", "지역", "주소", "전화", "특수학급 수", "설치 과정", "출처"],
      shown.map((it) => [TYPE[typeOf(it)].name, it.name, it.region, it.address || "", it.phone || "", it.classes || "", (it.courses || []).join("·"), it.source]));
  });
})();

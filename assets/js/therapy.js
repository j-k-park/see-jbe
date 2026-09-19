/* 5단계: 치료지원(꿈활짝카드) 가맹점 목록 — data/therapy.json (2026.5.1. 기준) */
(function () {
  "use strict";
  const { esc } = SEE;
  const $ = (id) => document.getElementById(id);
  const PAGE = 30;
  let all = [], shown = [], limit = PAGE;

  fetch("data/therapy.json")
    .then((r) => r.json())
    .then((d) => {
      all = d.items;
      const regions = [...new Set(all.filter((i) => i.local).map((i) => i.region))];
      $("t-region").insertAdjacentHTML("beforeend", regions.map((r) => `<option value="${r}">${r} (${d.counts[r]})</option>`).join("") + `<option value="도외">전북 밖 (${d.counts["도외"] || 0})</option>`);
      const r = new URLSearchParams(location.search).get("region");
      if (r && regions.includes(r)) $("t-region").value = r;
      update();
    })
    .catch(() => ($("t-body").innerHTML = '<tr><td colspan="5">목록을 불러오지 못했습니다.</td></tr>'));

  function update() {
    const region = $("t-region").value, q = $("t-q").value.trim(), rehab = $("t-rehab").checked;
    shown = all.filter((i) =>
      (!region || (region === "도외" ? !i.local : i.local && i.region === region)) &&
      (!q || `${i.name} ${i.address}`.includes(q)) &&
      (!rehab || i.rehab)
    );
    limit = PAGE;
    render();
  }

  function render() {
    $("t-count").innerHTML = `가맹점 <b>${shown.length}</b>곳`;
    $("t-body").innerHTML = shown.slice(0, limit).map((i) => `<tr>
      <td>${esc(i.local ? i.region : i.region.replace(/(특별자치도|광역시|특별시|도)$/, ""))}</td>
      <td><a href="https://map.kakao.com/?q=${encodeURIComponent(i.name)}" target="_blank" rel="noopener">${esc(i.name)}</a></td>
      <td>${esc(i.address)}</td>
      <td>${i.phone ? `<a href="tel:${esc(i.phone)}">${esc(i.phone)}</a>` : '<span class="src">누리집 확인</span>'}</td>
      <td>${i.rehab ? "○" : ""}</td></tr>`).join("") || '<tr><td colspan="5">조건에 맞는 가맹점이 없습니다.</td></tr>';
    $("t-more").hidden = shown.length <= limit;
  }

  $("t-region").addEventListener("change", update);
  $("t-q").addEventListener("input", update);
  $("t-rehab").addEventListener("change", update);
  $("t-more").addEventListener("click", () => { limit += PAGE; render(); });
  $("t-csv").addEventListener("click", () =>
    SEE.saveCsv(`치료지원 가맹점 목록 ${SEE.today()}`, ["지역", "기관명", "주소", "전화", "발달재활서비스 지정"],
      shown.map((i) => [i.region, i.name, i.address, i.phone, i.rehab ? "O" : ""]))
  );
})();

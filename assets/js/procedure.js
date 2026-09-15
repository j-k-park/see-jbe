/* 4단계: 특수교육대상자 선정 절차와 지원 혜택
   근거: 「장애인 등에 대한 특수교육법」 제3·14~18·28·36조(국가법령정보센터, 2025.10.1. 시행본),
        전북특별자치도교육청 특수교육지원센터 누리집 「특수교육대상자 선정·배치」·「치료지원」·「순회교육」·「특수교육인력지원」 (2026-09-15 확인) */
(function () {
  "use strict";
  const { icon, esc } = SEE;

  const PROC = [
    {
      t: "의심·관찰", who: ["보호자", "유치원·어린이집 선생님"],
      d: "아이의 발달이 걱정되면 관찰 기록을 남기고, 선별검사나 병·의원 상담으로 도움이 필요한지 먼저 살펴봅니다.",
      list: ["1단계 발달 정보와 관찰 기록지 활용", "영유아 건강검진(K-DST) 또는 온라인 선별검사", "필요하면 병·의원에서 발달 정밀 평가"],
      tip: "병원 진단이 없어도 다음 단계(진단·평가 의뢰)를 신청할 수 있어요. 병원 소견서나 검사 결과지가 있으면 함께 내면 참고 자료가 됩니다.",
    },
    {
      t: "진단·평가 의뢰", who: ["보호자", "각급학교의 장(보호자 사전 동의)"],
      d: "보호자가 진단·평가 의뢰서를 작성해 거주지 교육지원청(특수교육지원센터)에 제출합니다. 유치원 원장이 의뢰할 때는 보호자의 사전 동의가 필요합니다.",
      list: ["의뢰서 서식: 전북특별자치도교육청 특수교육지원센터 누리집 또는 관할 센터", "제출처: 유·초·중학교 과정은 교육지원청, 고등학교 과정은 도교육청", "필요 서류와 방문 일정은 관할 센터가 안내"],
      tip: "관할 특수교육지원센터에 먼저 전화하면 준비 서류와 일정을 자세히 안내받을 수 있어요.",
      law: "특수교육법 제14조 제3항",
    },
    {
      t: "진단·평가 시행", who: ["특수교육지원센터"],
      d: "특수교육지원센터는 진단·평가가 회부된 뒤 30일 이내에 진단·평가를 시행하고, 선정 여부와 필요한 교육지원 내용에 대한 최종 의견을 교육장에게 보고합니다.",
      list: ["방문 횟수와 검사 종류는 장애 영역에 따라 다름", "진단·평가 과정에서 보호자의 의견 진술 기회 보장", "센터가 최종 의견을 작성해 교육장·교육감에게 보고"],
      tip: "평소 아이 모습, 걱정되는 점, 원하는 지원을 메모해 가면 의견을 전하기 쉬워요. 자료실의 '상담 준비 체크리스트'를 활용하세요.",
      law: "특수교육법 제16조 제1·2·4항",
    },
    {
      t: "특수교육운영위원회 심사", who: ["시·군 특수교육운영위원회"],
      d: "진단·평가 결과를 바탕으로 유치원·초·중학교 과정은 시·군 특수교육운영위원회가, 고등학교 과정은 도 특수교육운영위원회가 심사합니다.",
      list: ["대면 심사와 서면 심사로 진행", "심사 일정은 교육지원청마다 다름", "선정 여부, 교육지원 내용, 배치 기관을 함께 심사"],
      tip: "예를 들어 전주교육지원청은 홀수 달에 접수·진단평가, 짝수 달에 선정·배치 결과를 통보하며 접수부터 결과 통보까지 약 2개월이 걸린다고 안내합니다. 지역별 일정은 관할 센터에 확인하세요.",
      law: "특수교육법 제15조 제2항",
    },
    {
      t: "선정·배치 결과 통보", who: ["교육장·교육감"],
      d: "교육장·교육감은 최종 의견을 받은 때부터 2주일 이내에 선정 여부와 제공할 교육지원 내용을 결정해 보호자에게 서면으로 알립니다.",
      list: ["교육지원 내용에 특수교육, 특수교육 관련서비스 등 구체적 내용 포함", "배치 결과와 학교(유치원) 지정도 서면으로 통지", "결과에 이의가 있으면 심사청구 가능(아래 안내)"],
      tip: "통지서에 적힌 교육지원 내용(예: 치료지원 영역)이 이후 지원의 근거가 되니 잘 보관하세요.",
      law: "특수교육법 제16조 제3항",
    },
    {
      t: "배치 기관 입학·교육 시작", who: ["보호자", "배치된 유치원·학교"],
      d: "선정된 아이는 일반학급(통합학급), 특수학급, 특수학교 중 한 곳에 배치되어 교육을 받습니다. 장애 정도·능력·보호자 의견을 종합해 거주지에서 가장 가까운 곳에 배치합니다.",
      list: ["일반학교의 일반학급(통합교육) / 특수학급 / 특수학교", "만 3세 미만 영아는 특수학교 유치원 과정, 영아학급, 특수교육지원센터에 배치 가능", "배치 후 개별화교육지원팀이 아이에게 맞는 교육계획 수립"],
      tip: "5단계 '기관 찾기'에서 우리 동네 특수학급 유치원과 특수학교를 미리 살펴보세요.",
      law: "특수교육법 제17·18조",
    },
  ];

  const BENEFITS = [
    { ic: "school", c: ["var(--blue-soft)", "var(--blue)"], t: "무상·의무교육", d: "특수교육대상자는 유치원 과정부터 의무교육이며, 만 3세 미만 장애영아 교육은 무상입니다. 만 3세부터 만 17세까지 의무교육을 받을 권리가 있습니다.", s: "특수교육법 제3조" },
    { ic: "people", c: ["var(--teal-soft)", "var(--teal)"], t: "유치원 특수학급", d: "유아특수교사가 있는 특수학급이 도내 공립유치원 53곳(85학급)에 있습니다. 선정되면 관내 특수학급 설치 유치원에 입학할 수 있습니다.", s: "2026년도 특수학급 현황", link: ["step5.html?type=kinder", "특수학급 유치원 찾기"] },
    { ic: "heart", c: ["var(--coral-soft)", "var(--coral)"], t: "통합학급 프로그램", d: "일반학급에서 또래와 함께 배우는 통합교육을 받을 수 있고, 개별화교육계획에 따라 아이에게 맞는 교육 목표와 방법을 정합니다.", s: "특수교육법 제21·22조" },
    { ic: "bus", c: ["var(--orange-soft)", "var(--orange)"], t: "순회교육", d: "특수학급이 없는 유치원에 다니면 특수교육지원센터 교사가 방문해 주 1회 2시간 이상 지원합니다. 가정·시설에 있는 영유아도 방문 교육을 받을 수 있습니다.", s: "전북교육청 순회교육 운영 방침" },
    { ic: "stetho", c: ["var(--teal-soft)", "var(--teal)"], t: "치료지원 (꿈활짝카드)", d: "물리·작업·언어치료, 청능·보행훈련, 미술·음악치료 등을 월 17만원 이내 실비로 지원합니다. 유치원 이상 재학 중인 특수교육대상자가 대상이며, 어린이집 재원 아동과 보건복지부 발달재활서비스 동일 영역 수혜자는 제외됩니다.", s: "전북교육청 치료지원 안내" },
    { ic: "bus", c: ["var(--blue-soft)", "var(--blue)"], t: "통학 지원", d: "통학차량 지원, 통학비 지원, 통학 지원인력 배치 등 등하교를 돕는 대책을 학교가 마련합니다.", s: "특수교육법 제28조 제5항" },
    { ic: "hand", c: ["var(--yellow-soft)", "#b98a00"], t: "지원인력", d: "특수교육지도사, 장애학생지원 사회복무요원, 자원봉사자 등이 식사·이동·학습 활동을 돕습니다. 필요한 인력은 전년도 11~12월에 학교를 통해 신청합니다.", s: "전북교육청 특수교육인력지원 안내" },
    { ic: "people", c: ["var(--coral-soft)", "var(--coral)"], t: "가족 지원", d: "특수교육대상자와 가족에게 가족상담, 부모교육 등 가족지원을 제공합니다.", s: "특수교육법 제28조 제1항" },
    { ic: "tool", c: ["#e6ecf5", "var(--navy)"], t: "보조공학기기·교구", d: "교육에 필요한 장애인용 교구, 학습보조기, 보조공학기기 등을 학교가 제공합니다.", s: "특수교육법 제28조 제4항" },
    { ic: "coin", c: ["var(--orange-soft)", "var(--orange)"], t: "상담 및 진단평가비 지원", d: "특수교육대상자 선정과 관련한 영유아 상담 및 진단평가 비용 지원이 있습니다. 지원 대상과 금액은 관할 특수교육지원센터에 확인해 주세요.", s: "", pending: true },
    { ic: "baby", c: ["var(--teal-soft)", "var(--teal)"], t: "만 3세 미만 영아 지원", d: "조기교육이 필요한 장애영아의 보호자는 교육장에게 교육을 요구할 수 있고, 영아학급·특수학교 유치원 과정·특수교육지원센터 배치나 순회교육을 받을 수 있습니다.", s: "특수교육법 제18조" },
    { ic: "info", c: ["var(--blue-soft)", "var(--blue)"], t: "장애인 등록과는 별개", d: "특수교육대상자 선정은 교육 지원을 위한 절차로, 주민센터에서 하는 장애인 등록과는 다른 제도입니다. 장애인 등록 없이도 진단·평가를 받을 수 있습니다.", s: "특수교육법 제15조" },
  ];

  window.SEE_PROC = PROC;
  window.SEE_BENEFITS = BENEFITS;

  /* 절차 스테퍼 (4단계 페이지에서만) */
  const stepper = document.getElementById("stepper");
  if (!stepper) return;
  const detail = document.getElementById("step-detail");
  let cur = 0;
  stepper.innerHTML = PROC.map((p, i) => `<button type="button" role="tab" data-i="${i}"><span class="circle">${i + 1}</span><span class="lbl">${esc(p.t)}</span></button>`).join("");
  stepper.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(+b.dataset.i); });
  document.getElementById("prev").addEventListener("click", () => show(Math.max(0, cur - 1)));
  document.getElementById("next").addEventListener("click", () => show(Math.min(PROC.length - 1, cur + 1)));

  function show(i) {
    cur = i;
    stepper.querySelectorAll("button").forEach((b, k) => {
      b.classList.toggle("done", k < i);
      k === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current");
      b.setAttribute("aria-selected", String(k === i));
    });
    const p = PROC[i];
    detail.innerHTML = `
      <div class="card">
        <span class="tag blue">${i + 1}단계</span>
        <h3 style="margin-top:8px">${esc(p.t)}</h3>
        <div class="who">${p.who.map((w) => `<span class="tag navy">${esc(w)}</span>`).join("")}</div>
        <p>${esc(p.d)}</p>
        <ul style="margin-top:12px">${p.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${p.law ? `<p class="src" style="margin-top:12px">근거: ${esc(p.law)}</p>` : ""}
      </div>
      <div class="card tip"><h4>보호자 도움말</h4><p>${esc(p.tip)}</p>
        <a class="btn btn-line btn-sm" style="margin-top:14px" href="chat.html?q=${encodeURIComponent(p.t + " 단계에 대해 자세히 알려주세요")}">${icon("chat")}이 단계 SEE에게 묻기</a></div>`;
    document.getElementById("prev").disabled = i === 0;
    document.getElementById("next").disabled = i === PROC.length - 1;
  }
  show(0);

  /* 지원 혜택 카드 */
  document.getElementById("benefits").innerHTML = BENEFITS.map((b) => `
    <article class="benefit">
      <span class="ico" style="--bg:${b.c[0]};--fg:${b.c[1]}">${icon(b.ic)}</span>
      <h3>${esc(b.t)} ${b.pending ? '<span class="pending">세부 기준 확인 중</span>' : ""}</h3>
      <p>${esc(b.d)}</p>
      ${b.link ? `<a class="btn btn-line btn-sm" style="align-self:flex-start" href="${b.link[0]}">${esc(b.link[1])}</a>` : ""}
      ${b.s ? `<p class="src">근거: ${esc(b.s)}</p>` : '<p class="src">문의: 거주지 교육지원청 특수교육지원센터</p>'}
    </article>`).join("");

  /* 저장 */
  function openSave(title, blocks) {
    const dlg = document.getElementById("save-dlg");
    dlg.innerHTML = `<div class="dlg-head"><h2>${esc(title)}</h2></div>
      <div class="dlg-body"><p>저장 형식을 고르세요. 워드 파일은 한글(HWP)에서도 열 수 있습니다.</p></div>
      <div class="dlg-foot">${SEE.saveButtons("x")}<button class="btn btn-sm btn-navy" type="button" value="close">닫기</button></div>`;
    dlg.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => { SEE.saveAs(b.dataset.save, title, blocks); dlg.close(); }));
    dlg.querySelector('[value="close"]').addEventListener("click", () => dlg.close());
    dlg.showModal();
  }
  document.getElementById("save-proc").addEventListener("click", () => {
    const blocks = [{ p: "전북특별자치도교육청 특수교육대상자 선정·배치 절차를 보호자 눈높이로 정리했습니다." }];
    PROC.forEach((p, i) => {
      blocks.push({ h: `${i + 1}단계. ${p.t}` }, { p: p.d }, { ul: p.list }, { note: "도움말: " + p.tip + (p.law ? ` (근거: ${p.law})` : "") });
    });
    blocks.push({ h: "결과에 이의가 있을 때" }, { p: "특수교육운영위원회에 심사청구 → 30일 이내 결과 통보 → 이의가 있으면 통보받은 날부터 90일 이내 행정심판 (특수교육법 제36조)" });
    openSave("특수교육대상자 선정·배치 절차 안내", blocks);
  });
  document.getElementById("save-benefit").addEventListener("click", () => {
    const blocks = [{ table: { head: ["지원", "내용", "근거·문의"], rows: BENEFITS.map((b) => [b.t, b.d, b.s || "관할 특수교육지원센터 문의"]) } }];
    openSave("특수교육대상자 지원 혜택 총정리", blocks);
  });
})();

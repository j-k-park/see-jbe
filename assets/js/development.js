/* 1단계: 연령별 발달 특징 · 상담 권유 신호 · 가정 놀이
   영역은 한국 영유아 발달선별검사(K-DST)의 6개 영역 이름을 따랐다.
   내용은 일반적인 발달 이정표를 학부모 눈높이로 정리한 참고 정보이며 진단 기준이 아니다. */
(function () {
  "use strict";
  const DOMAINS = [
    { key: "gross", name: "대근육 운동", c: "var(--coral)" },
    { key: "fine", name: "소근육 운동", c: "var(--orange)" },
    { key: "cog", name: "인지", c: "var(--blue)" },
    { key: "lang", name: "언어", c: "var(--teal)" },
    { key: "social", name: "사회성", c: "#e0a800" },
    { key: "self", name: "자조(스스로 하기)", c: "var(--navy)" },
  ];

  const AGES = [
    {
      id: "a0", label: "0~12개월", title: "돌 무렵까지",
      items: {
        gross: ["엎드린 자세에서 고개를 들고 가눈다 (4개월 무렵)", "뒤집기를 한다 (6개월 무렵)", "도움 없이 앉아 있다 (9개월 무렵)", "가구를 붙잡고 일어선다 (12개월 무렵)"],
        fine: ["손에 쥐여 준 장난감을 잡는다", "물건을 한 손에서 다른 손으로 옮긴다", "엄지와 검지로 작은 과자를 집는다 (12개월 무렵)"],
        cog: ["움직이는 물건을 눈으로 따라 본다", "까꿍 놀이를 즐긴다", "숨긴 장난감을 찾으려 한다"],
        lang: ["여러 소리로 옹알이를 한다", "이름을 부르면 돌아본다", "'엄마', '빠빠'처럼 뜻 있는 소리를 내기 시작한다"],
        social: ["눈을 맞추며 웃는다", "익숙한 사람과 낯선 사람을 구별한다", "'빠이빠이' 손 흔들기를 따라 한다"],
        self: ["손으로 음식을 집어 입에 넣는다", "도와주면 컵으로 마셔 본다"],
      },
      flags: ["6개월이 지나도 사람을 보고 웃거나 소리에 반응하지 않아요", "9개월이 지나도 이름을 불러도 반응이 거의 없어요", "12개월이 지나도 손가락으로 가리키거나 손을 흔들지 않아요", "할 수 있던 행동이나 옹알이가 사라졌어요 (모든 연령)"],
      play: [["까꿍 놀이", "천이나 손으로 얼굴을 가렸다가 보여 주며 웃어 주세요."], ["말 걸어 주기", "기저귀 갈 때, 목욕할 때 하는 일을 짧은 말로 들려주세요."], ["소리 나는 장난감", "딸랑이를 좌우로 움직여 눈과 손이 따라오게 해 주세요."], ["엎드려 놀기", "깨어 있을 때 엎드려 놀게 하면 목과 등 힘이 자랍니다."]],
    },
    {
      id: "a1", label: "1~2세", title: "12~24개월",
      items: {
        gross: ["혼자 걷는다 (15~18개월 무렵)", "손잡고 계단을 오른다", "뛰려고 하거나 공을 발로 차 본다 (24개월 무렵)"],
        fine: ["크레용으로 끄적인다", "블록을 2~4개 쌓는다", "숟가락을 잡고 떠먹으려 한다"],
        cog: ["'공 가져와' 같은 간단한 지시를 따른다", "전화하기, 인형 재우기 같은 흉내 놀이를 한다", "그림책 속 익숙한 물건을 가리킨다"],
        lang: ["의미 있는 낱말을 여러 개 말한다 (18개월 무렵)", "'엄마 물'처럼 두 낱말을 이어 말한다 (24개월 무렵)", "몸의 부분을 물으면 가리킨다"],
        social: ["원하는 것을 손가락으로 가리켜 알린다", "재미있는 것을 보면 어른에게 보여 주려 한다", "다른 아이에게 관심을 보인다"],
        self: ["숟가락과 컵을 스스로 써 보려 한다", "옷 벗기를 도우려 팔다리를 움직인다"],
      },
      flags: ["18개월이 지나도 혼자 걷지 못해요", "18개월이 지나도 원하는 것을 가리키거나 보여 주지 않아요", "24개월이 지나도 두 낱말을 이어 말하지 않아요", "눈맞춤이 드물고 이름을 불러도 잘 돌아보지 않아요"],
      play: [["공 주고받기", "마주 앉아 공을 굴리며 '데굴데굴' 소리를 붙여 주세요."], ["블록 쌓고 무너뜨리기", "함께 쌓고 '와르르!' 하며 차례를 연습해요."], ["그림책 가리키기", "'강아지 어디 있지?' 묻고 아이가 가리키면 크게 칭찬해 주세요."], ["흉내 놀이", "인형에게 밥 주기, 재우기 같은 생활 놀이를 함께 해요."]],
    },
    {
      id: "a2", label: "2~3세", title: "24~36개월",
      items: {
        gross: ["넘어지지 않고 달린다", "두 발을 모아 제자리에서 뛴다", "난간을 잡고 계단을 오르내린다"],
        fine: ["블록을 6개 이상 쌓는다", "그림책을 한 장씩 넘긴다", "보고 동그라미를 흉내 내 그린다 (3세 무렵)"],
        cog: ["색이나 크기가 같은 것끼리 모은다", "간단한 조각 퍼즐을 맞춘다", "'크다·작다'를 구별한다"],
        lang: ["세 낱말 이상으로 문장을 만든다", "자기 이름을 말한다", "가족이 알아듣는 말을 대부분 한다"],
        social: ["다른 아이 옆에서, 또는 함께 논다", "어른의 도움을 받아 차례를 기다린다", "기쁨·슬픔 같은 감정을 표현한다"],
        self: ["숟가락으로 흘리면서도 스스로 먹는다", "화장실 가고 싶은 것을 알리기 시작한다", "손 씻기를 도와주면 따라 한다"],
      },
      flags: ["간단한 말을 거의 이해하지 못하는 것 같아요", "30개월이 지나도 문장으로 말하지 않아요", "같은 행동을 반복하거나 한 가지에 지나치게 몰두하고, 다른 사람과 주고받기가 거의 없어요", "자주 넘어지거나 계단을 오르기 매우 어려워해요"],
      play: [["색깔 모으기", "빨래 개면서 같은 색 양말 짝 찾기를 해 보세요."], ["따라 그리기", "큰 종이에 동그라미·선을 먼저 그리고 따라 그리게 해요."], ["역할 놀이", "가게 놀이로 '주세요·여기 있어요' 주고받기를 연습해요."], ["몸 놀이", "제자리 뛰기, 이불 위 구르기로 균형 감각을 길러요."]],
    },
    {
      id: "a3", label: "3~4세", title: "만 3세",
      items: {
        gross: ["세발자전거 페달을 밟는다", "한 발로 잠깐 선다", "계단을 한 발씩 번갈아 오른다"],
        fine: ["동그라미를 그린다", "가위로 종이를 자르기 시작한다", "단추를 끼워 보려 한다"],
        cog: ["셋까지 수를 센다", "그림을 보고 무엇을 하는 장면인지 말한다", "'왜?'라는 질문을 자주 한다"],
        lang: ["문장으로 대화를 주고받는다", "처음 보는 사람도 말을 대부분 알아듣는다", "간단한 노래나 동요를 부른다"],
        social: ["친구와 역할 놀이를 한다", "차례 지키기를 조금씩 한다", "속상한 친구를 달래려 한다"],
        self: ["낮에는 대소변을 대부분 가린다", "혼자 옷을 벗고 간단한 옷을 입는다", "손을 씻고 닦는다"],
      },
      flags: ["다른 사람이 아이 말을 거의 알아듣지 못해요", "간단한 지시를 따르지 못해요", "또래와 어울리려 하지 않고 혼자 있으려고만 해요", "작은 물건을 다루거나 그리기를 매우 어려워해요"],
      play: [["이야기 이어 말하기", "그림책을 보며 '다음엔 어떻게 될까?' 물어보세요."], ["가위·풀 놀이", "안전 가위로 색종이를 자르고 붙여 작품을 만들어요."], ["순서 놀이", "간단한 보드게임으로 차례와 규칙을 익혀요."], ["놀이터 놀이", "미끄럼틀, 그네를 타며 몸의 균형을 키워요."]],
    },
    {
      id: "a4", label: "4~5세", title: "만 4세",
      items: {
        gross: ["한 발로 깡충 뛴다", "던져 준 큰 공을 잡는다", "몸을 흉내 내어 체조를 따라 한다"],
        fine: ["머리·몸·팔다리가 있는 사람을 그린다", "선을 따라 가위질한다", "십자(+) 모양을 보고 그린다"],
        cog: ["다섯 개 이상 물건을 센다", "색 이름을 여러 개 안다", "'같다·다르다'를 설명한다"],
        lang: ["있었던 일을 순서대로 이야기한다", "'만약 ~하면' 같은 문장을 쓴다", "짧은 이야기를 듣고 내용을 말한다"],
        social: ["규칙이 있는 놀이를 친구와 한다", "양보와 협동을 한다", "좋아하는 친구가 생긴다"],
        self: ["스스로 옷을 입고 벗는다", "숟가락·포크를 잘 사용한다", "혼자 화장실을 이용한다 (도움 조금)"],
      },
      flags: ["자기 경험을 말로 이야기하지 못해요", "또래와 함께하는 놀이에 거의 참여하지 못해요", "그림 그리기, 가위질처럼 손 쓰는 활동을 매우 어려워해요", "지나치게 산만하거나 공격적인 행동이 계속돼요"],
      play: [["요리 돕기", "재료 세기, 섞기, 순서 말하기를 함께 해요."], ["사람 그리기", "가족 얼굴을 그리며 눈·코·입·팔다리를 이야기해요."], ["규칙 게임", "'무궁화 꽃이 피었습니다'로 멈추기와 기다리기를 연습해요."], ["하루 이야기", "잠자리에서 오늘 있었던 일을 순서대로 말해 보게 해요."]],
    },
    {
      id: "a5", label: "5~6세", title: "만 5세",
      items: {
        gross: ["한 발로 여러 번 뛰거나 스킵을 한다", "줄넘기나 공 튀기기를 시도한다", "균형대 위를 걷는다"],
        fine: ["자기 이름을 쓰려 한다", "네모·세모를 보고 그린다", "젓가락을 써 보려 한다"],
        cog: ["10까지 세고 수의 많고 적음을 안다", "글자와 숫자에 관심을 보인다", "간단한 규칙을 이해하고 설명한다"],
        lang: ["완전한 문장으로 자연스럽게 말한다", "이야기를 지어내어 말한다", "모르는 낱말의 뜻을 묻는다"],
        social: ["친구와 역할을 나누어 협동 놀이를 한다", "규칙을 지키고 차례를 기다린다", "다른 사람의 기분을 헤아린다"],
        self: ["세수·양치를 대부분 혼자 한다", "신발을 바른 쪽으로 신는다", "자기 물건을 챙긴다"],
      },
      flags: ["문장으로 말하기 어렵거나 발음을 알아듣기 매우 힘들어요", "간단한 규칙이 있는 놀이를 따라가지 못해요", "몸을 쓰는 활동에서 또래보다 눈에 띄게 서툴러요", "새로운 환경이나 변화에 적응하기 매우 힘들어해요"],
      play: [["글자 찾기", "간판이나 그림책에서 아이 이름 글자를 함께 찾아요."], ["보드게임", "주사위 게임으로 수 세기와 규칙 지키기를 익혀요."], ["이야기 만들기", "그림 카드 3장을 골라 이야기를 지어 보게 해요."], ["심부름", "'수저 네 벌 놓아 줄래?'처럼 수와 순서가 있는 심부름을 맡겨요."]],
    },
  ];

  const tabs = document.getElementById("age-tabs");
  const panel = document.getElementById("age-panel");
  const state = {};
  let current = AGES[1];

  tabs.innerHTML = AGES.map((a, i) => `<button type="button" role="tab" id="tab-${a.id}" aria-controls="age-panel" aria-selected="${i === 1}">${a.label}</button>`).join("");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    current = AGES.find((a) => "tab-" + a.id === b.id);
    tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    render();
  });

  function render() {
    const a = current;
    state[a.id] = state[a.id] || {};
    panel.innerHTML = `
      <h2 class="sr-only">${a.title} 발달 특징</h2>
      <div class="dev-grid">
        ${DOMAINS.map((d) => `
          <div class="dev-card">
            <h3><i style="--c:${d.c}"></i>${d.name}</h3>
            <ul>${a.items[d.key].map((t, i) => {
              const id = `${a.id}-${d.key}-${i}`;
              return `<li><input type="checkbox" id="${id}" ${state[a.id][id] ? "checked" : ""}><label for="${id}">${SEE.esc(t)}</label></li>`;
            }).join("")}</ul>
          </div>`).join("")}
      </div>
      <div class="flag-box">
        <h3>이런 모습이 보이면 전문가와 상담해 보세요</h3>
        <ul>${a.flags.map((f) => `<li>${SEE.esc(f)}</li>`).join("")}</ul>
        <p style="margin-top:10px;color:#6a2a22">걱정되는 모습이 있다면 <a href="step2.html"><strong>2단계 선별검사</strong></a>로 확인하고, 소아청소년과 의사나 거주지 <a href="step5.html?type=center"><strong>특수교육지원센터</strong></a>에 상담해 보세요.</p>
      </div>
      <div class="play-box">
        <h3>집에서 이렇게 놀아 주세요</h3>
        <div class="play-list">${a.play.map(([t, d]) => `<div><b>${SEE.esc(t)}</b>${SEE.esc(d)}</div>`).join("")}</div>
      </div>`;
    panel.querySelectorAll("input[type=checkbox]").forEach((c) =>
      c.addEventListener("change", () => { state[a.id][c.id] = c.checked; summary(); })
    );
    summary();
  }

  function summary() {
    const a = current;
    const total = DOMAINS.reduce((n, d) => n + a.items[d.key].length, 0);
    const done = Object.values(state[a.id] || {}).filter(Boolean).length;
    document.getElementById("meter").style.width = (done / total) * 100 + "%";
    document.getElementById("check-text").textContent = `${a.label}: ${total}개 중 ${done}개 체크 · 체크 개수는 점수가 아니라 관찰을 돕는 기록입니다.`;
  }

  document.getElementById("save-obs").addEventListener("click", () => {
    const a = current;
    const blocks = [
      { p: `연령 구간: ${a.label} (${a.title}) · 관찰일: ${SEE.today()}` },
      { note: "체크 표시(■)는 보호자가 관찰한 모습, □는 아직 관찰되지 않은 모습입니다. 진단 결과가 아닙니다." },
    ];
    DOMAINS.forEach((d) => {
      blocks.push({ h: d.name });
      blocks.push({ ul: a.items[d.key].map((t, i) => `${state[a.id]?.[`${a.id}-${d.key}-${i}`] ? "■" : "□"} ${t}`) });
    });
    blocks.push({ h: "상담을 권하는 신호" }, { ul: a.flags });
    blocks.push({ h: "보호자 메모" }, { p: "________________________________________________" }, { p: "________________________________________________" });
    const title = `우리 아이 발달 관찰 기록 (${a.label})`;
    openSaveMenu(title, blocks);
  });

  function openSaveMenu(title, blocks) {
    let dlg = document.getElementById("save-dlg");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "save-dlg";
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = `<div class="dlg-head"><h2>관찰 기록 저장</h2></div>
      <div class="dlg-body"><p>상담이나 검진 때 가져가면 아이 모습을 설명하는 데 도움이 됩니다. 저장 형식을 고르세요.</p></div>
      <div class="dlg-foot">${SEE.saveButtons("obs")}<button class="btn btn-sm btn-navy" type="button" value="close">닫기</button></div>`;
    dlg.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => { SEE.saveAs(b.dataset.save, title, blocks); dlg.close(); }));
    dlg.querySelector('[value="close"]').addEventListener("click", () => dlg.close());
    dlg.showModal();
  }

  const hash = location.hash.replace("#", "");
  const byHash = AGES.find((a) => a.id === hash);
  if (byHash) { current = byHash; tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x.id === "tab-" + hash))); }
  render();
})();

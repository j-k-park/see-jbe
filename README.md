# SEE 우리 아이 성장 길잡이

전북특별자치도교육청 영유아 특수교육 조기지원 웹앱입니다. 발달이 걱정되는 보호자가
① 발달 정보 확인 → ② 선별검사 → ③ 결과별 가이드 → ④ 특수교육대상자 선정 절차·지원 → ⑤ 지역 기관 찾기
순서로 필요한 정보를 찾고, AI 상담 **SEE**에게 질문하고, 안내 자료를 PDF·워드·CSV로 내려받을 수 있습니다.

- 주소: https://see.jbedu.ai.kr
- 구성: 정적 HTML/CSS/JS + Netlify Functions(`netlify/functions`)
- AI: Anthropic Claude(`@anthropic-ai/sdk`), 서버 함수에서만 호출 — API 키는 Netlify 환경변수에만 둡니다
- 로그인: Google Identity Services(구글 로그인). 서버가 ID 토큰 서명을 매 요청 검증합니다
- 지도: Leaflet + OpenStreetMap

## 환경변수 (Netlify)

| 이름 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API 키 (비밀값, 코드·저장소에 넣지 않음) |
| `GOOGLE_CLIENT_ID` | 구글 OAuth 웹 클라이언트 ID (공개값) |
| `SEE_MODEL` | 사용할 모델, 기본 `claude-haiku-4-5` |
| `GATEWAY_BASE_URL` | (선택) 멀티 LLM 게이트웨이의 Anthropic 호환 주소. 넣으면 이쪽을 먼저 쓰고, 실패하면 Anthropic 직접 연결로 자동 전환 |
| `GATEWAY_API_KEY` | (선택, 비밀값) 게이트웨이 API 키 |
| `GATEWAY_MODEL` | (선택) 게이트웨이에서 쓸 모델 이름, 기본 `claude-haiku-4-5` |
| `GATEWAY_PROMPT_CACHE` | (선택) `off`면 프롬프트 캐싱 미사용 — 캐싱을 지원하지 않는 중계·모델용 |
| `GATEWAY_TOOL_CHOICE_NONE` | (선택) `off`면 마지막 턴의 `tool_choice: none`을 보내지 않음 |
| `GATEWAY_OFF` | (선택) `true`면 게이트웨이 설정을 남겨 둔 채 Anthropic 직접 연결만 사용 |
| `DAILY_LIMIT` | 계정당 하루 질문 수, 기본 30 |
| `DAILY_TOTAL_LIMIT` | 전체 하루 질문 수 상한, 기본 2000 |

## 기관 데이터 갱신

`scripts/build_data.py`의 목록(특수학급 현황 등)과 `scripts/sources_alimi.json`(유치원알리미 주소·전화)을 고친 뒤
`python scripts/build_data.py`를 실행하면 `data/institutions.json`이 다시 만들어집니다(좌표는 OpenStreetMap Nominatim).

## 로컬 실행

```
npm install
npx netlify-cli dev
```

`.env`에 `SEE_ALLOW_ANON=true`를 두면 로컬(`netlify dev`)에서만 로그인 없이 채팅 화면을 볼 수 있습니다.

## 자료 출처

장애인 등에 대한 특수교육법(국가법령정보센터), 전북특별자치도교육청 특수교육지원센터 누리집(2026년도 특수학급 현황, 특수학교 설치 현황,
선정·배치, 치료지원, 순회교육, 특수교육인력지원), 유치원알리미 정보공시, 각 교육지원청 누리집, 인싸이트·국민건강보험공단 검사 안내 (2026년 9월 확인).

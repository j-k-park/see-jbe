"""기관 데이터(data/institutions.json)를 만든다.

출처
- 특수학교 설치 현황, 2026년도 특수학급 현황: 전북특별자치도교육청 특수교육지원센터 누리집
  https://www.jbe.go.kr/special/  (2026-09-15 확인)
- 교육지원청 주소·연락처: 각 교육지원청 누리집 하단 정보 (2026-09-15 확인)
- 유치원·어린이집 주소·전화: 유치원알리미 통합조회 → scripts/sources_alimi.json (2026-09-15 확인)

좌표는 OpenStreetMap Nominatim으로 찾고 data/geocache.json에 저장한다(1초에 1건).
찾지 못한 기관은 좌표 없이 목록에만 나온다.
실행: python scripts/build_data.py
"""
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "geocache.json"
OUT = ROOT / "data" / "institutions.json"
SRC_SPECIAL = "전북특별자치도교육청 특수교육지원센터 누리집(2026)"

REGIONS = ["전주", "군산", "익산", "정읍", "남원", "김제", "완주", "진안", "무주", "장수", "임실", "순창", "고창", "부안"]
REGION_FULL = {r: (r + "시" if r in ("전주", "군산", "익산", "정읍", "남원", "김제") else r + "군") for r in REGIONS}

# 교육지원청(특수교육지원센터가 함께 있음)
CENTERS = [
    ("전주", "전북특별자치도 전주시 덕진구 태진로 100", "063-270-6114", "대표번호", "http://www.jbjje.kr/"),
    ("군산", "전북특별자치도 군산시 조촌로 22", "063-450-2624", "교육지원과", "http://www.jbgse.kr/"),
    ("익산", "전북특별자치도 익산시 중앙로 127", "063-850-8818", "교육지원과", "http://www.jbise.kr/"),
    ("정읍", "전북특별자치도 정읍시 충정로 276", "063-530-3067", "교육지원과", "http://www.jbjue.kr/"),
    ("남원", "전북특별자치도 남원시 남문로 373", "063-620-7816", "교육지원과", "http://www.jbnwe.kr/"),
    ("김제", "전북특별자치도 김제시 요촌북로 70", "063-540-2566", "교육지원과", "http://www.jbgje.go.kr/"),
    ("완주", "전북특별자치도 완주군 용진읍 지암로 65", "063-270-7606", "특수교육지원센터", "http://www.jbwje.kr/"),
    ("진안", "전북특별자치도 진안군 진안읍 학천변길 47", "063-430-6213", "교육지원과", "http://www.jbjae.kr/"),
    ("무주", "전북특별자치도 무주군 무주읍 단천로5길 22", "063-320-5100", "대표번호", "http://www.jbmje.kr/"),
    ("장수", "전북특별자치도 장수군 장수읍 호비로 50", "063-350-5245", "대표번호", "http://www.jbjse.kr/"),
    ("임실", "전북특별자치도 임실군 임실읍 봉황로 247", "063-640-3514", "교육지원과", "http://www.jbime.kr/"),
    ("순창", "전북특별자치도 순창군 순창읍 장류로 383", "063-650-6311", "교육지원과", "http://www.jbsce.kr/"),
    ("고창", "전북특별자치도 고창군 고창읍 중앙로 258", "063-560-1684", "특수교육지원센터", "http://www.jbgce.kr/"),
    ("부안", "전북특별자치도 부안군 부안읍 매창로 113", "063-580-7424", "교육지원과", "http://www.jbbae.go.kr/"),
]

# 특수학교: 이름, 설립, 주 장애영역, 과정(유초중고전공), 주소, 전화
SPECIAL = [
    ("전주유화학교", "공립", "지적장애·발달지체", "유", "전북특별자치도 전주시 덕진구 모래내6길 26-16", "063-253-1238", "전주"),
    ("전주선화학교", "공립", "청각장애·지적장애", "초중고전공", "전북특별자치도 전주시 완산구 효자로 39", "063-220-0508", "전주"),
    ("전주은화학교", "공립", "지적장애", "초중고전공", "전북특별자치도 전주시 완산구 효자로 28-20", "063-220-0902", "전주"),
    ("군산명화학교", "공립", "지적장애", "유초중고전공", "전북특별자치도 군산시 상나운1길 37", "063-462-2159", "군산"),
    ("다솜학교", "공립", "지적장애", "초중고전공", "전북특별자치도 정읍시 정읍남로 1146", "063-530-4551", "정읍"),
    ("한울학교", "공립", "지적장애", "초중고전공", "전북특별자치도 남원시 이백면 이백로 315", "063-630-6341", "남원"),
    ("덕유샘학교", "공립", "장애영역 통합", "중고전공", "전북특별자치도 장수군 계북면 장무로 1326", "063-350-5231", "장수"),
    ("동암차돌학교", "사립", "지체장애", "초중고전공", "전북특별자치도 전주시 완산구 천잠로 275", "063-223-4443", "전주"),
    ("전북맹아학교", "사립", "시각장애", "초중고전공", "전북특별자치도 익산시 서동로46길 41", "063-833-2621", "익산"),
    ("전북푸른학교", "사립", "지체장애", "초중고전공", "전북특별자치도 완주군 고산면 대아저수로 157-11", "063-263-2600", "완주"),
    ("전북혜화학교", "사립", "지적장애", "유초중고전공", "전북특별자치도 익산시 덕기길 77", "063-839-5312", "익산"),
]

# 2026년도 유치원 특수학급 현황 (괄호 안 숫자 = 학급 수, 없으면 1학급)
KINDER_RAW = {
    "전주": "전주문정유(3), 전주늘품유(3), 전주새뜰유(3), 전주새솔유(2), 전주성현유(2), 전주솔내유(2), 전주온샘유, 전주유, 전주푸른샘유(3), 전주풍남유, 전주홍산유, 전주남초병설유, 전주삼천남초병설유, 전주서원초병설유, 전주양현초병설유, 전주여울초병설유, 전주자연초병설유, 전주하가초병설유, 전주화정초병설유, 전주효천초병설유",
    "군산": "군산가람유(3), 군산도담유(3), 군산바다유, 군산새빛유(3), 군산중앙유(2), 군산신흥초병설유",
    "익산": "이리유(3), 익산맑은샘유(6), 익산솜리유(3), 익산부송유(3), 이리부천초병설유, 익산가온초병설유",
    "정읍": "정읍연지유(2), 신태인초병설유",
    "남원": "남원참사랑유, 남원노암초병설유",
    "김제": "김제제일유, 김제동초병설유, 김제초병설유, 황강초병설유",
    "완주": "봉동유(2), 봉서유, 삼봉유, 운곡마루유, 삼례중앙초병설유",
    "진안": "진안마이꿈유",
    "무주": "무주반디유",
    "장수": "장수한사랑유(2)",
    "임실": "임실둥지유",
    "순창": "순창옥천유",
    "고창": "고창꿈푸른유",
    "부안": "부안해오름유, 곰소초병설유",
}


def parse_kinder():
    rows = []
    for region, raw in KINDER_RAW.items():
        for item in [s.strip() for s in raw.split(",") if s.strip()]:
            classes = 1
            if "(" in item:
                item, n = item.rstrip(")").split("(")
                classes = int(n)
            if item.endswith("초병설유"):
                school = item[: -len("병설유")] + "등학교"
                name = school + " 병설유치원"
                kind = "병설"
                query = school
            else:
                name = item[:-1] + "유치원"
                kind = "단설"
                query = name
            rows.append({"key": item, "name": name, "kind": kind, "classes": classes, "region": region, "query": query})
    return rows


def locate(addr, names, region, cache):
    """주소 → 기관명 → 도로명(대략) 순서로 좌표를 찾는다. (좌표, 대략여부)"""
    a = addr.replace("전북특별자치도 ", "")
    pt = geocode(a, cache)
    if in_jeonbuk(pt) and not far_from_center(pt, region):
        return pt, False
    for n in names:
        pt = geocode(n, cache, region)
        if in_jeonbuk(pt) and not far_from_center(pt, region):
            return pt, False
    road = " ".join(a.split()[:-1])
    pt = geocode(road, cache)
    if in_jeonbuk(pt) and not far_from_center(pt, region):
        return pt, True
    return None, False


def load_cache():
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def geocode(q, cache, region=None):
    key = q if region is None else f"{q}|{region}"
    if key in cache:
        return cache[key]
    params = {"q": q if region is None else f"{q} {REGION_FULL[region]}", "format": "jsonv2", "limit": 1, "countrycodes": "kr", "accept-language": "ko"}
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "see-jbe-data-builder/1.0 (jeonbuk education office app)"})
    time.sleep(1.1)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.load(r)
    except Exception as e:  # 네트워크 오류는 좌표 없이 진행
        print("  ! 오류", q, e)
        return None
    hit = [float(res[0]["lat"]), float(res[0]["lon"])] if res else None
    cache[key] = hit
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    return hit


def in_jeonbuk(pt):
    return bool(pt) and 35.2 < pt[0] < 36.2 and 126.3 < pt[1] < 127.95


CENTER_PT = {}


def far_from_center(pt, region, km=32):
    """교육지원청 좌표에서 너무 먼 결과(동명 기관 오검색)를 걸러낸다."""
    c = CENTER_PT.get(region)
    if not c:
        return False
    dy = (pt[0] - c[0]) * 111
    dx = (pt[1] - c[1]) * 91
    return (dx * dx + dy * dy) ** 0.5 > km


def main():
    cache = load_cache()
    items = []

    for region, addr, phone, phone_label, url in CENTERS:
        pt = geocode(addr.replace("전북특별자치도 ", ""), cache)
        if not in_jeonbuk(pt):
            pt = geocode(f"{region}교육지원청", cache, region)
        if in_jeonbuk(pt):
            CENTER_PT[region] = pt
        items.append({
            "id": f"center-{region}", "type": "center", "name": f"{region}교육지원청 특수교육지원센터",
            "region": region, "address": addr, "phone": phone, "phoneLabel": phone_label, "url": url,
            "services": ["진단·평가", "선정·배치 상담", "순회교육", "치료지원"],
            "note": "특수교육대상자 진단·평가 의뢰와 상담의 첫 창구입니다.", "source": "각 교육지원청 누리집",
            "latlng": pt if in_jeonbuk(pt) else None,
        })

    for name, found, area, course, addr, phone, region in SPECIAL:
        pt, approx = locate(addr, [name], region, cache)
        services = ["특수학교"] + (["유치원 과정"] if "유" in course else [])
        items.append({
            "id": f"special-{name}", "type": "special", "name": name, "region": region, "founding": found,
            "address": addr, "phone": phone, "area": area,
            "courses": list(course.replace("전공", "")) + (["전공"] if "전공" in course else []),
            "services": services, "source": SRC_SPECIAL, "latlng": pt,
            **({"approx": True} if approx else {}),
        })

    alimi = json.loads((ROOT / "scripts" / "sources_alimi.json").read_text(encoding="utf-8"))
    for k in parse_kinder():
        phone, addr = alimi["kinder"][k["key"]]
        short = k["query"][len(k["region"]):] if k["query"].startswith(k["region"]) else k["query"]
        pt, approx = locate(addr, [k["query"], short], k["region"], cache)
        items.append({
            "id": f"kinder-{k['name']}", "type": "kinder", "name": k["name"], "region": k["region"],
            "founding": "공립", "kinderKind": k["kind"], "classes": k["classes"], "address": addr, "phone": phone,
            "services": ["유치원 특수학급", "통합교육"], "source": SRC_SPECIAL + " · 유치원알리미",
            "latlng": pt, **({"approx": True} if approx else {}),
        })

    for key, sub, label in (("daycare_special", "special", "장애아전문"), ("daycare_inclusive", "inclusive", "장애아통합")):
        for name, found, phone, addr, region in alimi[key]:
            pt, approx = locate(addr, [name], region, cache)
            items.append({
                "id": f"daycare-{name}", "type": "daycare", "daycareKind": sub, "name": name, "region": region,
                "founding": found, "address": addr, "phone": phone,
                "services": [f"{label} 어린이집"], "source": "어린이집 정보공시(유치원알리미 통합조회)",
                "latlng": pt, **({"approx": True} if approx else {}),
            })

    OUT.write_text(json.dumps({"updated": "2026-09-15", "regions": REGIONS, "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    missing = [i["name"] for i in items if not i["latlng"]]
    print(f"총 {len(items)}곳, 좌표 없음 {len(missing)}곳")
    for m in missing:
        print("  -", m)


if __name__ == "__main__":
    main()

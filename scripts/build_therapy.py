"""치료지원(꿈활짝카드) 가맹점 목록(data/therapy.json)을 만든다.

원자료: 이영미 장학사 제공 「2026.5.1.자 치료지원 가맹점 현황(지역별)타지역 정리」 엑셀 (2026-09-16 수령)
공개 원칙: 가맹점명·시군·주소(원자료가 도로명까지만 있음)·일반전화만 쓴다.
          사업자번호, 가맹점번호, 010 휴대폰 번호는 싣지 않는다. 상태가 '정상'인 곳만 싣는다.
실행: python scripts/build_therapy.py "<엑셀 경로>"
"""
import json
import pathlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "therapy.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
REGIONS = ["전주", "군산", "익산", "정읍", "남원", "김제", "완주", "진안", "무주", "장수", "임실", "순창", "고창", "부안"]


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_rows(path):
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheet = wb.find("m:sheets", NS)[0]
    target = rels[sheet.get(REL)].lstrip("/")
    target = target if target.startswith("xl/") else "xl/" + target
    empty = 0
    for _, el in ET.iterparse(z.open(target)):
        if el.tag != "{%s}row" % NS["m"]:
            continue
        row = {}
        for c in el.findall("m:c", NS):
            v = c.find("m:v", NS)
            if v is None:
                continue
            row[col_index(c.get("r"))] = ss[int(v.text)] if c.get("t") == "s" else v.text
        el.clear()
        if not row:
            empty += 1
            if empty > 200:
                break
            continue
        empty = 0
        yield row


def phone(*vals):
    for v in vals:
        d = re.sub(r"\D", "", v or "")
        if not d or d.startswith("010"):
            continue  # 개인 휴대폰은 싣지 않음
        if d.startswith("02"):
            return f"02-{d[2:-4]}-{d[-4:]}"
        if len(d) in (10, 11):
            return f"{d[:3]}-{d[3:-4]}-{d[-4:]}"
        if len(d) == 8:
            return f"{d[:4]}-{d[4:]}"
    return ""


def region_of(addr):
    a = addr.replace("전라북도", "전북").replace("전북특별자치도", "전북")
    if a.startswith("전북"):
        for r in REGIONS:
            if r in a.split()[1] if len(a.split()) > 1 else False:
                return r, True
    first = a.split()[0] if a.split() else "기타"
    return first, False


def main(path):
    items, seen = [], set()
    for row in read_rows(path):
        name = re.sub(r"\s*\(중복\)\s*$", "", (row.get(2) or "").strip())  # 가맹점번호가 둘인 같은 기관은 한 번만
        if not name or name == "가맹점명" or not (row.get(0) or "").strip().isdigit():
            continue
        if (row.get(6) or "").strip() != "정상":
            continue
        addr = re.sub(r"\s+", " ", (row.get(7) or "").strip())
        region, local = region_of(addr)
        key = (name, addr)
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "name": name,
            "region": region,
            "local": local,
            "address": addr.replace("전라북도", "전북특별자치도"),
            "phone": phone(row.get(10), row.get(9)),
            "rehab": (row.get(3) or "").strip().upper() == "O",
        })
    items.sort(key=lambda i: (not i["local"], REGIONS.index(i["region"]) if i["local"] else 99, i["region"], i["name"]))
    counts = {}
    for i in items:
        k = i["region"] if i["local"] else "도외"
        counts[k] = counts.get(k, 0) + 1
    OUT.write_text(json.dumps({"asOf": "2026-05-01", "source": "전북특별자치도교육청 치료지원(꿈활짝카드) 가맹점 현황(2026.5.1.)", "counts": counts, "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"가맹점 {len(items)}곳 (도내 {sum(1 for i in items if i['local'])}곳)")
    print(counts)


if __name__ == "__main__":
    main(sys.argv[1])

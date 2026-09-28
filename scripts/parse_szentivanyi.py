#!/usr/bin/env python3
"""Pull surname pairs out of the OCR of Szentiványi, Századunk névváltoztatásai (1895).

The book is public domain. The transcript is uneven, so this keeps only rows
where both the original surname and the adopted surname read as names.
"""

from __future__ import annotations

import collections
import json
import re
import sys
import urllib.request
from pathlib import Path

SRC_URL = (
    "https://archive.org/download/szzadunknvv00magyuoft/"
    "szzadunknvv00magyuoft_djvu.txt"
)

NEW_RE = re.compile(
    r"(?<![A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])"
    r"([A-ZÁÉÍÓÖŐÚÜŰ][A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű'’\-]{1,28}"
    r"(?:-[A-ZÁÉÍÓÖŐÚÜŰ][A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű'’\-]{1,24})?)"
    r"\s+"
    r"[\(\[\<\{\*]"
)

REF_RE = re.compile(
    r"(?<![A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])"
    r"((?:BM|B\.?\s?M|UK|HT|BML|BSL|ML))"
    r"\.?\s+"
    r"[0-9]"
    r"[0-9A-Za-zÍí\.\,\s]{0,12}"
    r"(?:[—\-–/]\s*)?"
    r"[0-9]{2}"
    r"\.?",
    re.I,
)

STOP = {
    "budapest",
    "bpest",
    "buda",
    "pest",
    "gyerm",
    "gyermek",
    "testver",
    "testvér",
    "nevaltoztatasok",
    "nevvaltoztatasok",
}

VOWELS = set("aeiouyáéíóöőúüűAEIOUYw")


def clean_name(value: str) -> str:
    value = value.replace("^", "").replace("~", "").replace("*", "")
    value = value.replace("_", "").replace("«", "").replace("»", "")
    value = re.sub(r"\s+", " ", value).strip(" .;,-–—\"'`")
    value = re.sub(r"\s+dr\.?$", "", value, flags=re.I)
    value = re.sub(r"^dr\.?\s+", "", value, flags=re.I)
    return value.strip(" .;")


def letters(value: str) -> str:
    return re.sub(r"[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]", "", value)


def ok_name(value: str) -> bool:
    if not value or not re.match(r"^[A-ZÁÉÍÓÖŐÚÜŰ]", value):
        return False
    if re.search(r"[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\-\.'’ ]", value):
        return False
    core = letters(value)
    if not 3 <= len(core) <= 28:
        return False
    if core.casefold() in STOP:
        return False
    vowels = sum(1 for ch in core if ch in VOWELS)
    if vowels == 0:
        return False
    if len(core) >= 6 and vowels / len(core) < 0.18:
        return False
    return True


def year_of(ref: str | None) -> int | None:
    if not ref:
        return None
    match = re.search(r"[—\-–/]\s*(\d{2})\s*\.?$", ref.strip())
    if not match:
        match = re.search(r"(\d{2})\s*\.?$", ref.strip())
    if not match:
        return None
    year = 1800 + int(match.group(1))
    if 1800 <= year <= 1893:
        return year
    return None


def read_old(rest: str) -> tuple[str, str] | None:
    closed = re.match(r"([A-ZÁÉÍÓÖŐÚÜŰ][^)\]>]{1,46}?)[)\]>]", rest)
    if closed and 2 <= len(closed.group(1)) <= 46:
        return closed.group(1), rest[closed.end() :]
    fallback = re.match(
        r"([A-ZÁÉÍÓÖŐÚÜŰ][A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű'’\-\. ]{1,36}?)"
        r"[iI\^O]"
        r"(?=\s+[A-ZÁÉÍÓÖŐÚÜŰ])",
        rest,
    )
    if fallback:
        return fallback.group(1), rest[fallback.end() :]
    return None


def trim_detail(detail: str) -> str:
    detail = re.split(r"\s(?:BM|B\.?\s?M|UK|HT|BML)\b", detail, maxsplit=1, flags=re.I)[0]
    detail = re.sub(r"\s+", " ", detail).strip(" .,-;")
    return detail[:160]


def load_text(path: Path) -> str:
    if path.exists() and path.stat().st_size > 1000:
        return path.read_text(errors="replace")
    print(f"downloading {SRC_URL}", file=sys.stderr)
    with urllib.request.urlopen(SRC_URL, timeout=120) as response:
        data = response.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data.decode("utf-8", errors="replace")


def extract(text: str) -> list[dict]:
    start = text.find("NÉVVÁLTOZTATÁSOK.")
    if start < 0:
        raise SystemExit("entry section not found")
    body = text[start:]
    end = body.find("KÖNYVKERESKED")
    if end > 0:
        body = body[:end]
    flat = re.sub(r"\s+", " ", body)
    flat = re.sub(r"NÉVVÁLTOZTATÁSOK\.?", " ", flat)

    starts = list(NEW_RE.finditer(flat))
    refs = list(REF_RE.finditer(flat))
    ref_index = 0
    records: list[dict] = []
    seen: set[tuple] = set()

    for index, match in enumerate(starts):
        parsed = read_old(flat[match.end() :])
        if not parsed:
            continue
        old_raw, _tail = parsed
        new_name = clean_name(match.group(1))
        old_name = clean_name(old_raw)
        if len(old_name.split()) > 3:
            continue
        if not ok_name(new_name) or not ok_name(old_name):
            continue
        if letters(new_name).casefold() == letters(old_name).casefold():
            continue

        next_at = starts[index + 1].start() if index + 1 < len(starts) else match.end() + 220
        while ref_index < len(refs) and refs[ref_index].start() < match.start():
            ref_index += 1
        ref = None
        if ref_index < len(refs) and refs[ref_index].start() < next_at + 8:
            ref = re.sub(r"\s+", " ", refs[ref_index].group()).strip()
            detail_end = min(next_at, refs[ref_index].start())
        else:
            detail_end = next_at

        closer_end = match.end() + (len(flat[match.end() :]) - len(_tail))
        detail = trim_detail(flat[closer_end:detail_end])
        year = year_of(ref)
        key = (new_name.casefold(), old_name.casefold(), year or 0, detail[:24].casefold())
        if key in seen:
            continue
        seen.add(key)
        records.append(
            {
                "id": f"sz-{len(records) + 1}",
                "corpus": "19",
                "uj": new_name,
                "eredeti": old_name,
                "reszlet": detail,
                "ev": year,
                "hivatkozas": (ref or "")[:48],
            }
        )
    return records


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/szazadunk.txt")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/szentivanyi.json")
    records = extract(load_text(src))
    decades = collections.Counter((record["ev"] or 0) // 10 * 10 for record in records)
    payload = {
        "forras": {
            "cim": "Századunk névváltoztatásai",
            "alcim": "Helytartósági és miniszteri engedéllyel megváltoztatott nevek gyűjteménye, 1800–1893",
            "osszeallito": "Szentiványi Zoltán",
            "kiadas": "Budapest, Hornyánszky, 1895",
            "szazad": "19",
            "url": "https://mek.oszk.hu/07400/07431/",
            "szoveg": "https://archive.org/details/szzadunknvv00magyuoft",
            "megjegyzes": (
                "A sorok a közkincs kötet OCR-szövegéből készültek, nem lektorált másolatok. "
                "A könyv valamivel több mint 15 000 változtatást sorol fel; itt azok vannak, "
                "amelyeknél mindkét vezetéknév kiolvasható volt."
            ),
        },
        "rekordok": records,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"records {len(records)} with_year {sum(1 for r in records if r['ev'])} "
        f"decades {sorted(decades.items())} bytes {out.stat().st_size}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()

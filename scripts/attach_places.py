#!/usr/bin/env python3
"""Fill város and megye on Szentiványi rows from the place named in the line."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fold(value: str) -> str:
    text = value.casefold()
    text = text.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o")
    text = text.replace("ö", "o").replace("ő", "o").replace("ú", "u").replace("ü", "u").replace("ű", "u")
    return re.sub(r"[^a-z0-9]", "", text)


def norm(detail: str) -> str:
    text = re.sub(r"\s+", " ", detail)
    replacements = (
        ("Buda- pest", "Budapest"),
        ("Buda-pest", "Budapest"),
        ("N.- Várad", "Nagyvárad"),
        ("N.-Várad", "Nagyvárad"),
        ("N. Várad", "Nagyvárad"),
        ("N.- Kanizsa", "Nagykanizsa"),
        ("N.-Kanizsa", "Nagykanizsa"),
        ("Nagy-Kanizsa", "Nagykanizsa"),
        ("N.- Károly", "Nagykároly"),
        ("N.-Károly", "Nagykároly"),
        ("Sz.- Fejérvár", "Székesfehérvár"),
        ("Sz.-Fejérvár", "Székesfehérvár"),
        ("Sz.- Fehérvár", "Székesfehérvár"),
        ("Sz.-Fehérvár", "Székesfehérvár"),
        ("S.-A.-Ujhely", "Sátoraljaújhely"),
        ("S.-A.-Újhely", "Sátoraljaújhely"),
        ("B.- Gyarmat", "Balassagyarmat"),
        ("B.-Gyarmat", "Balassagyarmat"),
        ("B.- Csaba", "Békéscsaba"),
        ("B.-Csaba", "Békéscsaba"),
        ("M.- Sziget", "Máramarossziget"),
        ("M.-Sziget", "Máramarossziget"),
        ("Zala-Egerszeg", "Zalaegerszeg"),
        ("Kis-Várda", "Kisvárda"),
    )
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def load_aliases() -> list[tuple[str, str, str]]:
    payload = json.loads((ROOT / "data" / "helyek.json").read_text(encoding="utf-8"))
    aliases: list[tuple[str, str, str]] = []
    for place in payload["telepulesek"]:
        names = [place["nev"], *place.get("alias", [])]
        for name in names:
            aliases.append((name, place["nev"], place["megye"]))
    aliases.sort(key=lambda item: len(item[0]), reverse=True)
    return aliases


def find_place(detail: str, aliases: list[tuple[str, str, str]]) -> tuple[str, str] | None:
    text = norm(detail)
    best: tuple[int, int, str, str] | None = None
    for alias, town, county in aliases:
        for match in re.finditer(rf"(?<![\wÁÉÍÓÖŐÚÜŰáéíóöőúüű]){re.escape(alias)}(?![\wÁÉÍÓÖŐÚÜŰáéíóöőúüű])", text):
            rank = (match.end(), len(alias))
            if best is None or rank > (best[0], best[1]):
                best = (match.end(), len(alias), town, county)
    if best is None:
        return None
    return best[2], best[3]


def main() -> None:
    path = ROOT / "data" / "szentivanyi.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    aliases = load_aliases()
    filled = 0
    for record in payload["rekordok"]:
        found = find_place(record.get("reszlet") or "", aliases)
        if not found:
            record.pop("hely", None)
            record.pop("megye", None)
            continue
        record["hely"], record["megye"] = found
        filled += 1
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"filled {filled} of {len(payload['rekordok'])}")


if __name__ == "__main__":
    main()

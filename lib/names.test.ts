import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  damerau,
  describeHit,
  indexEntries,
  looseKey,
  searchNames,
  searchPlaces,
  strictKey,
  type NameEntry,
} from "./names.ts"
import { bornInBudapest, isBudapest } from "./places.ts"

const rows: NameEntry[] = [
  {
    id: "1",
    corpus: "19",
    uj: "Korányi",
    eredeti: "Kohn",
    keresztnev: "Adolf",
    hely: "Csacza",
    megye: "Trencsén",
    ev: 1887,
    hivatkozas: "BM. 20939/87.",
  },
  {
    id: "2",
    corpus: "19",
    uj: "Aczél",
    eredeti: "Abeles",
    ev: 1887,
  },
  {
    id: "3",
    corpus: "19",
    uj: "Balog",
    eredeti: "Weisz",
    ev: 1890,
  },
  {
    id: "4",
    corpus: "20",
    uj: "Kovács",
    eredeti: "Schmidt",
    ev: 1924,
    imported: true,
  },
  {
    id: "5",
    corpus: "19",
    uj: "Ábrányi",
    eredeti: "Adler",
    ev: 1883,
  },
]

const indexed = indexEntries(rows)

test("orthography folds accents, cz, w/v, y/i and Weiss/Weisz", () => {
  assert.equal(strictKey("Aczél"), strictKey("Acél"))
  assert.equal(strictKey("Ábrányi"), strictKey("Abranyi"))
  assert.equal(strictKey("Weisz"), "veisz")
  assert.equal(looseKey("Weiss"), "veis")
  assert.equal(looseKey("Müller"), looseKey("Mueller"))
  assert.equal(looseKey("Bauer"), "bauer")
  assert.equal(strictKey("Schwarcz"), "svarc")
  assert.equal(strictKey("Kováts"), strictKey("Kovács"))
  assert.equal(strictKey("Tsászár"), strictKey("Császár"))
  assert.equal(strictKey("Nagy"), strictKey("Nagi"))
  assert.equal(strictKey("Korányi"), strictKey("Korányy"))
  assert.equal(strictKey("Wolf"), strictKey("Volf"))
  assert.equal(damerau("kohn", "khon"), 1)
})

test("place and given-name filters understand abbreviations", () => {
  const rows = indexEntries([
    {
      id: "p",
      corpus: "19",
      uj: "Kovács",
      eredeti: "Klein",
      hely: "Kisújszállás",
      megye: "Jász-Nagykun-Szolnok",
      reszlet: "Ferencz Kis-Új-Szállás",
    },
  ])
  const town = searchPlaces(rows, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    hely: "Kis-új-sz.",
  })
  assert.equal(town.total, 1)
  const county = searchPlaces(rows, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    megye: "Szolnok",
  })
  assert.equal(county.total, 1)
  const given = searchNames(rows, {
    query: "Kovács",
    field: "uj",
    corpus: "mind",
    strictness: "szoros",
    keresztnev: "Ferenc",
  })
  assert.equal(given.total, 1)
})

test("a town or a county does not need a surname", () => {
  const town = searchPlaces(indexed, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    hely: "Csacza",
  })
  assert.equal(town.shown.some((hit) => hit.entry.uj === "Korányi"), true)
  const withUnread = indexEntries([
    ...indexed.map((entry) => entry),
    {
      id: "sz-unread",
      corpus: "19",
      uj: "Ismeretlen",
      eredeti: "Rejtett",
      reszlet: "ocr szemét",
      keys: {
        ujStrict: "ismeretlen",
        ujLoose: "ismeretlen",
        eredetiStrict: "rejtett",
        eredetiLoose: "rejtett",
        detail: "ocrszemet",
        hely: "",
        keresztnev: "",
      },
    },
  ])
  const kept = searchPlaces(withUnread, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    hely: "Csacza",
  })
  assert.equal(kept.shown.some((hit) => hit.entry.id === "sz-unread"), true)
  const knownOnly = searchPlaces(withUnread, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    hely: "Csacza",
    placeRows: "known",
  })
  assert.equal(knownOnly.shown.some((hit) => hit.entry.id === "sz-unread"), false)
  assert.equal(knownOnly.shown.some((hit) => hit.entry.uj === "Korányi"), true)
  assert.ok(knownOnly.unread >= 1)
  const unreadOnly = searchPlaces(withUnread, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    hely: "Csacza",
    placeRows: "unread",
  })
  assert.equal(unreadOnly.shown.some((hit) => hit.entry.id === "sz-unread"), true)
  assert.equal(unreadOnly.shown.some((hit) => hit.entry.uj === "Korányi"), false)

  const county = searchPlaces(indexed, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    megye: "Trencsén",
  })
  assert.equal(county.total, 1)

  const empty = searchPlaces(indexed, {
    query: "",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    megye: "Zala",
  })
  assert.equal(empty.total, 0)
})

test("Kohn finds the adopted name and not the other field", () => {
  const onOriginal = searchNames(indexed, {
    query: "Kohn",
    field: "eredeti",
    corpus: "19",
    strictness: "laza",
  })
  assert.equal(onOriginal.total, 1)
  assert.equal(onOriginal.shown[0]?.entry.uj, "Korányi")

  const onAdopted = searchNames(indexed, {
    query: "Kohn",
    field: "uj",
    corpus: "mind",
    strictness: "laza",
  })
  assert.equal(onAdopted.total, 0)
})

test("excluding Budapest drops the capital and keeps Szeged", () => {
  assert.equal(isBudapest("Budapest"), true)
  assert.equal(isBudapest("Bpest"), true)
  assert.equal(isBudapest("Buda"), true)
  assert.equal(isBudapest("Pest"), true)
  assert.equal(isBudapest("Szeged"), false)
  assert.equal(isBudapest("Kecskemét"), false)
  const rows = indexEntries([
    { id: "bp", corpus: "19", uj: "Halasi", eredeti: "Fischer", hely: "Budapest", megye: "Budapest" },
    { id: "sz", corpus: "19", uj: "Darvas", eredeti: "Fischer", hely: "Szeged", megye: "Csongrád" },
    { id: "alias", corpus: "19", uj: "Bartos", eredeti: "Fischer", hely: "Bpest", megye: "Budapest" },
  ])
  const kept = searchNames(rows, {
    query: "Fischer",
    field: "eredeti",
    corpus: "mind",
    strictness: "szoros",
    budapestNelkul: true,
  })
  assert.deepEqual(kept.shown.map((hit) => hit.entry.id), ["sz"])

  assert.equal(bornInBudapest("Adolf szabómester Zágráb. szül. Pesten"), true)
  assert.equal(bornInBudapest("György pesti születésű udvari kamarai számtiszt"), true)
  assert.equal(bornInBudapest("Pálné szül. Farczalaics Terézifi"), false)
  assert.equal(bornInBudapest("Rozi szülésznő Bpest"), false)
  const born = searchNames(
    indexEntries([
      {
        id: "szuletett",
        corpus: "19",
        uj: "Halasi",
        eredeti: "Fischer",
        hely: "Szeged",
        megye: "Csongrád",
        reszlet: "Mór Szeged, szül. Budapesten",
      },
      {
        id: "nee",
        corpus: "19",
        uj: "Halasi",
        eredeti: "Fischer",
        hely: "Szeged",
        megye: "Csongrád",
        reszlet: "Pálné szül. Farczalaics Teréz",
      },
    ]),
    {
      query: "Fischer",
      field: "eredeti",
      corpus: "mind",
      strictness: "szoros",
      budapestNelkul: true,
    },
  )
  assert.deepEqual(born.shown.map((hit) => hit.entry.id), ["nee"])
})

test("Fischermann reaches Fischer in laza and not in szoros", () => {
  const rows = indexEntries([
    {
      id: "f",
      corpus: "19",
      uj: "Halasi",
      eredeti: "Fischer",
      hely: "Szeged",
      megye: "Csongrád",
      ev: 1884,
    },
  ])
  const loose = searchNames(rows, {
    query: "Fischermann",
    field: "eredeti",
    corpus: "mind",
    strictness: "laza",
  })
  assert.equal(loose.total, 1)
  const strict = searchNames(rows, {
    query: "Fischermann",
    field: "eredeti",
    corpus: "mind",
    strictness: "szoros",
  })
  assert.equal(strict.total, 0)
})

test("loose spelling still finds Aczél, Weisz and Ábrányi", () => {
  const acel = searchNames(indexed, {
    query: "Acel",
    field: "uj",
    corpus: "mind",
    strictness: "szoros",
  })
  assert.equal(acel.shown[0]?.entry.eredeti, "Abeles")

  const weiss = searchNames(indexed, {
    query: "Weiss",
    field: "eredeti",
    corpus: "mind",
    strictness: "laza",
  })
  assert.equal(weiss.shown[0]?.entry.uj, "Balog")
  assert.match(describeHit(weiss.shown[0]!.hits[0]!, "Weisz"), /eltérés|Írásváltozat/)

  const abranyi = searchNames(indexed, {
    query: "Abranyi",
    field: "uj",
    corpus: "mind",
    strictness: "szoros",
  })
  assert.equal(abranyi.shown[0]?.entry.uj, "Ábrányi")

  const ending = searchNames(indexed, {
    query: "Korányy",
    field: "uj",
    corpus: "mind",
    strictness: "szoros",
  })
  assert.equal(ending.shown[0]?.entry.uj, "Korányi")

  const cst = searchNames(
    indexEntries([{ id: "k", corpus: "19", uj: "Kovács", eredeti: "Klein" }]),
    { query: "Kováts", field: "uj", corpus: "mind", strictness: "szoros" },
  )
  assert.equal(cst.shown[0]?.entry.uj, "Kovács")
})

test("two names match original and adopted in either order", () => {
  const forward = searchNames(indexed, {
    query: "Kohn Korányi",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
  })
  assert.equal(forward.mode, "pair")
  assert.equal(forward.total, 1)
  assert.equal(forward.shown[0]?.entry.id, "1")

  const backward = searchNames(indexed, {
    query: "Koranyi Kohn",
    field: "mind",
    corpus: "mind",
    strictness: "szoros",
  })
  assert.equal(backward.total, 1)

  const adoptedOnly = searchNames(indexed, {
    query: "Kohn Korányi",
    field: "uj",
    corpus: "mind",
    strictness: "laza",
  })
  assert.equal(adoptedOnly.total, 1)
  assert.equal(adoptedOnly.shown[0]?.entry.id, "1")
})

test("century filter and given name stay on the same record", () => {
  const twentieth = searchNames(indexed, {
    query: "Schmidt",
    field: "eredeti",
    corpus: "20",
    strictness: "laza",
  })
  assert.equal(twentieth.shown[0]?.entry.uj, "Kovács")

  const nineteenth = searchNames(indexed, {
    query: "Schmidt",
    field: "mind",
    corpus: "19",
    strictness: "laza",
  })
  assert.equal(nineteenth.total, 0)

  const given = searchNames(indexed, {
    query: "Kohn",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    keresztnev: "Adolf",
  })
  assert.equal(given.total, 1)

  const wrongGiven = searchNames(indexed, {
    query: "Kohn",
    field: "mind",
    corpus: "mind",
    strictness: "laza",
    keresztnev: "Zsigmond",
  })
  assert.equal(wrongGiven.total, 0)
})

test("the 1800–1893 list answers the same queries", () => {
  const payload = JSON.parse(readFileSync("data/szentivanyi.json", "utf8")) as {
    rekordok: NameEntry[]
  }
  const list = indexEntries(payload.rekordok)
  const started = Date.now()
  const kohn = searchNames(list, {
    query: "Kohn",
    field: "eredeti",
    corpus: "19",
    strictness: "laza",
  })
  const elapsed = Date.now() - started
  assert.ok(kohn.total > 100, `expected many Kohn rows, got ${kohn.total}`)
  assert.ok(kohn.shown.some((hit) => hit.entry.uj === "Korányi"))
  assert.ok(elapsed < 1500, `search took ${elapsed}ms`)

  const acel = searchNames(list, {
    query: "Acél",
    field: "uj",
    corpus: "19",
    strictness: "szoros",
  })
  assert.ok(acel.shown.some((hit) => hit.entry.uj.replace(/cz/i, "c").startsWith("Acél") || hit.entry.uj === "Aczél"))

  const weiss = searchNames(list, {
    query: "Weiss",
    field: "eredeti",
    corpus: "19",
    strictness: "laza",
  })
  assert.ok(weiss.shown.some((hit) => /weisz/i.test(hit.entry.eredeti)))
})

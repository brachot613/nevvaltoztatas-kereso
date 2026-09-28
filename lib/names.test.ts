import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  damerau,
  describeHit,
  indexEntries,
  looseKey,
  searchNames,
  strictKey,
  type NameEntry,
} from "./names.ts"

const rows: NameEntry[] = [
  {
    id: "1",
    corpus: "19",
    uj: "Korányi",
    eredeti: "Kohn",
    keresztnev: "Adolf",
    hely: "Csacza",
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
  assert.equal(damerau("kohn", "khon"), 1)
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

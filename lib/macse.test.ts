import assert from "node:assert/strict"
import test from "node:test"
import { combineHits } from "./catalog.ts"
import {
  macsePageCount,
  macseRequests,
  macseVariants,
  macseNeedsYearSplit,
  mergeMacsePages,
  parseMacseHtml,
  residenceHalves,
  type MacseRecord,
} from "./macse.ts"
import { strictKey, type SearchHit } from "./names.ts"
import { townsForCounty } from "./places.ts"

const RECORD = `
Felvett vezetéknév:</b></td><td align='left'><span style="background-color:Maroon; color:Yellow;">Korányi</span></td>
<td align='left' colspan='2'><b>Eredeti (alias) vezetéknév:</b></td><td align='left' colspan='2'>Kohn</td></tr>
<tr><td align='left'><b>Utóneve(k):</b></td><td align='left'>Adolf</td>
<td><b>Vallása:</b></td><td>n.a.</td></tr>
<tr><td><b>Lakhelye:</b></td><td align='left'>Csacza</td>
<td><b>Polgári állása:</b></td><td align='left'>n.a.</td></tr>
<tr><td><b>Születési helye:</b></td><td align='left'>n.a.</td></tr>
<tr><td colspan='5'><b>Az engedélyt tartalmazó BM rendelet száma/évszáma:</b></td><td>20939/1887</td></tr>
<tr><td><b>Forrás: </b></td><td><a href='https://pelda.example/132'>Századunk névváltoztatásai 132. oldal</a></td></tr>
`

test("parser reads both surnames and ignores n.a.", () => {
  const page = parseMacseHtml(`Összesen: 12 találat ${RECORD}<a href='/'>logo</a>`)
  assert.equal(page.total, 12)
  assert.equal(page.records.length, 1)
  assert.equal(page.records[0]?.uj, "Korányi")
  assert.equal(page.records[0]?.eredeti, "Kohn")
  assert.equal(page.records[0]?.keresztnev, "Adolf")
  assert.equal(page.records[0]?.hely, "Csacza")
  assert.equal(page.records[0]?.foglalkozas, "")
  assert.equal(page.records[0]?.ev, 1887)
  assert.equal(page.records[0]?.hivatkozas, "20939/1887")
  assert.equal(page.records[0]?.forrasUrl, "https://pelda.example/132")
  assert.match(page.records[0]?.forrasSzoveg ?? "", /132\. oldal/)
})

test("too many results become a refine signal, not rows", () => {
  const page = parseMacseHtml("Túl sok találat (6 372), kérem finomítsa a keresést!")
  assert.equal(page.tooMany, 6372)
  assert.equal(page.records.length, 0)
})

test("spelling variants cover cz, cs/ts, final i/y, w/v and Weiss", () => {
  assert.deepEqual(macseVariants("Aczél"), ["Aczél", "Acél"])
  assert.deepEqual(macseVariants("Korányi"), ["Korányi", "Korányy"])
  assert.deepEqual(macseVariants("Kovács"), ["Kovács", "Kováts", "Kowács"])
  assert.deepEqual(macseVariants("Wolf"), ["Wolf", "Volf"])
  assert.ok(macseVariants("Weiss").includes("Weisz"))
  assert.ok(macseVariants("Weiss").includes("Veiss"))
})

test("page count covers every MACSE page until the cap", () => {
  assert.equal(macsePageCount(279, 10), 28)
  assert.equal(macsePageCount(6, 10), 1)
  assert.equal(macsePageCount(null, 10), 1)
})

test("a town slice above forty pages is split before it is truncated", () => {
  assert.equal(macseNeedsYearSplit(586, 10, null), true)
  assert.equal(macseNeedsYearSplit(279, 10, null), false)
  assert.equal(macseNeedsYearSplit(null, 0, 654), true)
})

test("a town or county without a surname searches residences", () => {
  const town = macseRequests({
    query: "",
    field: "mind",
    strictness: "laza",
    hely: "Szeged",
  })
  assert.equal(town.length, 1)
  assert.equal(town[0]?.residence, "Szeged")
  const short = macseRequests({
    query: "",
    field: "mind",
    strictness: "laza",
    hely: "Kis-új-sz.",
  })
  assert.equal(short[0]?.residence, "Kisújszállás")
  assert.equal(town[0]?.lname ?? "", "")

  const county = macseRequests({
    query: "",
    field: "mind",
    strictness: "laza",
    megye: "Zala",
  })
  const towns = county.map((request) => request.residence)
  assert.ok(towns.includes("Nagykanizsa"))
  assert.ok(towns.includes("Zalaegerszeg"))
  assert.equal(towns.length, 4)
})

test("a county asks every town bound to it", () => {
  const county = macseRequests({
    query: "",
    field: "mind",
    strictness: "laza",
    megye: "Pest",
  })
  assert.deepEqual(
    county.map((request) => request.residence),
    townsForCounty("Pest"),
  )
  assert.ok(county.length > 6)
})

test("a town MACSE refuses is split inside the 1815–1932 year box", () => {
  const whole = residenceHalves(undefined, undefined)
  assert.deepEqual(whole?.left, ["1815", "1873"])
  assert.deepEqual(whole?.right, ["1874", "1932"])
  assert.equal(residenceHalves("1900", "1900"), null)
  assert.equal(residenceHalves("1932", "1932"), null)
  const edge = residenceHalves("1900", "1901")
  assert.deepEqual(edge?.left, ["1900", "1900"])
  assert.deepEqual(edge?.right, ["1901", "1901"])
  const late = residenceHalves("1900", "1955")
  assert.equal(late?.right[1], "1932")
})

test("county pages add their totals and a surname keeps the larger one", () => {
  const nagy = macseRow("Nagy")
  const kiss = macseRow("Kiss")
  const county = mergeMacsePages(
    [
      { records: [nagy], total: 28, tooMany: null, complete: true },
      { records: [kiss], total: 12, tooMany: null, complete: true },
    ],
    true,
  )
  assert.equal(county.total, 40)
  assert.equal(county.records.length, 2)
  assert.equal(county.complete, true)

  const surname = mergeMacsePages(
    [
      { records: [nagy], total: 28, tooMany: null, complete: true },
      { records: [nagy], total: 12, tooMany: null, complete: true },
    ],
    false,
  )
  assert.equal(surname.total, 28)
  assert.equal(surname.records.length, 1)

  const refused = mergeMacsePages(
    [
      { records: [], total: null, tooMany: 900, complete: false },
      { records: [nagy], total: 28, tooMany: null, complete: true },
    ],
    true,
  )
  assert.equal(refused.complete, false)
  assert.equal(refused.tooMany, null)
  assert.equal(refused.records.length, 1)
})

function macseRow(uj: string): MacseRecord {
  return {
    eredeti: "Kohn",
    uj,
    keresztnev: "Ádám",
    hely: "Zalaegerszeg",
    foglalkozas: "",
    szuletesiHely: "",
    ev: 1901,
    hivatkozas: uj,
    forrasUrl: "",
    forrasSzoveg: "",
  }
}

test("a single surname searches both fields in one MACSE request", () => {
  const requests = macseRequests({
    query: "Weiss",
    field: "mind",
    strictness: "laza",
  })
  assert.equal(requests[0]?.mode, "1")
  assert.equal(requests[0]?.lname, "Weiss")
  assert.ok(requests.some((request) => request.lname === "Weisz"))
  assert.ok(requests.some((request) => request.lname === "Veiss"))
})

test("two surnames on one side are searched as separate words", () => {
  const requests = macseRequests({
    query: "Kohn Korányi",
    field: "uj",
    strictness: "laza",
  })
  assert.equal(requests[0]?.nlname, "Kohn")
  assert.equal(requests[0]?.olname, "")
  assert.equal(requests[1]?.nlname, "Korányi")
})

test("two surnames go to the original and adopted fields", () => {
  const requests = macseRequests({
    query: "Kohn Korányi",
    field: "mind",
    strictness: "szoros",
  })
  assert.equal(requests[0]?.olname, "Kohn")
  assert.equal(requests[0]?.nlname, "Korányi")
  assert.equal(requests[1]?.olname, "Korányi")
  assert.equal(requests[1]?.nlname, "Kohn")
})

test("the same person from both lists is one row", () => {
  const local: SearchHit[] = [
    {
      score: 100,
      hits: [{ field: "eredeti", kind: "exact", score: 100, token: "Kohn" }],
      entry: {
        id: "sz-1",
        corpus: "19",
        eredeti: "Kohn",
        uj: "Korányi",
        keresztnev: "Adolf",
        hely: "",
        reszlet: "Adolf Csacza",
        ev: 1887,
        hivatkozas: "BM. 20939/87.",
        keys: {
          ujStrict: "korani",
          ujLoose: "korani",
          eredetiStrict: "kohn",
          eredetiLoose: "kohn",
          detail: "adolfcsacza",
          hely: "",
          keresztnev: "adolf",
        },
      },
    },
  ]
  const hits = combineHits(
    local,
    [
      {
        eredeti: "Kohn",
        uj: "Korányi",
        keresztnev: "Adolf",
        hely: "Csacza",
        foglalkozas: "",
        szuletesiHely: "",
        ev: 1887,
        hivatkozas: "20939/1887",
        forrasUrl: "https://pelda.example/132",
        forrasSzoveg: "Századunk névváltoztatásai",
      },
    ],
    { query: "Kohn", field: "mind", strictness: "laza" },
  )
  assert.equal(hits.length, 1)
  assert.deepEqual(hits[0]?.sources.sort(), ["macse", "szentivanyi"])
  assert.equal(hits[0]?.hely, "Csacza")
})

test("two book rows with the same surnames stay two rows", () => {
  const row = (id: string, reszlet: string): SearchHit => ({
    score: 100,
    hits: [{ field: "eredeti", kind: "exact", score: 100, token: "Kohn" }],
    entry: {
      id,
      corpus: "19",
      eredeti: "Kohn",
      uj: "Kovács",
      reszlet,
      ev: 1891,
      hivatkozas: "",
      keys: {
        ujStrict: "kovacs",
        ujLoose: "kovacs",
        eredetiStrict: "kohn",
        eredetiLoose: "kohn",
        detail: strictKey(reszlet),
        hely: "",
        keresztnev: "",
      },
    },
  })
  const hits = combineHits(
    [row("sz-1", "János kereskedő"), row("sz-2", "Mór szabó")],
    [
      {
        eredeti: "Kohn",
        uj: "Kovács",
        keresztnev: "Mór",
        hely: "Pest",
        foglalkozas: "",
        szuletesiHely: "",
        ev: 1891,
        hivatkozas: "1/1891",
        forrasUrl: "https://pelda.example/m",
        forrasSzoveg: "",
      },
    ],
    { query: "Kohn", field: "mind", strictness: "laza" },
  )
  assert.equal(hits.length, 2)
  const mor = hits.find((hit) => hit.keresztnev === "Mór")
  assert.equal(mor?.id, "sz-2")
  assert.equal(mor?.hely, "Pest")
  assert.ok(mor?.sources.includes("macse"))
  assert.ok(mor?.sources.includes("szentivanyi"))
})

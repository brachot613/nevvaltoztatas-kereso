import { readFile } from "node:fs/promises"
import path from "node:path"
import type { MacseRecord } from "./macse.ts"
import { searchMacse } from "./macse.ts"
import {
  describeHit,
  indexEntries,
  searchNames,
  searchPlaces,
  strictKey,
  type IndexedEntry,
  type NameEntry,
  type NameField,
  type SearchHit,
  type Strictness,
} from "./names.ts"
import { countyOfTown, sameCounty, sameTown } from "./places.ts"

export type ResultSource = "macse" | "szentivanyi"

export type ResultHit = {
  id: string
  eredeti: string
  uj: string
  keresztnev: string
  hely: string
  reszlet: string
  ev: number | null
  hivatkozas: string
  forrasUrl: string
  sources: ResultSource[]
  reasons: string[]
  matched: Array<"eredeti" | "uj">
  score: number
}

export type SearchResponse = {
  hits: ResultHit[]
  tooShort: boolean
  compared: { strict: string; loose: string }
  macse: {
    total: number | null
    tooMany: number | null
    error: string | null
    fetched: number
    complete: boolean
  }
  szentivanyi: { matched: number }
}

type CatalogQuery = {
  query: string
  field: NameField
  strictness: Strictness
  keresztnev?: string
  hely?: string
  megye?: string
  evTol?: number | null
  evIg?: number | null
}

let indexed: Promise<IndexedEntry[]> | null = null

export async function searchCatalog(options: CatalogQuery): Promise<SearchResponse> {
  const list = await loadSzentivanyi()
  const named = strictKey(options.query).length >= 2
  const located = Boolean(options.hely?.trim() || options.megye?.trim())
  const local = named
    ? searchNames(list, { ...options, corpus: "mind", limit: 2000 })
    : located
      ? searchPlaces(list, { ...options, corpus: "mind", limit: 2000 })
      : searchNames(list, { ...options, corpus: "mind", limit: 2000 })
  if (!named && !located) {
    return {
      hits: [],
      tooShort: true,
      compared: local.compared,
      macse: { total: null, tooMany: null, error: null, fetched: 0, complete: true },
      szentivanyi: { matched: 0 },
    }
  }

  const remote = await searchMacse(options)
  remote.records = remote.records.filter((record) => fitsPlace(record.hely, options))
  return {
    hits: combineHits(local.shown, remote.records, options),
    tooShort: false,
    compared: local.compared,
    macse: {
      total: remote.total,
      tooMany: remote.tooMany,
      error: remote.error,
      fetched: remote.records.length,
      complete: remote.complete,
    },
    szentivanyi: { matched: local.total },
  }
}

export function combineHits(
  localHits: SearchHit[],
  remote: MacseRecord[],
  options: CatalogQuery,
): ResultHit[] {
  const remoteEntries: NameEntry[] = remote.map((record, index) => ({
    id: `macse-${index + 1}`,
    corpus: record.ev != null && record.ev >= 1900 ? "20" : "19",
    eredeti: record.eredeti,
    uj: record.uj,
    keresztnev: record.keresztnev,
    hely: record.hely,
    reszlet: remoteDetail(record),
    ev: record.ev,
    hivatkozas: record.hivatkozas,
  }))
  const remoteById = new Map(remote.map((record, index) => [`macse-${index + 1}`, record]))
  const scored = searchNames(indexEntries(remoteEntries), {
    ...options,
    corpus: "mind",
    limit: Math.max(remoteEntries.length, 1),
  })
  const scoredIds = new Set(scored.shown.map((hit) => hit.entry.id))

  const merged = new Map<string, ResultHit>()
  for (const hit of localHits) {
    merged.set(hit.entry.id, fromLocal(hit))
  }
  for (const hit of scored.shown) {
    const record = remoteById.get(hit.entry.id)
    if (!record) continue
    addRemote(merged, fromScoredRemote(hit, record))
  }
  remote.forEach((record, index) => {
    const id = `macse-${index + 1}`
    if (scoredIds.has(id)) return
    addRemote(merged, fromUnscoredRemote(record, id, options.field))
  })

  return [...merged.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return (right.ev ?? 0) - (left.ev ?? 0)
  })
}

function fromLocal(hit: SearchHit): ResultHit {
  const entry = hit.entry
  return {
    id: entry.id,
    eredeti: entry.eredeti,
    uj: entry.uj,
    keresztnev: entry.keresztnev ?? "",
    hely: entry.hely ?? "",
    reszlet: entry.reszlet ?? "",
    ev: entry.ev ?? null,
    hivatkozas: entry.hivatkozas ?? "",
    forrasUrl: "",
    sources: ["szentivanyi"],
    reasons: hit.hits.map((item) =>
      describeHit(item, item.field === "uj" ? entry.uj : entry.eredeti),
    ),
    matched: [...new Set(hit.hits.map((item) => item.field))],
    score: hit.score,
  }
}

function fromScoredRemote(hit: SearchHit, record: MacseRecord): ResultHit {
  const entry = hit.entry
  return {
    id: entry.id,
    eredeti: record.eredeti,
    uj: record.uj,
    keresztnev: record.keresztnev,
    hely: record.hely,
    reszlet: remoteDetail(record),
    ev: record.ev,
    hivatkozas: record.hivatkozas,
    forrasUrl: record.forrasUrl,
    sources: ["macse"],
    reasons: hit.hits.map((item) =>
      describeHit(item, item.field === "uj" ? record.uj : record.eredeti),
    ),
    matched: [...new Set(hit.hits.map((item) => item.field))],
    score: hit.score + 1,
  }
}

function fromUnscoredRemote(record: MacseRecord, id: string, field: NameField): ResultHit {
  const matched: Array<"eredeti" | "uj"> =
    field === "uj" ? ["uj"] : field === "eredeti" ? ["eredeti"] : ["eredeti", "uj"]
  return {
    id,
    eredeti: record.eredeti,
    uj: record.uj,
    keresztnev: record.keresztnev,
    hely: record.hely,
    reszlet: remoteDetail(record),
    ev: record.ev,
    hivatkozas: record.hivatkozas,
    forrasUrl: record.forrasUrl,
    sources: ["macse"],
    reasons: ["MACSE találat"],
    matched,
    score: 58,
  }
}

function addRemote(merged: Map<string, ResultHit>, incoming: ResultHit) {
  const existing = hostFor(merged, incoming)
  if (!existing) {
    merged.set(incoming.id, incoming)
    return
  }
  const [existingKey, previous] = existing
  merged.set(existingKey, {
    ...incoming,
    id: previous.id,
    sources: [...new Set([...previous.sources, ...incoming.sources])],
    reasons: [...new Set([...incoming.reasons, ...previous.reasons])],
    matched: [...new Set([...incoming.matched, ...previous.matched])],
    score: Math.max(previous.score, incoming.score),
    reszlet: incoming.reszlet || previous.reszlet,
    hely: incoming.hely || previous.hely,
    keresztnev: incoming.keresztnev || previous.keresztnev,
    hivatkozas: incoming.hivatkozas || previous.hivatkozas,
    forrasUrl: incoming.forrasUrl || previous.forrasUrl,
    ev: incoming.ev ?? previous.ev,
  })
}

function hostFor(
  merged: Map<string, ResultHit>,
  incoming: ResultHit,
): [string, ResultHit] | undefined {
  const matches = [...merged.entries()].filter(([, row]) => compatible(row, incoming))
  if (matches.length === 0) return undefined
  const given = strictKey(incoming.keresztnev)
  if (given) {
    const named = matches.find(
      ([, row]) => strictKey(row.keresztnev) === given || strictKey(row.reszlet).includes(given),
    )
    if (named) return named
  }
  return matches.find(([, row]) => !strictKey(row.keresztnev)) ?? matches[0]
}

function compatible(left: ResultHit, right: ResultHit): boolean {
  if (strictKey(left.eredeti) !== strictKey(right.eredeti)) return false
  if (strictKey(left.uj) !== strictKey(right.uj)) return false
  const leftGiven = strictKey(left.keresztnev)
  const rightGiven = strictKey(right.keresztnev)
  if (leftGiven && rightGiven && leftGiven !== rightGiven) return false
  if (left.ev != null && right.ev != null && left.ev !== right.ev) return false
  return true
}

function fitsPlace(town: string, options: CatalogQuery): boolean {
  if (options.hely?.trim() && !sameTown(town, options.hely)) return false
  if (options.megye?.trim() && !sameCounty(countyOfTown(town), options.megye)) return false
  return true
}

function remoteDetail(record: MacseRecord): string {
  return [record.foglalkozas, record.szuletesiHely ? `született: ${record.szuletesiHely}` : "", record.forrasSzoveg]
    .filter(Boolean)
    .join(" · ")
}

async function loadSzentivanyi(): Promise<IndexedEntry[]> {
  if (!indexed) {
    indexed = readFile(path.join(process.cwd(), "data", "szentivanyi.json"), "utf8")
      .then((raw) => JSON.parse(raw) as { rekordok: NameEntry[] })
      .then((payload) => indexEntries(payload.rekordok))
      .catch((error) => {
        indexed = null
        throw error
      })
  }
  return indexed
}

import { bornInBudapest, flexibleMatch, isBudapest, sameCounty, sameTown, textHasFlexible } from "./places.ts"

export type Corpus = "19" | "20"
export type NameField = "mind" | "eredeti" | "uj"
export type Strictness = "laza" | "szoros"
export type MatchKind = "exact" | "prefix" | "contains" | "loose" | "edit"

export type NameEntry = {
  id: string
  corpus: Corpus
  uj: string
  eredeti: string
  keresztnev?: string
  hely?: string
  megye?: string
  reszlet?: string
  ev?: number | null
  hivatkozas?: string
  imported?: boolean
}

export type IndexedEntry = NameEntry & {
  keys: {
    ujStrict: string
    ujLoose: string
    eredetiStrict: string
    eredetiLoose: string
    detail: string
    hely: string
    keresztnev: string
  }
}

export type FieldHit = {
  field: "uj" | "eredeti"
  kind: MatchKind
  distance?: number
  score: number
  token: string
}

export type SearchHit = {
  entry: IndexedEntry
  score: number
  hits: FieldHit[]
}

export type SearchOptions = {
  query: string
  field: NameField
  corpus: "mind" | Corpus
  strictness: Strictness
  keresztnev?: string
  hely?: string
  megye?: string
  evTol?: number | null
  evIg?: number | null
  limit?: number
  placeRows?: "all" | "known" | "unread"
  budapestNelkul?: boolean
}

export type SearchResult = {
  total: number
  shown: SearchHit[]
  unread: number
  compared: { strict: string; loose: string }
  mode: "single" | "pair"
  tooShort: boolean
}

const RESULT_LIMIT = 80
const INDEX_AT = 2500

type SearchPlan = {
  byInitial: Map<string, IndexedEntry[]>
  byTrigram: Map<string, IndexedEntry[]>
}

const planCache = new WeakMap<IndexedEntry[], SearchPlan>()

export function strictKey(value: string): string {
  let text = value.trim().toLowerCase().replace(/ß/g, "ss")
  text = text.normalize("NFD").replace(/\p{M}/gu, "")
  text = text.replace(/sch/g, "s")
  text = text.replace(/cz/g, "c")
  text = text.replace(/ts/g, "cs")
  text = text.replace(/ck/g, "k")
  text = text.replace(/ph/g, "f")
  text = text.replace(/w/g, "v")
  text = text.replace(/y/g, "i")
  text = text.replace(/[^a-z0-9]/g, "")
  return text
}

export function looseKey(value: string): string {
  let text = strictKey(value)
  text = text.replace(/(^|[^aeiou])ae/g, "$1a")
  text = text.replace(/(^|[^aeiou])oe/g, "$1o")
  text = text.replace(/(^|[^aeiou])ue/g, "$1u")
  text = text.replace(/tz/g, "c")
  text = text.replace(/th/g, "t")
  text = text.replace(/(.)\1+/g, "$1")
  return text
}

export function damerau(left: string, right: string): number {
  if (left === right) return 0
  const a = left.length
  const b = right.length
  if (a === 0) return b
  if (b === 0) return a

  const rows: number[][] = Array.from({ length: a + 1 }, () => new Array<number>(b + 1).fill(0))
  for (let i = 0; i <= a; i += 1) rows[i][0] = i
  for (let j = 0; j <= b; j += 1) rows[0][j] = j

  for (let i = 1; i <= a; i += 1) {
    for (let j = 1; j <= b; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1)
      }
      rows[i][j] = best
    }
  }
  return rows[a][b]
}

export function indexEntries(entries: NameEntry[]): IndexedEntry[] {
  return entries.map((entry) => {
    const detail = `${entry.keresztnev ?? ""} ${entry.hely ?? ""} ${entry.reszlet ?? ""}`
    return {
      ...entry,
      keys: {
        ujStrict: strictKey(entry.uj),
        ujLoose: looseKey(entry.uj),
        eredetiStrict: strictKey(entry.eredeti),
        eredetiLoose: looseKey(entry.eredeti),
        detail: strictKey(detail),
        hely: strictKey(entry.hely ?? ""),
        keresztnev: strictKey(entry.keresztnev ?? ""),
      },
    }
  })
}

function scoreAgainst(
  queryStrict: string,
  queryLoose: string,
  nameStrict: string,
  nameLoose: string,
  strictness: Strictness,
): Omit<FieldHit, "field" | "token"> | null {
  if (queryStrict.length < 2 || nameStrict.length < 2) return null
  if (queryStrict === nameStrict) return { kind: "exact", score: 100 }
  if (strictness === "laza" && queryLoose.length >= 3 && queryLoose === nameLoose) {
    return { kind: "loose", score: 90 }
  }
  if (strictness === "laza" && sameMannStem(queryLoose, nameLoose)) {
    return { kind: "loose", score: 78 }
  }
  if (queryStrict.length >= 3 && nameStrict.startsWith(queryStrict)) {
    return { kind: "prefix", score: 84 }
  }
  if (
    queryStrict.length >= 4 &&
    nameStrict.length >= queryStrict.length + 2 &&
    nameStrict.includes(queryStrict)
  ) {
    return { kind: "contains", score: 70 }
  }
  if (
    queryStrict.length >= 4 &&
    nameStrict.length >= 4 &&
    queryStrict.startsWith(nameStrict) &&
    queryStrict.length - nameStrict.length <= 2
  ) {
    return { kind: "prefix", score: 74 }
  }
  if (strictness === "szoros") return null

  const allowed = queryStrict.length >= 8 ? 2 : queryStrict.length >= 4 ? 1 : 0
  if (allowed === 0) return null

  const strictEdit = editDistance(queryStrict, nameStrict, allowed)
  if (strictEdit) return { kind: "edit", distance: strictEdit, score: strictEdit === 1 ? 76 : 63 }
  const looseEdit = editDistance(queryLoose, nameLoose, allowed)
  if (looseEdit) return { kind: "edit", distance: looseEdit, score: looseEdit === 1 ? 72 : 61 }

  if (
    queryLoose.length >= 4 &&
    nameLoose.length >= queryLoose.length + 2 &&
    nameLoose.includes(queryLoose)
  ) {
    return { kind: "contains", score: 66 }
  }
  return null
}

function sameMannStem(query: string, name: string): boolean {
  const queryStem = mannStem(query)
  const nameStem = mannStem(name)
  if (queryStem && queryStem === name) return true
  if (nameStem && nameStem === query) return true
  return false
}

function mannStem(value: string): string | null {
  if (!value.endsWith("man")) return null
  const stem = value.slice(0, -3)
  if (stem.length < 5) return null
  return stem
}

function editDistance(query: string, name: string, allowed: number): number | null {
  if (Math.abs(name.length - query.length) > allowed) return null
  if (query[0] !== name[0]) {
    if (allowed >= 1 && query.length >= 5 && query.slice(1) === name.slice(1)) return 1
    return null
  }
  const distance = damerau(query, name)
  if (distance > 0 && distance <= allowed && editOk(query, name, distance)) return distance
  return null
}

function editOk(query: string, name: string, distance: number): boolean {
  if (distance === 1 && query.length <= 4 && query[0] !== name[0]) return false
  return true
}

function candidates(entries: IndexedEntry[], query: string, tokens: string[]): IndexedEntry[] {
  if (entries.length < INDEX_AT) return entries
  const plan = planFor(entries)
  const keys = new Set<string>([strictKey(query), looseKey(query)])
  for (const token of tokens) {
    keys.add(strictKey(token))
    keys.add(looseKey(token))
  }
  const found = new Set<IndexedEntry>()
  for (const key of keys) {
    if (!key) continue
    for (const entry of plan.byInitial.get(key[0]) ?? []) found.add(entry)
    for (let i = 0; i <= key.length - 3; i += 1) {
      for (const entry of plan.byTrigram.get(key.slice(i, i + 3)) ?? []) found.add(entry)
    }
  }
  return [...found]
}

function planFor(entries: IndexedEntry[]): SearchPlan {
  const cached = planCache.get(entries)
  if (cached) return cached
  const byInitial = new Map<string, IndexedEntry[]>()
  const byTrigram = new Map<string, IndexedEntry[]>()
  const push = (map: Map<string, IndexedEntry[]>, key: string, entry: IndexedEntry) => {
    const list = map.get(key)
    if (list) list.push(entry)
    else map.set(key, [entry])
  }
  for (const entry of entries) {
    const initials = new Set<string>()
    const grams = new Set<string>()
    for (const key of [
      entry.keys.ujStrict,
      entry.keys.ujLoose,
      entry.keys.eredetiStrict,
      entry.keys.eredetiLoose,
    ]) {
      if (key[0]) initials.add(key[0])
      for (let i = 0; i <= key.length - 3; i += 1) grams.add(key.slice(i, i + 3))
    }
    for (const letter of initials) push(byInitial, letter, entry)
    for (const gram of grams) push(byTrigram, gram, entry)
  }
  const plan = { byInitial, byTrigram }
  planCache.set(entries, plan)
  return plan
}

function fieldsFor(field: NameField): Array<"uj" | "eredeti"> {
  if (field === "uj") return ["uj"]
  if (field === "eredeti") return ["eredeti"]
  return ["eredeti", "uj"]
}

function bestToken(
  entry: IndexedEntry,
  tokens: string[],
  fields: Array<"uj" | "eredeti">,
  strictness: Strictness,
): FieldHit | null {
  let best: FieldHit | null = null
  for (const token of tokens) {
    const hit = bestOn(entry, token, fields, strictness)
    if (hit && (!best || hit.score > best.score)) best = hit
  }
  return best
}

function bestOn(
  entry: IndexedEntry,
  token: string,
  fields: Array<"uj" | "eredeti">,
  strictness: Strictness,
): FieldHit | null {
  const queryStrict = strictKey(token)
  const queryLoose = looseKey(token)
  let best: FieldHit | null = null
  for (const field of fields) {
    const scored = scoreAgainst(
      queryStrict,
      queryLoose,
      field === "uj" ? entry.keys.ujStrict : entry.keys.eredetiStrict,
      field === "uj" ? entry.keys.ujLoose : entry.keys.eredetiLoose,
      strictness,
    )
    if (!scored) continue
    const hit: FieldHit = { ...scored, field, token }
    if (!best || hit.score > best.score) best = hit
  }
  return best
}

function passesFilters(entry: IndexedEntry, options: SearchOptions): boolean {
  if (options.corpus !== "mind" && entry.corpus !== options.corpus) return false
  if (options.evTol != null && (entry.ev == null || entry.ev < options.evTol)) return false
  if (options.evIg != null && (entry.ev == null || entry.ev > options.evIg)) return false
  if (options.keresztnev?.trim() && !matchesGiven(entry, options.keresztnev)) return false
  const unreadPlace = !entry.hely?.trim() && !entry.megye?.trim() && entry.id.startsWith("sz-")
  if (options.hely?.trim() && !matchesTown(entry, options.hely) && !unreadPlace) return false
  if (options.megye?.trim() && !sameCounty(entry.megye ?? "", options.megye) && !unreadPlace) return false
  if (options.budapestNelkul && inBudapest(entry)) return false
  return true
}

function inBudapest(entry: IndexedEntry): boolean {
  if (isBudapest(entry.hely ?? "")) return true
  if (isBudapest(entry.megye ?? "")) return true
  if (bornInBudapest(entry.reszlet ?? "")) return true
  if (!entry.hely?.trim() && !entry.megye?.trim()) return isBudapest(entry.reszlet ?? "")
  return false
}

function matchesTown(entry: IndexedEntry, query: string): boolean {
  if (sameTown(entry.hely ?? "", query)) return true
  return Boolean(entry.reszlet && textHasFlexible(query, entry.reszlet, true))
}

function matchesGiven(entry: IndexedEntry, query: string): boolean {
  if (entry.keresztnev && flexibleMatch(query, entry.keresztnev, false)) return true
  return Boolean(entry.reszlet && textHasFlexible(query, entry.reszlet, false))
}

export function searchPlaces(entries: IndexedEntry[], options: SearchOptions): SearchResult {
  const known: SearchHit[] = []
  const unread: SearchHit[] = []
  for (const entry of entries) {
    if (!passesFilters(entry, options)) continue
    const missing = !entry.hely?.trim() && !entry.megye?.trim()
    if (missing) unread.push({ entry, score: 10, hits: [] })
    else known.push({ entry, score: 40, hits: [] })
  }
  const byYear = (left: SearchHit, right: SearchHit) => (right.entry.ev ?? 0) - (left.entry.ev ?? 0)
  known.sort(byYear)
  unread.sort(byYear)
  const scope = options.placeRows ?? "all"
  const pool = scope === "known" ? known : scope === "unread" ? unread : [...known, ...unread]
  const limit = options.limit ?? 2000
  return {
    total: pool.length,
    shown: pool.slice(0, limit),
    unread: unread.length,
    compared: { strict: "", loose: "" },
    mode: "single",
    tooShort: false,
  }
}

export function searchNames(entries: IndexedEntry[], options: SearchOptions): SearchResult {
  const compared = { strict: strictKey(options.query), loose: looseKey(options.query) }
  if (compared.strict.length < 2) {
    return { total: 0, shown: [], unread: 0, compared, mode: "single", tooShort: true }
  }

  const tokens = options.query
    .trim()
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => strictKey(token).length >= 3)
  const pair = options.field === "mind" && tokens.length === 2
  const fields = fieldsFor(options.field)
  const hits: SearchHit[] = []
  const pool = candidates(entries, options.query, tokens)

  for (const entry of pool) {
    if (!passesFilters(entry, options)) continue
    const single =
      !pair && tokens.length > 1
        ? bestToken(entry, tokens, fields, options.strictness)
        : bestOn(entry, options.query, fields, options.strictness)
    let chosen: SearchHit | null = single
      ? { entry, score: single.score, hits: [single] }
      : null

    if (pair) {
      const forwardEredeti = bestOn(entry, tokens[0], ["eredeti"], options.strictness)
      const forwardUj = bestOn(entry, tokens[1], ["uj"], options.strictness)
      const reverseUj = bestOn(entry, tokens[0], ["uj"], options.strictness)
      const reverseEredeti = bestOn(entry, tokens[1], ["eredeti"], options.strictness)
      const pairs: FieldHit[][] = []
      if (forwardEredeti && forwardUj) pairs.push([forwardEredeti, forwardUj])
      if (reverseUj && reverseEredeti) pairs.push([reverseUj, reverseEredeti])
      for (const pairHits of pairs) {
        const score = Math.min(pairHits[0].score, pairHits[1].score)
        if (!chosen || score > chosen.score) {
          chosen = { entry, score, hits: pairHits }
        }
      }
    }

    if (chosen) hits.push(chosen)
  }

  hits.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    const year = (right.entry.ev ?? 0) - (left.entry.ev ?? 0)
    if (year !== 0) return year
    return left.entry.uj.localeCompare(right.entry.uj, "hu")
  })

  const limit = options.limit ?? RESULT_LIMIT
  return {
    total: hits.length,
    shown: hits.slice(0, limit),
    unread: 0,
    compared,
    mode: pair ? "pair" : "single",
    tooShort: false,
  }
}

export function describeHit(hit: FieldHit, name: string): string {
  const sameLetters =
    hit.token.trim().toLocaleLowerCase("hu") === name.trim().toLocaleLowerCase("hu")
  const side = hit.field === "uj" ? "a felvett névvel" : "az eredeti névvel"
  const inside = hit.field === "uj" ? "a felvett névben" : "az eredeti névben"
  if (hit.kind === "exact" && sameLetters) return `Betű szerint egyezik ${side}`
  if (hit.kind === "exact" || hit.kind === "loose") return `Írásváltozat ${inside}`
  if (hit.kind === "prefix") return `Ezzel kezdődik ${inside}`
  if (hit.kind === "contains") return `Benne van ${inside}`
  if (hit.distance === 1) return `Egy betű eltérés ${inside}`
  return `Két betű eltérés ${inside}`
}

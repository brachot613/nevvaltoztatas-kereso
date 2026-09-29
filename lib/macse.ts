import type { NameField, Strictness } from "./names.ts"
import { resolvePlace, townsForCounty } from "./places.ts"

const ENDPOINT = "https://macse.hu/db/names/names.php"
const USER_AGENT = "Nevkereso/1.0 (egy kereses, nem tarolas)"

export type MacseRecord = {
  eredeti: string
  uj: string
  keresztnev: string
  hely: string
  foglalkozas: string
  szuletesiHely: string
  ev: number | null
  hivatkozas: string
  forrasUrl: string
  forrasSzoveg: string
}

export type MacsePage = {
  records: MacseRecord[]
  total: number | null
  tooMany: number | null
}

export type MacseQuery = {
  query: string
  field: NameField
  strictness: Strictness
  keresztnev?: string
  hely?: string
  megye?: string
  evTol?: number | null
  evIg?: number | null
}

type MacseRequest = {
  mode: "0" | "1"
  lname?: string
  olname?: string
  nlname?: string
  fname?: string
  residence?: string
  changeyear1?: string
  changeyear2?: string
}

let cookiePromise: Promise<string> | null = null

export function macseVariants(raw: string): string[] {
  const trimmed = raw.trim()
  const found: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    const next = value.trim()
    if (next.length < 2) return
    const key = next.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    if (seen.has(key)) return
    seen.add(key)
    found.push(next)
  }

  add(trimmed)
  add(swapEndingIY(trimmed))
  if (/cs/i.test(trimmed)) add(swapDigraph(trimmed, "cs", "ts"))
  if (/ts/i.test(trimmed)) add(swapDigraph(trimmed, "ts", "cs"))
  if (/w/i.test(trimmed)) add(swapLetter(trimmed, /w/gi, "v"))
  else if (/v/i.test(trimmed)) add(swapLetter(trimmed, /v/gi, "w"))
  if (/cz/i.test(trimmed)) add(trimmed.replace(/cz/gi, "c"))
  else if (/c/i.test(trimmed) && !/cs/i.test(trimmed)) {
    add(trimmed.replace(/c/i, (letter) => (letter === "C" ? "Cz" : "cz")))
  }
  if (/ss/i.test(trimmed)) add(trimmed.replace(/ss/gi, "sz"))
  if (/sz/i.test(trimmed)) add(trimmed.replace(/sz/gi, "ss"))
  const doubled = found.find((item) => item !== trimmed && (/ss/i.test(item) || /sz/i.test(item)))
  if (doubled && /w/i.test(doubled)) add(swapLetter(doubled, /w/gi, "v"))
  if (/sch/i.test(trimmed)) add(trimmed.replace(/sch/gi, "s"))
  return found.slice(0, 4)
}

export function macseRequests(options: MacseQuery): MacseRequest[] {
  const given = blank(options.keresztnev)
  const place = blank(options.hely)
  const county = blank(options.megye)
  const from = yearParam(options.evTol)
  const to = yearParam(options.evIg)
  if (options.query.trim().length < 2) {
    if (!place && !county) return []
    if (place) return [detailed("", "", given, resolvePlace(place)?.nev ?? place, from, to)]
    return townsForCounty(county)
      .slice(0, 6)
      .map((town) => detailed("", "", given, town, from, to))
  }
  const detail = Boolean(place || from || to || options.field !== "mind")
  const tokens = options.query
    .trim()
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)

  if (options.field === "mind" && tokens.length === 2) {
    const requests: MacseRequest[] = [
      detailed(tokens[0], tokens[1], given, place, from, to),
      detailed(tokens[1], tokens[0], given, place, from, to),
    ]
    if (options.strictness === "laza") {
      const alt0 = macseVariants(tokens[0]).find((item) => item !== tokens[0])
      const alt1 = macseVariants(tokens[1]).find((item) => item !== tokens[1])
      if (alt0) requests.push(detailed(alt0, tokens[1], given, place, from, to))
      if (alt1) requests.push(detailed(tokens[0], alt1, given, place, from, to))
    }
    return requests.slice(0, 4)
  }

  const seeds = tokens.length > 1 ? tokens : [options.query.trim()].filter(Boolean)
  const names: string[] = []
  const seen = new Set<string>()
  for (const seed of seeds) {
    const variants = options.strictness === "laza" ? macseVariants(seed) : [seed]
    for (const name of variants) {
      const key = name.toLocaleLowerCase("hu")
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }

  if (!detail) {
    return names.slice(0, 4).map((name) => ({
      mode: "1",
      lname: name,
      fname: given,
    }))
  }

  return names.slice(0, 4).flatMap((name) => {
    if (options.field === "uj") return [detailed("", name, given, place, from, to)]
    if (options.field === "eredeti") return [detailed(name, "", given, place, from, to)]
    return [
      detailed(name, "", given, place, from, to),
      detailed("", name, given, place, from, to),
    ]
  }).slice(0, 8)
}

export function parseMacseHtml(html: string): MacsePage {
  const tooManyMatch = html.match(/Túl sok találat \(([\d\s]+)\)/)
  const totalMatch = html.match(/Összesen:\s*([\d\s]+)\s*találat/)
  const tooMany = tooManyMatch ? Number(tooManyMatch[1].replace(/\s/g, "")) : null
  const total = totalMatch ? Number(totalMatch[1].replace(/\s/g, "")) : null
  if (tooMany) return { records: [], total: null, tooMany }

  const records: MacseRecord[] = []
  const chunks = html.split("Felvett vezetéknév:</b>").slice(1)
  for (const chunk of chunks) {
    const uj = firstCell(chunk)
    const eredeti = cellAfter(chunk, "Eredeti (alias) vezetéknév:</b>")
    if (!uj || !eredeti) continue
    const decree = cellAfter(chunk, "BM rendelet száma/évszáma:</b>")
    const source = sourceFrom(chunk)
    records.push({
      uj,
      eredeti,
      keresztnev: cellAfter(chunk, "Utóneve(k):</b>"),
      hely: cellAfter(chunk, "Lakhelye:</b>"),
      foglalkozas: cellAfter(chunk, "Polgári állása:</b>"),
      szuletesiHely: cellAfter(chunk, "Születési helye:</b>"),
      ev: yearOf(decree),
      hivatkozas: decree,
      forrasUrl: source.url,
      forrasSzoveg: source.text,
    })
  }
  return { records, total, tooMany: null }
}

const MAX_MACSE_PAGES = 40

export function macsePageCount(total: number | null, firstCount: number, maxPages = MAX_MACSE_PAGES): number {
  if (total == null || firstCount <= 0 || total <= firstCount) return 1
  return Math.min(maxPages, Math.ceil(total / firstCount))
}

export async function searchMacse(
  options: MacseQuery,
): Promise<MacsePage & { error: string | null; complete: boolean }> {
  const requests = macseRequests(options)
  if (requests.length === 0) return { records: [], total: null, tooMany: null, error: null, complete: true }

  try {
    const manyTowns = options.query.trim().length < 2 && requests.length > 1
    const pageCap = manyTowns ? 4 : MAX_MACSE_PAGES
    const pages = await Promise.all(requests.map((request) => collectMacse(request, pageCap)))
    const records: MacseRecord[] = []
    const seen = new Set<string>()
    let total: number | null = null
    let tooMany: number | null = null
    let complete = true
    for (const page of pages) {
      if (page.tooMany && page.records.length === 0) {
        tooMany = Math.max(tooMany ?? 0, page.tooMany)
        continue
      }
      if (!page.complete) complete = false
      if (page.total != null) total = Math.max(total ?? 0, page.total)
      for (const record of page.records) {
        const key = `${record.eredeti}|${record.uj}|${record.keresztnev}|${record.hivatkozas}`
        if (seen.has(key)) continue
        seen.add(key)
        records.push(record)
      }
    }
    if (records.length > 0) tooMany = null
    else complete = false
    return { records, total, tooMany, error: null, complete }
  } catch (error) {
    return {
      records: [],
      total: null,
      tooMany: null,
      error: error instanceof Error ? error.message : "A MACSE most nem válaszol.",
      complete: false,
    }
  }
}

async function collectMacse(
  request: MacseRequest,
  maxPages = MAX_MACSE_PAGES,
): Promise<MacsePage & { complete: boolean }> {
  const first = await postMacse(request, 1)
  if (first.tooMany || first.records.length === 0 || first.total == null) {
    return { ...first, complete: first.tooMany == null && first.records.length > 0 }
  }
  const last = macsePageCount(first.total, first.records.length, maxPages)
  const full = Math.ceil(first.total / first.records.length)
  if (last === 1) return { ...first, complete: true }
  const records = [...first.records]
  let complete = last >= full
  try {
    const rest = await mapPool(
      Array.from({ length: last - 1 }, (_, index) => index + 2),
      4,
      (page) => postMacse(request, page),
    )
    for (const page of rest) records.push(...page.records)
  } catch {
    complete = false
  }
  return { records, total: first.total, tooMany: null, complete }
}

function swapEndingIY(value: string): string {
  const last = value.slice(-1)
  if (!/[iy]/i.test(last)) return value
  const flipped = last.toLowerCase() === "i" ? "y" : "i"
  const next = last === last.toUpperCase() ? flipped.toUpperCase() : flipped
  return value.slice(0, -1) + next
}

function swapDigraph(value: string, from: string, to: string): string {
  return value.replace(new RegExp(from, "gi"), (match) => {
    const head = match[0] === match[0].toUpperCase() ? to[0].toUpperCase() : to[0].toLowerCase()
    return head + to.slice(1)
  })
}

function swapLetter(value: string, pattern: RegExp, next: string): string {
  return value.replace(pattern, (letter) =>
    letter === letter.toUpperCase() ? next.toUpperCase() : next,
  )
}

function detailed(
  olname: string,
  nlname: string,
  fname: string,
  residence: string,
  from: string,
  to: string,
): MacseRequest {
  return {
    mode: "0",
    olname,
    nlname,
    fname,
    residence,
    changeyear1: from,
    changeyear2: to,
  }
}

async function postMacse(request: MacseRequest, page: number): Promise<MacsePage> {
  const cookie = await macseCookie()
  const body = new URLSearchParams({
    function: "names",
    currentPageNumber: String(page),
    mode: request.mode,
    lname: request.lname ?? "",
    olname: request.olname ?? "",
    nlname: request.nlname ?? "",
    fname: request.fname ?? "",
    residence: request.residence ?? "",
    changeyear1: request.changeyear1 ?? "",
    changeyear2: request.changeyear2 ?? "",
    birthplace: "",
    birthyear1: "",
    birthyear2: "",
    decreenumb: "",
    religion: "0",
  })
  if (page === 1) body.set("btnExecute", "1")
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`A MACSE ${response.status} választ adott.`)
  return parseMacseHtml(await response.text())
}

async function macseCookie(): Promise<string> {
  if (!cookiePromise) {
    cookiePromise = fetch(ENDPOINT, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    })
      .then(async (response) => {
        const html = await response.text()
        const match = html.match(/v_ok=([a-f0-9]+)/)
        if (!match) throw new Error("A MACSE nem adott belépő sütit.")
        return `v_ok=${match[1]}`
      })
      .catch((error) => {
        cookiePromise = null
        throw error
      })
  }
  return cookiePromise
}

function sourceFrom(chunk: string): { url: string; text: string } {
  const label = chunk.match(/Forrás:\s*<\/b>/i)
  if (!label || label.index == null) return { url: "", text: "" }
  const block = chunk.slice(label.index + label[0].length, label.index + label[0].length + 700)
  const end = block.indexOf("</table>")
  const source = end >= 0 ? block.slice(0, end) : block
  const url = source.match(/href=['"](https?:\/\/[^'"]+)['"]/i)?.[1] ?? ""
  return { url, text: clean(source) }
}

function firstCell(chunk: string): string {
  return clean(chunk.match(/<td[^>]*>(.*?)<\/td>/i)?.[1] ?? "")
}

function cellAfter(chunk: string, label: string): string {
  const at = chunk.indexOf(label)
  if (at < 0) return ""
  return clean(chunk.slice(at + label.length).match(/<td[^>]*>(.*?)<\/td>/i)?.[1] ?? "")
}

function clean(value: string): string {
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
  if (/^n\.a\.?$/i.test(text)) return ""
  return text
}

function yearOf(decree: string): number | null {
  const years = [...decree.matchAll(/\b(1[89]\d{2}|19\d{2})\b/g)].map((match) => Number(match[1]))
  const year = years.find((item) => item >= 1800 && item <= 1956)
  return year ?? null
}

function blank(value: string | undefined): string {
  return value?.trim() ?? ""
}

function yearParam(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  return String(value)
}

async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

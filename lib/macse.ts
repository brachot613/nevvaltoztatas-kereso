import type { NameField, Strictness } from "./names.ts"

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
  if (/cz/i.test(trimmed)) add(trimmed.replace(/cz/gi, "c"))
  else if (/c/i.test(trimmed)) {
    add(trimmed.replace(/c/i, (letter) => (letter === "C" ? "Cz" : "cz")))
  }
  const hasDoubleS = /ss/i.test(trimmed) || /sz/i.test(trimmed)
  if (/ss/i.test(trimmed)) add(trimmed.replace(/ss/gi, "sz"))
  if (/sz/i.test(trimmed)) add(trimmed.replace(/sz/gi, "ss"))
  if (!hasDoubleS && /w/i.test(trimmed)) add(swapLetter(trimmed, /w/gi, "v"))
  else if (!hasDoubleS && /v/i.test(trimmed)) add(swapLetter(trimmed, /v/gi, "w"))
  if (/sch/i.test(trimmed)) add(trimmed.replace(/sch/gi, "s"))
  return found.slice(0, 3)
}

export function macseRequests(options: MacseQuery): MacseRequest[] {
  const given = blank(options.keresztnev)
  const place = blank(options.hely)
  const from = yearParam(options.evTol)
  const to = yearParam(options.evIg)
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
    const variant = macseVariants(tokens[0]).find((item) => item !== tokens[0])
    if (options.strictness === "laza" && variant) {
      requests.push(detailed(variant, tokens[1], given, place, from, to))
    }
    return requests.slice(0, 3)
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
    return names.slice(0, 3).map((name) => ({
      mode: "1",
      lname: name,
      fname: given,
    }))
  }

  return names.slice(0, 3).flatMap((name) => {
    if (options.field === "uj") return [detailed("", name, given, place, from, to)]
    if (options.field === "eredeti") return [detailed(name, "", given, place, from, to)]
    return [
      detailed(name, "", given, place, from, to),
      detailed("", name, given, place, from, to),
    ]
  }).slice(0, 4)
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

export async function searchMacse(options: MacseQuery): Promise<MacsePage & { error: string | null }> {
  const requests = macseRequests(options)
  if (requests.length === 0) return { records: [], total: null, tooMany: null, error: null }

  try {
    const pages = await Promise.all(requests.map((request) => postMacse(request)))
    const records: MacseRecord[] = []
    const seen = new Set<string>()
    let total: number | null = null
    let tooMany: number | null = null
    for (const page of pages) {
      if (page.tooMany && page.records.length === 0) {
        tooMany = Math.max(tooMany ?? 0, page.tooMany)
        continue
      }
      if (page.total != null) total = Math.max(total ?? 0, page.total)
      for (const record of page.records) {
        const key = `${record.eredeti}|${record.uj}|${record.keresztnev}|${record.hivatkozas}`
        if (seen.has(key)) continue
        seen.add(key)
        records.push(record)
      }
    }
    if (records.length > 0) tooMany = null
    return { records, total, tooMany, error: null }
  } catch (error) {
    return {
      records: [],
      total: null,
      tooMany: null,
      error: error instanceof Error ? error.message : "A MACSE most nem válaszol.",
    }
  }
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

async function postMacse(request: MacseRequest): Promise<MacsePage> {
  const cookie = await macseCookie()
  const body = new URLSearchParams({
    function: "names",
    currentPageNumber: "1",
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
    btnExecute: "1",
  })
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

import { readFileSync } from "node:fs"
import path from "node:path"

type Place = { nev: string; megye: string; alias: string[] }

type Gazetteer = { telepulesek: Place[] }

let cached: Gazetteer | null = null
let byAlias: Map<string, Place> | null = null

function load(): Gazetteer {
  if (!cached) {
    const file = path.join(process.cwd(), "data", "helyek.json")
    cached = JSON.parse(readFileSync(file, "utf8")) as Gazetteer
  }
  return cached
}

function placeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "")
}

function aliases(): Map<string, Place> {
  if (!byAlias) {
    byAlias = new Map()
    for (const place of load().telepulesek) {
      for (const name of [place.nev, ...place.alias]) {
        byAlias.set(placeKey(name), place)
      }
    }
  }
  return byAlias
}

const GEO: Record<string, string[]> = {
  n: ["nagy"],
  k: ["kis"],
  sz: ["szent", "szekes", "szekely"],
  b: ["balassa", "bekes"],
  m: ["maramaros"],
  u: ["uj"],
  a: ["also"],
  f: ["felso"],
}

function pieces(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

export function flexibleMatch(query: string, target: string, geo = false): boolean {
  const foldedTarget = placeKey(target)
  const foldedQuery = placeKey(query)
  if (!foldedTarget || !foldedQuery) return false
  if (foldedTarget === foldedQuery) return true
  const parts = pieces(query)
  if (parts.length === 1) {
    const part = parts[0] ?? ""
    if (part.length < 4) return false
    if (foldedTarget.startsWith(part) && foldedTarget.length - part.length <= 2) return true
    if (part.startsWith(foldedTarget) && part.length - foldedTarget.length <= 2) return true
    return false
  }
  return consume(parts, foldedTarget, geo)
}

function consume(parts: string[], full: string, geo: boolean): boolean {
  function walk(index: number, rest: string): boolean {
    if (index === parts.length) return true
    const last = index === parts.length - 1
    const options = geo ? [parts[index] ?? "", ...(GEO[parts[index] ?? ""] ?? [])] : [parts[index] ?? ""]
    for (const option of options) {
      if (!option || !rest.startsWith(option)) continue
      if (last || walk(index + 1, rest.slice(option.length))) return true
    }
    return false
  }
  return walk(0, full)
}

export function resolvePlace(value: string): { nev: string; megye: string } | null {
  const key = placeKey(value)
  if (!key) return null
  const direct = aliases().get(key)
  if (direct) return { nev: direct.nev, megye: direct.megye }
  let best: { place: Place; gap: number } | null = null
  for (const place of load().telepulesek) {
    if (!flexibleMatch(value, place.nev, true)) continue
    const gap = Math.abs(placeKey(place.nev).length - key.length)
    if (!best || gap < best.gap) best = { place, gap }
  }
  return best ? { nev: best.place.nev, megye: best.place.megye } : null
}

export function sameTown(stored: string, query: string): boolean {
  if (!stored.trim() || !query.trim()) return false
  const storedPlace = resolvePlace(stored)
  const queryPlace = resolvePlace(query)
  if (storedPlace && queryPlace && placeKey(storedPlace.nev) === placeKey(queryPlace.nev)) return true
  if (flexibleMatch(query, stored, true) || flexibleMatch(stored, query, true)) return true
  if (queryPlace && flexibleMatch(query, stored, true)) return true
  return false
}

export function textHasFlexible(query: string, text: string, geo: boolean): boolean {
  const words = pieces(text)
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? ""
    if (flexibleMatch(query, word, geo)) return true
    const joined = words.slice(index, index + 4).join("")
    if (joined !== word && flexibleMatch(query, joined, geo)) return true
  }
  return false
}

export function sameCounty(stored: string, query: string): boolean {
  const left = placeKey(stored)
  const right = placeKey(query).replace(/megye|varmegye/g, "")
  if (!left || !right) return false
  if (left === right) return true
  if (right === "pest" && left === "budapest") return true
  if (pieces(stored).some((part) => part === right)) return true
  if (right.length >= 4 && pieces(stored).some((part) => part.startsWith(right) && part.length - right.length <= 2)) {
    return true
  }
  return flexibleMatch(query, stored, true)
}

export function townsForCounty(megye: string): string[] {
  const key = placeKey(megye).replace(/megye|varmegye/g, "")
  return load()
    .telepulesek.filter((place) => placeKey(place.megye) === key)
    .map((place) => place.nev)
}

export function countyOfTown(town: string): string {
  return resolvePlace(town)?.megye ?? ""
}

export function isBudapest(value: string): boolean {
  const chunks = pieces(value)
  if (chunks.length === 0) return false
  if (chunks.some((chunk) => capitalKey(chunk))) return true
  const whole = placeKey(value)
  return capitalKey(whole)
}

function capitalKey(key: string): boolean {
  if (!key) return false
  if (key.startsWith("budapest")) return true
  if (key === "buda" || key === "obuda" || key === "pest" || key === "pesten") return true
  if (key === "bpest" || key === "bpast" || key === "bpst") return true
  const resolved = aliases().get(key)
  return Boolean(resolved && placeKey(resolved.megye) === "budapest")
}

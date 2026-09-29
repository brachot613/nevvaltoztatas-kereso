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

export function resolvePlace(value: string): { nev: string; megye: string } | null {
  const key = placeKey(value)
  if (!key) return null
  const place = aliases().get(key)
  if (!place) return null
  return { nev: place.nev, megye: place.megye }
}

export function sameTown(stored: string, query: string): boolean {
  const left = resolvePlace(stored) ?? resolvePlace(query)
  const storedKey = placeKey(resolvePlace(stored)?.nev ?? stored)
  const queryKey = placeKey(resolvePlace(query)?.nev ?? query)
  if (!storedKey || !queryKey) return false
  if (storedKey === queryKey) return true
  if (left && placeKey(left.nev) === storedKey && placeKey(left.nev) === queryKey) return true
  return false
}

export function sameCounty(stored: string, query: string): boolean {
  const left = placeKey(stored)
  const right = placeKey(query).replace(/megye|varmegye/g, "")
  if (!left || !right) return false
  if (left === right) return true
  if (right === "pest" && left === "budapest") return true
  if (right === "budapest" && left === "budapest") return true
  return false
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

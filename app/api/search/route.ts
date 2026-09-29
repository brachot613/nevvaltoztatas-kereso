import { searchCatalog } from "@/lib/catalog"
import type { NameField, Strictness } from "@/lib/names"
import { readNote } from "@/lib/note"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const field = oneOf(url.searchParams.get("field"), ["mind", "eredeti", "uj"] as const, "mind")
  const strictness = oneOf(url.searchParams.get("strictness"), ["laza", "szoros"] as const, "laza")
  const reading = readNote(url.searchParams.get("q") ?? "")
  const result = await searchCatalog({
    query: reading.query,
    field: field as NameField,
    strictness: strictness as Strictness,
    keresztnev: url.searchParams.get("keresztnev") || reading.keresztnev,
    hely: url.searchParams.get("hely") || reading.hely,
    megye: url.searchParams.get("megye") ?? "",
    evTol: numberOrNull(url.searchParams.get("tol")) ?? reading.evTol,
    evIg: numberOrNull(url.searchParams.get("ig")) ?? reading.evIg,
  })
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  })
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function numberOrNull(value: string | null): number | null {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

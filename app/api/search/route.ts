import { searchCatalog } from "@/lib/catalog"
import type { NameField, Strictness } from "@/lib/names"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const field = oneOf(url.searchParams.get("field"), ["mind", "eredeti", "uj"] as const, "mind")
  const strictness = oneOf(url.searchParams.get("strictness"), ["laza", "szoros"] as const, "laza")
  const result = await searchCatalog({
    query: url.searchParams.get("q") ?? "",
    field: field as NameField,
    strictness: strictness as Strictness,
    keresztnev: url.searchParams.get("keresztnev") ?? "",
    hely: url.searchParams.get("hely") ?? "",
    evTol: numberOrNull(url.searchParams.get("tol")),
    evIg: numberOrNull(url.searchParams.get("ig")),
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

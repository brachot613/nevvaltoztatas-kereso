"use client"

import { useEffect, useState } from "react"
import type { SearchResponse } from "@/lib/catalog"
import type { NameField, Strictness } from "@/lib/names"
import { cn } from "@/lib/utils"

const EXAMPLES = ["Kohn", "Weiss", "Aczél", "Korányi"]

type Status = "idle" | "loading" | "done" | "error"

export function SearchApp() {
  const [query, setQuery] = useState("")
  const [field, setField] = useState<NameField>("mind")
  const [strictness, setStrictness] = useState<Strictness>("laza")
  const [keresztnev, setKeresztnev] = useState("")
  const [hely, setHely] = useState("")
  const [tol, setTol] = useState("")
  const [ig, setIg] = useState("")
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [resultKey, setResultKey] = useState("")

  const trimmedQuery = query.trim()
  const searching = trimmedQuery.length >= 2
  const requestKey = JSON.stringify({
    q: trimmedQuery,
    field,
    strictness,
    keresztnev: keresztnev.trim(),
    hely: hely.trim(),
    tol: tol.trim(),
    ig: ig.trim(),
  })
  const fresh = result != null && resultKey === requestKey
  const filtersOn = Boolean(keresztnev.trim() || hely.trim() || tol.trim() || ig.trim())

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void runSearch(controller.signal)
    }, 280)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // Filters are part of the search, so they retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, query, field, strictness, keresztnev, hely, tol, ig])

  async function runSearch(signal: AbortSignal) {
    const trimmed = query.trim()
    setStatus("loading")
    setMessage(null)
    const params = new URLSearchParams({
      q: trimmed,
      field,
      strictness,
      keresztnev,
      hely,
      tol,
      ig,
    })
    try {
      const response = await fetch(`/api/search?${params}`, { signal, cache: "no-store" })
      if (!response.ok) throw new Error("A keresés nem sikerült.")
      const data = (await response.json()) as SearchResponse
      if (signal.aborted) return
      setResult(data)
      setResultKey(requestKey)
      setStatus("done")
    } catch (error) {
      if (signal.aborted) return
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "A keresés nem sikerült.")
    }
  }

  const showResults = searching && (status === "loading" || status === "done" || status === "error")
  const visible = fresh ? result : null

  return (
    <div className="flex-1 bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-8 sm:px-8 sm:py-14">
        <header className="grid gap-4">
          <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-primary uppercase">
            1800–1955
          </p>
          <h1 className="font-serif text-5xl leading-none font-medium tracking-tight sm:text-6xl">
            Névkereső
          </h1>
          <p className="max-w-xl text-lg leading-8 text-muted-foreground">
            Eredeti és felvett vezetéknév, egy mezőben. Nem kell betűre pontosan egyeznie.
          </p>
        </header>

        <form
          className="mt-10"
          onSubmit={(event) => {
            event.preventDefault()
            const controller = new AbortController()
            void runSearch(controller.signal)
          }}
        >
          <label htmlFor="q" className="sr-only">
            Vezetéknév
          </label>
          <div className="flex items-end gap-4 border-b-2 border-foreground transition-colors focus-within:border-seal">
            <input
              id="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Kohn"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-16 min-w-0 flex-1 bg-transparent font-serif text-4xl outline-none placeholder:text-muted-foreground/40 sm:text-5xl"
            />
            <button
              type="submit"
              className="mb-3 shrink-0 text-sm font-medium tracking-[0.16em] text-primary uppercase"
            >
              Keresés
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TextChoice
              label="Hol"
              value={field}
              onChange={setField}
              options={[
                ["mind", "Mindkét név"],
                ["eredeti", "Csak eredeti"],
                ["uj", "Csak felvett"],
              ]}
            />
            <TextChoice
              label="Egyezés"
              value={strictness}
              onChange={setStrictness}
              options={[
                ["laza", "Laza"],
                ["szoros", "Szoros"],
              ]}
            />
          </div>

          <details className="mt-5">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Szűkítés keresztnévvel, hellyel, évvel
              {filtersOn ? <span className="text-seal"> · bekapcsolva</span> : null}
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Field label="Keresztnév" value={keresztnev} onChange={setKeresztnev} />
              <Field label="Hely" value={hely} onChange={setHely} />
              <Field label="Évtől" value={tol} onChange={setTol} numeric />
              <Field label="Évig" value={ig} onChange={setIg} numeric />
            </div>
          </details>
        </form>

        {!showResults && (
          <section className="mt-10 grid gap-8">
            <p className="text-sm text-muted-foreground">
              Például{" "}
              {EXAMPLES.map((example, index) => (
                <span key={example}>
                  {index > 0 && ", "}
                  <button
                    type="button"
                    className="font-serif text-base text-foreground underline decoration-seal/50 decoration-1 underline-offset-4"
                    onClick={() => setQuery(example)}
                  >
                    {example}
                  </button>
                </span>
              ))}
            </p>
            <div className="grid gap-3 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
              <p>
                Két lista fut egyszerre, és egyik sem kerül a gépedre. A{" "}
                <a className="text-foreground underline decoration-border underline-offset-4" href="https://macse.hu/db/names/names.php" target="_blank" rel="noreferrer">
                  MACSE
                </a>{" "}
                1815–1955 közötti névváltoztatásai élőben jönnek. Mellette Szentiványi Zoltán
                1800–1893-as kötete, laza egyezéssel: ékezet, cz/c, w/v, Weiss/Weisz, egy-két eltérő betű.
              </p>
              <p>Két szó esetén az egyik az eredeti név, a másik a felvett, a sorrend mindegy.</p>
            </div>
          </section>
        )}

        {showResults && (
          <section aria-live="polite" className="mt-10">
            <StatusLine status={status} message={message} result={visible} />
            {visible && visible.hits.length > 0 && (
              <ol className="mt-4">
                {groupHits(visible.hits).map((group) => (
                  <li key={group.rows[0]?.id} className="border-t border-border py-7">
                    <article className="grid gap-3">
                      <NamePair
                        eredeti={group.eredeti}
                        uj={group.uj}
                        matched={group.rows[0]?.matched ?? []}
                      />
                      {group.rows.length === 1 && group.rows[0] ? (
                        <HitBody hit={group.rows[0]} />
                      ) : (
                        <ol>
                          {group.rows.map((hit) => (
                            <li key={hit.id} className="border-t border-border/80 py-4">
                              <HitBody hit={hit} />
                            </li>
                          ))}
                        </ol>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <footer className="mt-auto pt-16 text-sm leading-6 text-muted-foreground">
          Semmit nem mentünk el. A MACSE-t élőben kérdezzük, a Szentiványi-kötet a szerveren marad.
        </footer>
      </div>
    </div>
  )
}

function StatusLine({
  status,
  message,
  result,
}: {
  status: Status
  message: string | null
  result: SearchResponse | null
}) {
  if (!result) {
    if (status === "error") return <p className="text-sm text-destructive">{message}</p>
    return (
      <p className="text-sm text-muted-foreground">Keresek a MACSE-ben és a Szentiványi-listában…</p>
    )
  }
  if (result.tooShort) return null
  if (result.hits.length === 0) {
    return (
      <p className="max-w-xl text-sm leading-6">
        {result.macse.tooMany
          ? `A MACSE ${result.macse.tooMany.toLocaleString("hu-HU")} sort talált, és listát csak keresztnévvel vagy hellyel ad. A Szentiványi-kötetben nincs egyezés.`
          : `Nincs találat.${result.macse.error ? ` ${result.macse.error}` : ""}`}
      </p>
    )
  }
  const count = (value: number) => value.toLocaleString("hu-HU")
  const macseLine = result.macse.tooMany
    ? `A MACSE ${count(result.macse.tooMany)} sort talált, és listát csak szűkítve ad. Ami lent van, a Szentiványi-kötetből jön.`
    : result.macse.total
      ? `A MACSE-ben ${count(result.macse.total)} találat van, ebből ${count(result.macse.fetched)} sor jött át.`
      : result.macse.error
        ? result.macse.error
        : "A MACSE-ben nincs találat."
  const book =
    result.szentivanyi.matched > 0
      ? ` A Szentiványi-kötetben ${count(result.szentivanyi.matched)} egyezés.`
      : ""
  const clipped =
    result.szentivanyi.matched > result.hits.length
      ? " A legközelebbi sorok látszanak."
      : ""
  return (
    <div className="grid gap-1">
      <p className="font-serif text-2xl">{result.hits.length} sor</p>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {macseLine}
        {book}
        {clipped}
      </p>
    </div>
  )
}

function groupHits(hits: SearchResponse["hits"]) {
  const groups: Array<{ eredeti: string; uj: string; rows: SearchResponse["hits"] }> = []
  const index = new Map<string, number>()
  for (const hit of hits) {
    const key = `${hit.eredeti}\0${hit.uj}`
    const at = index.get(key)
    if (at == null) {
      index.set(key, groups.length)
      groups.push({ eredeti: hit.eredeti, uj: hit.uj, rows: [hit] })
    } else {
      groups[at]?.rows.push(hit)
    }
  }
  return groups
}

function NamePair({
  eredeti,
  uj,
  matched,
}: {
  eredeti: string
  uj: string
  matched: Array<"eredeti" | "uj">
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <NameLine label="Eredeti" name={eredeti} marked={matched.includes("eredeti")} />
      <span aria-hidden className="pb-0.5 text-xl text-seal">
        →
      </span>
      <NameLine label="Felvett" name={uj} marked={matched.includes("uj")} />
    </div>
  )
}

function HitBody({ hit }: { hit: SearchResponse["hits"][number] }) {
  const facts = [hit.keresztnev, hit.hely, hit.ev?.toString(), hit.hivatkozas].filter(Boolean)
  return (
    <div className="grid gap-1.5">
      <p className="text-[0.95rem] leading-6">
        {facts.join(" · ") || "Nincs további adat a sorban."}
      </p>
      {hit.reszlet && <p className="text-sm leading-6 text-muted-foreground">{hit.reszlet}</p>}
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-primary uppercase">
          {sourceLabel(hit.sources)}
        </span>
        {hit.forrasUrl.startsWith("http") && (
          <a
            href={hit.forrasUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline decoration-border underline-offset-4"
          >
            forrásoldal
          </a>
        )}
        <span className="text-muted-foreground">{hit.reasons.slice(0, 2).join(" · ")}</span>
      </p>
    </div>
  )
}

function NameLine({
  label,
  name,
  marked,
}: {
  label: string
  name: string
  marked: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">{label}</div>
      <div
        className={cn(
          "font-serif text-[1.65rem] leading-tight break-words sm:text-3xl",
          marked && "text-seal",
        )}
      >
        {name}
      </div>
    </div>
  )
}

function TextChoice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: Array<[T, string]>
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">{label}</span>
      {options.map(([option, text]) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              "text-sm",
              active
                ? "text-foreground underline decoration-seal decoration-2 underline-offset-4"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  numeric = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  numeric?: boolean
}) {
  const id = `szuro-${label}`
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        value={value}
        inputMode={numeric ? "numeric" : "text"}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 border-b border-border bg-transparent outline-none focus:border-foreground"
        autoComplete="off"
      />
    </label>
  )
}

function sourceLabel(sources: Array<"macse" | "szentivanyi">): string {
  const names = sources.map((source) => (source === "macse" ? "MACSE" : "Szentiványi"))
  return names.join(" · ")
}

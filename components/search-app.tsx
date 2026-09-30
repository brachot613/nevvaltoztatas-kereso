"use client"

import { useEffect, useState } from "react"
import type { SearchResponse } from "@/lib/catalog"
import type { NameField, Strictness } from "@/lib/names"
import { readNote } from "@/lib/note"
import { cn } from "@/lib/utils"

const EXAMPLES = ["Nagy", "Kovács", "Tóth", "Szabó", "Horváth", "Varga", "Kiss", "Molnár", "Németh", "Balogh"]
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

type Drop = { q: string; keresztnev: boolean; hely: boolean; ev: boolean }

type Status = "idle" | "loading" | "done" | "error"

export function SearchApp() {
  const [query, setQuery] = useState("")
  const [field, setField] = useState<NameField>("mind")
  const [strictness, setStrictness] = useState<Strictness>("laza")
  const [keresztnev, setKeresztnev] = useState("")
  const [hely, setHely] = useState("")
  const [megye, setMegye] = useState("")
  const [tol, setTol] = useState("")
  const [ig, setIg] = useState("")
  const [budapestKizarva, setBudapestKizarva] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [resultKey, setResultKey] = useState("")
  const [drop, setDrop] = useState<Drop>({ q: "", keresztnev: false, hely: false, ev: false })
  const [listWindow, setListWindow] = useState({ key: "", limit: 40 })

  const trimmedQuery = query.trim()
  const reading = readNote(trimmedQuery)
  const noteOff = drop.q === trimmedQuery ? drop : { q: trimmedQuery, keresztnev: false, hely: false, ev: false }
  const manualYear = Boolean(tol.trim() || ig.trim())
  const effective = {
    q: reading.query.trim(),
    keresztnev: keresztnev.trim() || (noteOff.keresztnev ? "" : reading.keresztnev),
    hely: hely.trim() || (noteOff.hely ? "" : reading.hely),
    megye: megye.trim(),
    tol: manualYear || noteOff.ev || reading.evTol == null ? tol.trim() : String(reading.evTol),
    ig: manualYear || noteOff.ev || reading.evIg == null ? ig.trim() : String(reading.evIg),
  }
  const searching = effective.q.length >= 2 || Boolean(effective.hely || effective.megye)
  const requestKey = JSON.stringify({
    q: effective.q,
    field,
    strictness,
    keresztnev: effective.keresztnev,
    hely: effective.hely,
    megye: effective.megye,
    tol: effective.tol,
    ig: effective.ig,
    bp: budapestKizarva ? "nelkul" : "",
  })
  const fresh = result != null && resultKey === requestKey
  const hiddenFilters = Boolean(effective.keresztnev || effective.tol || effective.ig)

  async function runSearch(signal: AbortSignal) {
    setStatus("loading")
    setMessage(null)
    const params = new URLSearchParams({
      q: effective.q,
      field,
      strictness,
      keresztnev: effective.keresztnev,
      hely: effective.hely,
      megye: effective.megye,
      tol: effective.tol,
      ig: effective.ig,
      ...(budapestKizarva ? { bp: "nelkul" } : {}),
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
  }, [searching, effective.q, field, strictness, effective.keresztnev, effective.hely, effective.megye, effective.tol, effective.ig, budapestKizarva])

  const showResults = searching && (status === "loading" || status === "done" || status === "error")
  const visible = fresh ? result : null
  const listLimit = listWindow.key === requestKey ? listWindow.limit : 40
  const groups = visible ? groupHits(visible.hits) : []
  const shownGroups = groups.slice(0, listLimit)
  const waiting = effective.megye && effective.q.length < 2 ? "Keresek a megye városaiban…" : "Keresek…"
  function unreadParams() {
    const params = new URLSearchParams({
      q: effective.q,
      field,
      strictness,
      keresztnev: effective.keresztnev,
      hely: effective.hely,
      megye: effective.megye,
      tol: effective.tol,
      ig: effective.ig,
      ...(budapestKizarva ? { bp: "nelkul" } : {}),
    })
    params.set("only", "olvashatatlan")
    return params
  }

  return (
    <div className="flex-1 bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-8 sm:px-8 sm:py-14">
        <header className="grid gap-4">
          <h1 className="max-w-full font-serif text-[1.85rem] leading-[1.15] font-medium tracking-tight text-balance sm:text-[2.35rem]">
            Vezetéknév-változtatás kereső
          </h1>
          <p className="max-w-xl text-[calc(1.125rem-2pt)] leading-7 text-pretty text-muted-foreground">
            Írd be a régi vezetéknevet, vagy azt, amire kicserélték. Nem baj, ha nem pontosan úgy írod, ahogy a papíron van. Megmutatja, ki miről mire változtatta a nevét, 1800-tól 1955-ig. Két forrásból dolgozik:{" "}
            <a
              className="text-foreground underline decoration-border underline-offset-4"
              href="https://mek.oszk.hu/07400/07431/"
              target="_blank"
              rel="noreferrer"
            >
              Szentiványi Zoltán: Századunk névváltoztatásai
            </a>{" "}
            (1800–1893) és a{" "}
            <a
              className="text-foreground underline decoration-border underline-offset-4"
              href="https://macse.hu/db/names/names.php"
              target="_blank"
              rel="noreferrer"
            >
              MACSE
            </a>{" "}
            névváltoztatási listája (1815–1955).
          </p>
        </header>

        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault()
            const controller = new AbortController()
            void runSearch(controller.signal)
          }}
        >
          <label htmlFor="q" className="sr-only">
            Név vagy rövid mondat
          </label>
          <div className="flex items-end gap-4 border-b-2 border-foreground transition-colors focus-within:border-seal">
            <textarea
              id="q"
              rows={trimmedQuery.length > 42 ? 2 : 1}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={hely.trim() || megye.trim() ? "" : "Nagy"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={cn(
                "min-w-0 w-full flex-1 resize-none bg-transparent font-serif outline-none placeholder:text-muted-foreground/40",
                trimmedQuery.length > 22
                  ? "py-2 text-2xl leading-snug sm:text-3xl"
                  : "h-16 text-4xl leading-none sm:text-5xl",
              )}
            />
            <button
              type="submit"
              className={cn(
                "mb-2 shrink-0 px-1 py-2 text-sm font-medium tracking-[0.16em] text-primary uppercase",
                FOCUS,
              )}
            >
              Keresés
            </button>
          </div>

          {reading.active && (
            <Reading
              keresztnev={!keresztnev.trim() && !noteOff.keresztnev ? reading.keresztnev : ""}
              hely={!hely.trim() && !noteOff.hely ? reading.hely : ""}
              evTol={manualYear || noteOff.ev ? null : reading.evTol}
              evIg={manualYear || noteOff.ev ? null : reading.evIg}
              onDrop={(part) => setDrop({ ...noteOff, [part]: true })}
            />
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TextChoice
              label="Név"
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

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field
              label="Város"
              value={hely}
              onChange={setHely}
              placeholder={noteOff.hely ? "" : reading.hely || "Szeged"}
            />
            <Field label="Megye" value={megye} onChange={setMegye} placeholder="Zala" />
          </div>
          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={budapestKizarva}
              onChange={(event) => setBudapestKizarva(event.target.checked)}
              className={cn("size-4 accent-primary", FOCUS)}
            />
            Budapest kizárása
          </label>

          <details className="mt-5">
            <summary className={cn("cursor-pointer text-sm text-muted-foreground", FOCUS)}>
              Szűrés
              {hiddenFilters ? <span className="text-seal"> ·</span> : null}
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field
                label="Keresztnév"
                value={keresztnev}
                onChange={setKeresztnev}
                placeholder={noteOff.keresztnev ? "" : reading.keresztnev}
              />
              <Field
                label="Évtől"
                value={tol}
                onChange={setTol}
                numeric
                placeholder={noteOff.ev || reading.evTol == null ? "" : String(reading.evTol)}
              />
              <Field
                label="Évig"
                value={ig}
                onChange={setIg}
                numeric
                placeholder={noteOff.ev || reading.evIg == null ? "" : String(reading.evIg)}
              />
            </div>
          </details>
        </form>

        {!showResults && (
          <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className={cn("text-foreground", FOCUS)}
                  onClick={() => setQuery(example)}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        )}

        {showResults && (
          <section aria-live="polite" className="mt-8">
            <StatusLine status={status} message={message} result={visible} waiting={waiting} />
            {shownGroups.length > 0 && (
              <ol className="mt-4">
                {shownGroups.map((group) => (
                  <li key={group.rows[0]?.id} className="border-t border-border py-5">
                    <article className="grid gap-3">
                      <NamePair
                        eredeti={group.eredeti}
                        uj={group.uj}
                        matched={effective.q.length >= 2 ? (group.rows[0]?.matched ?? []) : []}
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
            {groups.length > shownGroups.length && (
              <button
                type="button"
                className={cn("mt-1 py-3 text-sm text-foreground", FOCUS)}
                onClick={() => setListWindow({ key: requestKey, limit: listLimit + 40 })}
              >
                További találatok
              </button>
            )}
            {visible && visible.olvashatatlanCount > 0 && (
              <UnreadRows key={requestKey} count={visible.olvashatatlanCount} params={unreadParams()} />
            )}
          </section>
        )}

      </div>
    </div>
  )
}

function StatusLine({
  status,
  message,
  result,
  waiting,
}: {
  status: Status
  message: string | null
  result: SearchResponse | null
  waiting: string
}) {
  if (!result) {
    if (status === "error") return <p className="text-sm text-destructive">{message}</p>
    return <p className="text-sm text-muted-foreground">{waiting}</p>
  }
  if (result.tooShort) return null
  if (result.hits.length === 0) {
    if (result.olvashatatlanCount > 0 && !result.macse.tooMany) return null
    return (
      <p className="text-sm">
        {result.macse.tooMany ? "Túl sok találat." : "Nincs találat."}
        {result.macse.error ? ` ${result.macse.error}` : ""}
      </p>
    )
  }
  const count = (value: number) => value.toLocaleString("hu-HU")
  const bits: string[] = []
  if (result.macse.tooMany && result.macse.fetched === 0) bits.push("MACSE túl sok")
  else if (result.macse.complete && (result.macse.fetched > 0 || result.macse.total)) {
    bits.push(`MACSE ${count(result.macse.fetched || result.macse.total || 0)}`)
  } else if (result.macse.total) {
    bits.push(`MACSE ${count(result.macse.fetched)}/${count(result.macse.total)}`)
  } else if (result.macse.error) bits.push(result.macse.error)
  if (result.szentivanyi.matched > 0) bits.push(`Szentiványi ${count(result.szentivanyi.matched)}`)
  return (
    <p className="sticky top-0 z-10 -mx-5 flex flex-wrap items-baseline gap-x-3 border-b border-border bg-background/95 px-5 py-3 text-sm text-muted-foreground backdrop-blur-sm sm:-mx-8 sm:px-8">
      <span className="font-serif text-3xl leading-none text-foreground">{count(result.hits.length)}</span>
      {bits.length > 0 && <span>{bits.join(" · ")}</span>}
    </p>
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
      {facts.length > 0 && <p className="text-[0.95rem] leading-6">{facts.join(" · ")}</p>}
      {hit.reszlet && <p className="text-sm leading-6 text-muted-foreground">{hit.reszlet}</p>}
      <p className="text-sm">
        {hit.forrasUrl.startsWith("http") ? (
          <a
            href={hit.forrasUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "text-[0.68rem] font-semibold tracking-[0.14em] text-primary uppercase underline decoration-border underline-offset-4",
              FOCUS,
            )}
          >
            {sourceLabel(hit.sources)}
          </a>
        ) : (
          <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-primary uppercase">
            {sourceLabel(hit.sources)}
          </span>
        )}
      </p>
    </div>
  )
}

function Reading({
  keresztnev,
  hely,
  evTol,
  evIg,
  onDrop,
}: {
  keresztnev: string
  hely: string
  evTol: number | null
  evIg: number | null
  onDrop: (part: "keresztnev" | "hely" | "ev") => void
}) {
  const year = evTol == null ? "" : evTol === evIg ? String(evTol) : `${evTol}–${evIg}`
  if (!keresztnev && !hely && !year) return null
  return (
    <p className="mt-4 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
      {keresztnev && (
        <ReadingPart label={`${keresztnev} nélkül`} onClick={() => onDrop("keresztnev")}>
          {keresztnev}
        </ReadingPart>
      )}
      {hely && (
        <ReadingPart label={`${hely} nélkül`} onClick={() => onDrop("hely")}>
          {hely}
        </ReadingPart>
      )}
      {year && (
        <ReadingPart label={`${year} nélkül`} onClick={() => onDrop("ev")}>
          {year}
        </ReadingPart>
      )}
    </p>
  )
}

function ReadingPart({
  children,
  label,
  onClick,
}: {
  children: string
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn("text-foreground", FOCUS)}>
      {children}
      <span aria-hidden className="ml-1 text-muted-foreground">
        ×
      </span>
    </button>
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
              FOCUS,
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
  placeholder = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  numeric?: boolean
  placeholder?: string
}) {
  const id = `szuro-${label}`
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={numeric ? "numeric" : "text"}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 border-b border-border bg-transparent outline-none placeholder:text-muted-foreground/40 focus:border-foreground",
          FOCUS,
        )}
        autoComplete="off"
      />
    </label>
  )
}

function UnreadRows({ count, params }: { count: number; params: URLSearchParams }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<SearchResponse["olvashatatlan"] | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState(40)
  const visibleRows = rows?.slice(0, shown) ?? []

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || rows) return
    try {
      const response = await fetch(`/api/search?${params}`, { cache: "no-store" })
      if (!response.ok) throw new Error("A sorok nem jöttek át.")
      const data = (await response.json()) as SearchResponse
      setRows(data.olvashatatlan)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => void toggle()}
        className={cn(
          "flex w-full items-baseline justify-between gap-4 py-4 text-left text-sm text-muted-foreground",
          FOCUS,
        )}
      >
        <span>{count.toLocaleString("hu-HU")} sor, helye nem olvasható</span>
        <span aria-hidden className="text-foreground">
          {open ? "–" : "+"}
        </span>
      </button>
      {open && failed && <p className="pb-4 text-sm text-destructive">A sorok nem jöttek át.</p>}
      {open && !failed && rows == null && <p className="pb-4 text-sm text-muted-foreground">Keresek…</p>}
      {open && rows && rows.length > 0 && (
        <ol>
          {groupHits(visibleRows).map((group) => (
            <li key={group.rows[0]?.id} className="border-t border-border/80 py-4">
              <article className="grid gap-3">
                <NamePair eredeti={group.eredeti} uj={group.uj} matched={group.rows[0]?.matched ?? []} />
                {group.rows.length === 1 && group.rows[0] ? (
                  <HitBody hit={group.rows[0]} />
                ) : (
                  <ol>
                    {group.rows.map((hit) => (
                      <li key={hit.id} className="border-t border-border/80 py-3">
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
      {open && rows && shown < rows.length && (
        <button
          type="button"
          className={cn("mb-6 text-sm text-foreground", FOCUS)}
          onClick={() => setShown((value) => value + 80)}
        >
          További {Math.min(80, rows.length - shown).toLocaleString("hu-HU")}
        </button>
      )}
    </div>
  )
}

function sourceLabel(sources: Array<"macse" | "szentivanyi">): string {
  const names = sources.map((source) => (source === "macse" ? "MACSE" : "Szentiványi"))
  return names.join(" · ")
}

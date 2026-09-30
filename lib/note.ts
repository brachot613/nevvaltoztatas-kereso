export type NoteReading = {
  query: string
  keresztnev: string
  hely: string
  evTol: number | null
  evIg: number | null
  ordered: boolean
  active: boolean
}

const GIVEN = words(`
  Ádám Adolf Ágoston Ágost Albert Alajos Alfréd Andor András Antal Ármin Áron Artúr
  Bálint Béla Benedek Benjámin Benő Bernát Bertalan Dániel Dávid Dezső Döme Ede Elek
  Emil Endre Ernő Ferenc Ferencz Flórián Fülöp Gábor Gergely Géza Gusztáv György Gyula
  Győző Henrik Herman Hermann Hugó Ignác Ignácz Illés Imre István Izidor Izrael Jakab
  János Jenő József Kálmán Károly Lajos László Leó Leon Lipót Lőrinc Manó Márk Márton
  Máté Mátyás Mihály Miklós Miksa Mór Móric Mózes Nándor Náthán Ödön Oszkár Pál Péter
  Rezső Richárd Róbert Rudolf Salamon Sámuel Samu Sándor Simon Soma Tamás Tibor Tivadar
  Vencel Vilmos Vince Zakariás Zoltán Zsigmond Zsiga
  Adél Amália Anna Auguszta Berta Blanka Borbála Cecília Dorottya Emma Erzsébet Etel
  Etelka Eugénia Fáni Flóra Franciska Frida Gizella Hermina Ida Ilona Irén Janka Jolán
  Jozefa Júlia Julianna Karolina Katalin Klára Laura Lina Lujza Magdolna Malvin Margit
  Mária Matild Netti Nina Olga Paula Paulina Piroska Regina Róza Rozália Rózsa Sarolta
  Sára Szeréna Szerén Teréz Terézia Valéria Vilma Zelma Zsófia Aranka Elza Giza Hani
  Lili Mimi Réka Rella
`)

const PLACES = words(`
  Budapest Bpest Bp Pest Buda Óbuda Bécs Wien Csacza Zsámbokrét Pozsony Kassa Kolozsvár
  Temesvár Szeged Debrecen Pécs Győr Miskolc Szombathely Sopron Eger Vác Székesfehérvár
  Nyíregyháza Szatmár Nagyvárad Arad Brassó Marosvásárhely Szabadka Újvidék Zombor Versec
  Nagykanizsa Kaposvár Zágráb Fiume Eszék Munkács Beregszász Máramarossziget Nagybánya
  Szatmárnémeti Nagyszeben Székelyudvarhely Sepsiszentgyörgy Csíkszereda Lugos Pancsova
  Zenta Nagybecskerek Pozsega Varasd Zára Eperjes Besztercebánya Trencsén Nyitra Komárom
  Késmárk Lőcse Igló Rimaszombat Losonc Érsekújvár Dunaszerdahely Léva Selmecbánya
  Körmöcbánya Zólyom Zsolna Rózsahegy Liptószentmiklós Poprád Bártfa Pöstyén Gyula Makó
  Pápa Keszthely Szolnok Kecskemét Cegléd Baja Szekszárd Sátoraljaújhely Sárospatak
  Hódmezővásárhely Békéscsaba Szentes Csongrád Mohács Veszprém Esztergom Kalocsa Hatvan
  Gyöngyös Jászberény Karcag Kisvárda Szentes Orosháza Kőszeg Moson Magyaróvár Siófok
  Balatonfüred Tapolca Dunaújváros Érd Gödöllő Visegrád Tata Szarvas Békés
`)

const STOP = words(`
  a az és volt lett nev neve nevet néven nevén nevű felvette felvett felvettek eredeti
  új uj vezetéknév keresztnév született szül lakhely lakhelye hely helyen ben ban körül
  kb között év évben család dédapa nagyapa nagyapám apja anyja fia szerint aki legyen
  keresd keresem kérem meg hogy pedig akkor jött ment lakott élt éltek nevét
`)

export function readNote(raw: string): NoteReading {
  const original = raw.trim().replace(/\s+/g, " ")
  const plain: NoteReading = {
    query: original,
    keresztnev: "",
    hely: "",
    evTol: null,
    evIg: null,
    ordered: false,
    active: false,
  }
  if (fold(original).length < 2) return plain

  const years = pullYears(original)
  const directed = pullDirected(years.text)
  const tokens = trimIncomplete(tokenize(directed.text))
  const picked = classify(tokens, directed)

  const query = picked.surnames.join(" ")
  if (fold(query).length < 2) return plain

  const reading: NoteReading = {
    query,
    keresztnev: picked.keresztnev,
    hely: picked.hely,
    evTol: years.evTol,
    evIg: years.evIg,
    ordered: directed.ordered && picked.surnames.length === 2,
    active: false,
  }
  reading.active =
    reading.query !== original ||
    reading.keresztnev !== "" ||
    reading.hely !== "" ||
    reading.evTol != null
  return reading
}

export function extraSurnamePair(raw: string): string | null {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((token) => fold(token).length >= 2 && !/^\d{4}$/.test(token))
  if (tokens.length !== 2) return null
  const second = tokens[1] ?? ""
  const place = asPlace(second)
  if (place && place !== second) return null
  const reading = readNote(raw)
  const pair = tokens.join(" ")
  if (reading.query === pair) return null
  return pair
}

function classify(
  tokens: string[],
  directed: { from: string; to: string; ordered: boolean },
): { surnames: string[]; keresztnev: string; hely: string } {
  const given: string[] = []
  const rest: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ""
    if (given.length === 0 && GIVEN.has(fold(token))) {
      given.push(token)
      while (GIVEN.has(fold(tokens[index + 1] ?? ""))) index += 1
      continue
    }
    rest.push(token)
  }

  let surnames: string[] = []
  let place: string[] = []
  if (directed.from && directed.to) {
    surnames = [directed.from, directed.to]
    place = rest.map(tidyPlace)
  } else if (directed.to || directed.from) {
    const locked = directed.from || directed.to
    const parsed = splitNamesAndPlace(rest)
    const other = parsed.surnames.find((name) => fold(name) !== fold(locked))
    surnames = directed.from ? [directed.from, other ?? ""].filter(Boolean) : [other ?? locked, directed.to].filter(Boolean)
    if (!other) surnames = [locked]
    place = parsed.place
  } else {
    const parsed = splitNamesAndPlace(rest)
    surnames = parsed.surnames
    place = parsed.place
  }

  return {
    surnames: surnames.filter((name) => fold(name).length >= 2).slice(0, 2),
    keresztnev: given[0] ?? "",
    hely: place.filter(Boolean).join(" "),
  }
}

function splitNamesAndPlace(tokens: string[]): { surnames: string[]; place: string[] } {
  if (tokens.length === 0) return { surnames: [], place: [] }
  if (tokens.length === 1) return { surnames: [tokens[0] ?? ""], place: [] }
  const lastPlace = asPlace(tokens[tokens.length - 1] ?? "")
  if (tokens.length === 2 && lastPlace) return { surnames: [tokens[0] ?? ""], place: [lastPlace] }
  if (tokens.length === 2) return { surnames: [tokens[0] ?? "", tokens[1] ?? ""], place: [] }
  return {
    surnames: tokens.slice(0, 2),
    place: tokens.slice(2).map(tidyPlace),
  }
}

function pullDirected(text: string): { text: string; from: string; to: string; ordered: boolean } {
  const empty = { text, from: "", to: "", ordered: false }
  const fromTo = text.match(
    /(\p{L}[\p{L}.'’-]{1,}?)(?:-)?(?:ból|ből|bol|bel|tól|től|tol|tel)\s+(\p{L}[\p{L}.'’-]{2,})/iu,
  )
  if (fromTo?.[1] && fromTo[2]) {
    return { text: text.replace(fromTo[0], " "), from: clean(fromTo[1]), to: clean(fromTo[2]), ordered: true }
  }
  const took = text.match(/(.+?)\s+felvett(?:e|ék|ek)?\s+(?:a|az)\s+(\p{L}[\p{L}.'’-]{2,})\s+nev/iu)
  if (took?.[1] && took[2]) {
    return { text: took[1], from: "", to: clean(took[2]), ordered: true }
  }
  const named = text.match(
    /eredeti(?:\s+nev\p{L}*)?\s*[:.]?\s*(\p{L}[\p{L}.'’-]{2,}).{0,48}?(?:új|uj|felvett)(?:\s+nev\p{L}*)?\s*[:.]?\s*(\p{L}[\p{L}.'’-]{2,})/iu,
  )
  if (named?.[1] && named[2]) {
    return { text: text.replace(named[0], " "), from: clean(named[1]), to: clean(named[2]), ordered: true }
  }
  return empty
}

function pullYears(text: string): { text: string; evTol: number | null; evIg: number | null } {
  const range = text.match(/(\d{4})\s*[-–—]\s*(\d{4})/) ?? text.match(/(\d{4})\s+(?:és|es)\s+(\d{4})/)
  if (range) {
    const start = yearOf(range[1])
    const end = yearOf(range[2])
    if (start && end) {
      return {
        text: text.replace(range[0], " "),
        evTol: Math.min(start, end),
        evIg: Math.max(start, end),
      }
    }
  }
  const around = text.match(/(?:körül|korul|kb\.?|circa)\s*(\d{4})|(\d{4})\s*(?:körül|korul)/i)
  const aroundYear = yearOf(around?.[1] ?? around?.[2])
  if (around && aroundYear) {
    return { text: text.replace(around[0], " "), evTol: aroundYear - 1, evIg: aroundYear + 1 }
  }
  const one = text.match(/\b(\d{4})\b/)
  const year = yearOf(one?.[1])
  if (one && year) return { text: text.replace(one[0], " "), evTol: year, evIg: year }
  return { text, evTol: null, evIg: null }
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,;:]+/)
    .map((token) => clean(token))
    .filter((token) => {
      const key = fold(token)
      return key.length >= 2 && !STOP.has(key) && !/^\d+$/.test(key)
    })
}

function trimIncomplete(tokens: string[]): string[] {
  if (tokens.length < 2) return tokens
  const last = tokens[tokens.length - 1] ?? ""
  const key = fold(last)
  if (key.length >= 4 || GIVEN.has(key) || asPlace(last)) return tokens
  return tokens.slice(0, -1)
}

function asPlace(token: string): string | null {
  if (PLACES.has(fold(token))) return token
  const stripped = token.replace(/(?:ból|ből|bol|bel|ról|ről|rol|rel|ban|ben|ra|re|ba|be|on|en|án|én)$/i, "")
  if (stripped !== token && PLACES.has(fold(stripped))) return stripped
  return null
}

function tidyPlace(token: string): string {
  return asPlace(token) ?? stripLongSuffix(token)
}

function stripLongSuffix(token: string): string {
  const stripped = token.replace(/(?:ból|ből|bol|bel|ról|ről|rol|rel|ban|ben)$/i, "")
  return fold(stripped).length >= 3 ? stripped : token
}

function yearOf(value: string | undefined): number | null {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1800 || year > 1956) return null
  return year
}

function clean(value: string): string {
  return value.replace(/^['"„“]+|['"”]+$/g, "").replace(/^[.\-–—]+|[.\-–—]+$/g, "")
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "")
}

function words(list: string): Set<string> {
  return new Set(
    list
      .trim()
      .split(/\s+/)
      .map((word) => fold(word))
      .filter((word) => word.length >= 2),
  )
}

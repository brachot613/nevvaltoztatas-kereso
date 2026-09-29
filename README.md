# Névkereső

Egy mező, két vezetéknév. Az eredeti és a felvett névre keres, betűre pontos egyezés nélkül, a két elérhető listában egyszerre.

- **MACSE**, 1815–1955, élő lekérdezés. A találatokat nem mentjük el.
- **Szentiványi Zoltán: Századunk névváltoztatásai**, 1800–1893. Közkincs kötet, a szerveren egy OCR-ből kiolvasott névmutató.

A laza egyezés összevonja az ékezetet, a `cz`/`c`, a `cs`/`ts`, a `w`/`v`, a név végi `i`/`y` és a Weiss/Weisz párost, és még egy-két eltérő betűt is elfogad. Két szó esetén az egyik az eredeti név, a másik a felvett.

Egy rövid mondatot is meg lehet adni, például `Kohn Adolf Csacza 1887` vagy `Kohnból Korányi lett`. A nevet, a keresztnevet, a helyet és az évet a böngésző olvassa ki, a jegyzet nem megy el sehova. A betűeltérést nem egy nyelvi modell találja ki, hanem a laza egyezés.

## Futtatás

```bash
npm install
npm run dev
```

A fejlesztői szerver a [http://127.0.0.1:43123](http://127.0.0.1:43123) címen indul.

```bash
npm test
npm run lint
```

## A névmutató újraépítése

A Szentiványi-mutató a könyv Internet Archive-on lévő OCR-szövegéből készül:

```bash
python3 scripts/parse_szentivanyi.py /tmp/szazadunk.txt data/szentivanyi.json
```

Ha a szövegfájl nincs meg, a script letölti.

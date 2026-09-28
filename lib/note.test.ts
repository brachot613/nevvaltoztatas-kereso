import assert from "node:assert/strict"
import test from "node:test"
import { readNote } from "./note.ts"

test("a plain surname stays a surname", () => {
  const note = readNote("Kohn")
  assert.equal(note.active, false)
  assert.equal(note.query, "Kohn")
  assert.equal(note.keresztnev, "")
})

test("two surnames stay a pair", () => {
  const note = readNote("Kohn Korányi")
  assert.equal(note.active, false)
  assert.equal(note.query, "Kohn Korányi")
  assert.equal(note.ordered, false)
})

test("a given name, a place and a year come out of a short note", () => {
  const note = readNote("Kohn Adolf Csacza 1887")
  assert.equal(note.query, "Kohn")
  assert.equal(note.keresztnev, "Adolf")
  assert.equal(note.hely, "Csacza")
  assert.equal(note.evTol, 1887)
  assert.equal(note.evIg, 1887)
  assert.equal(note.active, true)
})

test("ból and felvette mark the original and the adopted name", () => {
  const from = readNote("Kohnból Korányi lett")
  assert.equal(from.query, "Kohn Korányi")
  assert.equal(from.ordered, true)

  const took = readNote("Kohn Adolf felvette a Korányi nevet")
  assert.equal(took.query, "Kohn Korányi")
  assert.equal(took.keresztnev, "Adolf")
  assert.equal(took.ordered, true)
})

test("the original and adopted labels are a pair", () => {
  const note = readNote("eredeti neve Kohn, új neve Korányi")
  assert.equal(note.query, "Kohn Korányi")
  assert.equal(note.ordered, true)
})

test("a known town is a place, an unknown second word stays a surname", () => {
  const town = readNote("Weiss Budapesten")
  assert.equal(town.query, "Weiss")
  assert.equal(town.hely, "Budapest")

  const pair = readNote("Weiss Fehér")
  assert.equal(pair.active, false)
  assert.equal(pair.query, "Weiss Fehér")
})

test("a year range and körül widen the years", () => {
  const range = readNote("Kohn 1880-1890")
  assert.equal(range.query, "Kohn")
  assert.equal(range.evTol, 1880)
  assert.equal(range.evIg, 1890)

  const around = readNote("Korányi 1887 körül")
  assert.equal(around.evTol, 1886)
  assert.equal(around.evIg, 1888)
})

test("an unfinished short word does not become a second surname", () => {
  const note = readNote("Kohn Ad")
  assert.equal(note.query, "Kohn")
  assert.equal(note.keresztnev, "")
})

/**
 * Deciding where every pupil goes at the end of the year — no database import.
 *
 * The screen shows the owner a plan and the server carries one out. While those
 * were two pieces of code they could disagree, and a preview that does not
 * match what happens is worse than no preview. This file is the one place the
 * decision is made: the browser runs it to draw the preview, the server runs
 * it again on the same inputs before writing, and both get the same answer.
 *
 * It is also why a class may feed more than one destination. Three classes of
 * first intermediate do not fit into two of second intermediate by pointing
 * each at one target — one target takes two classes and the other takes one.
 * A class listed with several destinations has its pupils shared out so the
 * receiving classes finish level.
 */

export type PlanClass = {
  id: string
  /** Where its pupils go, the first being the main one. Empty = no destination. */
  destinations: string[]
  isTerminal: boolean
}

export type PlanStudent = { id: string; fullName: string; classId: string | null }

export type PromotionPlan = {
  /** Pupil → the class they move into. Pupils who stay or graduate are absent. */
  moves: Map<string, string>
  graduating: string[]
  /** Left where they are: held back, unassigned, or in a class with no destination. */
  untouched: number
  /** How many of the movers come from a class shared between several destinations. */
  splitCount: number
  /** Pupils who stay in each class (held back, or the class has no destination). */
  staying: Map<string, number>
  /** Pupils arriving in each class. */
  arriving: Map<string, number>
}

/** The extra destinations stored on a class, tolerating whatever is in the column. */
export function parseExtraDestinations(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.length > 0) : []
  } catch {
    return []
  }
}

/**
 * A class's destinations in order, with everything that cannot be one removed:
 * itself, a class that no longer exists, and repeats.
 */
export function destinationsOf(
  classId: string,
  primary: string | null | undefined,
  extras: readonly string[],
  exists: (id: string) => boolean,
): string[] {
  const out: string[] = []
  for (const id of [primary, ...extras]) {
    if (!id || id === classId || !exists(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1)

/**
 * Plain code-unit order, with the id as a tiebreak. Not a locale collation on
 * purpose: the browser and the server carry different ICU data, and the two
 * must deal the same pupil to the same class.
 */
const byNameThenId = (a: PlanStudent, b: PlanStudent) =>
  a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export function planPromotion(input: {
  classes: readonly PlanClass[]
  students: readonly PlanStudent[]
  /** Pupils repeating the year: they stay exactly where they are. */
  held: ReadonlySet<string>
  /** A destination picked by hand for a pupil of a shared-out class. */
  overrides?: Readonly<Record<string, string>>
}): PromotionPlan {
  const { classes, students, held, overrides } = input
  const byId = new Map(classes.map((c) => [c.id, c]))
  const destsOf = new Map(
    classes.map((c) => [c.id, destinationsOf(c.id, c.destinations[0], c.destinations.slice(1), (id) => byId.has(id))]),
  )

  const moves = new Map<string, string>()
  const graduating: string[] = []
  const staying = new Map<string, number>()
  const arriving = new Map<string, number>()
  const shared = new Map<string, PlanStudent[]>()
  let untouched = 0
  let splitCount = 0

  /**
   * Every pupil is placed from the register as it stands before anything is
   * written, so a chain (4→5, 5→6) moves each year group one step and no
   * further. Pupils of single-destination classes are settled first: only then
   * is it known how full each receiving class already is, which is what the
   * shared-out classes are balanced against.
   */
  for (const s of students) {
    if (!s.classId) { untouched++; continue }
    const cls = byId.get(s.classId)
    if (!cls) { untouched++; continue }
    if (held.has(s.id)) { untouched++; bump(staying, cls.id); continue }
    if (cls.isTerminal) { graduating.push(s.id); continue }

    const dests = destsOf.get(cls.id) ?? []
    if (dests.length === 0) { untouched++; bump(staying, cls.id); continue }
    if (dests.length === 1) { moves.set(s.id, dests[0]); bump(arriving, dests[0]); continue }

    const list = shared.get(cls.id) ?? []
    list.push(s)
    shared.set(cls.id, list)
  }

  // Sorted by id so the browser and the server walk the shared classes in the
  // same order whatever order their own queries returned them in.
  const sources = [...shared.keys()].sort().map((id) => ({
    dests: destsOf.get(id) ?? [],
    pupils: (shared.get(id) ?? []).slice().sort(byNameThenId),
    free: [] as PlanStudent[],
    quota: new Map<string, number>(),
  }))

  // A pupil placed by hand goes where they were put, and counts towards that
  // class before anybody else is dealt.
  for (const src of sources) {
    splitCount += src.pupils.length
    for (const p of src.pupils) {
      const picked = overrides?.[p.id]
      if (picked && src.dests.includes(picked)) { moves.set(p.id, picked); bump(arriving, picked) }
      else src.free.push(p)
    }
    for (const d of src.dests) src.quota.set(d, 0)
  }

  /**
   * How many each destination takes from each shared class: one pupil at a
   * time, to whichever of that class's destinations is emptiest.
   *
   * The shared classes take turns rather than being settled one after another.
   * Two of them with a destination in common — four classes becoming three —
   * would otherwise have the first pour itself whole into the class they
   * share, because the second had not arrived there yet, and the receiving
   * classes would finish 25, 38 and 37 where 33, 33 and 34 was on offer.
   */
  const level = new Map<string, number>()
  for (const src of sources) {
    for (const d of src.dests) {
      if (!level.has(d)) level.set(d, (staying.get(d) ?? 0) + (arriving.get(d) ?? 0))
    }
  }
  const pending = sources.map((src) => src.free.length)
  for (let left = pending.reduce((a, b) => a + b, 0); left > 0;) {
    for (let s = 0; s < sources.length; s++) {
      if (pending[s] === 0) continue
      const { dests, quota } = sources[s]
      let lowest = dests[0]
      for (const d of dests) if (level.get(d)! < level.get(lowest)!) lowest = d
      quota.set(lowest, quota.get(lowest)! + 1)
      level.set(lowest, level.get(lowest)! + 1)
      pending[s]--
      left--
    }
  }

  // Then deal the names out evenly against those quotas. Filling the emptier
  // class first would hand it the top of the alphabet in one block.
  for (const { dests, free, quota } of sources) {
    const given = new Map(dests.map((d) => [d, 0]))
    for (let i = 0; i < free.length; i++) {
      let next = dests[0]
      let furthestBehind = -Infinity
      for (const d of dests) {
        const q = quota.get(d)!
        const g = given.get(d)!
        if (g >= q) continue
        const behind = ((i + 1) * q) / free.length - g
        if (behind > furthestBehind) { furthestBehind = behind; next = d }
      }
      moves.set(free[i].id, next)
      given.set(next, given.get(next)! + 1)
      bump(arriving, next)
    }
  }

  return { moves, graduating, untouched, splitCount, staying, arriving }
}

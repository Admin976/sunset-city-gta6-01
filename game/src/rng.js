// Deterministic PRNG (mulberry32). The whole city is generated from a single integer seed,
// so every visitor gets the same Puerto Sol: same towers, same palms, same back alleys.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small helper bundle around one random stream. */
export function createRandom(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    chance(p) { return next() < p; },
    /** Weighted pick: [[value, weight], ...] */
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e[1];
      let r = next() * total;
      for (const e of entries) {
        r -= e[1];
        if (r <= 0) return e[0];
      }
      return entries[entries.length - 1][0];
    },
  };
}

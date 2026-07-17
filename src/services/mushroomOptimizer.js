// Activity giant-mushroom optimizer.
//
// Given the roster's power and today's remaining attempts, plan EXACTLY N giant
// mushrooms so the overall dispatch is the most valuable legal plan — not by
// finishing one mushroom at a time, but by searching all legal plans and taking
// the best. We use backtracking + branch-and-bound, never a greedy pass.
//
// A mushroom's star level is the highest threshold it reaches:
//   power >= 117040 -> 4⭐, >= 36120 -> 3⭐, >= 20020 -> 2⭐, else 1⭐.
// The star LEVEL below is the index into EVENT_THRESHOLDS (0..3); the DISPLAYED
// star count is level + 1.
//
// Hard constraints — a plan breaking any of these is invalid and never produced:
//   1. exactly N mushrooms are planned
//   2. each mushroom has at least MIN_MEMBERS players
//   3. each mushroom has at most MAX_MEMBERS players
//   4. each player joins at most `remaining` mushrooms
//   5. each player dispatches at most `power` in total
//   6. a player who joins a mushroom contributes at least MIN_POWER_PER_MUSHROOM
//
// Optimisation objectives, applied lexicographically once the constraints hold:
//   1. maximise total stars across all mushrooms
//   2. best star distribution — most 4⭐, then most 3⭐, then most 2⭐
//   3. mushrooms as close as possible to their NEXT star level
//      (minimise the summed remaining power needed to reach the next threshold)
//   4. minimise total player splits (extra contributions beyond one per player)
//   5. minimise wasted power (power beyond what the reached star level requires)
//
// Objective 3 means we deliberately keep pouring spare power into mushrooms even
// after a star level is reached, to get them closer to the next one. We do not
// stop at "good enough".

const EVENT_THRESHOLDS = [0, 20020, 36120, 117040];
const MIN_MEMBERS = 3;
const MAX_MEMBERS = 5;
const MIN_POWER_PER_MUSHROOM = 1000;

// Turn a mushroom's total power into its star level (index into thresholds).
function starLevel(power) {
  let level = 0;
  for (let index = EVENT_THRESHOLDS.length - 1; index >= 0; index -= 1) {
    if (power >= EVENT_THRESHOLDS[index]) {
      level = index;
      break;
    }
  }
  return level;
}

// Power still needed for a mushroom to reach its next star level, or 0 if it is
// already at the top level. Used for objective 3 ("closeness to next star").
function distanceToNextStar(power) {
  const level = starLevel(power);
  if (level >= EVENT_THRESHOLDS.length - 1) return 0;
  return EVENT_THRESHOLDS[level + 1] - power;
}

// All multisets of `count` star levels (each 0..maxLevel), ordered best-first by
// objective 1 (total stars) then objective 2 (star distribution: most 4⭐, then
// 3⭐, then 2⭐).
function starProfiles(count) {
  const maxLevel = EVENT_THRESHOLDS.length - 1;
  const profiles = [];

  const build = (remaining, current) => {
    if (remaining === 0) {
      profiles.push(current);
      return;
    }
    for (let level = maxLevel; level >= 0; level -= 1) {
      build(remaining - 1, [...current, level]);
    }
  };
  build(count, []);

  const totalStars = (profile) => profile.reduce((sum, level) => sum + level, 0);
  // Histogram of counts per level, highest level first: [#4⭐, #3⭐, #2⭐, #1⭐].
  const histogram = (profile) => {
    const counts = new Array(EVENT_THRESHOLDS.length).fill(0);
    for (const level of profile) counts[level] += 1;
    return counts.slice().reverse();
  };

  profiles.sort((left, right) => {
    if (totalStars(right) !== totalStars(left)) return totalStars(right) - totalStars(left);
    const leftHist = histogram(left);
    const rightHist = histogram(right);
    for (let index = 0; index < leftHist.length; index += 1) {
      if (rightHist[index] !== leftHist[index]) return rightHist[index] - leftHist[index];
    }
    return 0;
  });
  return profiles;
}

// Compare two completed assignments on objectives 3–5 (objectives 1–2 are fixed
// by the profile). Returns true if `candidate` is strictly better than `current`.
function isBetterAssignment(candidate, current) {
  if (candidate.closeness !== current.closeness) return candidate.closeness < current.closeness;
  if (candidate.splitCount !== current.splitCount) return candidate.splitCount < current.splitCount;
  return candidate.waste < current.waste;
}

// Score a completed fill (all mushrooms meet their profile target) on the
// tie-break objectives 3–5.
function scoreFill(state, targets) {
  const mushroomCount = targets.length;
  const totals = new Array(mushroomCount).fill(0);
  for (const player of state) {
    for (let m = 0; m < mushroomCount; m += 1) totals[m] += player.contributions[m];
  }

  let closeness = 0;
  let waste = 0;
  for (let m = 0; m < mushroomCount; m += 1) {
    closeness += distanceToNextStar(totals[m]);
    waste += totals[m] - EVENT_THRESHOLDS[starLevel(totals[m])];
  }

  let splitCount = 0;
  for (const player of state) {
    const joins = player.contributions.filter((amount) => amount > 0).length;
    if (joins > 1) splitCount += joins - 1;
  }

  return { closeness, splitCount, waste };
}

// Backtracking + branch-and-bound fill for one star profile. Honours every hard
// constraint (3–5 members, per-player attempt/power caps, MIN_POWER_PER_MUSHROOM)
// and returns the best assignment on objectives 3–5, or null if the profile is
// infeasible.
//
// `targets` are the per-mushroom power requirements, sorted descending so the
// hardest mushrooms are chosen first. A `nodeBudget` bounds the search so
// pathological inputs return the best assignment found so far instead of hanging.
function fillProfile(targets, players, nodeBudget = 200000) {
  const mushroomCount = targets.length;

  const state = players.map((player) => ({
    name: player.player_name,
    power: player.power,
    left: player.power,
    used: 0,
    remainingLimit: player.remaining,
    contributions: new Array(mushroomCount).fill(0),
  }));

  // Cheap global feasibility bounds before the expensive search.
  const totalAttempts = state.reduce((sum, player) => sum + Math.min(player.remainingLimit, mushroomCount), 0);
  if (totalAttempts < mushroomCount * MIN_MEMBERS) return null;
  const totalPower = state.reduce((sum, player) => sum + player.power, 0);
  // Each mushroom needs at least max(target, MIN_MEMBERS * MIN_POWER_PER_MUSHROOM).
  const minTotalNeeded = targets.reduce(
    (sum, target) => sum + Math.max(target, MIN_MEMBERS * MIN_POWER_PER_MUSHROOM),
    0,
  );
  if (totalPower < minTotalNeeded) return null;

  // Fill players largest-power-first so a strong incumbent appears early.
  state.sort((left, right) => right.left - left.left);

  let best = null;
  let nodes = 0;
  let exhausted = true; // false if the node budget cut the search short

  const keepIfBetter = () => {
    const score = scoreFill(state, targets);
    if (best && !isBetterAssignment(score, best)) return;
    best = {
      ...score,
      contributions: state.map((player) => ({ name: player.name, contributions: [...player.contributions] })),
    };
  };

  // Choose contributors and amounts for mushroom `m`, then recurse to `m + 1`.
  // `members` counts distinct players already on this mushroom; `filled` is its
  // accumulated power. Because objective 3 rewards overfilling toward the next
  // star, once the target and member floor are met we still explore giving the
  // remaining players their spare power here before moving on.
  const fillMushroom = (m, playerIndex, members, filled) => {
    nodes += 1;
    if (nodes > nodeBudget) {
      exhausted = false;
      return;
    }

    const target = targets[m];
    const targetMet = filled >= target && members >= MIN_MEMBERS;

    // Move to the next mushroom once this one is legal. For the last mushroom a
    // legal fill completes the whole plan.
    if (targetMet) {
      if (m === mushroomCount - 1) {
        keepIfBetter();
      } else {
        fillMushroom(m + 1, 0, 0, 0);
      }
      // Do not `return`: fall through so remaining players may still pour spare
      // power into this mushroom (objective 3), unless it is already full.
    }

    if (playerIndex >= state.length) return;
    if (members >= MAX_MEMBERS) return;

    // Branch-and-bound: with every still-eligible player from here on, can we
    // reach both the member floor and the power target for this mushroom?
    let reachablePower = filled;
    let reachableMembers = members;
    for (let index = playerIndex; index < state.length; index += 1) {
      const player = state[index];
      if (player.used < player.remainingLimit && player.left >= MIN_POWER_PER_MUSHROOM) {
        reachablePower += player.left;
        reachableMembers += 1;
      }
    }
    if (reachableMembers < MIN_MEMBERS) return;
    if (reachablePower < target) return;

    const player = state[playerIndex];
    const canJoin = player.used < player.remainingLimit && player.left >= MIN_POWER_PER_MUSHROOM;

    if (canJoin) {
      // Candidate contribution amounts for this player on this mushroom. We try
      // a small, purposeful set rather than every integer:
      //   - the exact power still needed to hit the target (minimises waste)
      //   - the exact power to reach the next star threshold (objective 3)
      //   - the player's entire remaining power (pour everything in)
      //   - the minimum legal contribution (leave power for other mushrooms)
      const need = Math.max(0, target - filled);
      const toNextStar = Math.max(0, EVENT_THRESHOLDS[Math.min(starLevel(filled) + 1, EVENT_THRESHOLDS.length - 1)] - filled);
      const candidateGives = new Set();
      const consider = (amount) => {
        const clamped = Math.min(player.left, Math.max(MIN_POWER_PER_MUSHROOM, amount));
        if (clamped >= MIN_POWER_PER_MUSHROOM && clamped <= player.left) candidateGives.add(clamped);
      };
      if (need > 0) consider(need);
      if (toNextStar > 0) consider(toNextStar);
      consider(player.left);
      consider(MIN_POWER_PER_MUSHROOM);

      // Try larger gives first: they tend to reach targets/next-star with fewer
      // splits, producing a strong incumbent early.
      for (const give of [...candidateGives].sort((a, b) => b - a)) {
        player.left -= give;
        player.contributions[m] += give;
        player.used += 1;

        fillMushroom(m, playerIndex + 1, members + 1, filled + give);

        player.left += give;
        player.contributions[m] -= give;
        player.used -= 1;
      }
    }

    // Branch where this player sits out mushroom m.
    fillMushroom(m, playerIndex + 1, members, filled);
  };

  fillMushroom(0, 0, 0, 0);
  return best ? { ...best, exhausted } : null;
}

// Build the public plan object from a solved fill.
function buildPlan(targets, fill, eligible) {
  const mushrooms = targets.map((target, m) => {
    const members = fill.contributions
      .filter((player) => player.contributions[m] > 0)
      .map((player) => ({ name: player.name, power: player.contributions[m] }))
      .sort((left, right) => right.power - left.power);
    const total = members.reduce((sum, member) => sum + member.power, 0);
    return { target, stars: starLevel(total), total, waste: total - EVENT_THRESHOLDS[starLevel(total)], members };
  });

  const byName = new Map(fill.contributions.map((player) => [player.name, player]));
  const dispatch = eligible
    .map((source) => ({ source, player: byName.get(source.player_name) }))
    .filter(({ player }) => player && player.contributions.some((amount) => amount > 0))
    .map(({ source, player }) => {
      const assignments = player.contributions
        .map((amount, m) => ({ mushroom: m, power: amount }))
        .filter((entry) => entry.power > 0);
      return { name: source.player_name, remaining: source.remaining, power: source.power, assignments };
    });

  const usedPower = mushrooms.reduce((sum, mushroom) => sum + mushroom.total, 0);
  const totalAvailable = eligible.reduce((sum, player) => sum + player.power, 0);
  const totalStars = mushrooms.reduce((sum, mushroom) => sum + mushroom.stars + 1, 0);

  return {
    ok: true,
    mushrooms,
    dispatch,
    totalStars,
    usedPower,
    unusedPower: totalAvailable - usedPower,
  };
}

// Try to plan exactly `count` mushrooms, best profile first. The first feasible
// profile is optimal on objectives 1–2; its fill is optimal on objectives 3–5.
function planForCount(eligible, count) {
  const profiles = starProfiles(count);
  for (const profile of profiles) {
    const targets = profile.map((level) => EVENT_THRESHOLDS[level]).sort((a, b) => b - a);
    const fill = fillProfile(targets, eligible);
    if (fill) return buildPlan(targets, fill, eligible);
  }
  return null;
}

// The most mushrooms that can be planned at all under the hard constraints
// (3 members each, each giving MIN_POWER_PER_MUSHROOM). The all-1⭐ profile is
// the easiest to satisfy, so it decides feasibility of a given count.
function maxFeasibleCount(eligible, requested) {
  for (let count = requested - 1; count >= 1; count -= 1) {
    const targets = new Array(count).fill(EVENT_THRESHOLDS[0]);
    if (fillProfile(targets, eligible)) return count;
  }
  return 0;
}

// Public entry point.
//   { ok: true, mushrooms, dispatch, totalStars, usedPower, unusedPower }
//   { ok: false, reason: 'range' }
//   { ok: false, reason: 'empty' }
//   { ok: false, reason: 'infeasible', requested, maxCount }
function optimizeMushrooms(players, count) {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    return { ok: false, reason: 'range' };
  }

  // Ignore anyone with no attempts left or too little power to join a mushroom.
  const eligible = players.filter(
    (player) => player.remaining > 0 && player.power >= MIN_POWER_PER_MUSHROOM,
  );
  if (eligible.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const plan = planForCount(eligible, count);
  if (plan) return plan;

  return { ok: false, reason: 'infeasible', requested: count, maxCount: maxFeasibleCount(eligible, count) };
}

export {
  EVENT_THRESHOLDS,
  MIN_MEMBERS,
  MAX_MEMBERS,
  MIN_POWER_PER_MUSHROOM,
  optimizeMushrooms,
  starLevel,
};

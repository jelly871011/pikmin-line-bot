// Activity giant-mushroom optimizer.
//
// Given the roster's power and today's remaining attempts, plan exactly N giant
// mushrooms so the combined star rating is as high as possible, subject to hard
// event rules.
//
// A player's power may be split across several mushrooms, but only across at
// most `remaining` of them (each mushroom a player joins costs one attempt),
// and the sum of a player's contributions can never exceed their power.
//
// A mushroom's star level is the highest threshold it reaches:
//   power >= 117040 -> 4⭐, >= 36120 -> 3⭐, >= 20020 -> 2⭐, else 1⭐.
// The star LEVEL below is the index into EVENT_THRESHOLDS (0..3); the DISPLAYED
// star count is level + 1.
//
// Hard constraints (a plan that breaks any of these is invalid and never
// produced):
//   - exactly N mushrooms are planned
//   - each mushroom has at least 3 and at most 5 players
//   - each player joins at most `remaining` mushrooms
//   - each player dispatches at most `power` in total
//
// Optimisation objectives, applied lexicographically once the constraints hold:
//   1. maximise total stars across all mushrooms
//   2. maximise the number of top-tier (4⭐) mushrooms
//   3. minimise wasted power (power above the reached threshold's requirement)
//   4. minimise the number of players who are split across mushrooms
//   5. minimise the total number of splits (extra contributions beyond one)
//
// We do NOT use a plain greedy pass. We enumerate every star profile (which
// star level each of the N mushrooms targets) best-first, then for each profile
// run a bounded backtracking + branch-and-bound fill that respects the 3–5
// member rule and the per-player caps. The first feasible profile in best-first
// order is optimal on objectives 1–3 (we never over-fill, so waste is always 0
// when feasible); the search then minimises objectives 4–5 within it.

const EVENT_THRESHOLDS = [0, 20020, 36120, 117040];
const MIN_MEMBERS = 3;
const MAX_MEMBERS = 5;

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

// All multisets of `count` star levels (each 0..3), ordered best-first by
// (total stars, top-tier count).
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
  const topTier = (profile) => profile.filter((level) => level === maxLevel).length;

  profiles.sort((left, right) => {
    if (totalStars(right) !== totalStars(left)) return totalStars(right) - totalStars(left);
    return topTier(right) - topTier(left);
  });
  return profiles;
}

// Backtracking fill for one star profile, honouring the 3–5 member rule and the
// per-player attempt/power caps. Returns the best assignment ({ splitPlayers,
// splitCount, contributions }) or null if the profile cannot be satisfied.
//
// `targets` are the per-mushroom power requirements, sorted descending so the
// hardest mushrooms are filled first (fail fast, prune early). A `nodeBudget`
// caps the search so pathological inputs return the best assignment found so far
// rather than hanging.
function fillProfile(targets, players, nodeBudget = 60000) {
  const mushroomCount = targets.length;

  const state = players.map((player) => ({
    name: player.player_name,
    power: player.power,
    left: player.power,
    used: 0,
    remainingLimit: player.remaining,
    contributions: new Array(mushroomCount).fill(0),
  }));

  // Quick global feasibility bounds before the expensive search:
  //   - enough player-attempts to cover MIN_MEMBERS per mushroom
  //   - enough total power to meet every target
  const totalAttempts = state.reduce((sum, player) => sum + Math.min(player.remainingLimit, mushroomCount), 0);
  if (totalAttempts < mushroomCount * MIN_MEMBERS) return null;
  const totalPower = state.reduce((sum, player) => sum + player.power, 0);
  const totalTarget = targets.reduce((sum, target) => sum + target, 0);
  if (totalPower < totalTarget) return null;

  let best = null;
  let nodes = 0;

  const splitCost = () => {
    let splitPlayers = 0;
    let splitCount = 0;
    for (const player of state) {
      const joins = player.contributions.filter((amount) => amount > 0).length;
      if (joins > 1) {
        splitPlayers += 1;
        splitCount += joins - 1;
      }
    }
    return { splitPlayers, splitCount };
  };

  const isBetter = (candidate, current) => {
    if (candidate.splitPlayers !== current.splitPlayers) return candidate.splitPlayers < current.splitPlayers;
    return candidate.splitCount < current.splitCount;
  };

  const prunedBySplits = () => {
    if (!best) return false;
    const cost = splitCost();
    if (cost.splitPlayers > best.splitPlayers) return true;
    if (cost.splitPlayers === best.splitPlayers && cost.splitCount >= best.splitCount) return true;
    return false;
  };

  const keep = () => {
    const cost = splitCost();
    if (best && !isBetter(cost, best)) return;
    best = {
      splitPlayers: cost.splitPlayers,
      splitCount: cost.splitCount,
      contributions: state.map((player) => ({ name: player.name, contributions: [...player.contributions] })),
    };
  };

  // Fill mushroom `m`. `members` is how many distinct players have joined it so
  // far; `filled` is the power accumulated. We require MIN_MEMBERS..MAX_MEMBERS
  // members and filled >= target before moving to the next mushroom.
  const fillMushroom = (m) => {
    if (nodes > nodeBudget && best) return;
    if (m === mushroomCount) {
      keep();
      return;
    }
    if (prunedBySplits()) return;

    const target = targets[m];

    // Choose contributors for mushroom m, scanning players in order.
    const solve = (playerIndex, members, filled) => {
      nodes += 1;
      if (nodes > nodeBudget && best) return;

      // Mushroom complete: target met and member floor reached. Move on. We do
      // NOT pad with extra members once valid — more members only add waste and
      // splits, which the objectives penalise.
      if (filled >= target && members >= MIN_MEMBERS) {
        fillMushroom(m + 1);
        return;
      }

      if (playerIndex >= state.length) return;
      if (members >= MAX_MEMBERS) return; // cannot add more players to this mushroom

      // Bound: even using every remaining eligible player, can we still reach
      // both the member floor and the power target?
      let reachablePower = filled;
      let reachableMembers = members;
      for (let index = playerIndex; index < state.length; index += 1) {
        const player = state[index];
        const canJoin = player.used < player.remainingLimit && player.left > 0;
        if (canJoin) {
          reachablePower += player.left;
          reachableMembers += 1;
        }
      }
      if (reachableMembers < MIN_MEMBERS) return;
      if (reachablePower < target) return;

      const player = state[playerIndex];
      const canJoin = player.used < player.remainingLimit && player.left > 0;

      if (canJoin) {
        // How much this player should give. If the target is not yet met, give
        // what is still needed (capped by the player's power). If the target is
        // met but we still need members, a token contribution keeps waste at 0.
        const need = Math.max(0, target - filled);
        const give = need > 0 ? Math.min(player.left, need) : Math.min(player.left, 1);

        player.left -= give;
        player.contributions[m] += give;
        player.used += 1;

        solve(playerIndex + 1, members + 1, filled + give);

        player.left += give;
        player.contributions[m] -= give;
        player.used -= 1;
      }

      // Branch where this player sits out mushroom m.
      solve(playerIndex + 1, members, filled);
    };

    solve(0, 0, 0);
  };

  // Fill players largest-power-first: big players cover targets with fewer
  // splits, so a low-split incumbent is found early and prunes the rest.
  state.sort((left, right) => right.left - left.left);

  fillMushroom(0);
  return best;
}

// Build the public plan object from a solved fill.
function buildPlan(targets, fill, eligible) {
  const mushrooms = targets.map((target, m) => {
    const members = fill.contributions
      .filter((player) => player.contributions[m] > 0)
      .map((player) => ({ name: player.name, power: player.contributions[m] }));
    const total = members.reduce((sum, member) => sum + member.power, 0);
    return { target, stars: starLevel(total), total, waste: total - target, members };
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

// Try to plan exactly `count` mushrooms. Returns the best plan or null.
function planForCount(eligible, count) {
  const profiles = starProfiles(count);
  for (const profile of profiles) {
    const targets = profile.map((level) => EVENT_THRESHOLDS[level]).sort((a, b) => b - a);
    const fill = fillProfile(targets, eligible);
    if (fill) return buildPlan(targets, fill, eligible);
  }
  return null;
}

// The most mushrooms that can be planned at all (every mushroom needs 3 members
// and threshold[0] = 0 power, so this is purely about attempts/players).
function maxFeasibleCount(eligible, requested) {
  for (let count = requested - 1; count >= 1; count -= 1) {
    // A count is feasible if the all-1⭐ profile (targets all 0) can be filled.
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

  // Ignore anyone with no attempts left or no power to give.
  const eligible = players.filter((player) => player.remaining > 0 && player.power > 0);
  if (eligible.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const plan = planForCount(eligible, count);
  if (plan) return plan;

  // Could not place `count` mushrooms under the rules — report how many fit.
  return { ok: false, reason: 'infeasible', requested: count, maxCount: maxFeasibleCount(eligible, count) };
}

export { EVENT_THRESHOLDS, MIN_MEMBERS, MAX_MEMBERS, optimizeMushrooms, starLevel };

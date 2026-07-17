// Activity giant-mushroom optimizer.
//
// Given the roster's power and today's remaining attempts, decide how to spread
// each player's power across a fixed number of "giant mushrooms" so that the
// combined star rating is as high as possible.
//
// A player's power may be split across several mushrooms, but only across at
// most `remaining` of them (each mushroom a player joins costs one attempt),
// and the sum of a player's contributions can never exceed their power.
//
// A mushroom's star level is the highest threshold it reaches:
//   power >= 117040 -> 3 stars, >= 36120 -> 2 stars, >= 20020 -> 1 star, else 0.
// (Index into EVENT_THRESHOLDS.)
//
// Objectives, applied lexicographically:
//   1. maximise total stars across all mushrooms
//   2. maximise the number of top-tier (index 3) mushrooms
//   3. minimise wasted power (power above the reached threshold's requirement)
//   4. minimise the number of players who are split across mushrooms
//   5. minimise the total number of splits (extra contributions beyond one)
//
// We do NOT use a plain greedy pass. Instead we enumerate every star profile
// (which star level each mushroom targets) best-first, and for each profile run
// a backtracking + branch-and-bound fill that finds the minimal-waste, minimal-
// split assignment. The first fully-solved profile in best-first order is
// optimal for objectives 1 & 2; among assignments we keep the best on 3–5.

const EVENT_THRESHOLDS = [0, 20020, 36120, 117040];

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

// All multisets of K star levels (each 0..3), returned as arrays sorted
// descending, ordered best-first by (total stars, top-tier count).
function starProfiles(count) {
  const maxLevel = EVENT_THRESHOLDS.length - 1;
  const profiles = [];

  const build = (remaining, minLevel, current) => {
    if (remaining === 0) {
      profiles.push(current);
      return;
    }
    // Emit levels in descending order so higher targets come first; the outer
    // sort below still guarantees best-first regardless.
    for (let level = maxLevel; level >= minLevel; level -= 1) {
      build(remaining - 1, 0, [...current, level]);
    }
  };
  build(count, 0, []);

  const totalStars = (profile) => profile.reduce((sum, level) => sum + level, 0);
  const topTier = (profile) => profile.filter((level) => level === maxLevel).length;

  profiles.sort((left, right) => {
    if (totalStars(right) !== totalStars(left)) return totalStars(right) - totalStars(left);
    return topTier(right) - topTier(left);
  });
  return profiles;
}

// Backtracking fill for one star profile.
//
// `targets` are the per-mushroom power requirements (thresholds for the profile,
// sorted descending). We assign player contributions mushroom by mushroom until
// every mushroom meets its target, then score the assignment on objectives 3–5.
// Branch-and-bound prunes any partial assignment whose players cannot possibly
// supply the power still required.
//
// We never over-fill a mushroom: a player gives at most the power still needed.
// So any leftover power stays unassigned (剩餘未分配) rather than wasted, which
// means every feasible fill of a profile has ZERO waste. Objectives 1–3 are
// therefore decided purely by which profile is feasible; this search only has
// to minimise objectives 4–5 (split players, then split count) within it.
//
// A `nodeBudget` caps the search so pathological inputs (e.g. many high-power
// players over 10 mushrooms) return the best feasible assignment found so far
// instead of hanging. The first complete assignment is already optimal on
// stars/top-tier/waste; extra nodes only refine splits.
function fillProfile(targets, players, nodeBudget = 60000) {
  const mushroomCount = targets.length;
  const totalTarget = targets.reduce((sum, target) => sum + target, 0);
  const totalPower = players.reduce((sum, player) => sum + player.power, 0);
  if (totalPower < totalTarget) return null;

  // Per-player mutable state: power left to give, distinct mushrooms joined so
  // far (capped by remaining), and the per-mushroom contribution amounts.
  const state = players.map((player) => ({
    name: player.player_name,
    left: player.power,
    used: 0,
    remainingLimit: player.remaining,
    contributions: new Array(mushroomCount).fill(0),
  }));

  let best = null; // { splitPlayers, splitCount, contributions }
  let nodes = 0;

  const scoreAndKeep = () => {
    let splitPlayers = 0;
    let splitCount = 0;
    for (const player of state) {
      const joins = player.contributions.filter((amount) => amount > 0).length;
      if (joins > 1) {
        splitPlayers += 1;
        splitCount += joins - 1;
      }
    }
    if (best && !(splitPlayers < best.splitPlayers
      || (splitPlayers === best.splitPlayers && splitCount < best.splitCount))) {
      return;
    }
    best = {
      splitPlayers,
      splitCount,
      contributions: state.map((player) => ({ name: player.name, contributions: [...player.contributions] })),
    };
  };

  // Current split cost of the partial assignment — a lower bound on the final
  // cost (splits never decrease), used to prune against the incumbent.
  const currentSplitCost = () => {
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

  const prunedBySplits = () => {
    if (!best) return false;
    const { splitPlayers, splitCount } = currentSplitCost();
    if (splitPlayers > best.splitPlayers) return true;
    if (splitPlayers === best.splitPlayers && splitCount >= best.splitCount) return true;
    return false;
  };

  // Fill mushroom `m` up to its target, choosing player contributions.
  const fillMushroom = (m) => {
    if (nodes > nodeBudget && best) return; // budget spent; keep best found
    if (m === mushroomCount) {
      scoreAndKeep();
      return;
    }
    if (prunedBySplits()) return;

    const target = targets[m];

    const solve = (playerIndex, filled) => {
      nodes += 1;
      if (nodes > nodeBudget && best) return;
      if (filled >= target) {
        fillMushroom(m + 1);
        return;
      }
      if (playerIndex >= state.length) return; // ran out of players for this mushroom

      // Prune: even giving everything from here on cannot reach the target.
      let reachable = filled;
      for (let index = playerIndex; index < state.length; index += 1) {
        const player = state[index];
        const canJoin = player.contributions[m] > 0 || player.used < player.remainingLimit;
        if (canJoin) reachable += player.left;
      }
      if (reachable < target) return;

      const player = state[playerIndex];
      const alreadyIn = player.contributions[m] > 0;
      const canJoin = alreadyIn || player.used < player.remainingLimit;

      if (canJoin && player.left > 0) {
        // Give exactly what is still needed, or everything the player has left —
        // never more than needed (over-filling would only add waste).
        const need = target - filled;
        const give = Math.min(player.left, need);

        player.left -= give;
        player.contributions[m] += give;
        if (!alreadyIn) player.used += 1;

        // Try this player first (fill-largest-first favours whole, unsplit
        // contributions, so a good incumbent is found early and prunes the rest).
        solve(playerIndex + 1, filled + give);

        player.left += give;
        player.contributions[m] -= give;
        if (!alreadyIn) player.used -= 1;
      }

      // Branch where this player contributes nothing to mushroom m.
      solve(playerIndex + 1, filled);
    };

    solve(0, 0);
  };

  // Fill players largest-power-first: a big player can cover a whole target
  // alone, which is exactly the split-free assignment we want to find first.
  state.sort((left, right) => right.left - left.left);

  fillMushroom(0);
  return best;
}

// Public entry point. Returns a structured plan or a reason string.
//   { ok: true, mushrooms, dispatch, totalStars, usedPower, unusedPower }
//   { ok: false, reason: 'range' | 'empty' }
function optimizeMushrooms(players, count) {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    return { ok: false, reason: 'range' };
  }

  // Ignore anyone with no attempts left or no power to give.
  const eligible = players.filter((player) => player.remaining > 0 && player.power > 0);
  if (eligible.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const profiles = starProfiles(count);
  for (const profile of profiles) {
    // Targets sorted descending; the profile is already best-first.
    const targets = profile.map((level) => EVENT_THRESHOLDS[level]).sort((a, b) => b - a);
    const fill = fillProfile(targets, eligible);
    if (!fill) continue;

    // First feasible profile in best-first order is optimal on stars + top-tier.
    const mushrooms = targets.map((target, m) => {
      const members = fill.contributions
        .filter((player) => player.contributions[m] > 0)
        .map((player) => ({ name: player.name, power: player.contributions[m] }));
      const totalFilled = members.reduce((sum, member) => sum + member.power, 0);
      return {
        target,
        stars: starLevel(totalFilled),
        total: totalFilled,
        waste: totalFilled - target,
        members,
      };
    });

    // Per-player dispatch summary (only players who were actually sent out),
    // kept in the roster's display order rather than the search's internal one.
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
    const totalStars = mushrooms.reduce((sum, mushroom) => sum + mushroom.stars, 0);

    return {
      ok: true,
      mushrooms,
      dispatch,
      totalStars,
      usedPower,
      unusedPower: totalAvailable - usedPower,
    };
  }

  // Should be unreachable: an all-zero profile is always feasible.
  return { ok: false, reason: 'empty' };
}

export { EVENT_THRESHOLDS, optimizeMushrooms, starLevel };

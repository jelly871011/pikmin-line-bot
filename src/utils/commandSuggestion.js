// Command suggestion / Smart Help.
//
// When an input starts with a known feature prefix (菇 / 戰力 / 課長) but does
// not parse into a real command, we suggest the closest real commands instead
// of silently ignoring it. Inputs that do NOT start with a known prefix are not
// our concern — the caller ignores them, preserving the "not a command → no
// reply" behaviour for ordinary chatter.
//
// All the matching logic lives here so it is not scattered across index.js.

import { COMMANDS, COMMAND_PREFIXES, KNOWN_PREFIXES } from '../constants/commands.js';

// Whether an input begins with a known feature prefix (so it is worth
// suggesting for). Returns the matching prefix, or null.
export function matchedPrefix(input) {
  const trimmed = input.trim();
  for (const prefix of KNOWN_PREFIXES) {
    if (trimmed === prefix || trimmed.startsWith(`${prefix} `) || trimmed.startsWith(`${prefix}\n`)) {
      return prefix;
    }
  }
  return null;
}

// Classic Levenshtein edit distance, used for fuzzy keyword matching.
function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dist[i][0] = i;
  for (let j = 0; j < cols; j += 1) dist[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
    }
  }
  return dist[a.length][b.length];
}

// The feature key (mushroom / power / whale) for a given prefix.
function featureForPrefix(prefix) {
  return Object.keys(COMMAND_PREFIXES).find((key) => COMMAND_PREFIXES[key] === prefix);
}

// Build concrete example commands for a prefix, ranked by how close they are to
// what the user typed after the prefix. Always returns at least the prefix's
// keyword list as examples.
export function suggestCommands(input) {
  const prefix = matchedPrefix(input);
  if (!prefix) return [];

  const feature = featureForPrefix(prefix);
  const keywords = COMMANDS[feature] ?? [];

  // The token the user typed right after the prefix (their attempted keyword).
  const rest = input.trim().slice(prefix.length).trim();
  const attempt = rest.split(/\s+/)[0] ?? '';

  const ranked = keywords
    .map((keyword) => ({ keyword, distance: attempt ? editDistance(attempt, keyword) : keyword.length }))
    .sort((left, right) => left.distance - right.distance);

  // Prefer near-matches (distance <= 2) when the user actually typed something;
  // otherwise show the full keyword list as examples.
  const near = attempt ? ranked.filter((entry) => entry.distance <= 2) : [];
  const chosen = (near.length ? near : ranked).slice(0, 3);

  return chosen.map(({ keyword }) => `${prefix} ${keyword}`);
}

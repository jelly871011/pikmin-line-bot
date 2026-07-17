import { supabase } from '../lib/supabase.js';

// Whale ranking system (課長排行榜). Fully independent of the players table:
// every database operation for whales lives here so index.js only parses
// commands and formats replies.

// Fixed grade set, ordered best-first. No other grade is accepted.
const WHALE_GRADES = ['ㄅ', 'ㄆ', 'ㄇ', 'ㄈ', 'ㄦ'];
const DEFAULT_GRADE = 'ㄦ';

// Raised when Supabase returns an error, so callers can respond with a single
// generic message without inspecting the cause. Mirrors PlayerServiceError.
class WhaleServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'WhaleServiceError';
    this.cause = cause;
  }
}

function fail(context, error) {
  console.error(`Supabase error (${context}):`, error);
  throw new WhaleServiceError(context, error);
}

function isValidGrade(grade) {
  return WHALE_GRADES.includes(grade);
}

const gradeRank = (grade) => {
  const index = WHALE_GRADES.indexOf(grade);
  return index === -1 ? WHALE_GRADES.length : index;
};

// Returns every whale for a group, sorted by grade order then by name so the
// ranking reads ㄅ → ㄆ → ㄇ → ㄈ → ㄦ.
async function getWhales(groupId) {
  const { data, error } = await supabase
    .from('whales')
    .select('name, grade')
    .eq('group_id', groupId);
  if (error) fail('getWhales', error);

  return (data ?? []).slice().sort((left, right) => {
    if (gradeRank(left.grade) !== gradeRank(right.grade)) return gradeRank(left.grade) - gradeRank(right.grade);
    return left.name > right.name ? 1 : left.name < right.name ? -1 : 0;
  });
}

async function getWhale(groupId, name) {
  const { data, error } = await supabase
    .from('whales')
    .select('name, grade')
    .eq('group_id', groupId)
    .eq('name', name)
    .maybeSingle();
  if (error) fail('getWhale', error);

  return data ?? null;
}

// Inserts a new whale. Returns true on success, false if the name already
// exists for this group (unique constraint violation, Postgres code 23505).
async function addWhale(groupId, name, grade = DEFAULT_GRADE) {
  const { error } = await supabase
    .from('whales')
    .insert({ group_id: groupId, name, grade });
  if (error) {
    if (error.code === '23505') return false;
    fail('addWhale', error);
  }
  return true;
}

async function updateWhaleGrade(groupId, name, grade) {
  const { error } = await supabase
    .from('whales')
    .update({ grade, updated_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('name', name);
  if (error) fail('updateWhaleGrade', error);
}

async function deleteWhale(groupId, name) {
  const { error } = await supabase
    .from('whales')
    .delete()
    .eq('group_id', groupId)
    .eq('name', name);
  if (error) fail('deleteWhale', error);
}

export {
  WHALE_GRADES,
  DEFAULT_GRADE,
  WhaleServiceError,
  isValidGrade,
  getWhales,
  getWhale,
  addWhale,
  updateWhaleGrade,
  deleteWhale,
};

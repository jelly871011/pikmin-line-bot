import { supabase } from '../lib/supabase.js';

const MAX_ATTEMPTS = 3;
const DEFAULT_PLAYERS = ['小蓁', '牙齒', '肌膚', '青青', 'jun'];

// Raised by any service call when Supabase returns an error, so callers can
// respond with a single generic message without inspecting the cause.
class PlayerServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PlayerServiceError';
    this.cause = cause;
  }
}

function fail(context, error) {
  console.error(`Supabase error (${context}):`, error);
  throw new PlayerServiceError(context, error);
}

// Returns every player row for a group, ordered so DEFAULT_PLAYERS come first
// in their fixed order and any extras follow alphabetically.
async function getPlayers(groupId) {
  const { data, error } = await supabase
    .from('players')
    .select('player_name, remaining, power')
    .eq('group_id', groupId);
  if (error) fail('getPlayers', error);

  return sortPlayers(data ?? []);
}

async function getPlayer(groupId, playerName) {
  const { data, error } = await supabase
    .from('players')
    .select('player_name, remaining, power')
    .eq('group_id', groupId)
    .eq('player_name', playerName)
    .maybeSingle();
  if (error) fail('getPlayer', error);

  return data ?? null;
}

async function updateRemaining(groupId, playerName, remaining) {
  const { error } = await supabase
    .from('players')
    .update({ remaining, updated_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('player_name', playerName);
  if (error) fail('updateRemaining', error);
}

async function updatePower(groupId, playerName, power) {
  const { error } = await supabase
    .from('players')
    .update({ power, updated_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('player_name', playerName);
  if (error) fail('updatePower', error);
}

// Resets remaining to the daily maximum for every group at once.
async function resetRemaining() {
  const { error } = await supabase
    .from('players')
    .update({ remaining: MAX_ATTEMPTS, updated_at: new Date().toISOString() })
    .neq('remaining', MAX_ATTEMPTS);
  if (error) fail('resetRemaining', error);
}

// Seeds the default roster for a group. Existing rows are left untouched
// thanks to the (group_id, player_name) unique constraint + ignoreDuplicates.
async function createPlayers(groupId) {
  const rows = DEFAULT_PLAYERS.map((player_name) => ({
    group_id: groupId,
    player_name,
    remaining: MAX_ATTEMPTS,
    power: 0,
  }));
  const { error } = await supabase
    .from('players')
    .upsert(rows, { onConflict: 'group_id,player_name', ignoreDuplicates: true });
  if (error) fail('createPlayers', error);
}

function sortPlayers(rows) {
  const defaults = DEFAULT_PLAYERS
    .map((name) => rows.find((row) => row.player_name === name))
    .filter(Boolean);
  const extras = rows
    .filter((row) => !DEFAULT_PLAYERS.includes(row.player_name))
    .sort((left, right) => (left.player_name > right.player_name ? 1 : left.player_name < right.player_name ? -1 : 0));
  return [...defaults, ...extras];
}

export {
  MAX_ATTEMPTS,
  DEFAULT_PLAYERS,
  PlayerServiceError,
  getPlayers,
  getPlayer,
  updateRemaining,
  updatePower,
  resetRemaining,
  createPlayers,
};

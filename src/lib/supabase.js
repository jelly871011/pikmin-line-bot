import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  process.exit(1);
}

// We only use the REST API, but supabase-js still initialises its Realtime
// client, which needs a WebSocket implementation on Node < 22 (Render runs
// Node 20). Providing `ws` avoids the "no native WebSocket support" error.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

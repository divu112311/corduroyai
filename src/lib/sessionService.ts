import { supabase } from './supabase';

// ─── Login History ───────────────────────────────────────────────────────────

export interface LoginHistoryEntry {
  id: string;
  user_id: string;
  auth_method: 'email' | 'google' | 'unknown';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Record a login event in the login_history table.
 * Fails silently — login should never be blocked by tracking errors.
 */
export async function recordLogin(
  userId: string,
  authMethod: 'email' | 'google' | 'unknown' = 'unknown'
): Promise<void> {
  try {
    const { error } = await supabase.from('login_history').insert({
      user_id: userId,
      auth_method: authMethod,
      user_agent: navigator.userAgent,
    });
    if (error) console.error('Failed to record login:', error.message);
  } catch (err) {
    console.error('Failed to record login:', err);
  }
}

/**
 * Fetch recent login history for a user.
 */
export async function getLoginHistory(
  userId: string,
  limit = 20
): Promise<LoginHistoryEntry[]> {
  try {
    const { data, error } = await supabase
      .from('login_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch login history:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Failed to fetch login history:', err);
    return [];
  }
}

// ─── Active Sessions ─────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  user_id: string;
  device_info: string | null;
  browser: string | null;
  os: string | null;
  last_active_at: string;
  created_at: string;
  is_current?: boolean;
}

/** Generate a random session ID and store it in sessionStorage for the tab lifetime. */
function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem('app_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('app_session_id', id);
  }
  return id;
}

export function getCurrentSessionId(): string {
  return getOrCreateSessionId();
}

/** Parse the User-Agent string into browser + OS for display. */
function parseUserAgent(): { browser: string; os: string } {
  const ua = navigator.userAgent;
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';

  // Browser detection
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  // OS detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return { browser, os };
}

/**
 * Register or refresh the current session in the user_sessions table.
 */
export async function upsertSession(userId: string): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    const { browser, os } = parseUserAgent();

    const { error } = await supabase.from('user_sessions').upsert(
      {
        id: sessionId,
        user_id: userId,
        device_info: navigator.userAgent,
        browser,
        os,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) console.error('Failed to upsert session:', error.message);
  } catch (err) {
    console.error('Failed to upsert session:', err);
  }
}

/**
 * Send a heartbeat to keep the session alive.
 */
export async function heartbeat(userId: string): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    const { error } = await supabase
      .from('user_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) console.error('Heartbeat failed:', error.message);
  } catch (err) {
    console.error('Heartbeat failed:', err);
  }
}

/**
 * Fetch all active sessions for a user.
 * Sessions with no heartbeat in the last 30 minutes are considered stale but still shown.
 */
export async function getActiveSessions(userId: string): Promise<UserSession[]> {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch sessions:', error.message);
      return [];
    }

    const currentId = getOrCreateSessionId();
    return (data || []).map((s) => ({
      ...s,
      is_current: s.id === currentId,
    }));
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
    return [];
  }
}

/**
 * Revoke (delete) a specific session.
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('Failed to revoke session:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to revoke session:', err);
    return false;
  }
}

/**
 * Revoke all sessions except the current one.
 */
export async function revokeAllOtherSessions(userId: string): Promise<boolean> {
  try {
    const currentId = getOrCreateSessionId();
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', userId)
      .neq('id', currentId);

    if (error) {
      console.error('Failed to revoke other sessions:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to revoke other sessions:', err);
    return false;
  }
}

/**
 * Remove the current session on logout.
 */
export async function removeCurrentSession(): Promise<void> {
  try {
    const sessionId = sessionStorage.getItem('app_session_id');
    if (!sessionId) return;

    await supabase.from('user_sessions').delete().eq('id', sessionId);
    sessionStorage.removeItem('app_session_id');
  } catch (err) {
    console.error('Failed to remove session:', err);
  }
}

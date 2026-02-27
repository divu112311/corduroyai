import { supabase } from './supabase';

export type ActivityAction =
  | 'login'
  | 'logout'
  | 'signup'
  | 'password_changed'
  | 'settings_updated'
  | 'classification_started'
  | 'classification_completed'
  | 'product_added'
  | 'product_approved'
  | 'product_rejected'
  | 'bulk_upload_started'
  | 'session_revoked';

export interface ActivityLogEntry {
  id: string;
  user_id: string;
  action: ActivityAction;
  details: Record<string, any> | null;
  created_at: string;
}

/**
 * Log a user activity event. Fails silently — should never block the user flow.
 */
export async function logActivity(
  userId: string,
  action: ActivityAction,
  details?: Record<string, any>
): Promise<void> {
  try {
    const { error } = await supabase.from('activity_log').insert({
      user_id: userId,
      action,
      details: details || null,
    });
    if (error) console.error('Failed to log activity:', error.message);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

/**
 * Fetch recent activity log entries for a user.
 */
export async function getActivityLog(
  userId: string,
  limit = 50
): Promise<ActivityLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch activity log:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Failed to fetch activity log:', err);
    return [];
  }
}

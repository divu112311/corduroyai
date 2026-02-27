import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, Trash2, AlertCircle, CheckCircle, Loader2, LogOut } from 'lucide-react';
import { getActiveSessions, revokeSession, revokeAllOtherSessions, type UserSession } from '../lib/sessionService';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLogger';

function getDeviceIcon(os: string | null) {
  if (!os) return <Globe className="w-5 h-5" />;
  const lower = os.toLowerCase();
  if (lower.includes('android') || lower.includes('ios')) {
    return <Smartphone className="w-5 h-5" />;
  }
  return <Monitor className="w-5 h-5" />;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const data = await getActiveSessions(user.id);
    setSessions(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevoke = async (session: UserSession) => {
    setRevokingId(session.id);
    setMessage(null);
    const success = await revokeSession(session.id);
    if (success) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logActivity(user.id, 'session_revoked', { session_id: session.id, browser: session.browser, os: session.os });
      }
      setMessage({ type: 'success', text: 'Session revoked successfully' });
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } else {
      setMessage({ type: 'error', text: 'Failed to revoke session' });
    }
    setRevokingId(null);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setMessage(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRevokingAll(false);
      return;
    }
    const success = await revokeAllOtherSessions(user.id);
    if (success) {
      await logActivity(user.id, 'session_revoked', { scope: 'all_other' });
      setMessage({ type: 'success', text: 'All other sessions revoked' });
      setSessions((prev) => prev.filter((s) => s.is_current));
    } else {
      setMessage({ type: 'error', text: 'Failed to revoke sessions' });
    }
    setRevokingAll(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const otherSessionsExist = sessions.some((s) => !s.is_current);

  return (
    <div>
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-4 text-center text-slate-500 text-sm">No active sessions found.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-4 p-4 rounded-lg border ${
                session.is_current
                  ? 'border-blue-200 bg-blue-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                session.is_current ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {getDeviceIcon(session.os)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {session.browser || 'Unknown Browser'} on {session.os || 'Unknown OS'}
                  </p>
                  {session.is_current && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                      This device
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Last active: {formatRelativeTime(session.last_active_at)}
                </p>
              </div>

              {!session.is_current && (
                <button
                  onClick={() => handleRevoke(session)}
                  disabled={revokingId === session.id}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Revoke session"
                >
                  {revokingId === session.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {otherSessionsExist && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button
            onClick={handleRevokeAll}
            disabled={revokingAll}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {revokingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            Sign out of all other devices
          </button>
        </div>
      )}
    </div>
  );
}

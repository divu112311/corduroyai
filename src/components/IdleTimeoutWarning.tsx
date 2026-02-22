import { Clock, LogOut } from 'lucide-react';

interface IdleTimeoutWarningProps {
  remainingSeconds: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export function IdleTimeoutWarning({ remainingSeconds, onStayLoggedIn, onLogout }: IdleTimeoutWarningProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, '0')}`
    : `${seconds}s`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-7 h-7 text-amber-600" />
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mb-2">Session Expiring</h3>
        <p className="text-slate-600 text-sm mb-1">
          You've been inactive for a while. For your security, you'll be logged out in:
        </p>
        <p className="text-2xl font-bold text-amber-600 my-3">{timeDisplay}</p>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
          <button
            onClick={onStayLoggedIn}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}

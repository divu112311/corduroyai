import { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { UnifiedClassification } from './components/UnifiedClassification';
import { ProductProfile } from './components/ProductProfile';
import { Activity } from './components/Activity';
import { Settings } from './components/Settings';
import { LoginForm } from './components/auth/LoginForm';
import { SignUpForm, SignUpData } from './components/auth/SignUpForm';
import { ResetPasswordForm } from './components/auth/ResetPasswordForm';
import { NewPasswordForm } from './components/auth/NewPasswordForm';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { OnboardingFlow } from './components/auth/OnboardingFlow';
import { IdleTimeoutWarning } from './components/IdleTimeoutWarning';
import { Package, FileText, LayoutDashboard, LogOut, User, Settings as SettingsIcon, Clock } from 'lucide-react';
import logo from './assets/8dffc9a46764dc298d3dc392fb46f27f3eb8c7e5.png';
import { supabase } from './lib/supabase';
import { getUserMetadata, updateLastLogin, createOrUpdateUserMetadata } from './lib/userService';
import { recordLogin, upsertSession, heartbeat, removeCurrentSession } from './lib/sessionService';
import { logActivity } from './lib/activityLogger';
import { setSentryUser } from './lib/sentry';
import { useIdleTimeout } from './hooks/useIdleTimeout';

type View = 'dashboard' | 'classify' | 'profile' | 'settings' | 'activity';
type AuthView = 'login' | 'signup' | 'reset-password' | 'new-password';

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  companyName?: string;
  confidenceThreshold?: number;
  hasCompletedOnboarding?: boolean;
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [authView, setAuthView] = useState<AuthView>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(false);

  // Refs to avoid stale closures in onAuthStateChange callback (Fix #1)
  const isAuthenticatedRef = useRef(isAuthenticated);
  const authViewRef = useRef(authView);
  const userRef = useRef(user);
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);
  useEffect(() => { authViewRef.current = authView; }, [authView]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Idle timeout — auto-logout after 15 min inactivity, 2 min warning
  const { showWarning: showIdleWarning, remainingSeconds, stayLoggedIn } = useIdleTimeout({
    idleTimeout: 15 * 60 * 1000,
    warningDuration: 2 * 60 * 1000,
    onTimeout: () => handleLogout(),
    enabled: isAuthenticated,
  });

  // Session heartbeat — ping every 2 minutes while authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const interval = setInterval(() => heartbeat(user.id), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id]);

  // Check for existing session on mount
  useEffect(() => {
    // Check for password reset token in URL hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');

    // Check for explicit logout parameter
    const urlParams = new URLSearchParams(window.location.search);
    const shouldLogout = urlParams.get('logout') === 'true';

    if (shouldLogout) {
      // User explicitly wants to logout, clear session
      supabase.auth.signOut().then(() => {
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
        // Remove logout parameter from URL
        window.history.replaceState(null, '', window.location.pathname);
      });
      return;
    }

    if (type === 'recovery') {
      // User came from password reset email link
      setAuthView('new-password');
      // Clear the hash from URL
      window.history.replaceState(null, '', window.location.pathname);
    } else if (hashParams.get('access_token') || hashParams.get('code')) {
      // OAuth redirect (e.g. Google login) — let onAuthStateChange handle it
      // Don't call checkSession() to avoid flashing the login screen
    } else {
      checkSession();
    }

    // Listen for auth changes (Fix #1: read from refs, Fix #2: handle all events)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_IN' && session) {
        // Auto-login unless already authenticated or explicitly skipping (after logout)
        const skipAutoLogin = sessionStorage.getItem('skipAutoLogin') === 'true';
        if (!isAuthenticatedRef.current && !skipAutoLogin) {
          loadUserData(session.user).finally(() => setIsLoading(false));
        } else {
          setIsLoading(false);
        }
      } else if (_event === 'TOKEN_REFRESHED') {
        if (!session) {
          // Token refresh failed — session expired (Fix #3)
          setIsAuthenticated(false);
          setUser(null);
          setSessionExpiredMessage(true);
        }
        // If session exists, refresh succeeded silently — nothing to do
      } else if (_event === 'USER_UPDATED' && session) {
        // User profile was updated, reload data
        loadUserData(session.user);
      } else if (_event === 'SIGNED_OUT' || !session) {
        // Session ended
        const wasAuthenticated = isAuthenticatedRef.current;
        setIsAuthenticated(false);
        setUser(null);
        // Show expiry notice if this was an unexpected logout (Fix #7)
        if (wasAuthenticated && _event !== 'SIGNED_OUT') {
          setSessionExpiredMessage(true);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fix #5: Simplified skipAutoLogin — read once, clear immediately, then decide
  const checkSession = async () => {
    try {
      const skipAutoLogin = sessionStorage.getItem('skipAutoLogin') === 'true';
      sessionStorage.removeItem('skipAutoLogin');

      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user && !skipAutoLogin) {
        await loadUserData(session.user);
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserData = async (supabaseUser: any) => {
    try {
      console.log('Loading user data for:', supabaseUser.id, supabaseUser.email);
      
      // Fetch user metadata from user_metadata table
      let userMetadata = await getUserMetadata(supabaseUser.id);
      
      // If no metadata exists, create it
      if (!userMetadata) {
        console.log('No user_metadata found, creating new record...');
        userMetadata = await createOrUpdateUserMetadata(
          supabaseUser.id,
          supabaseUser.email || '',
          supabaseUser.user_metadata?.company
        );
      }
      
      // Update last login timestamp
      await updateLastLogin(supabaseUser.id);

      // Extract profile info if available
      const profileInfo = userMetadata?.profile_info || {};
      
      const userData = {
        id: supabaseUser.id,
        email: userMetadata?.email || supabaseUser.email || '',
        firstName: profileInfo.first_name || profileInfo.firstName || supabaseUser.user_metadata?.first_name,
        lastName: profileInfo.last_name || profileInfo.lastName || supabaseUser.user_metadata?.last_name,
        company: userMetadata?.company_name || supabaseUser.user_metadata?.company,
        companyName: userMetadata?.company_name,
        confidenceThreshold: userMetadata?.confidence_threshold,
        hasCompletedOnboarding: profileInfo.has_completed_onboarding ?? true,
      };
      
      console.log('Setting user data:', userData);
      setUser(userData);
      setIsAuthenticated(true);

      // Track login: record history, register session, identify in Sentry
      const authMethod = supabaseUser.app_metadata?.provider === 'google' ? 'google' : 'email';
      setSentryUser({ id: userData.id, email: userData.email });
      recordLogin(supabaseUser.id, authMethod as 'email' | 'google');
      upsertSession(supabaseUser.id);
      logActivity(supabaseUser.id, 'login', { auth_method: authMethod });
    } catch (error: any) {
      console.error('Error loading user data:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details
      });
      
      // Only use fallback if it's a non-critical error (like metadata fetch failure)
      // For critical errors, re-throw to let the caller handle it
      const isCriticalError = error?.code === 'AUTH_ERROR' || error?.message?.includes('authentication');
      
      if (!isCriticalError) {
        // Fallback to basic user data if metadata fetch fails (non-critical)
        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          firstName: supabaseUser.user_metadata?.first_name,
          lastName: supabaseUser.user_metadata?.last_name,
          company: supabaseUser.user_metadata?.company,
          hasCompletedOnboarding: true,
        });
        setIsAuthenticated(true);
      } else {
        // Re-throw critical authentication errors
        throw error;
      }
    }
  };

  // Authentication handlers
  const handleLogin = async (supabaseUser: any) => {
    sessionStorage.removeItem('skipAutoLogin');
    setSessionExpiredMessage(false);
    try {
      await loadUserData(supabaseUser);
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  };

  // Fix #4: Replace arbitrary delay with retry polling
  const handleSignUp = async (data: SignUpData) => {
    try {
      // Poll for the authenticated user instead of using an arbitrary delay
      let supabaseUser = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        if (fetchedUser && !userError) {
          supabaseUser = fetchedUser;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (!supabaseUser) {
        console.error('Could not retrieve user after signup');
        setUser({
          id: '',
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company,
          companyName: data.company,
          hasCompletedOnboarding: false,
        });
        setShowWelcome(true);
        setIsAuthenticated(true);
        return;
      }

      await createOrUpdateUserMetadata(
        supabaseUser.id,
        data.email,
        data.company
      );

      await loadUserData(supabaseUser);
      logActivity(supabaseUser.id, 'signup', { email: data.email, company: data.company });
      setShowWelcome(true);
    } catch (error) {
      console.error('Error during signup:', error);
      setUser({
        id: '',
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company,
        hasCompletedOnboarding: false,
      });
      setShowWelcome(true);
      setIsAuthenticated(true);
    }
  };

  const handleResetPassword = (email: string) => {
    // In a real app, this would send a reset email
    console.log('Password reset requested for:', email);
  };

  const handleResetComplete = () => {
    // After password reset, go back to login
    setAuthView('login');
  };

  const handleLogout = async () => {
    try {
      // Log activity and clean up session before signing out
      const currentUser = userRef.current;
      if (currentUser?.id) {
        await logActivity(currentUser.id, 'logout');
      }
      await removeCurrentSession();
      setSentryUser(null);

      // Set flag to skip auto-login after logout
      sessionStorage.setItem('skipAutoLogin', 'true');
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
      setCurrentView('dashboard');
      setShowUserMenu(false);
      setAuthView('login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Show loading state while checking session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show auth screens
  if (!isAuthenticated) {
    if (authView === 'login') {
      return (
        <>
          {/* Fix #7: Session expiry notification */}
          {sessionExpiredMessage && (
            <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
              <p className="text-amber-800 text-sm">
                Your session has expired. Please sign in again.
                <button
                  onClick={() => setSessionExpiredMessage(false)}
                  className="ml-3 text-amber-600 hover:text-amber-800 underline text-sm"
                >
                  Dismiss
                </button>
              </p>
            </div>
          )}
          <LoginForm
            onLogin={handleLogin}
            onSwitchToSignUp={() => setAuthView('signup')}
            onSwitchToResetPassword={() => setAuthView('reset-password')}
          />
        </>
      );
    }

    if (authView === 'signup') {
      return (
        <SignUpForm
          onSignUp={handleSignUp}
          onSwitchToLogin={() => setAuthView('login')}
        />
      );
    }

    if (authView === 'reset-password') {
      return (
        <ResetPasswordForm
          onRequestReset={handleResetPassword}
          onBackToLogin={() => setAuthView('login')}
        />
      );
    }

    if (authView === 'new-password') {
      return <NewPasswordForm onResetComplete={handleResetComplete} />;
    }
  }

  // Show welcome screen for new users
  if (isAuthenticated && showWelcome) {
    return (
      <WelcomeScreen
        userName={user && user.firstName ? user.firstName : (user && user.email ? user.email.split('@')[0] : 'there')}
        company={user && user.company ? user.company : undefined}
        onGetStarted={() => setShowWelcome(false)}
      />
    );
  }

  // Show onboarding flow for new users
  if (isAuthenticated && user && !user.hasCompletedOnboarding) {
    return (
      <OnboardingFlow
        userName={user && user.firstName ? user.firstName : (user && user.email ? user.email.split('@')[0] : 'there')}
        company={user && user.company ? user.company : undefined}
        onComplete={() => {
          setUser({ ...user, hasCompletedOnboarding: true });
          setShowOnboarding(false);
        }}
      />
    );
  }

  // Authenticated app
  return (
    <>
    {showIdleWarning && (
      <IdleTimeoutWarning
        remainingSeconds={remainingSeconds}
        onStayLoggedIn={stayLoggedIn}
        onLogout={handleLogout}
      />
    )}
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <div className="mb-8">
          <img src={logo} alt="Corduroy AI" className="w-full max-w-[200px]" />
        </div>
        
        <nav className="flex-1 space-y-2">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'dashboard'
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          
          <button
            onClick={() => setCurrentView('classify')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'classify'
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package className="w-5 h-5" />
            <span>Classify Product</span>
          </button>
          
          <button
            onClick={() => setCurrentView('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'profile'
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span>Product Profiles</span>
          </button>

          <button
            onClick={() => setCurrentView('activity')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'activity'
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span>Activity</span>
          </button>

          <button
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'settings'
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </nav>
        
        {/* User Profile Section */}
        <div className="mt-auto pt-6 border-t border-slate-200">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 truncate">
                  {user && user.firstName ? user.firstName : (user && user.email ? user.email.split('@')[0] : 'User')}
                </p>
                <p className="text-xs text-slate-500 truncate">{user && user.email ? user.email : ''}</p>
              </div>
            </button>

            {/* User Menu Dropdown */}
            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
                <div className="p-3 border-b border-slate-100">
                  <p className="text-sm text-slate-900">
                    {user && user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : (user && user.email ? user.email : '')}
                  </p>
                  {user && user.company && (
                    <p className="text-xs text-slate-500 mt-1">{user.company}</p>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 text-slate-500 text-xs">
            <p>Corduroy AI v0.1</p>
            <p className="mt-1">Made with love in the USA</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {currentView === 'dashboard' && <Dashboard onNavigate={setCurrentView} />}
        {currentView === 'classify' && <UnifiedClassification />}
        {currentView === 'profile' && <ProductProfile />}
        {currentView === 'activity' && <Activity />}
        {currentView === 'settings' && <Settings />}
      </main>
    </div>
    </>
  );
}

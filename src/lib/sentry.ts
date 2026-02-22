import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry error monitoring.
 * Set VITE_SENTRY_DSN in your .env to enable.
 * If the DSN is missing, Sentry is silently disabled.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.log('Sentry DSN not configured — error monitoring disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' or 'production'
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Performance monitoring — capture 20% of transactions in prod
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    // Session replay — capture 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

/**
 * Identify the current user in Sentry so errors are linked to their account.
 */
export function setSentryUser(user: { id: string; email: string } | null) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

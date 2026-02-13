import { useState } from 'react';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import logo from '../../assets/8dffc9a46764dc298d3dc392fb46f27f3eb8c7e5.png';
import { supabase } from '../../lib/supabase';

interface ResetPasswordFormProps {
  onRequestReset: (email: string) => void;
  onBackToLogin: () => void;
}

export function ResetPasswordForm({ onRequestReset, onBackToLogin }: ResetPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Send password reset email via Supabase Auth
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message || 'Failed to send reset email');
        setIsLoading(false);
        return;
      }

      setEmailSent(true);
      onRequestReset(email);
    } catch (err: any) {
      setError(err.message || 'An error occurred while sending reset email');
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Success Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>

            <h2 className="text-slate-900 mb-3">Check Your Email</h2>
            <p className="text-slate-600 mb-6">
              We've sent password reset instructions to <strong>{email}</strong>
            </p>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
              <p className="text-blue-900 text-sm mb-2">
                <strong>Next Steps:</strong>
              </p>
              <ol className="text-blue-800 text-sm text-left space-y-1 ml-4 list-decimal">
                <li>Check your email inbox (and spam folder)</li>
                <li>Click the reset link in the email</li>
                <li>Create your new password</li>
              </ol>
            </div>

            <button
              onClick={onBackToLogin}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Login
            </button>

            <div className="mt-4">
              <button
                onClick={() => setEmailSent(false)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Didn't receive the email? Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <img src={logo} alt="Corduroy AI" className="h-12 mx-auto" />
          </div>
          <h1 className="text-slate-900 mb-2">Reset Your Password</h1>
          <p className="text-slate-600">
            Enter your email and we'll send you instructions to reset your password
          </p>
        </div>

        {/* Reset Password Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-900 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                'Send Reset Instructions'
              )}
            </button>

            {/* Back to Login */}
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

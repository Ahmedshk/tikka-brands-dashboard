import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '../../components/common/Spinner';
import loginBackground from '@assets/images/login_background.png';
import LogoWhite from '@assets/logos/main_logo_white.svg?react';
import MainLogo from '@assets/logos/main_logo.svg?react';
import {
  validateSetPasswordToken,
  setPassword as submitSetPassword,
} from '../../services/auth.service';
import { PasswordChecklist } from '../../components/common/PasswordChecklist';
import { isPasswordStrong } from '../../utils/passwordValidation';

type ValidationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'valid'; email: string; firstName: string }
  | { status: 'expired' }
  | { status: 'invalid' };

export const SetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [validation, setValidation] = useState<ValidationState>({
    status: 'idle',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!token?.trim()) {
      setValidation({ status: 'invalid' });
      return;
    }
    let cancelled = false;
    setValidation({ status: 'loading' });
    validateSetPasswordToken(token)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setValidation({
            status: 'valid',
            email: res.data.email,
            firstName: res.data.firstName,
          });
        } else if (res.expired) {
          setValidation({ status: 'expired' });
        } else {
          setValidation({ status: 'invalid' });
        }
      })
      .catch(() => {
        if (!cancelled) setValidation({ status: 'invalid' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validation.status !== 'valid' || !token) return;
    setSubmitError('');
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }
    if (!isPasswordStrong(password)) {
      setSubmitError(
        'Password must be at least 8 characters with one lowercase letter, one uppercase letter, one number, and one symbol.'
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await submitSetPassword(token, password, confirmPassword);
      if (res.success) {
        navigate('/login', {
          replace: true,
          state: {
            message:
              res.message ||
              'Password set successfully. You can now sign in.',
          },
        });
      } else {
        setSubmitError(
          (res as { message?: string }).message ||
            'Something went wrong. Please try again or contact your administrator.'
        );
      }
    } catch {
      setSubmitError(
        'Unable to set password. Please try again or contact your administrator for a new invitation link.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = () => {
    if (validation.status === 'idle' || validation.status === 'loading') {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" className="text-button-primary" />
        </div>
      );
    }

    if (validation.status === 'expired') {
      return (
        <div className="space-y-6">
          <p className="text-primary text-sm md:text-base">
            This link has expired. Please contact your administrator for a new
            invitation link.
          </p>
          <Link
            to="/login"
            className="inline-block text-button-primary hover:underline font-medium"
          >
            Back to login
          </Link>
        </div>
      );
    }

    if (validation.status === 'invalid') {
      return (
        <div className="space-y-6">
          <p className="text-primary text-sm md:text-base">
            This link is invalid or has already been used. Please contact your
            administrator for a new invitation link.
          </p>
          <Link
            to="/login"
            className="inline-block text-button-primary hover:underline font-medium"
          >
            Back to login
          </Link>
        </div>
      );
    }

    // status === 'valid'
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        {submitError && (
          <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {submitError}
          </div>
        )}

        <div>
          <label htmlFor="set-password-email" className="block text-sm text-primary mb-1">
            Email
          </label>
          <input
            type="email"
            id="set-password-email"
            value={validation.email}
            readOnly
            className="w-full px-4 py-3 bg-gray-100 focus:outline-none cursor-not-allowed text-primary"
            aria-readonly
          />
        </div>

        <div>
          <label htmlFor="set-password-password" className="block text-sm text-primary mb-1">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="set-password-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Enter password"
              className="w-full px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-button-primary focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-button-primary transition-colors focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 01-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              )}
            </button>
          </div>
          <PasswordChecklist password={password} className="mt-2" />
        </div>

        <div>
          <label htmlFor="set-password-confirm" className="block text-sm text-primary mb-1">
            Confirm password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="set-password-confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Confirm password"
              className="w-full px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-button-primary focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-button-primary transition-colors focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 01-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-button-primary text-white text-sm md:text-base 2xl:text-lg py-3 px-4 rounded-md font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="h-5 w-5 text-white" />
              Setting password...
            </>
          ) : (
            'Set password'
          )}
        </button>
      </form>
    );
  };

  return (
    <div className="h-screen bg-dashboard-background p-4 overflow-hidden">
      <div className="w-full h-full flex flex-col rounded-4xl overflow-hidden shadow-lg bg-white">
        <div className="lg:hidden flex justify-center p-6 mt-12 mb-30">
          <MainLogo className="max-w-2xl w-full px-8" />
        </div>

        <div className="flex flex-1">
          <div className="hidden lg:flex lg:w-1/2 relative">
            <div className="relative w-full">
              <div
                className="absolute inset-0 bg-cover bg-center rounded-4xl m-4"
                style={{ backgroundImage: `url(${loginBackground})` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <LogoWhite className="max-w-2xl w-full px-8" />
              </div>
            </div>
          </div>

          <div className="w-full lg:w-1/2 bg-card-background flex items-center justify-center p-8 h-1/2 lg:h-full">
            <div className="w-full max-w-md">
              <h2 className="text-[30px] md:text-[40px] 2xl:text-[50px] font-bold text-tertiary mb-8">
                Set your password
              </h2>
              {content()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

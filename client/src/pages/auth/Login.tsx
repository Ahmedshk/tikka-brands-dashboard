import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useAuth } from '../../hooks/useAuth';
import { RootState } from '../../store/store';
import { Spinner } from '../../components/common/Spinner';
import loginBackground from '@assets/images/login_background.png';
import LogoWhite from '@assets/logos/main_logo_white.svg?react';
import MainLogo from '@assets/logos/main_logo.svg?react';

export const Login = () => {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard/command-center', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    try {
      await login({ email, password });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An error occurred during login');
      }
    }
  };

  return (
    <div className="h-screen bg-dashboard-background p-4 overflow-hidden">
      {/* Main Container with Rounded Corners */}
      <div className="w-full h-full flex flex-col rounded-4xl overflow-hidden shadow-lg bg-white">
        {/* Logo for smaller screens */}
        <div className="lg:hidden flex justify-center p-6 mt-12 mb-30 ">
          <MainLogo className="max-w-2xl w-full px-8" />
        </div>

        <div className="flex flex-1">
          {/* Left Panel - Background Image with Logo */}
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

          {/* Right Panel - Login Form */}
          <div className="w-full lg:w-1/2 bg-card-background flex items-center justify-center p-8 h-1/2 lg:h-full">
            <div className="w-full max-w-md">
              <h2 className="text-[30px] md:text-[40px] 2xl:text-[50px] font-bold text-tertiary mb-8 lg:mb-8">Login</h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Email"
                    className="w-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-button-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Password"
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
                  <div className="mt-2 text-right">
                    <Link
                      to="/forgot-password"
                      className="text-xs md:text-sm 2xl:text-base text-primary hover:text-button-primary/80 transition-colors"
                    >
                      Forgot Password?
                    </Link>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-button-primary text-white text-sm md:text-base 2xl:text-lg py-3 px-4 rounded-md font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isLoading ? (
                    <>
                      <Spinner size="sm" className="h-5 w-5 text-white" />
                      Logging in...
                    </>
                  ) : (
                    'LOGIN'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

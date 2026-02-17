import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/common/Spinner';
import loginBackground from '@assets/images/login_background.png';
import LogoWhite from '@assets/logos/main_logo_white.svg?react';
import MainLogo from '@assets/logos/main_logo.svg?react';

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    // Placeholder for forgot password logic
    setTimeout(() => {
      setMessage('Password reset email sent (placeholder)');
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="h-screen bg-dashboard-background p-4 overflow-hidden">
      {/* Main Container with Rounded Corners */}
      <div className="w-full h-full flex flex-col rounded-4xl overflow-hidden shadow-lg bg-white">
        {/* Logo for smaller screens */}
        <div className="lg:hidden flex justify-center p-6 mt-12 mb-30">
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

          {/* Right Panel - Forgot Password Form */}
          <div className="w-full lg:w-1/2 bg-card-background flex items-center justify-center p-8 h-1/2 lg:h-full">
            <div className="w-full max-w-md">
              <h2 className="text-[30px] md:text-[40px] 2xl:text-[50px] font-bold text-tertiary mb-8">
                Forgot Password
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                {message && (
                  <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm">
                    {message}
                  </div>
                )}

                <div>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email"
                    required
                    className="w-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-button-primary focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-button-primary text-white text-sm md:text-base 2xl:text-lg py-3 px-4 rounded-md font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isLoading ? (
                    <>
                      <Spinner size="sm" className="h-5 w-5 text-white" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="text-lg md:text-xl 2xl:text-2xl text-primary hover:text-button-primary/80 transition-colors underline font-bold"
                  >
                    Back to Login
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

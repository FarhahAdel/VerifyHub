import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FiUser, FiMail, FiLock, FiUsers, FiExternalLink, FiFileText, FiCheckSquare, FiUpload, FiEye, FiEyeOff } from 'react-icons/fi';

export default function AuthPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('INSTITUTE');
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login, register, loading, error: authError } = useAuth();
  const navigate = useNavigate();
  // show password
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Clear error when switching between login and register modes
  useEffect(() => {
    setError('');
  }, [isRegistering]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    console.log('Form submission:', {
      isLogin: !isRegistering,
      email,
      password: '***',
      name: isRegistering ? name : 'N/A',
      role: isRegistering ? role : 'N/A'
    });

    try {
      let success = false;

      if (isRegistering) {
        // Registration validation
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        success = await register(name, email, password, role);
      } else {
        // Login
        success = await login(email, password, rememberMe);
      }

      if (success) {
        console.log('Auth successful, redirecting to dashboard');
        navigate('/');
      } else {
        // Use specific error messages based on the operation
        if (isRegistering) {
          setError(authError || 'Registration failed. Please check your information and try again.');
        } else {
          setError(authError || 'Invalid email or password. Please try again.');
        }
      }
    } catch (err) {
      console.error('Auth exception:', err);
      setError(err.message || (isRegistering ? 'Registration failed' : 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipLogin = () => {
    navigate('/');
  };


  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setRole('INSTITUTE');
  };

  // Error Message Component
  const ErrorMessage = ({ message }) => (
    <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">
            {isRegistering ? 'Registration Error' : 'Login Error'}
          </h3>
          <p className="text-sm leading-5 text-red-700 mt-1">{message}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm -z-10" />

      <div className="w-full max-w-4xl mx-4 flex overflow-hidden rounded-sm shadow-xl">
        {/* Left side - Dark themed */}
        <div className="hidden md:block w-1/3 bg-gray-800 p-8 text-white">
          <div className="h-full flex flex-col justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">VerifyHub</h1>
              <p className="text-gray-400 mb-6 text-sm">Secure certificate verification platform</p>

              <div className="space-y-4 mt-8">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-sm bg-gray-700 flex items-center justify-center mr-3">
                    <FiFileText className="text-gray-300 w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-200">Generate Certificates</h3>
                    <p className="text-xs text-gray-400">Create and issue digital certificates</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-sm bg-gray-700 flex items-center justify-center mr-3">
                    <FiCheckSquare className="text-gray-300 w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-200">Verify Authenticity</h3>
                    <p className="text-xs text-gray-400">Confirm certificate validity instantly</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-sm bg-gray-700 flex items-center justify-center mr-3">
                    <FiUpload className="text-gray-300 w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-200">Upload & Manage</h3>
                    <p className="text-xs text-gray-400">Store and organize your certificates</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              © 2025 VerifyHub. All rights reserved.
            </div>
          </div>
        </div>

        {/* Right side - Light themed */}
        <div className="w-full md:w-2/3 bg-white p-8">
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
              {isRegistering ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-center text-gray-600 mb-4">
              {isRegistering
                ? 'Join us and start verifying your certificates today!'
                : 'Login to access your dashboard'}
            </p>
            {(authError || error) && <ErrorMessage message={authError || error} />}


            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegistering && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent focus:outline-none transition-all"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    name='email'
                    autoComplete='email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent focus:outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent focus:outline-none transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
                {isRegistering && (
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum 8 characters with at least 1 letter and 1 number
                  </p>
                )}
              </div>

              {isRegistering && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent focus:outline-none transition-all"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500"
                        tabIndex={-1}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role
                    </label>
                    <div className="relative">
                      <FiUsers className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <select
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="INSTITUTE">INSTITUTE</option>
                        <option value="VERIFIER">VERIFIER</option>
                        <option value="STUDENT">STUDENT</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="ml-2 text-sm text-gray-600">Remember me</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || submitting}
                className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading || submitting ? 'Processing...' : isRegistering ? 'Register' : 'Login'}
              </button>
            </form>

            <div className="mt-6 space-y-4">
              <div className="text-center">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSkipLogin}
                className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-sm text-gray-700 hover:bg-gray-100 transition-all"
              >
                <span>Continue without login</span>
                <FiExternalLink className="ml-2" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
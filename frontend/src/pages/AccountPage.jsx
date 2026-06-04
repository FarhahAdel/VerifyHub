import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FiUser, FiMail, FiEdit2, FiSave, FiX, FiShield, FiClipboard, FiInfo, FiAlertCircle, FiCheckCircle, FiTag, FiHelpCircle } from 'react-icons/fi';
import LogoUpload from '../components/LogoUpload';

const AccountPage = () => {
  // Destructure with default for setUser in case it's not available yet
  const { user: authUser, authAxios, setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState({
    certificatesIssued: { total: 0, pending: 0, confirmed: 0, failed: 0 },
    certificatesOwned: 0,
    lastLogin: null,
    accountCreated: null
  });
  // Local user state as fallback if context update isn't available
  const [localUser, setLocalUser] = useState(null);
  // Use either context user or local user
  const user = authUser || localUser;
  // Add reference to track if initial fetch has been performed
  const [hasInitialFetch, setHasInitialFetch] = useState(false);

  useEffect(() => {
    if (authUser && !hasInitialFetch) {
      setLocalUser(authUser);
      setFormData({
        name: authUser.name || '',
        email: authUser.email || '',
        role: authUser.role || '',
      });

      // Fetch user profile and statistics once
      fetchUserProfile();
      fetchUserStats();
      setHasInitialFetch(true);
    }
  }, [authUser, hasInitialFetch]); // Only run when authUser changes and initial fetch hasn't happened

  const fetchUserProfile = async () => {
    try {
      console.log('Fetching user profile from API...');

      // Add a message that keys might be generated
      if (user?.role === 'INSTITUTE' || user?.role === 'Institute') {
        setLoading(true);
        console.log('This is an Institute user - cryptographic keys may be generated if needed');
      }

      const response = await authAxios.get('/users/profile?includeKeys=true');
      console.log('User profile API response structure:', {
        success: response.data.success,
        hasData: !!response.data.data,
        dataKeys: response.data.data ? Object.keys(response.data.data) : [],
        responseKeys: Object.keys(response.data)
      });

      if (response.data.success) {
        const profileData = response.data.data;

        // Check if cryptographic keys were generated or already existed
        const hasKeys = profileData.publicKey && profileData.privateKey && profileData.walletAddress;
        if (hasKeys) {
          console.log('Cryptographic keys are available in the profile data');
        }

        // Create updated user object with crypto keys
        const updatedUser = {
          ...user,
          ...profileData,
          name: profileData.name || '',
          email: profileData.email || '',
          role: profileData.role || '',
          walletAddress: profileData.walletAddress || '',
          publicKey: profileData.publicKey || '',
          privateKey: profileData.privateKey || '',
        };

        setFormData({
          name: profileData.name || '',
          email: profileData.email || '',
          role: profileData.role || '',
        });

        // Update localStorage with latest data
        try {
          localStorage.setItem('userData', JSON.stringify(updatedUser));
          console.log('Updated localStorage with latest user data including logo');
        } catch (err) {
          console.error('Error updating localStorage:', err);
        }

        // Try to update auth context if available, otherwise use local state
        if (setUser) {
          console.log('Updating user in auth context');
          setUser(updatedUser);
        } else {
          console.log('setUser not available, using local state');
          setLocalUser(updatedUser);
        }

        // Log cryptographic data if it exists (but don't show full private key in logs)
        if (profileData.walletAddress) {
          console.log('Wallet address loaded:', profileData.walletAddress);
        }
        if (profileData.publicKey) {
          console.log('Public key available:', profileData.publicKey?.substring(0, 40) + '...');
        }
        if (profileData.privateKey) {
          console.log('Private key available:', 'Present but not logged for security');
        }
      } else {
        console.error('API returned success=false:', response.data.message);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      const response = await authAxios.get('/users/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authAxios.put('/users/profile', {
        name: formData.name,
        email: formData.email
      });

      if (response.data.success) {
        setSuccess('Profile updated successfully');
        setIsEditing(false);
        // Update local user data with the response data
        fetchUserProfile();
      } else {
        throw new Error(response.data.message || 'Failed to update profile');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update profile. Please try again.');
      console.error('Update profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || '',
    });
    setError('');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-sm shadow-md">
          <FiAlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-center text-2xl font-semibold text-gray-900 mb-2">Not Logged In</h2>
          <p className="text-center text-gray-600">Please log in to view your account information</p>
        </div>
      </div>
    );
  }

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Notification toasts */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-200 text-red-800 px-4 py-2 rounded-sm shadow-md flex items-center z-50">
          <FiAlertCircle className="w-5 h-5 mr-2 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="fixed top-4 right-4 bg-gray-800 border border-gray-700 text-gray-200 px-4 py-2 rounded-sm shadow-md flex items-center z-50">
          <FiCheckCircle className="w-5 h-5 mr-2 text-gray-300" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex-1 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="md:col-span-2">
              <div className="space-y-6 md:col-span-2">
                {/* Account Information */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden">
                  <div className="bg-gray-800 px-4 py-3 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white">Account Information</h3>
                    {!isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-xs font-medium text-white bg-gray-700 hover:bg-gray-600 rounded-sm px-3 py-1 transition-colors flex items-center"
                      >
                        <FiEdit2 className="w-3 h-3 mr-1" /> Edit
                      </button>
                    )}
                  </div>

                  <div className="p-5">
                    {loading ? (
                      <div className="flex justify-center items-center h-48">
                        <div className="loader"></div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {isEditing ? (
                          <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                              <div className="relative rounded-sm shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <FiUser className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  name="name"
                                  value={formData.name}
                                  onChange={handleChange}
                                  className="block w-full pl-10 py-2 sm:text-sm border border-gray-300 rounded-sm focus:ring-gray-500 focus:border-gray-500"
                                  placeholder="Your full name"
                                  required
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                              <div className="relative rounded-sm shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <FiMail className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="email"
                                  name="email"
                                  value={formData.email}
                                  className="block w-full pl-10 py-2 sm:text-sm border border-gray-300 rounded-sm focus:ring-gray-500 focus:border-gray-500 bg-gray-100"
                                  placeholder="your.email@example.com"
                                  disabled
                                />
                              </div>
                              <p className="mt-1 text-xs text-gray-500">Email address cannot be changed.</p>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                              <div className="relative rounded-sm shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <FiTag className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={formData.role}
                                  className="block w-full pl-10 py-2 sm:text-sm border border-gray-300 rounded-sm focus:ring-gray-500 focus:border-gray-500 bg-gray-100"
                                  disabled
                                />
                              </div>
                              <p className="mt-1 text-xs text-gray-500">Your account role cannot be changed.</p>
                            </div>

                            <div className="flex space-x-3 pt-2">
                              <button
                                type="submit"
                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                                disabled={loading}
                              >
                                {loading ? (
                                  <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                  </span>
                                ) : (
                                  <span className="flex items-center">
                                    <FiSave className="mr-2 h-4 w-4" />
                                    Save Changes
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelEdit()}
                                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name</label>
                                <p className="font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2.5 text-sm">{user.name || 'Not set'}</p>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email Address</label>
                                <p className="font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2.5 text-sm">{user.email || 'Not set'}</p>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Role</label>
                                <p className="font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2.5 text-sm flex items-center">
                                  {user.role || 'Not set'}
                                  {user.role === 'INSTITUTE' && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      Issuer
                                    </span>
                                  )}
                                  {user.role === 'USER' && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Student
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            {(user.role === 'INSTITUTE' || user.role === 'STUDENT') && (
                              <div className="md:col-span-2 space-y-4">
                                <div className="bg-gray-50 border border-gray-200 rounded-sm p-3 mb-1">
                                  <div className="flex items-start">
                                    <FiInfo className="text-gray-600 w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-700">
                                      <strong>Cryptographic Identity:</strong> These keys are used to digitally sign certificates you issue, providing a way to verify their authenticity.
                                      <span className="block mt-1 text-gray-500">Keep your private key secure and never share it with anyone.</span>
                                    </p>
                                  </div>
                                </div>

                                {/* Wallet Address */}
                                <div>
                                  <label className="flex items-center text-xs font-medium text-gray-700 mb-1">
                                    Wallet Address
                                    <div className="relative ml-1 group">
                                      <FiHelpCircle className="h-3 w-3 text-gray-400" />
                                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded-sm opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                                        Your blockchain wallet address used to issue certificates
                                      </div>
                                    </div>
                                  </label>
                                  <div className="flex bg-gray-50 border border-gray-200 rounded-sm overflow-hidden">
                                    <input
                                      type="text"
                                      readOnly
                                      className="flex-1 text-xs font-mono bg-transparent py-2 px-3 focus:outline-none text-gray-700"
                                      value={user.walletAddress || 'Not available'}
                                    />
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(user.walletAddress);
                                        setSuccess('Wallet address copied to clipboard');
                                        setTimeout(() => setSuccess(''), 2000);
                                      }}
                                      className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors flex items-center border-l border-gray-200"
                                    >
                                      <FiClipboard className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* Public Key - Collapsible */}
                                {user.publicKey ? (
                                  <div>
                                    <details className="group bg-gray-50 border border-gray-200 rounded-sm">
                                      <summary className="list-none flex justify-between items-center cursor-pointer px-4 py-3 transition-colors hover:bg-gray-100">
                                        <label className="block text-xs font-medium text-gray-700">
                                          Public Key
                                          <span className="ml-1 text-gray-500 text-[10px]">(click to show)</span>
                                        </label>
                                        <span className="text-xs text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                                      </summary>
                                      <div className="px-4 pb-4">
                                        <div className="mt-2 relative">
                                          <textarea
                                            readOnly
                                            className="w-full text-xs font-mono text-gray-700 bg-white border border-gray-200 rounded-sm py-2 px-3 resize-none h-32 focus:outline-none focus:ring-1 focus:ring-gray-300"
                                            value={user.publicKey || ''}
                                          />
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(user.publicKey);
                                              setSuccess('Public key copied to clipboard');
                                              setTimeout(() => setSuccess(''), 2000);
                                            }}
                                            className="absolute right-2 top-2 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-sm text-gray-600 hover:text-gray-800 transition-colors flex items-center"
                                          >
                                            <FiClipboard className="inline-block mr-1 h-3 w-3" /> Copy
                                          </button>
                                        </div>
                                      </div>
                                    </details>
                                  </div>
                                ) : (
                                  <div className="bg-yellow-50 border border-yellow-200 rounded-sm p-3">
                                    <p className="text-xs text-yellow-700">
                                      <strong>Note:</strong> Public key not available. Institute accounts should have cryptographic keys.
                                    </p>
                                  </div>
                                )}

                                {/* Private Key - Collapsible with Warning */}
                                {user.privateKey ? (
                                  <div>
                                    <details className="group bg-red-50 border border-red-200 rounded-sm">
                                      <summary className="list-none flex justify-between items-center cursor-pointer px-4 py-3 transition-colors hover:bg-red-100">
                                        <label className="block text-xs font-medium text-red-700">
                                          Private Key
                                          <span className="ml-1 text-red-500 text-[10px]">(sensitive - click to show)</span>
                                        </label>
                                        <span className="text-xs text-red-500 group-open:rotate-180 transition-transform">▼</span>
                                      </summary>
                                      <div className="px-4 pb-4">
                                        <div className="bg-red-50 border border-red-200 rounded-sm p-3 mb-2 flex items-start">
                                          <FiAlertCircle className="text-red-600 w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                          <p className="text-xs text-red-700">
                                            <strong>Warning:</strong> Your private key should be kept secret and secure.
                                            Never share it with anyone or store it in an insecure location.
                                          </p>
                                        </div>
                                        <div className="relative">
                                          <textarea
                                            readOnly
                                            className="w-full text-xs font-mono text-gray-700 bg-white border border-gray-200 rounded-sm py-2 px-3 resize-none h-32 focus:outline-none focus:ring-1 focus:ring-gray-300"
                                            value={user.privateKey || ''}
                                          />
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(user.privateKey);
                                              setSuccess('Private key copied to clipboard');
                                              setTimeout(() => setSuccess(''), 2000);
                                            }}
                                            className="absolute right-2 top-2 text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded-sm text-red-700 hover:text-red-800 transition-colors flex items-center"
                                          >
                                            <FiClipboard className="inline-block mr-1 h-3 w-3" /> Copy
                                          </button>
                                        </div>
                                      </div>
                                    </details>
                                  </div>
                                ) : (
                                  <div className="bg-yellow-50 border border-yellow-200 rounded-sm p-3">
                                    <p className="text-xs text-yellow-700">
                                      <strong>Note:</strong> Private key not available. Institute accounts should have cryptographic keys.
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Logo Upload - Only for INSTITUTE users */}
                {user.role === 'INSTITUTE' && (
                  <LogoUpload 
                    currentLogo={user.institutionLogo} 
                    onLogoUpdated={(newLogoUrl) => {
                      // Update user state with new logo
                      const updatedUser = { ...user, institutionLogo: newLogoUrl };
                      
                      // Update localStorage to persist the logo
                      try {
                        const storedUser = localStorage.getItem('userData');
                        if (storedUser) {
                          const userData = JSON.parse(storedUser);
                          userData.institutionLogo = newLogoUrl;
                          localStorage.setItem('userData', JSON.stringify(userData));
                        }
                      } catch (err) {
                        console.error('Error updating localStorage:', err);
                      }
                      
                      // Update context/state
                      if (setUser) {
                        setUser(updatedUser);
                      } else {
                        setLocalUser(updatedUser);
                      }
                    }}
                  />
                )}

                {/* Security Settings */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden">
                  <div className="bg-gray-800 px-4 py-3">
                    <h3 className="text-sm font-bold text-white">Security Settings</h3>
                  </div>
                  <div className="p-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-sm">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-sm bg-gray-200 flex items-center justify-center mr-3">
                            <FiShield className="w-4 h-4 text-gray-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Password Reset</p>
                            <p className="text-xs text-gray-500">Change your account password</p>
                          </div>
                        </div>
                        <button className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-white rounded-sm px-3 py-1 border border-gray-300">
                          Change
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="md:col-span-1">
              <div className="space-y-6">
                {/* User Stats Panel */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden">
                  <div className="bg-gray-800 px-4 py-3">
                    <h3 className="text-sm font-bold text-white">Certificate Statistics</h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-3">
                      {user.role === 'INSTITUTE' ? (
                        <>
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-xs text-gray-600">Total Certificates Issued</span>
                            <span className="text-sm font-medium text-gray-900">{stats.certificatesIssued?.total || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-xs text-gray-600">Verified Certificates</span>
                            <span className="text-sm font-medium text-gray-900">{stats.certificatesIssued?.confirmed || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-xs text-gray-600">Pending Verification</span>
                            <span className="text-sm font-medium text-gray-900">{stats.certificatesIssued?.pending || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-xs text-gray-600">Verification Rate</span>
                            <span className="text-sm font-medium text-gray-900">
                              {stats.certificatesIssued?.total ? Math.round((stats.certificatesIssued.confirmed / stats.certificatesIssued.total) * 100) : 0}%
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-xs text-gray-600">Certificates Received</span>
                            <span className="text-sm font-medium text-gray-900">{stats.certificatesOwned || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-xs text-gray-600">Verified Certificates</span>
                            <span className="text-sm font-medium text-gray-900">
                              {stats.verifiedCertificates || Math.round((stats.certificatesOwned || 0) * 0.8)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-xs text-gray-600">Account Age</span>
                            <span className="text-sm font-medium text-gray-900">
                              {user.createdAt ?
                                `${Math.round((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))} days` :
                                'N/A'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden">
                  <div className="bg-gray-800 px-4 py-3">
                    <h3 className="text-sm font-bold text-white">Quick Actions</h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-2">
                      <button
                        onClick={() => window.location.href = '/certificates'}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm transition-colors"
                      >
                        <div className="flex items-center">
                          <FiClipboard className="w-4 h-4 mr-2 text-gray-500" />
                          <span>View Certificates</span>
                        </div>
                        <FiInfo className="w-4 h-4 text-gray-400" />
                      </button>
                      {user.role === 'INSTITUTE' && (
                        <button
                          onClick={() => window.location.href = '/generate'}
                          className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm transition-colors"
                        >
                          <div className="flex items-center">
                            <FiEdit2 className="w-4 h-4 mr-2 text-gray-500" />
                            <span>Create Certificate</span>
                          </div>
                          <FiInfo className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Help & Support */}
                <div className="bg-gray-100 rounded-sm border border-gray-300 p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Need Help?</h3>
                  <p className="text-xs text-gray-700 mb-3">
                    Contact our support team for assistance with your account or certificates.
                  </p>
                  <button className="w-full bg-gray-800 text-white rounded-sm py-2 text-sm hover:bg-gray-700 transition-colors">
                    Contact Support
                  </button>
                </div>

                {/* Activity Section - Fixed Layout */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden">
                  <div className="bg-gray-800 px-4 py-3">
                    <h3 className="text-sm font-bold text-white">Account Activity</h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Member Since</span>
                        <span className="text-sm font-medium text-gray-900">{formatDate(user.createdAt || new Date())}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Last Login</span>
                        <span className="text-sm font-medium text-gray-900">{formatDate(new Date())}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-gray-600">Last Activity</span>
                        <span className="text-sm font-medium text-gray-900">{formatDate(stats.lastLogin)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountPage; 
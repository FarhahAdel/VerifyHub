import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { FiSearch, FiFilter, FiDownload, FiExternalLink, FiCheckCircle, FiAlertCircle, FiClock, FiEye, FiFileText, FiPlus, FiGrid, FiList, FiX, FiClipboard, FiInfo } from 'react-icons/fi';

const CertificatesPage = () => {
  const { user, authAxios } = useAuth();
  const location = useLocation();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    // Fetch certificates data when component mounts or user changes
    if (user) {
      fetchCertificates();
    }
  }, [user]);

  // Fetch certificates when location changes (e.g., coming from generate page)
  useEffect(() => {
    if (user && location.pathname === '/certificates') {
      console.log('Location changed to certificates page, refreshing data');
      fetchCertificates();
    }
  }, [location.pathname]);

  // Listen for focus events to refresh data when tab becomes active again
  useEffect(() => {
    const refreshOnFocus = () => {
      if (user && document.visibilityState === 'visible') {
        console.log('Tab became visible, refreshing certificates');
        fetchCertificates();
      }
    };

    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', fetchCertificates);

    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', fetchCertificates);
    };
  }, [user]);

  const fetchCertificates = async () => {
    setLoading(true);
    setError('');

    try {
      // Call the real API endpoint
      const response = await authAxios.get('/users/certificates', {
        params: {
          search: searchTerm || undefined,
          status: filterStatus !== 'all' ? filterStatus.toUpperCase() : undefined
        }
      });
      console.log(response)

      if (response.data.success) {
        console.log('Certificates fetched successfully:', response.data.data);
        setCertificates(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to load certificates');
      }
    } catch (err) {
      console.error('Error fetching certificates:', err);
      setError(err.response?.data?.message || 'Failed to load certificates. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (e) => {
    setFilterStatus(e.target.value);
  };

  const applyFilters = () => {
    fetchCertificates();
  };

  // Handle certificate actions
  const handleViewCertificate = (cert) => {
    // Show details modal instead of navigating to PDF viewer
    setSelectedCertificate(cert);
    setShowDetailsModal(true);
  };

  const handleDownloadCertificate = (cert) => {
    if (!cert || !cert.certificateId) {
      setError('Invalid certificate data');
      return;
    }

    // Show loading indicator
    setLoading(true);

    // First try the direct IPFS link as it's most reliable
    if (cert.ipfsHash) {
      const ipfsUrl = getIpfsUrl(cert);
      console.log(`Downloading certificate using IPFS: ${ipfsUrl}`);

      // Open in new window to trigger download
      window.open(ipfsUrl, '_blank');
      setLoading(false);
      return;
    }

    // Fallback to API endpoint if no IPFS hash available
    try {
      const downloadUrl = `/api/certificates/${cert.certificateId}/view-pdf?download=true&timestamp=${Date.now()}`;
      console.log(`Downloading certificate using API: ${downloadUrl}`);

      // Open in new window to trigger download
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Download error:', error);
      setError('Failed to download certificate');
    } finally {
      // Reset loading state
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    }
  };

  const handleVerifyCertificate = (cert) => {
    // Create a verification URL with the port 5173
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    const verifyUrl = `${protocol}//${host}:5173/verify?code=${cert.verificationCode || cert.shortCode}&auto=true`;

    // Open verification page in a new tab
    window.open(verifyUrl, '_blank');
  };

  // Function to get IPFS direct link
  const getIpfsUrl = (cert) => {
    if (!cert || !cert.ipfsHash) return '';
    return `https://gateway.pinata.cloud/ipfs/${cert.ipfsHash}`;
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedCertificate(null);
  };

  // Apply search filter on frontend for immediate feedback
  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch =
      (cert.courseName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (cert.candidateName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (cert.orgName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (cert.certificateId?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (cert.shortCode?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (cert.verificationCode?.toLowerCase().includes(searchTerm.toLowerCase()) || false);

    // We don't filter by status here since that's handled by the API
    return matchesSearch;
  });

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      CONFIRMED: {
        icon: <FiCheckCircle className="w-3.5 h-3.5 mr-1" />,
        label: 'Verified',
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        border: 'border-gray-300'
      },
      VERIFIED: {
        icon: <FiCheckCircle className="w-3.5 h-3.5 mr-1" />,
        label: 'Verified',
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        border: 'border-gray-300'
      },
      PENDING: {
        icon: <FiClock className="w-3.5 h-3.5 mr-1" />,
        label: 'Pending',
        bg: 'bg-yellow-50',
        text: 'text-amber-800',
        border: 'border-amber-200'
      },
      FAILED: {
        icon: <FiAlertCircle className="w-3.5 h-3.5 mr-1" />,
        label: 'Failed',
        bg: 'bg-red-50',
        text: 'text-red-800',
        border: 'border-red-200'
      }
    };

    const badge = badges[status] || badges.PENDING;

    return (
      <div className={`flex items-center px-2 py-1 rounded-sm text-xs font-medium ${badge.bg} ${badge.text} border ${badge.border}`}>
        {badge.icon}
        <span>{badge.label}</span>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-sm shadow-md">
          <FiAlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-center text-2xl font-semibold text-gray-900 mb-2">Not Logged In</h2>
          <p className="text-center text-gray-600">Please log in to view your certificates</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Error notification */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-200 text-red-800 px-4 py-2 rounded-sm shadow-md flex items-center z-50">
          <FiAlertCircle className="w-5 h-5 mr-2 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div className="mb-4 md:mb-0">
              <h1 className="text-2xl font-bold text-gray-900">
                {user.role === 'INSTITUTE' ? 'Issued Certificates' : 'Your Certificates'}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {user.role === 'INSTITUTE'
                  ? 'Manage and track all certificates issued by your institution'
                  : 'View and manage your personal certificates'}
              </p>
            </div>

            {user.role === 'INSTITUTE' && (
              <Link
                to="/generate"
                className="bg-gray-800 text-white rounded-sm px-4 py-2 text-sm flex items-center hover:bg-gray-700 transition-colors"
              >
                <FiPlus className="mr-2" />
                Create Certificate
              </Link>
            )}
          </div>

          {/* Certificate Summary */}
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden mb-6">
            <div className="bg-gray-800 px-4 py-3">
              <h3 className="text-sm font-bold text-white">Certificate Summary</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-sm border border-gray-200 p-3">
                  <div className="text-xs text-gray-500 mb-1">Total</div>
                  <div className="flex items-center">
                    <FiFileText className="w-4 h-4 mr-2 text-gray-500" />
                    <span className="text-lg font-medium text-gray-900">{certificates.length}</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-sm border border-gray-200 p-3">
                  <div className="text-xs text-gray-500 mb-1">Verified</div>
                  <div className="flex items-center">
                    <FiCheckCircle className="w-4 h-4 mr-2 text-gray-700" />
                    <span className="text-lg font-medium text-gray-900">
                      {certificates.filter(cert => cert.status === 'VERIFIED' || cert.status === 'CONFIRMED').length}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-sm border border-gray-200 p-3">
                  <div className="text-xs text-gray-500 mb-1">Pending</div>
                  <div className="flex items-center">
                    <FiClock className="w-4 h-4 mr-2 text-amber-600" />
                    <span className="text-lg font-medium text-gray-900">
                      {certificates.filter(cert => cert.status === 'PENDING').length}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-sm border border-gray-200 p-3">
                  <div className="text-xs text-gray-500 mb-1">Failed</div>
                  <div className="flex items-center">
                    <FiAlertCircle className="w-4 h-4 mr-2 text-red-600" />
                    <span className="text-lg font-medium text-gray-900">
                      {certificates.filter(cert => cert.status === 'FAILED').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Verification Status Explanation */}
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-sm p-3">
                <h4 className="text-sm font-medium text-blue-800 mb-1 flex items-center">
                  <FiInfo className="w-4 h-4 mr-1" /> Understanding Certificate Verification
                </h4>
                <p className="text-xs text-blue-700 mb-2">
                  After a certificate is issued, it goes through a blockchain verification process:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <div className="flex items-start">
                    <div className="bg-amber-100 rounded-full p-1 mr-2 mt-0.5">
                      <FiClock className="w-3 h-3 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">Pending</p>
                      <p className="text-gray-600">Certificate is issued but waiting for blockchain confirmation (typically 1-5 minutes)</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="bg-gray-100 rounded-full p-1 mr-2 mt-0.5">
                      <FiCheckCircle className="w-3 h-3 text-gray-700" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">Verified</p>
                      <p className="text-gray-600">Successfully stored on blockchain with confirmed transaction and IPFS storage</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="bg-red-100 rounded-full p-1 mr-2 mt-0.5">
                      <FiAlertCircle className="w-3 h-3 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">Failed</p>
                      <p className="text-gray-600">Blockchain transaction failed; certificate metadata is stored locally but not verified</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Controls */}
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="col-span-1 md:col-span-2">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, course, or ID..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                    value={searchTerm}
                    onChange={handleSearch}
                  />
                </div>
              </div>

              {/* Filter */}
              <div className="flex items-center space-x-2">
                <div className="relative grow">
                  <FiFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <select
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none appearance-none"
                    value={filterStatus}
                    onChange={handleFilterChange}
                  >
                    <option value="all">All Statuses</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>

                {/* Apply filters button */}
                <button
                  onClick={applyFilters}
                  className="px-4 py-2 bg-gray-800 text-white rounded-sm transition-colors hover:bg-gray-700"
                  title="Apply filters"
                >
                  Apply
                </button>

                {/* Refresh button */}
                <button
                  onClick={() => fetchCertificates()}
                  className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-sm transition-colors"
                  title="Refresh certificates"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                {/* View toggle */}
                <div className="flex border border-gray-300 rounded-sm overflow-hidden">
                  <button
                    className={`p-2 ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700'}`}
                    onClick={() => setViewMode('grid')}
                  >
                    <FiGrid className="w-5 h-5" />
                  </button>
                  <button
                    className={`p-2 ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700'}`}
                    onClick={() => setViewMode('list')}
                  >
                    <FiList className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-8 flex justify-center">
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-600 mb-4"></div>
                <p className="text-gray-600">Loading certificates...</p>
              </div>
            </div>
          ) : filteredCertificates.length > 0 ? (
            <>
              {/* Grid View */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  {filteredCertificates.map(cert => (
                    <div key={cert.certificateId || cert._id} className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-4 border-b border-gray-200">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-gray-900 truncate">{cert.courseName}</h3>
                          <div className="flex items-center gap-1">
                            {getStatusBadge(cert.status)}
                            {cert.revoked && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs border bg-amber-50 text-amber-800 border-amber-200">
                                Revoked
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center text-sm text-gray-500 mb-2">
                          <FiFileText className="w-4 h-4 mr-1 flex-shrink-0" />
                          <span className="truncate">ID: {cert.certificateId}</span>
                        </div>
                        {user.role === 'INSTITUTE' ? (
                          <div className="text-sm text-gray-900">
                            <span className="text-gray-500">Issued to:</span> {cert.candidateName}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-900">
                            <span className="text-gray-500">Issued by:</span> {cert.orgName}
                          </div>
                        )}
                      </div>
                      <div className="bg-gray-50 px-4 py-3 flex justify-between items-center text-xs">
                        <div className="text-gray-500">
                          Issued: {formatDate(cert.createdAt)}
                        </div>
                        <div className="flex items-center space-x-2">
                          <button className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors" title="View details" onClick={() => handleViewCertificate(cert)}>
                            <FiEye className="w-4 h-4 text-gray-600" />
                          </button>
                          <button className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors" title="Download certificate" onClick={() => handleDownloadCertificate(cert)}>
                            <FiDownload className="w-4 h-4 text-gray-600" />
                          </button>
                          <a
                            href={getIpfsUrl(cert)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                            title="View on IPFS"
                          >
                            <FiExternalLink className="w-4 h-4 text-gray-600" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* List View */}
              {viewMode === 'list' && (
                <div className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden mb-8">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Certificate</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{user.role === 'INSTITUTE' ? 'Student' : 'Institution'}</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issued Date</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                        <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredCertificates.map(cert => (
                        <tr key={cert.certificateId || cert._id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm">
                            <div className="font-medium text-gray-900">{cert.courseName}</div>
                            <div className="text-gray-500 text-xs">{cert.certificateId}</div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900">
                            {user.role === 'INSTITUTE' ? cert.candidateName : (cert.orgName || cert.institutionName)}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900">
                            {formatDate(cert.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div className="flex items-center gap-1">
                              {getStatusBadge(cert.status)}
                              {cert.revoked && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs border bg-amber-50 text-amber-800 border-amber-200">
                                  Revoked
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm font-mono text-gray-900">
                            {cert.verificationCode || cert.shortCode}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex space-x-2 justify-end">
                              <button className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors" title="View details" onClick={() => handleViewCertificate(cert)}>
                                <FiEye className="w-4 h-4 text-gray-600" />
                              </button>
                              <button className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors" title="Download certificate" onClick={() => handleDownloadCertificate(cert)}>
                                <FiDownload className="w-4 h-4 text-gray-600" />
                              </button>
                              <a
                                href={getIpfsUrl(cert)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                                title="View on IPFS"
                              >
                                <FiExternalLink className="w-4 h-4 text-gray-600" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-8 text-center">
              <FiFileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-1">No Certificates Found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterStatus !== 'all'
                  ? 'No certificates match your search criteria. Try adjusting your filters.'
                  : user.role === 'INSTITUTE'
                    ? 'You haven\'t issued any certificates yet.'
                    : 'You don\'t have any certificates yet.'}
              </p>
              {user.role === 'INSTITUTE' && (
                <Link
                  to="/generate"
                  className="inline-flex items-center bg-gray-800 text-white rounded-sm px-4 py-2 text-sm hover:bg-gray-700 transition-colors"
                >
                  <FiPlus className="mr-2" />
                  Create Certificate
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Certificate Details Modal */}
      {showDetailsModal && selectedCertificate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm shadow-lg w-full max-w-2xl overflow-hidden">
            <div className="bg-gray-800 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Certificate Details</h2>
              <button
                onClick={closeDetailsModal}
                className="text-gray-300 hover:text-white transition-colors"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Certificate Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Course Name</label>
                      <p className="font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2.5 text-sm">{selectedCertificate.courseName}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Certificate ID</label>
                      <div className="bg-gray-50 border border-gray-200 rounded-sm p-2">
                        <code className="text-xs font-mono text-gray-700 break-all">
                          {selectedCertificate.certificateId}
                        </code>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Verification Code</label>
                      <div className="flex items-center">
                        <div className="bg-gray-800 text-white px-3 py-1.5 text-sm font-mono rounded-sm">
                          {selectedCertificate.verificationCode || selectedCertificate.shortCode}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedCertificate.verificationCode || selectedCertificate.shortCode);
                            // You would need to implement a toast notification here
                            alert('Verification code copied to clipboard');
                          }}
                          className="ml-2 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-sm text-gray-600"
                          title="Copy code"
                        >
                          <FiClipboard className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Issuance Details</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Recipient</label>
                      <p className="font-medium text-gray-900">{selectedCertificate.candidateName}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Issuing Organization</label>
                      <p className="font-medium text-gray-900">{selectedCertificate.orgName || selectedCertificate.institutionName}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Issue Date</label>
                      <p className="font-medium text-gray-900">{formatDate(selectedCertificate.createdAt)}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Status</label>
                      {getStatusBadge(selectedCertificate.status)}
                    </div>
                  </div>
                </div>
              </div>

              {selectedCertificate.transfer && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Credit Transfer</h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-sm p-3 space-y-1">
                    {selectedCertificate.transfer.transferredFrom && (
                      <p className="text-sm text-gray-800">
                        <FiInfo className="inline w-3.5 h-3.5 text-blue-700 mr-1 -mt-0.5" />
                        Recognizes credit transferred from{' '}
                        <span className="font-semibold">{selectedCertificate.transfer.transferredFrom.institutionName}</span>
                        {' '}for{' '}
                        <span className="font-semibold">{selectedCertificate.transfer.transferredFrom.courseName}</span>
                        {selectedCertificate.transfer.agreementId
                          ? ` under equivalency agreement #${selectedCertificate.transfer.agreementId}.`
                          : '.'}
                      </p>
                    )}
                    {selectedCertificate.transfer.transferredTo && (
                      <p className="text-sm text-gray-800">
                        <FiInfo className="inline w-3.5 h-3.5 text-blue-700 mr-1 -mt-0.5" />
                        Later superseded by a certificate at{' '}
                        <span className="font-semibold">{selectedCertificate.transfer.transferredTo.institutionName}</span>
                        {' '}for{' '}
                        <span className="font-semibold">{selectedCertificate.transfer.transferredTo.courseName}</span>.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedCertificate.blockchainTx && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Blockchain Verification</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-sm p-3">
                    <div className="mb-2">
                      <label className="block text-xs text-gray-500 mb-1">Transaction Hash</label>
                      <div className="bg-white border border-gray-200 rounded-sm py-1.5 px-2">
                        <code className="text-xs font-mono text-gray-700 break-all">
                          {selectedCertificate.blockchainTx}
                        </code>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">IPFS Hash</label>
                      <div className="bg-white border border-gray-200 rounded-sm py-1.5 px-2">
                        <code className="text-xs font-mono text-gray-700 break-all">
                          {selectedCertificate.ipfsHash}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => handleVerifyCertificate(selectedCertificate)}
                  className="bg-gray-100 text-gray-800 border border-gray-300 rounded-sm px-4 py-2 text-sm hover:bg-gray-200 transition-colors flex items-center"
                >
                  <FiCheckCircle className="mr-2" />
                  Verify
                </button>
                <a
                  href={getIpfsUrl(selectedCertificate)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-100 text-gray-800 border border-gray-300 rounded-sm px-4 py-2 text-sm hover:bg-gray-200 transition-colors flex items-center"
                >
                  <FiExternalLink className="mr-2" />
                  View on IPFS
                </a>
                <button
                  onClick={() => handleDownloadCertificate(selectedCertificate)}
                  className="bg-gray-800 text-white rounded-sm px-4 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center"
                >
                  <FiDownload className="mr-2" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificatesPage; 
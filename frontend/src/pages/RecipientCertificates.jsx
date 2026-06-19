import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  FiSearch, FiAward, FiDownload, FiExternalLink, FiAlertCircle,
  FiArrowRight, FiMail, FiFileText, FiEye, FiCheckCircle,
  FiGrid, FiList, FiX, FiCheck, FiClock, FiRefreshCw
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const RecipientCertificates = () => {
  const { user, getToken } = useAuth();

  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const email = user.email;

  useEffect(() => {
    if (email) {
      handleRefresh();
    }
  }, [email]);

  useEffect(() => {
    if (email) {
      const interval = setInterval(() => {
        handleRefresh();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.get(`${API_URL}/api/certificates/email/${encodeURIComponent(email)}`);

      if (response.data?.data?.certificates) {
        console.log(response.data)
        setCertificates(response.data.data.certificates);
      }
    } catch (err) {
      console.error('Error refreshing certificates:', err);
      setError(err.response?.data?.error?.message || 'Failed to refresh certificates. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const formatFullDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get a display-friendly status badge
  // Keep your original CertificatesPage code as is, just ensure status badges use:
  const getStatusBadge = (status) => {
    const badges = {
      CONFIRMED: {
        icon: <FiCheckCircle className="w-3.5 h-3.5 mr-1" />,
        label: 'Confirmed',
        bg: 'bg-green-100',
        text: 'text-green-800',
        border: 'border-green-300'
      },
      PENDING: {
        icon: <FiClock className="w-3.5 h-3.5 mr-1" />,
        label: 'Pending',
        bg: 'bg-yellow-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        innerWidth: "fit-content"
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

  const handleViewCertificate = (cert) => {
    try {
      if (!cert || !cert.certificateId) {
        console.error('Attempted to view certificate with invalid data', cert);
        alert('Cannot view this certificate. Invalid data.');
        return;
      }

      setSelectedCertificate(cert);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Error showing certificate details:', error);
      alert('An error occurred while displaying certificate details.');
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedCertificate(null);
  };

  // Add function to handle download failures
  const handleDownloadError = (e) => {
    alert('Could not download certificate. Please try again later.');
    e.preventDefault();
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Hero Section */}
      <div className="bg-gray-900 text-white py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-3">
              Find Your Certificates
            </h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              View all certificates issued to your email address
            </p>
          </div>
        </div>
      </div>



      {/* Main Content */}
      <div className="flex-1 w-full sm:w-[50%] mx-auto px-4 py-8
        min-w-[300px] 
        sm:min-w-[500px] sm:px-6
        md:min-w-[600px] 
        lg:min-w-[800px] lg:px-8
        xl:min-w-[1000px]">
        {/* Search Form */}

        {/* Certificates Results Section */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {certificates.length > 0
                ? `Certificates for ${email}`
                : 'No certificates found'}
            </h2>
            {certificates.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                Found {certificates.length} certificate{certificates.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {certificates.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Add Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 border border-gray-300 rounded-sm hover:bg-gray-100 transition-colors"
                title="Refresh certificates"
              >
                <FiRefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>

              {/* Existing View Toggle */}
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
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-8 flex justify-center">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-600 mb-4"></div>
              <p className="text-gray-600">Loading certificates...</p>
            </div>
          </div>
        ) : certificates.length === 0 ? (
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-8 text-center">
            <FiAward className="mx-auto text-gray-400 mb-3" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No certificates found</h3>
            <p className="text-gray-700 mb-1">We couldn't find any certificates associated with this email address.</p>
            <p className="text-gray-500 text-sm mt-2 mb-6">
              If you believe you should have certificates, please contact the institution that issued them.
            </p>
          </div>
        ) : (
          <>
            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {certificates.map(cert => (
                  <div key={cert.certificateId} className="bg-white rounded-sm shadow-sm border border-gray-300 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-gray-900 truncate">{cert.courseName}</h3>
                        {getStatusBadge(cert.status)}
                      </div>
                      <div className="flex items-center text-sm text-gray-500 mb-2">
                        <FiFileText className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">ID: {cert.certificateId ? cert.certificateId.substring(0, 12) + '...' : 'N/A'}</span>
                      </div>
                      <div className="text-sm text-gray-900">
                        <span className="text-gray-500">Issued by:</span> {cert.institutionName || 'Unknown Institution'}
                      </div>
                    </div>
                    <div className="bg-gray-50 px-4 py-3 flex justify-between items-center text-xs">
                      <div className="text-gray-500">
                        Issued: {formatDate(cert.issuedDate)}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                          title="View details"
                          onClick={() => handleViewCertificate(cert)}
                        >
                          <FiEye className="w-4 h-4 text-gray-600" />
                        </button>
                        <a
                          href={cert._links?.pdf || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                          title="Download certificate"
                          onClick={(e) => !cert._links?.pdf && handleDownloadError(e)}
                        >
                          <FiDownload className="w-4 h-4 text-gray-600" />
                        </a>
                        <a
                          href={cert.verificationCode ?
                            `http://localhost:5173/verify?code=${cert.verificationCode}&auto=true` :
                            '/verify'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                          title="Verify certificate"
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
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Institution</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Issued Date</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {certificates.map(cert => (
                      <tr key={cert.certificateId} className="hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">
                          <div className="font-medium text-gray-900">{cert.courseName}</div>
                          <div className="text-gray-500 text-xs">{cert.certificateId ? cert.certificateId.substring(0, 12) + '...' : 'N/A'}</div>
                          <div className="text-gray-500 text-xs sm:hidden">
                            {formatDate(cert.issuedDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 hidden md:table-cell">
                          {cert.institutionName || 'Unknown Institution'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 hidden sm:table-cell">
                          {formatDate(cert.issuedDate)}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {getStatusBadge(cert.status)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex space-x-2 justify-end">
                            <button
                              className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                              title="View details"
                              onClick={() => handleViewCertificate(cert)}
                            >
                              <FiEye className="w-4 h-4 text-gray-600" />
                            </button>
                            <a
                              href={cert.verificationCode ?
                                `http://localhost:5173/verify?code=${cert.verificationCode}&auto=true` :
                                '/verify'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                              title="Verify certificate"
                            >
                              <FiCheck className="w-4 h-4 text-gray-600" />
                            </a>
                            <a
                              href={cert._links?.pdf || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-sm hover:bg-gray-200 transition-colors"
                              title="Download certificate"
                              onClick={(e) => !cert._links?.pdf && handleDownloadError(e)}
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
        )}
    

        {/* CTA Section  */}

        <div className="bg-gray-900 text-white p-6 rounded-sm text-center mt-8">
          <h3 className="text-xl font-bold mb-2">Need to verify a specific certificate?</h3>
          <p className="text-gray-300 mb-4 max-w-xl mx-auto">
            Use our verification tool to quickly check the authenticity of any certificate using its verification code.
          </p>
          <a
            href="/verify"
            className="inline-flex items-center px-6 py-3 bg-white text-gray-900 font-medium rounded-sm hover:bg-gray-100 transition-colors"
          >
            Go to Verification Page <FiArrowRight className="ml-2" />
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 text-white py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">© 2025 VerifyHub</p>
        </div>
      </div>

      {/* Certificate Details Modal */}
      {showDetailsModal && (
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

            {!selectedCertificate ? (
              <div className="p-6 flex justify-center items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-600"></div>
              </div>
            ) : (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Certificate Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Course Name</label>
                        <p className="font-medium text-gray-900">{selectedCertificate.courseName}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Certificate ID</label>
                        <div className="bg-gray-50 border border-gray-200 rounded-sm py-1.5 px-2">
                          <code className="text-xs font-mono text-gray-700 break-all">
                            {selectedCertificate.certificateId || 'N/A'}
                          </code>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Verification Code</label>
                        <div className="flex items-center">
                          <div className="rounded-sm bg-gray-800 text-white px-3 py-1 text-sm font-mono">
                            {selectedCertificate.verificationCode}
                          </div>
                        </div>
                      </div>
                      {selectedCertificate.validUntil && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Valid Until</label>
                          <p className="font-medium text-gray-900">{formatFullDate(selectedCertificate.validUntil)}</p>
                        </div>
                      )}
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
                        <p className="font-medium text-gray-900">{selectedCertificate.institutionName}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Issue Date</label>
                        <p className="font-medium text-gray-900">{formatFullDate(selectedCertificate.issuedDate)}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Status</label>
                        {getStatusBadge(selectedCertificate.status)}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedCertificate.ipfsHash && (
                  <div className="mb-6">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Blockchain Verification</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-sm p-3">
                      <div className="mb-2">
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
                  <a
                    href={selectedCertificate._links?.pdf || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-800 text-white text-sm rounded-sm hover:bg-gray-700 transition-colors"
                    onClick={(e) => !selectedCertificate._links?.pdf && handleDownloadError(e)}
                  >
                    <FiDownload className="inline mr-2" />
                    Download Certificate
                  </a>
                  <a
                    href={selectedCertificate.verificationCode ?
                      `http://localhost:5173/verify?code=${selectedCertificate.verificationCode}&auto=true` :
                      '/verify'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 border border-gray-300 text-gray-800 text-sm rounded-sm hover:bg-gray-50 transition-colors"
                  >
                    <FiExternalLink className="inline mr-2" />
                    Verify Authenticity
                  </a>
                  <button
                    onClick={closeDetailsModal}
                    className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipientCertificates; 
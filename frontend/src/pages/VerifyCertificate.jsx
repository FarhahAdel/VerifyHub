import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { FiUpload, FiCheck, FiX, FiSearch, FiFileText, FiExternalLink, FiHash, FiInfo, FiCopy, FiCheckCircle, FiAlertCircle, FiCalendar, FiDownload, FiLock, FiRotateCcw } from 'react-icons/fi';

// API base URL - we still connect to backend API on port 3000
const API_BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/certificates`;

// Helper function to format dates nicely
const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  }).format(date);
};

// Generate a verification URL for sharing
const getVerificationUrl = (code) => {
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${host}:5173/verify?code=${code}&auto=true`;
};

const VerifyCertificate = () => {
  const [verificationMethod, setVerificationMethod] = useState('code');
  const [certificateCode, setCertificateCode] = useState('');
  const [certificateId, setCertificateId] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const fileInputRef = useRef(null);
  const copyNotificationRef = useRef(null);
  const resultRef = useRef(null);

  // Handle URL query parameters on component mount
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const codeParam = queryParams.get('code');
    const autoVerify = queryParams.get('auto') === 'true';

    if (codeParam) {
      setCertificateCode(codeParam);
      setVerificationMethod('code');

      // Auto-verify if the auto parameter is true
      if (autoVerify) {
        console.log('Auto-verifying certificate with code:', codeParam);
        verifyByCode(codeParam);
      }
    }
  }, []);

  // Function to verify by code without requiring a form submit event
  const verifyByCode = async (code) => {
    if (!code || code.trim().length === 0) return;

    setLoading(true);
    setError('');
    setVerificationResult(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/code/${code.trim()}`);

      if (response.data.success === false) {
        throw new Error(response.data.message || 'Verification failed');
      }

      // Process response and show result
      const normalizedData = normalizeResponseData(response.data);
      // Ensure we set the status to 'verified' if the request was successful
      normalizedData.status = 'verified';
      setVerificationResult(normalizedData);

      // Generate share URL if we have a verification code
      if (normalizedData.certificate?.shortCode) {
        setShareUrl(getVerificationUrl(normalizedData.certificate.shortCode));
      }

      // Scroll to result
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Verification error:', err);

      // Extract the most useful error message
      let errorMessage = err.message || 'Verification failed';
      if (err.response?.status === 404) {
        errorMessage = 'Certificate not found. Please check your information and try again.';
      } else if (err.response?.status === 400) {
        errorMessage = 'Invalid input or PDF file. Please check and try again.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;

    if (copyNotificationRef.current) {
      copyNotificationRef.current.style.opacity = '1';
      copyNotificationRef.current.style.transform = 'translateY(0)';
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopiedField(fieldName);
          setTimeout(() => {
            setCopiedField('');
            if (copyNotificationRef.current) {
              copyNotificationRef.current.style.opacity = '0';
              copyNotificationRef.current.style.transform = 'translateY(10px)';
            }
          }, 2000);
        })
        .catch(err => {
          console.error("Clipboard error:", err);
        });
    } else {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        setCopiedField(fieldName);
        setTimeout(() => {
          setCopiedField('');
          if (copyNotificationRef.current) {
            copyNotificationRef.current.style.opacity = '0';
            copyNotificationRef.current.style.transform = 'translateY(10px)';
          }
        }, 2000);
      } catch (err) {
        console.error("Clipboard error:", err);
      }
    }
  };

  // Simplified and more concise response data normalization
  const normalizeResponseData = (data) => {
    console.log('API response data:', data);

    // Create basic structure with defaults
    const normalized = {
      status: data.status || 'verified',
      verificationId: data.verificationId,
      certificate: {
        uid: '',
        candidateName: '',
        courseName: '',
        orgName: '',
        certificateId: '',
        ipfsHash: '',
        sha256Hash: '',
        timestamp: '',
        issuedAt: '',
        revoked: false,
        transfer: null,
        shortCode: data.certificate?.verificationCode || data.verificationId?.substring(0, 6) || data.certificate?.shortCode
      },
      transaction: { hash: '' },
      links: { pdf: '', blockchain: '' }
    };

    // Extract certificate data
    if (data.certificate) {
      const cert = data.certificate;
      Object.assign(normalized.certificate, {
        uid: cert.uid || cert.referenceId || '',
        candidateName: cert.candidateName || '',
        courseName: cert.courseName || '',
        orgName: cert.orgName || cert.institutionName || '',
        certificateId: cert.certificateId || cert.id || '',
        ipfsHash: cert.ipfsHash || data.cidHash || '',
        timestamp: cert.timestamp || '',
        issuedAt: cert.issuedAt || '',
        revoked: cert.revoked || data.status === 'REVOKED' || false,
        transfer: cert.transfer || null
      });

      // Extract blockchain data if available
      if (cert.blockchainData) {
        const blockData = cert.blockchainData;
        Object.keys(blockData).forEach(key => {
          if (blockData[key] && Object.prototype.hasOwnProperty.call(normalized.certificate, key)) {
            normalized.certificate[key] = blockData[key];
          }
        });
      }
    }

    // Handle PDF verification response
    if (data.computedHash) {
      normalized.certificate.sha256Hash = data.computedHash;
      normalized.certificate.ipfsHash = normalized.certificate.ipfsHash || data.cidHash || '';
    }

    // Extract transaction hash from blockchain link
    if (data._links?.blockchain) {
      normalized.transaction.hash = data._links.blockchain.split('/').pop();
    }

    // Set links
    normalized.links = {
      pdf: data._links?.pdf || '',
      blockchain: data._links?.blockchain || '',
      verification: data._links?.verification || ''
    };

    return normalized;
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setVerificationResult(null);

    try {
      let response;

      if (verificationMethod === 'code') {
        if (!certificateCode.trim()) throw new Error('Please enter a verification code');
        // Use the common verifyByCode function for code verification
        return verifyByCode(certificateCode);
      } else if (verificationMethod === 'id') {
        if (!certificateId.trim()) throw new Error('Please enter a certificate ID');
        response = await axios.get(`${API_BASE_URL}/${certificateId.trim()}/verify`);
      } else if (verificationMethod === 'file') {
        if (!file) throw new Error('Please select a PDF certificate to verify');
        const formData = new FormData();
        formData.append('certificate', file);
        response = await axios.post(`${API_BASE_URL}/verify/pdf`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      if (response.data.success === false) {
        throw new Error(response.data.message || 'Verification failed');
      }

      // Process response and show result
      const normalizedData = normalizeResponseData(response.data);
      // Ensure we set the status to 'verified' if the request was successful
      normalizedData.status = 'verified';
      setVerificationResult(normalizedData);

      // Generate share URL if we have a verification code
      if (normalizedData.certificate?.shortCode) {
        setShareUrl(getVerificationUrl(normalizedData.certificate.shortCode));
      }

      // Scroll to result
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Verification error:', err);

      // Extract the most useful error message
      let errorMessage = err.message || 'Verification failed';
      if (err.response?.status === 404) {
        errorMessage = 'Certificate not found. Please check your information and try again.';
      } else if (err.response?.status === 400) {
        errorMessage = 'Invalid input or PDF file. Please check and try again.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Copy notification toast */}
      <div
        ref={copyNotificationRef}
        className="fixed top-4 right-4 bg-gray-800 border border-gray-700 text-gray-200 px-4 py-2 rounded-sm shadow-md flex items-center transition-all duration-300 opacity-0 transform translate-y-10 z-50"
      >
        <FiCheckCircle className="w-5 h-5 mr-2 text-gray-300" />
        <span>Copied to clipboard</span>
      </div>

      {error && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-200 text-red-800 px-4 py-2 rounded-sm shadow-md flex items-center z-50">
          <FiAlertCircle className="w-5 h-5 mr-2 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 py-6 px-4 bg-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Verify Certificate</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm flex items-start">
                <FiX className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Verification Methods Tabs */}
            {!verificationResult && (
              <div className="bg-gray-50 rounded-sm p-4 mb-6 border border-gray-200">
                <div className="flex flex-wrap gap-3">
                  <button
                    className={`px-4 py-2 rounded-sm text-sm font-medium flex items-center ${verificationMethod === 'code'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100'
                      }`}
                    onClick={() => {
                      setVerificationMethod('code');
                      setError('');
                    }}
                  >
                    <FiFileText className="mr-2" />
                    Verify by Code
                  </button>
                  <button
                    className={`px-4 py-2 rounded-sm text-sm font-medium flex items-center ${verificationMethod === 'id'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100'
                      }`}
                    onClick={() => {
                      setVerificationMethod('id');
                      setError('');
                    }}
                  >
                    <FiHash className="mr-2" />
                    Verify by Certificate ID
                  </button>
                  <button
                    className={`px-4 py-2 rounded-sm text-sm font-medium flex items-center ${verificationMethod === 'file'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100'
                      }`}
                    onClick={() => {
                      setVerificationMethod('file');
                      setError('');
                    }}
                  >
                    <FiUpload className="mr-2" />
                    Verify PDF Certificate
                  </button>
                </div>
              </div>
            )}

            {/* Verification Forms */}
            {!verificationResult && (
              <div>
                {verificationMethod === 'code' && (
                  <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Certificate Verification Code
                      </label>
                      <div className="flex">
                        <input
                          type="text"
                          name='certificateCode'
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck="false"
                          autoCapitalize="characters"
                          maxLength={4}
                          required
                          value={certificateCode}
                          onChange={(e) => setCertificateCode(e.target.value.toUpperCase())}
                          placeholder="Enter the verification code (e.g., ABCD)"
                          autoFocus
                          className="flex-1 p-2.5 border border-gray-300 rounded-sm rounded-r-none focus:ring-2 focus:ring-gray-400 focus:outline-none font-mono text-center uppercase"
                        />
                        <button
                          type="submit"
                          disabled={loading || !certificateCode}
                          className="bg-gray-800 text-white px-6 py-2.5 rounded-sm rounded-l-none
                            hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                        >
                          {loading ? (
                            <span className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Verifying
                            </span>
                          ) : (
                            <span className="flex items-center">
                              <FiSearch className="mr-2" />
                              Verify
                            </span>
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Enter the verification code shown on the certificate to verify its authenticity.
                      </p>
                    </div>
                  </form>
                )}

                {verificationMethod === 'id' && (
                  <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Certificate ID
                      </label>
                      <div className="flex">
                        <input
                          type="text"
                          value={certificateId}
                          onChange={(e) => setCertificateId(e.target.value)}
                          placeholder="Enter the full certificate ID"
                          className="flex-1 p-2.5 border border-gray-300 rounded-sm rounded-r-none focus:ring-2 focus:ring-gray-400 focus:outline-none font-mono text-sm"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={loading || !certificateId}
                          className="bg-gray-800 text-white px-6 py-2.5 rounded-sm rounded-l-none
                            hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                        >
                          {loading ? (
                            <span className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Verifying
                            </span>
                          ) : (
                            <span className="flex items-center">
                              <FiSearch className="mr-2" />
                              Verify
                            </span>
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Enter the full certificate ID hash for complete verification.
                      </p>
                    </div>
                  </form>
                )}

                {verificationMethod === 'file' && (
                  <form onSubmit={handleVerify} className="space-y-4">
                    <div className="border-dashed border-2 border-gray-300 rounded-sm p-6 text-center">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="hidden"
                        accept="application/pdf"
                        ref={fileInputRef}
                        id="pdfUpload"
                      />
                      <label htmlFor="pdfUpload" className="cursor-pointer block mb-2">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FiUpload className="w-8 h-8 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {file ? file.name : 'Click to select a PDF certificate'}
                          </span>
                          <span className="text-xs text-gray-500">
                            or drag and drop a file here
                          </span>
                        </div>
                      </label>
                      {file && (
                        <div className="mt-4 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="text-xs text-red-600 hover:text-red-700 transition-colors inline-flex items-center px-2 py-1 rounded-sm bg-white shadow-sm border border-red-200 hover:bg-red-50"
                          >
                            <FiX className="w-3.5 h-3.5 mr-1" />
                            Remove File
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !file}
                      className="w-full bg-gray-800 text-white px-6 py-2.5 rounded-sm
                        hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed 
                        transition-colors flex items-center justify-center"
                    >
                      {loading ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Verifying
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <FiSearch className="mr-2" />
                          Verify PDF Certificate
                        </span>
                      )}
                    </button>

                    <p className="text-center text-sm text-gray-500">
                      Upload a PDF certificate to verify its authenticity. The system will extract and verify the embedded certificate information.
                    </p>
                  </form>
                )}
              </div>
            )}

            {verificationResult && (
              <div className="space-y-6" ref={resultRef}>
                {/* Verification Success Banner */}
                <div className="mb-6 bg-gray-100 border border-gray-300 rounded-sm p-5 text-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <svg className="w-full h-full" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                      <path d="M30,30 L70,30 L70,70 L30,70 Z" fill="currentColor" className="text-gray-800" />
                      <path d="M35,35 L65,35 L65,65 L35,65 Z" fill="currentColor" className="text-gray-700" />
                    </svg>
                  </div>
                  {verificationResult.certificate?.revoked ? (
                    <>
                      <div className="inline-flex items-center justify-center bg-amber-100 border border-amber-300 rounded-sm w-16 h-16 mb-3 shadow-inner relative z-10">
                        <FiRotateCcw className="w-8 h-8 text-amber-700" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1 relative z-10">
                        Certificate Revoked
                      </h3>
                      <p className="text-gray-700 relative z-10">
                        This certificate is no longer active
                        {verificationResult.certificate?.transfer?.transferredTo
                          ? ' — credit was transferred to a new institute (see below).'
                          : '.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex items-center justify-center bg-gray-200 border border-gray-300 rounded-sm w-16 h-16 mb-3 shadow-inner relative z-10">
                        <FiCheck className="w-8 h-8 text-gray-700" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1 relative z-10">
                        Certificate Verified Successfully
                      </h3>
                      <p className="text-gray-700 relative z-10">
                        This certificate has been validated on the blockchain and is authentic.
                      </p>
                    </>
                  )}
                </div>

                {/* Certificate Content in 2 columns */}
                <div className="bg-white border border-gray-300 rounded-sm shadow-sm overflow-hidden mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                    {/* Left Column - Certificate Details */}
                    <div className="p-5">
                      <div className="flex items-center border-b border-gray-200 pb-3 mb-4">
                        <div className="bg-gray-100 p-2 rounded-sm mr-3">
                          <FiInfo className="w-5 h-5 text-gray-600" />
                        </div>
                        <h4 className="text-lg font-bold text-gray-900">Certificate Details</h4>
                      </div>

                      {/* Certificate fields */}
                      <div className="space-y-4">
                        {/* Share certificate verification link */}
                        {shareUrl && (
                          <div className="bg-blue-50 border border-blue-200 rounded-sm p-3 mb-4">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-blue-700 uppercase">Share Verification Link</span>
                              <span className="text-xs text-blue-600">Click to copy</span>
                            </div>
                            <button
                              className="w-full text-left bg-white border border-blue-200 rounded-sm p-2 relative hover:bg-blue-50 transition-colors"
                              onClick={() => copyToClipboard(shareUrl, 'shareUrl')}
                            >
                              <code className="text-xs text-gray-800 break-all font-mono pr-6">{shareUrl}</code>
                              <span className="absolute right-2 top-1.5">
                                {copiedField === 'shareUrl' ?
                                  <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> :
                                  <FiCopy className="w-3.5 h-3.5 text-blue-600" />
                                }
                              </span>
                            </button>
                            <p className="text-xs text-blue-700 mt-1">
                              This link verifies the certificate automatically when opened.
                            </p>
                          </div>
                        )}

                        <div className="bg-gray-50 p-4 border border-gray-200 rounded-sm">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {verificationResult.certificate?.uid && (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Unique ID
                                </label>
                                <p className="font-semibold text-gray-900">
                                  {verificationResult.certificate.uid}
                                </p>
                              </div>
                            )}

                            {verificationResult.certificate?.candidateName && (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Candidate Name
                                </label>
                                <p className="font-semibold text-gray-900">
                                  {verificationResult.certificate.candidateName}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            {verificationResult.certificate?.courseName && (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Course Name
                                </label>
                                <p className="font-semibold text-gray-900">
                                  {verificationResult.certificate.courseName}
                                </p>
                              </div>
                            )}

                            {verificationResult.certificate?.orgName && (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Organization
                                </label>
                                <p className="font-semibold text-gray-900">
                                  {verificationResult.certificate.orgName}
                                </p>
                              </div>
                            )}
                          </div>

                          {verificationResult.certificate?.transfer && (
                            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-sm p-3">
                              <div className="flex items-center mb-2">
                                <FiRotateCcw className="w-4 h-4 text-blue-700 mr-2" />
                                <span className="text-xs font-medium text-blue-700 uppercase">
                                  Credit Transfer
                                </span>
                              </div>
                              {verificationResult.certificate.transfer.transferredFrom && (
                                <p className="text-sm text-gray-800 mb-1">
                                  This certificate recognizes credit transferred from{' '}
                                  <span className="font-semibold">
                                    {verificationResult.certificate.transfer.transferredFrom.institutionName}
                                  </span>
                                  {' '}for{' '}
                                  <span className="font-semibold">
                                    {verificationResult.certificate.transfer.transferredFrom.courseName}
                                  </span>
                                  {verificationResult.certificate.transfer.agreementId
                                    ? ` under equivalency agreement #${verificationResult.certificate.transfer.agreementId}.`
                                    : '.'}
                                </p>
                              )}
                              {verificationResult.certificate.transfer.transferredTo && (
                                <p className="text-sm text-gray-800">
                                  This certificate was later superseded by a certificate at{' '}
                                  <span className="font-semibold">
                                    {verificationResult.certificate.transfer.transferredTo.institutionName}
                                  </span>
                                  {' '}for{' '}
                                  <span className="font-semibold">
                                    {verificationResult.certificate.transfer.transferredTo.courseName}
                                  </span>.
                                  {' '}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCertificateId(verificationResult.certificate.transfer.transferredTo.certificateId);
                                      setVerificationMethod('id');
                                    }}
                                    className="text-blue-700 underline hover:text-blue-900"
                                  >
                                    View it
                                  </button>
                                </p>
                              )}
                            </div>
                          )}

                          {/* Timestamp/Issue Date */}
                          {(verificationResult.certificate?.timestamp || verificationResult.certificate?.issuedAt) && (
                            <div className="mt-4">
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Issue Date
                              </label>
                              <p className="font-semibold text-gray-900">
                                {verificationResult.certificate.issuedAt
                                  ? formatDateTime(verificationResult.certificate.issuedAt)
                                  : formatDateTime(verificationResult.certificate.timestamp)
                                }
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Certificate ID with special styling */}
                        {verificationResult.certificate?.certificateId && (
                          <div className="bg-gray-100 border border-gray-200 rounded-sm p-2.5">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-gray-700 uppercase">Certificate ID</span>
                              <span className="text-xs text-gray-500">Click to copy</span>
                            </div>
                            <button
                              className="w-full text-left bg-white border border-gray-200 rounded-sm p-2 relative hover:bg-gray-50 transition-colors"
                              onClick={() => copyToClipboard(verificationResult.certificate.certificateId, 'certificateId')}
                            >
                              <code className="text-xs text-gray-800 break-all font-mono pr-6">{verificationResult.certificate.certificateId}</code>
                              <span className="absolute right-2 top-1.5">
                                {copiedField === 'certificateId' ?
                                  <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> :
                                  <FiCopy className="w-3.5 h-3.5 text-gray-700" />
                                }
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column - Blockchain Data */}
                    <div className="p-5">
                      <div className="flex items-center border-b border-gray-200 pb-3 mb-4">
                        <div className="bg-gray-100 p-2 rounded-sm mr-3">
                          <FiHash className="w-5 h-5 text-gray-600" />
                        </div>
                        <h4 className="text-lg font-bold text-gray-900">Blockchain Verification</h4>
                      </div>

                      <div className="space-y-3">
                        {/* Transaction hash */}
                        {verificationResult.transaction?.hash && (
                          <div>
                            <div className="space-y-0.5">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-medium text-gray-500 uppercase">Blockchain Transaction</span>
                                <span className="text-xs text-gray-400">Click to copy</span>
                              </div>
                              <button
                                className="w-full text-left bg-gray-50 border border-gray-200 rounded-sm p-2 overflow-x-auto relative hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm"
                                onClick={() => copyToClipboard(verificationResult.transaction.hash, 'txHash')}
                                aria-label="Copy Blockchain Transaction"
                              >
                                <code className="text-sm text-gray-800 break-all font-mono pr-8">
                                  {verificationResult.transaction.hash}
                                </code>
                                <span className="absolute right-2 top-2">
                                  {copiedField === 'txHash' ?
                                    <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> :
                                    <FiCopy className="w-3.5 h-3.5 text-gray-600" />
                                  }
                                </span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* IPFS Hash */}
                        {verificationResult.certificate?.ipfsHash && (
                          <div className="space-y-0.5 mt-4">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-medium text-gray-500 uppercase">IPFS Hash</span>
                              <span className="text-xs text-gray-400">Click to copy</span>
                            </div>
                            <button
                              className="w-full text-left bg-gray-50 border border-gray-200 rounded-sm p-2 overflow-x-auto relative hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm"
                              onClick={() => copyToClipboard(verificationResult.certificate.ipfsHash, 'ipfsHash')}
                              aria-label="Copy IPFS hash"
                            >
                              <code className="text-sm text-gray-800 break-all font-mono pr-8">{verificationResult.certificate.ipfsHash}</code>
                              <span className="absolute right-2 top-2">
                                {copiedField === 'ipfsHash' ?
                                  <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> :
                                  <FiCopy className="w-3.5 h-3.5 text-gray-600" />
                                }
                              </span>
                            </button>
                          </div>
                        )}

                        {/* SHA256 Hash */}
                        {verificationResult.certificate?.sha256Hash && (
                          <div className="space-y-0.5 mt-4">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-medium text-gray-500 uppercase">SHA-256 Hash</span>
                              <span className="text-xs text-gray-400">Click to copy</span>
                            </div>
                            <button
                              className="w-full text-left bg-gray-50 border border-gray-200 rounded-sm p-2 overflow-x-auto relative hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm"
                              onClick={() => copyToClipboard(verificationResult.certificate.sha256Hash, 'sha256Hash')}
                              aria-label="Copy SHA-256 hash"
                            >
                              <code className="text-sm text-gray-800 break-all font-mono pr-8">{verificationResult.certificate.sha256Hash}</code>
                              <span className="absolute right-2 top-2">
                                {copiedField === 'sha256Hash' ?
                                  <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> :
                                  <FiCopy className="w-3.5 h-3.5 text-gray-600" />
                                }
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* External links and actions */}
                <div className="flex flex-wrap gap-3 mb-6">
                  {verificationResult.transaction?.hash && (
                    <a
                      href={`https://etherscan.io/tx/${verificationResult.transaction.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center px-4 py-2.5 bg-gray-800 text-white rounded-sm hover:bg-gray-700 transition-colors border border-gray-700"
                    >
                      <FiExternalLink className="mr-2" />
                      View on Blockchain
                    </a>
                  )}

                  {verificationResult.certificate?.ipfsHash && (
                    <a
                      href={`https://ipfs.io/ipfs/${verificationResult.certificate.ipfsHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center px-4 py-2.5 bg-gray-700 text-white rounded-sm hover:bg-gray-600 transition-colors border border-gray-600"
                    >
                      <FiExternalLink className="mr-2" />
                      View on IPFS
                    </a>
                  )}

                  <button
                    onClick={() => {
                      setVerificationResult(null);
                      setError('');
                      setCertificateCode('');
                      setCertificateId('');
                      setFile(null);
                    }}
                    className="flex-1 flex items-center justify-center px-4 py-2.5 bg-gray-100 text-gray-800 rounded-sm hover:bg-gray-200 transition-colors border border-gray-300"
                  >
                    <FiSearch className="mr-2" />
                    Verify Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyCertificate;
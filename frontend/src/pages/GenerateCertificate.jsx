import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { io } from 'socket.io-client';
import { FiX, FiSave, FiCopy, FiCheckCircle, FiAlertCircle, FiPlus, FiMinus } from 'react-icons/fi';
import CertificateSuccessView from '../components/CertificateSuccessView';

const API_ENDPOINT = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/certificates/generate`;

const GenerateCertificate = () => {
  const { user, getToken } = useAuth();
  const [formData, setFormData] = useState({
    candidateName: '',
    courseName: '',
    referenceId: '',
    certificateType: 'ACHIEVEMENT',
    validUntil: '',
    recipientEmail: '',
    additionalMetadata: {
      instructor: '',
      totalHours: '',
      grade: ''
    }
  });

  const [additionalFields, setAdditionalFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [certificateData, setCertificateData] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [copyError, setCopyError] = useState('');
  const [includeDeveloperPage, setIncludeDeveloperPage] = useState(false);
  const [certificateStatus, setCertificateStatus] = useState('PENDING');
  const copyNotificationRef = useRef(null);
  const socketRef = useRef(null);
  const currentCertificateId = useRef(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');

  // Student lookup state
  const [studentEmail, setStudentEmail] = useState('');
  const [studentLookupStatus, setStudentLookupStatus] = useState('idle'); // idle | loading | found | not_found
  const [selectedStudent, setSelectedStudent] = useState(null); // { id, name, email, walletAddress }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('additionalMetadata.')) {
      const field = name.split('.')[1];
      setFormData({
        ...formData,
        additionalMetadata: {
          ...formData.additionalMetadata,
          [field]: value
        }
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleCourseChange = (e) => {
    const courseId = e.target.value;
    const found = courses.find(c => c._id === courseId);
    setSelectedCourse(found);
    console.log(found)
    setFormData(prev => ({
      ...prev,
      courseName: found ? found.name : '',
      referenceId: found? found._id: '',
    }));
  };

  const handleAdditionalFieldChange = (index, field, value) => {
    const updatedFields = [...additionalFields];
    if (field === 'key') {
      updatedFields[index].key = value;
    } else {
      updatedFields[index].value = value;
    }
    setAdditionalFields(updatedFields);
  };

  const addAdditionalField = () => {
    setAdditionalFields([...additionalFields, { key: '', value: '' }]);
  };

  const removeAdditionalField = (index) => {
    const updatedFields = [...additionalFields];
    updatedFields.splice(index, 1);
    setAdditionalFields(updatedFields);
  };

  // Load courses for the logged-in institute
  const instituteId = user?._id || user?.id;

  const fetchCourses = async () => {
    if (!instituteId) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const { data } = await axios.get(`${API_URL}/api/courses/${instituteId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setCourses(data.courses);
    } catch (err) {
      console.log("Failed loading")
      setCourses([]);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [user]);

  // Look up a student by email
  const lookupStudent = async (email) => {
    if (!email || !email.includes('@')) return;
    setStudentLookupStatus('loading');
    setSelectedStudent(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      // Lookup student
      const { data } = await axios.get(`${API_URL}/api/users/lookup-student`, {
        params: { email },
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!data.success || !data.data) {
        setStudentLookupStatus('not_found');
        return;
      }
      const student = data.data;
      console.log(student)
      setSelectedStudent(student);
      setStudentLookupStatus(student.isEnrolled ? 'found' : 'not_enrolled');
      console.log(studentLookupStatus);
      if (student.isEnrolled) {
        setFormData(prev => ({ ...prev, candidateName: student.name }));
      }
    } catch {
      setStudentLookupStatus('not_found');
    }
  };

  const handleStudentEmailChange = (e) => {
    const email = e.target.value;
    setStudentEmail(email);
    setStudentLookupStatus('idle');
    setSelectedStudent(null);
    setFormData(prev => ({ ...prev, candidateName: '' }));
  };

  // Setup WebSocket connection for real-time status updates
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    
    // Connect to Socket.IO server
    socketRef.current = io(API_URL, {
      transports: ['websocket', 'polling']
    });

    socketRef.current.on('connect', () => {
      console.log('✅ WebSocket connected');
    });

    socketRef.current.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });

    // Listen for certificate status updates
    socketRef.current.on('certificate:status', (data) => {
      console.log('📡 Status update received:', data);
      
      // Only update if it's for the current certificate
      if (data.certificateId === currentCertificateId.current) {
        setCertificateStatus(data.status);
        console.log(`✅ Certificate ${data.certificateId} status updated to ${data.status}`);
      }
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const copyToClipboard = (text, fieldName) => {
    setCopyError('');

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
          setCopyError(`Couldn't copy to clipboard: ${err.message}`);
          setTimeout(() => setCopyError(''), 3000);
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
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          setCopiedField(fieldName);
          setTimeout(() => {
            setCopiedField('');
            if (copyNotificationRef.current) {
              copyNotificationRef.current.style.opacity = '0';
              copyNotificationRef.current.style.transform = 'translateY(10px)';
            }
          }, 2000);
        } else {
          setCopyError("Couldn't copy to clipboard. Please try selecting the text manually.");
          setTimeout(() => setCopyError(''), 3000);
        }
      } catch (err) {
        setCopyError(`Couldn't copy to clipboard: ${err.message}`);
        setTimeout(() => setCopyError(''), 3000);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!selectedStudent || !selectedStudent.isEnrolled) {
      setError(selectedStudent
        ? 'This student is not enrolled in your institute. They must enroll first.'
        : 'Please look up and select a registered, enrolled student before generating a certificate.');
      setLoading(false);
      return;
    }

    try {
      const token = getToken();

      const payload = {
        ...formData,
        candidateName: selectedStudent?.name || formData.candidateName,
        recipientEmail: selectedStudent?.email || formData.recipientEmail,
        recipientWalletAddress: selectedStudent?.walletAddress || null,
        courseName: selectedCourse?.name || undefined,
        referenceId: selectedCourse?._id || undefined,
        additionalMetadata: {
          ...formData.additionalMetadata,
          ...additionalFields.reduce((acc, field) => {
            if (field.key && field.value) {
              acc[field.key] = field.value;
            }
            return acc;
          }, {})
        }
      };

      // If validUntil is empty, remove it from payload
      if (!payload.validUntil) {
        delete payload.validUntil;
      }

      // Add developer page query parameter if enabled
      const url = includeDeveloperPage
        ? `${API_ENDPOINT}?developer=true`
        : API_ENDPOINT;

      const response = await axios.post(
        url,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data && response.data.success) {
        setSuccess(true);
        const transformedData = {
          certificateId: response.data.data.certificateId,
          shortCode: response.data.data.verificationCode,
          _links: {
            verification: response.data.data.verificationUrl,
            pdf: response.data.data.ipfsGateway
          },
          transaction: response.data.data.transaction,
          sha256Hash: response.data.data.computedHashes?.sha256Hash,
          cidHash: response.data.data.computedHashes?.cidHash,
          ipfsHash: response.data.data.computedHashes?.ipfsHash
        };
        setCertificateData(transformedData);
        currentCertificateId.current = response.data.data.certificateId;
        setCertificateStatus('PENDING');
      } else {
        throw new Error(response.data?.message || 'Failed to generate certificate');
      }
    } catch (err) {
      let errorMessage = 'Failed to generate certificate. Please try again.';

      if (err.response?.status === 404) {
        errorMessage = 'API endpoint not found: ' + API_ENDPOINT;
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        errorMessage = 'Authentication error. Please try logging in again.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      candidateName: '',
      courseName: '',
      referenceId: '',
      certificateType: 'ACHIEVEMENT',
      validUntil: '',
      recipientEmail: '',
      additionalMetadata: {
        instructor: '',
        totalHours: '',
        grade: ''
      }
    });
    setAdditionalFields([]);
    setSelectedCourse('');
    setStudentEmail('');
    setStudentLookupStatus('idle');
    setSelectedStudent(null);
    setIncludeDeveloperPage(false);
    setSuccess(false);
    setCertificateData(null);
  };

  const HashField = ({ label, value, fieldName, className = "" }) => {
    if (!value) return null;

    return (
      <div className={`space-y-0.5 ${className}`}>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
          <span className="text-xs text-gray-400">Click to copy</span>
        </div>
        <button
          className="w-full text-left bg-gray-50 border border-gray-200 rounded-sm p-2 overflow-x-auto relative hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm"
          onClick={() => copyToClipboard(value, fieldName)}
          aria-label={`Copy ${label}`}
        >
          <code className="text-sm text-gray-800 break-all font-mono pr-8">{value}</code>
          <span className="absolute right-2 top-2 p-1 bg-gray-200 rounded-sm">
            {copiedField === fieldName ?
              <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> :
              <FiCopy className="w-3.5 h-3.5 text-gray-600" />
            }
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div
        ref={copyNotificationRef}
        className="fixed top-4 right-4 bg-green-100 border border-green-200 text-green-800 px-4 py-2 rounded-sm shadow-md flex items-center transition-all duration-300 opacity-0 transform translate-y-10 z-50"
      >
        <FiCheckCircle className="w-5 h-5 mr-2 text-green-600" />
        <span>Copied to clipboard</span>
      </div>

      {copyError && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-200 text-red-800 px-4 py-2 rounded-sm shadow-md flex items-center z-50">
          <FiAlertCircle className="w-5 h-5 mr-2 text-red-600" />
          <span>{copyError}</span>
        </div>
      )}

      <div className="flex-1 py-6 px-4 bg-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Generate Certificate</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm flex items-start">
                <FiX className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && certificateData ? (
              <CertificateSuccessView
                certificateData={certificateData}
                copiedField={copiedField}
                onCopy={copyToClipboard}
                onReset={resetForm}
                formData={formData}
                mode="generated"
                status={certificateStatus}
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="border-b border-gray-200 pb-4 mb-4">
                  <h3 className="text-md font-medium text-gray-700 mb-3">Required Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Student Lookup by Email */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Recipient Student Email*
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={studentEmail}
                          onChange={handleStudentEmailChange}
                          className="flex-1 p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                          placeholder="Enter student's registered email"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => lookupStudent(studentEmail)}
                          disabled={studentLookupStatus === 'loading' || !studentEmail.includes('@')}
                          className="px-4 py-2.5 bg-gray-700 text-white rounded-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                        >
                          {studentLookupStatus === 'loading' ? 'Looking up…' : 'Look Up'}
                        </button>
                      </div>

                      {/* Lookup result */}
                      {studentLookupStatus === 'found' && selectedStudent && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-sm flex items-start gap-2">
                          <FiCheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-green-800">{selectedStudent.name}</p>
                            <p className="text-green-700 text-xs mt-0.5 font-mono">{selectedStudent.walletAddress}</p>
                            <p className="text-green-600 text-xs mt-0.5">✓ Enrolled in your institute</p>
                          </div>
                        </div>
                      )}
                      {studentLookupStatus === 'not_enrolled' && selectedStudent && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-sm flex items-start gap-2">
                          <FiAlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-amber-800">{selectedStudent.name} found, but not enrolled in your institute</p>
                            <p className="text-amber-700 text-xs mt-1">The student must enroll in your institute before you can issue them a certificate.</p>
                          </div>
                        </div>
                      )}
                      {studentLookupStatus === 'not_found' && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-sm flex items-center gap-2">
                          <FiAlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <p className="text-sm text-red-700">No registered student found with that email.</p>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">The certificate will be issued to this student's blockchain wallet</p>
                    </div>

                    {/* Course Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Course Name*
                      </label>
                      <select
                        value={selectedCourse?._id}
                        onChange={handleCourseChange}
                        className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                        required
                      >
                        <option value="">Select course</option>
                        {courses.map(c => (
                          <option key={c._id} value={c._id}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Name of the course or achievement being certified</p>
                    </div>

                    {/* Reference ID */}
                  </div>
                </div>

                <div className="border-b border-gray-200 pb-4 mb-4">
                  <h3 className="text-md font-medium text-gray-700 mb-3">Certificate Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Certificate Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Certificate Type
                      </label>
                      <select
                        name="certificateType"
                        value={formData.certificateType}
                        onChange={handleInputChange}
                        className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                      >
                        <option value="ACHIEVEMENT">Achievement</option>
                        <option value="COMPLETION">Completion</option>
                        <option value="PARTICIPATION">Participation</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Determines the certificate style and wording
                      </p>
                    </div>

                    {/* Valid Until */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valid Until
                      </label>
                      <input
                        type="date"
                        name="validUntil"
                        value={formData.validUntil}
                        onChange={handleInputChange}
                        className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty if the certificate doesn't expire
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-b border-gray-200 pb-4 mb-4">
                  <h3 className="text-md font-medium text-gray-700 mb-3">Additional Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {/* Instructor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Instructor
                      </label>
                      <input
                        type="text"
                        name="additionalMetadata.instructor"
                        value={formData.additionalMetadata.instructor}
                        onChange={handleInputChange}
                        className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                        placeholder="Course instructor name"
                      />
                    </div>

                    {/* Total Hours */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Course Duration (hours)
                      </label>
                      <input
                        type="number"
                        name="additionalMetadata.totalHours"
                        value={formData.additionalMetadata.totalHours}
                        onChange={handleInputChange}
                        className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                        placeholder="Total hours (e.g., 40)"
                        min="0"
                      />
                    </div>

                    {/* Grade */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Grade
                      </label>
                      <input
                        type="text"
                        name="additionalMetadata.grade"
                        value={formData.additionalMetadata.grade}
                        onChange={handleInputChange}
                        className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                        placeholder="Final grade (e.g., A+)"
                      />
                    </div>
                  </div>

                  {/* Dynamic Additional Fields */}
                  {additionalFields.map((field, index) => (
                    <div key={index} className="flex gap-2 items-start mb-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={field.key}
                          onChange={(e) => handleAdditionalFieldChange(index, 'key', e.target.value)}
                          className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                          placeholder="Field name"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={field.value}
                          onChange={(e) => handleAdditionalFieldChange(index, 'value', e.target.value)}
                          className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                          placeholder="Field value"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAdditionalField(index)}
                        className="p-2.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-200"
                      >
                        <FiMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addAdditionalField}
                    className="flex items-center text-sm text-gray-700 hover:text-gray-900 mt-2"
                  >
                    <FiPlus className="w-4 h-4 mr-1" />
                    <span>Add Custom Field</span>
                  </button>
                </div>

                <div className="border-b border-gray-200 pb-4 mb-4">
                  <h3 className="text-md font-medium text-gray-700 mb-3">Certificate Options</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="developerPage"
                        checked={includeDeveloperPage}
                        onChange={() => setIncludeDeveloperPage(!includeDeveloperPage)}
                        className="h-4 w-4 text-gray-600 focus:ring-gray-500 border-gray-300 rounded"
                      />
                      <label htmlFor="developerPage" className="ml-2 block text-sm text-gray-700">
                        Include technical details page
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 ml-6">
                      Adds a second page with blockchain verification details and technical information
                    </p>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-800 text-white px-6 py-3 rounded-sm
                      hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {loading ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <FiSave className="mr-2" />
                        Generate Certificate
                      </span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateCertificate;
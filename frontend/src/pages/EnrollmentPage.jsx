import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  FiCheckCircle, FiAlertCircle, FiLoader, FiLogOut,
  FiAward, FiUsers, FiSearch
} from 'react-icons/fi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const EnrollmentPage = () => {
  const { user, getToken } = useAuth();

  const [status, setStatus] = useState(null);         // current enrollment status
  const [institutes, setInstitutes] = useState([]);   // all available institutes
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingInstitutes, setLoadingInstitutes] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/enrollment/status`, { headers });
      console.log(data)
      setStatus(data.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load enrollment status' });
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchInstitutes = async () => {
    setLoadingInstitutes(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/enrollment/institutes`);
      setInstitutes(data.data.institutes);
      setFiltered(data.data.institutes);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load institutes' });
    } finally {
      setLoadingInstitutes(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchInstitutes();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(institutes);
    } else {
      const q = search.toLowerCase();
      setFiltered(institutes.filter(i => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)));
    }
  }, [search, institutes]);

  const handleEnroll = async (instituteId) => {
    setActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const { data } = await axios.post(
        `${API_URL}/api/enrollment/enroll`,
        { instituteId },
        { headers }
      );
      setMessage({ type: 'success', text: `Successfully enrolled in ${data.data.instituteName}` });
      await fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Enrollment failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnenroll = async () => {
    if (!window.confirm('Are you sure you want to unenroll? You will need to re-enroll to receive new certificates.')) return;
    setActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.post(`${API_URL}/api/enrollment/unenroll`, {}, { headers });
      setMessage({ type: 'success', text: 'Successfully unenrolled' });
      await fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Unenroll failed' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h2 className="text-xl font-bold text-gray-900">Institute Enrollment</h2>
          <p className="text-sm text-gray-500 mt-1">
            Enroll in an institute to receive blockchain-verified certificates.
            You can only be enrolled in one institute at a time.
          </p>
        </div>

        {/* Feedback message */}
        {message.text && (
          <div className={`p-3 rounded-sm border flex items-start gap-2 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {message.type === 'success'
              ? <FiCheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        {/* Current Enrollment Status */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiAward className="w-4 h-4" /> Current Enrollment
          </h3>

          {loadingStatus ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <FiLoader className="animate-spin w-4 h-4" /> Loading…
            </div>
          ) : !status?.registered ? (
            <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 p-3 rounded-sm">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              Your account is not yet registered on-chain. This usually happens automatically at registration.
              Contact support if this persists.
            </div>
          ) : status?.enrolled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-sm">
                <FiCheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-green-900 text-sm">{status.institute?.name}</p>
                  <p className="text-xs text-green-700 font-mono mt-0.5">{status.institute?.walletAddress}</p>
                </div>
                <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-sm font-medium">Enrolled</span>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>{status.certificateCount} certificate{status.certificateCount !== 1 ? 's' : ''} issued to you</span>
                <button
                  onClick={handleUnenroll}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 text-red-600 hover:text-red-800 disabled:opacity-50 text-xs font-medium"
                >
                  <FiLogOut className="w-3.5 h-3.5" /> Unenroll
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-600 text-sm bg-gray-50 border border-gray-200 p-3 rounded-sm">
              <FiAlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
              You are not enrolled in any institute. Choose one below.
            </div>
          )}
        </div>

        {/* Institute List */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiUsers className="w-4 h-4" /> Available Institutes
          </h3>

          {/* Search */}
          <div className="relative mb-4">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
            />
          </div>

          {loadingInstitutes ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <FiLoader className="animate-spin w-4 h-4" /> Loading institutes…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No institutes found.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map(inst => {
                const isCurrentInstitute = status?.institute?.walletAddress === inst.walletAddress;
                return (
                  <li key={inst.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {inst.logo ? (
                        <img src={inst.logo} alt="" className="w-9 h-9 rounded-sm object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-sm bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-500 font-bold text-sm">{inst.name[0]}</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{inst.name}</p>
                        <p className="text-xs text-gray-500 truncate">{inst.email}</p>
                      </div>
                    </div>

                    {isCurrentInstitute ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-sm font-medium flex-shrink-0">
                        Enrolled
                      </span>
                    ) : !status?.enrolled && (
                      <button
                        onClick={() => handleEnroll(inst.id)}
                        disabled={actionLoading}
                        className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 font-medium"
                      >
                        {'Enroll'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Wallet Info */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Your On-Chain Identity</h3>
          <div className="bg-gray-50 rounded-sm p-3 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Wallet Address</p>
            <p className="text-xs font-mono text-gray-800 break-all">{user?.walletAddress || 'Not available'}</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EnrollmentPage;
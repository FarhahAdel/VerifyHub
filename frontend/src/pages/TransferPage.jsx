import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  FiCheckCircle, FiXCircle, FiAlertCircle, FiLoader, FiRepeat,
  FiArrowRight, FiClock, FiFileText, FiChevronDown, FiChevronUp, FiInfo
} from 'react-icons/fi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const REASON_LABELS = {
  NO_MATCHING_EQUIVALENCY_RULE: 'No matching equivalency rule for this course',
  COURSE_NOT_IN_CATALOG: "Course not found in your institute's catalog",
  CERTIFICATE_RECORD_NOT_FOUND: 'Certificate record not found',
  NOT_ISSUED_BY_SOURCE_INSTITUTE: 'Not issued by your current institute',
};

const courseLabel = (course) => {
  if (!course) return null;
  if (course.name) return course.code ? `${course.code} — ${course.name}` : course.name;
  return null;
};

const TransferPage = () => {
  const { user, getToken } = useAuth();

  const [status, setStatus] = useState(null);
  const [institutes, setInstitutes] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingInstitutes, setLoadingInstitutes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [result, setResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/enrollment/status`, { headers });
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
    } catch {
      // Non-fatal — the form just won't have options yet.
    } finally {
      setLoadingInstitutes(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/transfers`, { headers });
      setHistory(data.data.evaluations);
    } catch {
      // Non-fatal — history just won't show.
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchInstitutes();
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eligibleInstitutes = institutes.filter(
    i => i.walletAddress !== status?.institute?.walletAddress
  );

  const handleApply = async (e) => {
    e.preventDefault();
    if (!destinationId) return;
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    setResult(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/transfers/apply`,
        { destinationInstituteId: destinationId },
        { headers }
      );
      setResult(data.data);
      setMessage({ type: 'success', text: data.message });
      setDestinationId('');
      await Promise.all([fetchStatus(), fetchHistory()]);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Transfer evaluation failed' });
    } finally {
      setSubmitting(false);
    }
  };

  // Renders one course-result row, used both for the just-submitted result and for history detail.
  const ResultRow = ({ item, accepted }) => (
    <li className={`text-xs rounded-sm px-3 py-2 border flex items-start gap-2 ${
      accepted ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'
    }`}>
      {accepted
        ? <FiCheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-600" />
        : <FiXCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />}
      <div className="min-w-0">
        <p className="font-medium truncate">{item.courseName || 'Untitled certificate'}</p>
        {accepted ? (
          <p className="text-green-700 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{courseLabel(item.sourceCourse) || 'Your course'}</span>
            <FiArrowRight className="w-3 h-3 flex-shrink-0" />
            <span>{courseLabel(item.destinationCourse) || 'Destination course'}</span>
          </p>
        ) : (
          <p className="text-gray-500 mt-0.5">{REASON_LABELS[item.reason] || 'Not eligible for transfer'}</p>
        )}
      </div>
    </li>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FiRepeat className="w-5 h-5" /> Credit Transfer
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Apply to transfer to another institute. Your certificates are automatically checked
            against the active equivalency agreement between your current and destination institutes,
            and the result is recorded on-chain.
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

        {/* Current enrollment */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Current Institute</h3>
          {loadingStatus ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <FiLoader className="animate-spin w-4 h-4" /> Loading…
            </div>
          ) : status?.enrolled ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-sm">
              {status.institute?.logo ? (
                <img src={status.institute.logo} alt="" className="w-9 h-9 rounded-sm object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-sm bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-500 font-bold text-sm">{status.institute?.name?.[0]}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{status.institute?.name}</p>
                <p className="text-xs text-gray-500">{status.certificateCount} certificate{status.certificateCount !== 1 ? 's' : ''} on record</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 p-3 rounded-sm">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              You must be enrolled in an institute before you can apply for a credit transfer.
            </div>
          )}
        </div>

        {/* Apply for transfer */}
        {status?.enrolled && (
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
            <h3 className="text-md font-semibold text-gray-800 mb-3">Apply for Transfer</h3>
            <form onSubmit={handleApply} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Institute</label>
                {loadingInstitutes ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <FiLoader className="animate-spin w-4 h-4" /> Loading institutes…
                  </div>
                ) : (
                  <select
                    value={destinationId}
                    onChange={e => setDestinationId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                  >
                    <option value="">Select an institute…</option>
                    {eligibleInstitutes.map(inst => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={!destinationId || submitting}
                className="bg-gray-800 text-white px-5 py-2.5 rounded-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {submitting ? 'Evaluating…' : 'Evaluate & Apply'}
              </button>
            </form>
          </div>
        )}

        {/* Latest result */}
        {result && (
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-md font-semibold text-gray-800">Evaluation Result</h3>
              <span className="text-xs text-gray-400">
                {result.sourceInstitute.name} <FiArrowRight className="inline w-3 h-3 mx-1" /> {result.destinationInstitute.name}
              </span>
            </div>

            {result.enrollmentUpdated && (
              <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 text-green-800 p-3 rounded-sm">
                <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
                Your enrollment has been updated to {result.destinationInstitute.name}.
              </div>
            )}

            {result.accepted.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Accepted ({result.accepted.length})</p>
                <ul className="space-y-1.5">
                  {result.accepted.map(item => <ResultRow key={item.certificateId} item={item} accepted />)}
                </ul>
              </div>
            )}

            {result.rejected.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Rejected ({result.rejected.length})</p>
                <ul className="space-y-1.5">
                  {result.rejected.map(item => <ResultRow key={item.certificateId} item={item} accepted={false} />)}
                </ul>
              </div>
            )}

            {result.accepted.length === 0 && result.rejected.length === 0 && (
              <p className="text-sm text-gray-500">No certificates from your current institute were available to evaluate.</p>
            )}

            {result.excluded?.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <FiInfo className="w-3.5 h-3.5 flex-shrink-0" />
                  {result.excluded.length} certificate{result.excluded.length !== 1 ? 's were' : ' was'} not considered (not issued by your current institute).
                </p>
              </div>
            )}
          </div>
        )}

        {/* History */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiFileText className="w-4 h-4" /> Transfer History
            {!loadingHistory && (
              <span className="text-sm font-normal text-gray-400">({history.length} total)</span>
            )}
          </h3>

          {loadingHistory ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <FiLoader className="animate-spin w-4 h-4" /> Loading…
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <FiClock className="w-8 h-8 mb-2" />
              <p className="text-sm">No transfer evaluations yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {history.map(ev => {
                const isOpen = expandedId === ev.id;
                return (
                  <li key={ev.id} className="py-3">
                    <button
                      onClick={() => setExpandedId(isOpen ? null : ev.id)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {ev.sourceInstitute.name} <FiArrowRight className="inline w-3 h-3 mx-1 text-gray-400" /> {ev.destinationInstitute.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(ev.evaluatedAt).toLocaleDateString()} · {ev.acceptedCount} accepted · {ev.rejectedCount} rejected
                          {ev.enrollmentUpdated && ' · Enrolled'}
                        </p>
                      </div>
                      {isOpen ? <FiChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <FiChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>

                    {isOpen && (
                      <div className="mt-3 space-y-3">
                        {ev.accepted.length > 0 && (
                          <ul className="space-y-1.5">
                            {ev.accepted.map(item => <ResultRow key={item.certificateId} item={item} accepted />)}
                          </ul>
                        )}
                        {ev.rejected.length > 0 && (
                          <ul className="space-y-1.5">
                            {ev.rejected.map(item => <ResultRow key={item.certificateId} item={item} accepted={false} />)}
                          </ul>
                        )}
                        {ev.accepted.length === 0 && ev.rejected.length === 0 && (
                          <p className="text-xs text-gray-400">No certificates were evaluated in this application.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
};

export default TransferPage;

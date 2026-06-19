import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  FiCheckCircle, FiXCircle, FiClock, FiPlus, FiTrash2,
  FiAlertCircle, FiArrowRight, FiLoader, FiFileText
} from 'react-icons/fi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const STATUS_BADGE = {
  PROPOSED: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  REVOKED: 'bg-gray-200 text-gray-600',
};

const AgreementsPage = () => {
  const { user, getToken } = useAuth();
  const myInstituteId = user?._id || user?.id;

  const [agreements, setAgreements] = useState([]);
  const [loadingAgreements, setLoadingAgreements] = useState(true);
  const [institutes, setInstitutes] = useState([]);
  const [actionId, setActionId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Proposal form state
  const [counterpartyId, setCounterpartyId] = useState('');
  const [myCourses, setMyCourses] = useState([]);
  const [theirCourses, setTheirCourses] = useState([]);
  const [pendingA, setPendingA] = useState('');
  const [pendingB, setPendingB] = useState('');
  const [pairs, setPairs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchAgreements = async () => {
    setLoadingAgreements(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/agreements`, { headers });
      setAgreements(data.data.agreements);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load agreements' });
    } finally {
      setLoadingAgreements(false);
    }
  };

  const fetchInstitutes = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/enrollment/institutes`);
      setInstitutes(data.data.institutes.filter(i => i.id !== myInstituteId));
    } catch {
      // Non-fatal — proposal form just won't have options yet.
    }
  };

  useEffect(() => {
    fetchAgreements();
    fetchInstitutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadCourses = async () => {
      if (!myInstituteId || !counterpartyId) {
        setMyCourses([]);
        setTheirCourses([]);
        return;
      }
      setLoadingCourses(true);
      try {
        const [mine, theirs] = await Promise.all([
          axios.get(`${API_URL}/api/courses/${myInstituteId}`, { headers }),
          axios.get(`${API_URL}/api/courses/${counterpartyId}`, { headers }),
        ]);
        setMyCourses(mine.data.courses.filter(c => c.isActive));
        setTheirCourses(theirs.data.courses.filter(c => c.isActive));
      } catch {
        setMessage({ type: 'error', text: 'Failed to load course catalogs' });
      } finally {
        setLoadingCourses(false);
      }
    };
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterpartyId]);

  const counterpartyName = useMemo(
    () => institutes.find(i => i.id === counterpartyId)?.name || '',
    [institutes, counterpartyId]
  );

  const addPair = () => {
    if (!pendingA || !pendingB) return;
    if (pairs.some(p => p.aId === pendingA && p.bId === pendingB)) return;
    const a = myCourses.find(c => c._id === pendingA);
    const b = theirCourses.find(c => c._id === pendingB);
    setPairs(prev => [...prev, {
      aId: pendingA, bId: pendingB,
      aLabel: `${a.code} — ${a.name}`, bLabel: `${b.code} — ${b.name}`,
    }]);
    setPendingA('');
    setPendingB('');
  };

  const removePair = (aId, bId) => {
    setPairs(prev => prev.filter(p => !(p.aId === aId && p.bId === bId)));
  };

  const resetForm = () => {
    setCounterpartyId('');
    setPairs([]);
    setPendingA('');
    setPendingB('');
  };

  const handlePropose = async (e) => {
    e.preventDefault();
    if (!counterpartyId || pairs.length === 0) return;
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.post(
        `${API_URL}/api/agreements`,
        {
          counterpartyInstituteId: counterpartyId,
          pairs: pairs.map(p => ({ instituteACourseId: p.aId, instituteBCourseId: p.bId })),
        },
        { headers }
      );
      setMessage({ type: 'success', text: `Agreement proposed to ${counterpartyName}. Awaiting their countersignature.` });
      resetForm();
      await fetchAgreements();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to propose agreement' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (id) => {
    setActionId(id);
    setMessage({ type: '', text: '' });
    try {
      await axios.post(`${API_URL}/api/agreements/${id}/accept`, {}, { headers });
      setMessage({ type: 'success', text: 'Agreement accepted — it is now active.' });
      await fetchAgreements();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to accept agreement' });
    } finally {
      setActionId(null);
    }
  };

  const handleRevoke = async (id, confirmLabel, successLabel) => {
    if (!window.confirm(`${confirmLabel}? This cannot be undone.`)) return;
    setActionId(id);
    setMessage({ type: '', text: '' });
    try {
      await axios.post(`${API_URL}/api/agreements/${id}/revoke`, {}, { headers });
      setMessage({ type: 'success', text: successLabel });
      await fetchAgreements();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Action failed' });
    } finally {
      setActionId(null);
    }
  };

  const renderActions = (agreement) => {
    const isInstituteA = agreement.instituteA.walletAddress === user?.walletAddress;
    const isBusy = actionId === agreement.id;

    if (agreement.status === 'PROPOSED') {
      if (!isInstituteA) {
        return (
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => handleAccept(agreement.id)}
              disabled={isBusy}
              className="flex items-center gap-1.5 text-xs bg-gray-800 text-white px-3 py-1.5 rounded-sm hover:bg-gray-600 disabled:opacity-50 font-medium"
            >
              <FiCheckCircle className="w-3.5 h-3.5" /> {isBusy ? 'Please wait…' : 'Accept'}
            </button>
            <button
              onClick={() => handleRevoke(agreement.id, 'Decline this agreement', 'Agreement declined.')}
              disabled={isBusy}
              className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 font-medium"
            >
              <FiXCircle className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        );
      }
      return (
        <button
          onClick={() => handleRevoke(agreement.id, 'Withdraw this proposal', 'Proposal withdrawn.')}
          disabled={isBusy}
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 font-medium flex-shrink-0"
        >
          <FiXCircle className="w-3.5 h-3.5" /> {isBusy ? 'Please wait…' : 'Withdraw Proposal'}
        </button>
      );
    }

    if (agreement.status === 'ACTIVE') {
      return (
        <button
          onClick={() => handleRevoke(agreement.id, 'Revoke this agreement', 'Agreement revoked.')}
          disabled={isBusy}
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 font-medium flex-shrink-0"
        >
          <FiXCircle className="w-3.5 h-3.5" /> {isBusy ? 'Please wait…' : 'Revoke'}
        </button>
      );
    }

    return null; // REVOKED — no actions, read-only history
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h2 className="text-xl font-bold text-gray-900">Equivalency Agreements</h2>
          <p className="text-sm text-gray-500 mt-1">
            Propose or manage bilateral course-equivalency agreements with other institutes.
            Every proposal, acceptance, and revocation is recorded on-chain.
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

        {/* Propose new agreement */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiPlus className="w-4 h-4" /> Propose New Agreement
          </h3>

          <form onSubmit={handlePropose} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty Institute</label>
              <select
                value={counterpartyId}
                onChange={e => { setCounterpartyId(e.target.value); setPairs([]); }}
                className="w-full p-2.5 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
              >
                <option value="">Select an institute…</option>
                {institutes.map(inst => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </div>

            {counterpartyId && (
              <div className="border border-gray-200 rounded-sm p-4 bg-gray-50 space-y-3">
                <p className="text-xs font-medium text-gray-600">Add course-equivalency pairs</p>

                {loadingCourses ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <FiLoader className="animate-spin w-4 h-4" /> Loading course catalogs…
                  </div>
                ) : myCourses.length === 0 || theirCourses.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {myCourses.length === 0 ? 'You have no active courses.' : `${counterpartyName} has no active courses.`} Add courses before proposing an agreement.
                  </p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs text-gray-500 mb-1">Your course</label>
                      <select
                        value={pendingA}
                        onChange={e => setPendingA(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {myCourses.map(c => (
                          <option key={c._id} value={c._id}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                    <FiArrowRight className="hidden sm:block w-4 h-4 text-gray-400 mb-2.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs text-gray-500 mb-1">{counterpartyName}'s course</label>
                      <select
                        value={pendingB}
                        onChange={e => setPendingB(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {theirCourses.map(c => (
                          <option key={c._id} value={c._id}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={addPair}
                      disabled={!pendingA || !pendingB}
                      className="flex items-center justify-center gap-1.5 text-xs bg-gray-800 text-white px-3 py-2 rounded-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex-shrink-0"
                    >
                      <FiPlus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                )}

                {pairs.length > 0 && (
                  <ul className="divide-y divide-gray-200 bg-white rounded-sm border border-gray-200 mt-2">
                    {pairs.map(p => (
                      <li key={`${p.aId}-${p.bId}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="text-gray-700 truncate">
                          {p.aLabel} <FiArrowRight className="inline w-3 h-3 mx-1 text-gray-400" /> {p.bLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePair(p.aId, p.bId)}
                          className="text-gray-400 hover:text-red-600 flex-shrink-0"
                          aria-label="Remove pair"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={!counterpartyId || pairs.length === 0 || submitting}
                className="bg-gray-800 text-white px-5 py-2.5 rounded-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {submitting ? 'Proposing…' : 'Propose Agreement'}
              </button>
            </div>
          </form>
        </div>

        {/* Agreements list */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiFileText className="w-4 h-4" /> Your Agreements
            {!loadingAgreements && (
              <span className="text-sm font-normal text-gray-400">({agreements.length} total)</span>
            )}
          </h3>

          {loadingAgreements ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <FiLoader className="animate-spin w-4 h-4" /> Loading…
            </div>
          ) : agreements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <FiAlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">No agreements yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {agreements.map(agreement => {
                const isInstituteA = agreement.instituteA.walletAddress === user?.walletAddress;
                const counterparty = isInstituteA ? agreement.instituteB : agreement.instituteA;
                const revokedByName = agreement.revokedBy === agreement.instituteA.walletAddress
                  ? agreement.instituteA.name
                  : agreement.instituteB.name;

                return (
                  <li key={agreement.id} className="py-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900">{counterparty.name || counterparty.walletAddress}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${STATUS_BADGE[agreement.status]}`}>
                            {agreement.status === 'PROPOSED' && <FiClock className="inline w-3 h-3 mr-1 -mt-0.5" />}
                            {agreement.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Proposed {new Date(agreement.proposedAt).toLocaleDateString()}
                          {agreement.status === 'ACTIVE' && agreement.respondedAt &&
                            ` · Active since ${new Date(agreement.respondedAt).toLocaleDateString()}`}
                          {agreement.status === 'REVOKED' && agreement.respondedAt &&
                            ` · Revoked ${new Date(agreement.respondedAt).toLocaleDateString()} by ${revokedByName}`}
                        </p>
                      </div>
                      {renderActions(agreement)}
                    </div>

                    <ul className="mt-3 space-y-1">
                      {agreement.pairs.map((pair, i) => (
                        <li key={i} className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-sm px-3 py-1.5 flex items-center gap-2 flex-wrap">
                          <span className="font-mono">{pair.instituteACourse.code || '—'}</span>
                          <span className="truncate">{pair.instituteACourse.name}</span>
                          <FiArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="font-mono">{pair.instituteBCourse.code || '—'}</span>
                          <span className="truncate">{pair.instituteBCourse.name}</span>
                        </li>
                      ))}
                    </ul>
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

export default AgreementsPage;

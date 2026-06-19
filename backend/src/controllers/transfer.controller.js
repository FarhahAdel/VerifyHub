// src/controllers/transfer.controller.js
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Course from '../models/course.model.js';
import Certificate from '../models/certificate.model.js';
import {
  getStudentRegistryContract,
  getEquivalencyAgreementContract,
  getCreditTransferEvaluationContract,
  getWeb3,
} from '../utils/blockchain.js';
import { successResponse } from '../utils/responseUtils.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidId = (id) => /^\d+$/.test(String(id)) && Number(id) > 0;

const toIso = (unixSeconds) => {
  const n = Number(unixSeconds);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hydrateInstitute = async (walletAddress) => {
  const lower = walletAddress.toLowerCase();
  const inst = await User.findOne({ walletAddress: lower, role: 'INSTITUTE' })
    .select('name institutionName walletAddress institutionLogo');
  return inst
    ? {
        id: inst._id,
        name: inst.institutionName || inst.name,
        walletAddress: inst.walletAddress,
        logo: inst.institutionLogo,
      }
    : { id: null, name: null, walletAddress: lower, logo: null };
};

/**
 * Find the Mongo Course document a (institute, courseName) pair refers to.
 * Certificates only store a free-text courseName, so we match it back to the
 * institute's course catalog the same way certificates are generated against it.
 */
const findCourseByName = async (instituteUserId, courseName) => {
  if (!instituteUserId || !courseName) return null;
  return Course.findOne({
    institute: instituteUserId,
    name: new RegExp(`^${escapeRegExp(courseName.trim())}$`, 'i'),
  });
};

/**
 * Locate the single active EquivalencyAgreement between two institute wallets.
 * Returns the agreement (raw on-chain shape) plus its id, or null if none is active.
 */
const findActiveAgreement = async (agreementContract, sourceWallet, destinationWallet) => {
  const ids = await agreementContract.methods.getInstituteAgreements(sourceWallet).call();
  const candidates = await Promise.all(ids.map(async (id) => {
    const raw = await agreementContract.methods.getAgreement(id).call();
    return { id: Number(id), raw };
  }));

  const matches = candidates.filter(({ raw }) => {
    const isActive = Number(raw.status) === 1; // 0 Proposed, 1 Active, 2 Revoked
    const counterpartMatches = [raw.instituteA, raw.instituteB]
      .some(addr => addr.toLowerCase() === destinationWallet.toLowerCase());
    return isActive && counterpartMatches;
  });

  if (matches.length === 0) return null;
  // If more than one active agreement somehow exists between the same pair, use the most recent.
  matches.sort((a, b) => b.id - a.id);
  return matches[0];
};

// Hydrate one on-chain evaluation (by id) into a display-friendly object.
const hydrateEvaluation = async (id, evalContract) => {
  const raw = await evalContract.methods.getEvaluation(id).call();
  const { certificateIds, sourceCourseIds, destinationCourseIds, accepted } =
    await evalContract.methods.getAllEvaluationResults(id).call();

  const [sourceInstitute, destinationInstitute] = await Promise.all([
    hydrateInstitute(raw.sourceInstitute),
    hydrateInstitute(raw.destinationInstitute),
  ]);

  // Bulk-hydrate certificate metadata and course names for every result row.
  const [certificates, allCourses] = await Promise.all([
    Certificate.find({ certificateId: { $in: certificateIds } })
      .select('certificateId courseName candidateName issuedDate'),
    Course.find({
      _id: {
        $in: [...sourceCourseIds, ...destinationCourseIds].filter(cid => mongoose.isValidObjectId(cid)),
      },
    }).select('name code'),
  ]);
  const certMap = new Map(certificates.map(c => [c.certificateId, c]));
  const courseMap = new Map(allCourses.map(c => [c._id.toString(), c]));

  const results = certificateIds.map((certId, i) => {
    const cert = certMap.get(certId);
    const sourceCourse = courseMap.get(sourceCourseIds[i]);
    const destinationCourse = courseMap.get(destinationCourseIds[i]);
    return {
      certificateId: certId,
      courseName: cert?.courseName || null,
      candidateName: cert?.candidateName || null,
      accepted: accepted[i],
      sourceCourse: sourceCourse
        ? { id: sourceCourseIds[i], name: sourceCourse.name, code: sourceCourse.code }
        : (sourceCourseIds[i] ? { id: sourceCourseIds[i], name: 'Unknown course', code: '' } : null),
      destinationCourse: destinationCourse
        ? { id: destinationCourseIds[i], name: destinationCourse.name, code: destinationCourse.code }
        : null,
      reason: accepted[i]
        ? null
        : (sourceCourseIds[i] ? 'NO_MATCHING_EQUIVALENCY_RULE' : 'COURSE_NOT_IN_CATALOG'),
    };
  });

  return {
    id: Number(id),
    student: { walletAddress: raw.student.toLowerCase() },
    sourceInstitute,
    destinationInstitute,
    agreementId: Number(raw.agreementId),
    evaluatedAt: toIso(raw.evaluatedAt),
    acceptedCount: Number(raw.acceptedCount),
    rejectedCount: Number(raw.rejectedCount),
    enrollmentUpdated: raw.enrollmentUpdated,
    accepted: results.filter(r => r.accepted),
    rejected: results.filter(r => !r.accepted),
  };
};

const getMe = async (req) => {
  return User.findById(req.user.id).select('walletAddress name institutionName _id role');
};

// ─── Controllers ────────────────────────────────────────────────────────────

// POST /api/transfers/apply — student applies to transfer into a destination institute
export const applyForTransfer = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const { destinationInstituteId } = req.body;

  if (!destinationInstituteId || !mongoose.isValidObjectId(destinationInstituteId)) {
    return res.status(400).json({ success: false, message: 'destinationInstituteId is required' });
  }

  try {
    const student = await getMe(req);
    if (!student?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Student wallet not found' });
    }

    const destinationInstitute = await User.findOne({ _id: destinationInstituteId, role: 'INSTITUTE' })
      .select('walletAddress name institutionName _id');
    if (!destinationInstitute?.walletAddress) {
      return res.status(404).json({ success: false, message: 'Destination institute not found or has no wallet' });
    }

    const registry = getStudentRegistryContract();
    const agreementContract = getEquivalencyAgreementContract();
    const evalContract = getCreditTransferEvaluationContract();
    const web3Instance = getWeb3();
    const accounts = await web3Instance.eth.getAccounts();

    // 1. Student must be registered and currently enrolled somewhere (their "source").
    const isRegistered = await registry.methods.isStudentRegistered(student.walletAddress).call();
    if (!isRegistered) {
      return res.status(400).json({
        success: false,
        message: 'Student is not registered on-chain. Please contact support.',
        code: 'STUDENT_NOT_ON_CHAIN',
      });
    }

    const sourceWallet = await registry.methods.getEnrolledInstitute(student.walletAddress).call();
    if (!sourceWallet || sourceWallet.toLowerCase() === ZERO_ADDRESS) {
      return res.status(400).json({
        success: false,
        message: 'You must be enrolled in an institute before applying for a credit transfer.',
        code: 'NOT_ENROLLED',
      });
    }
    if (sourceWallet.toLowerCase() === destinationInstitute.walletAddress.toLowerCase()) {
      return res.status(409).json({ success: false, message: 'You are already enrolled at this institute.' });
    }

    const isDestRegistered = await registry.methods.isInstituteRegistered(destinationInstitute.walletAddress).call();
    if (!isDestRegistered) {
      return res.status(400).json({ success: false, message: 'Destination institute is not yet registered on-chain.' });
    }

    const sourceInstitute = await User.findOne({ walletAddress: sourceWallet.toLowerCase(), role: 'INSTITUTE' })
      .select('walletAddress name institutionName _id');
    if (!sourceInstitute) {
      return res.status(500).json({ success: false, message: 'Could not resolve your current institute record.' });
    }

    // 2. There must be an active bilateral agreement between source and destination.
    const agreement = await findActiveAgreement(
      agreementContract, sourceInstitute.walletAddress, destinationInstitute.walletAddress
    );
    if (!agreement) {
      return res.status(404).json({
        success: false,
        message: 'No active equivalency agreement exists between your current institute and the destination institute. Transfer evaluation cannot proceed.',
        code: 'NO_ACTIVE_AGREEMENT',
      });
    }

    const { instituteACourseIds, instituteBCourseIds } = await agreementContract.methods
      .getAllCoursePairs(agreement.id).call();

    // Orient the pair list so "sourceCourseIds[i] <-> destCourseIds[i]" regardless of
    // which side proposed the original agreement.
    const isSourceA = agreement.raw.instituteA.toLowerCase() === sourceInstitute.walletAddress.toLowerCase();
    const sourcePairCourseIds = isSourceA ? instituteACourseIds : instituteBCourseIds;
    const destPairCourseIds = isSourceA ? instituteBCourseIds : instituteACourseIds;
    const equivalencyMap = new Map(sourcePairCourseIds.map((cid, i) => [cid, destPairCourseIds[i]]));

    // 3. Pull every certificate currently linked to the student on-chain.
    const studentData = await registry.methods.getStudent(student.walletAddress).call();
    const certificateIds = studentData[3] || [];

    const certificates = certificateIds.length
      ? await Certificate.find({ certificateId: { $in: certificateIds } })
      : [];
    const certMap = new Map(certificates.map(c => [c.certificateId, c]));

    // 4. Evaluate only the certificates actually issued by the source institute —
    //    that's the body of credit being transferred. Certificates from elsewhere
    //    aren't relevant to this particular agreement and are reported separately
    //    for transparency rather than silently dropped.
    const evaluated = [];
    const excluded = [];

    for (const certId of certificateIds) {
      const cert = certMap.get(certId);

      if (!cert) {
        excluded.push({ certificateId: certId, reason: 'CERTIFICATE_RECORD_NOT_FOUND' });
        continue;
      }

      const issuedBySource = cert.issuer
        ? cert.issuer.toString() === sourceInstitute._id.toString()
        : cert.institutionName?.trim().toLowerCase() ===
          (sourceInstitute.institutionName || sourceInstitute.name || '').trim().toLowerCase();

      if (!issuedBySource) {
        excluded.push({ certificateId: certId, courseName: cert.courseName, reason: 'NOT_ISSUED_BY_SOURCE_INSTITUTE' });
        continue;
      }

      const sourceCourse = await findCourseByName(sourceInstitute._id, cert.courseName);
      const sourceCourseId = sourceCourse ? sourceCourse._id.toString() : '';
      const destCourseId = sourceCourseId && equivalencyMap.has(sourceCourseId)
        ? equivalencyMap.get(sourceCourseId)
        : '';
      const accepted = Boolean(destCourseId);

      evaluated.push({
        certificateId: certId,
        courseName: cert.courseName,
        candidateName: cert.candidateName,
        sourceCourseId,
        destinationCourseId: destCourseId,
        accepted,
      });
    }

    // 5. Record the evaluation immutably on-chain — even if nothing was evaluated,
    //    so there is a transparent trail that the student applied and what was found.
    const tx = await evalContract.methods
      .recordEvaluation(
        student.walletAddress,
        sourceInstitute.walletAddress,
        destinationInstitute.walletAddress,
        agreement.id,
        evaluated.map(r => r.certificateId),
        evaluated.map(r => r.sourceCourseId),
        evaluated.map(r => r.destinationCourseId),
        evaluated.map(r => r.accepted),
      )
      .send({ from: accounts[0], gas: 3000000 });

    const evaluationId = tx.events?.TransferEvaluated?.returnValues?.evaluationId;
    console.log(`[${requestId}] Transfer evaluated: id=${evaluationId} tx=${tx.transactionHash}`);

    const acceptedResults = evaluated.filter(r => r.accepted);
    let enrollmentTxHash = null;

    // 6. Acceptance of any course re-enrolls the student at the destination institute.
    const enrollTx = await registry.methods
      .enrollStudent(student.walletAddress, destinationInstitute.walletAddress)
      .send({ from: accounts[0], gas: 300000 });
    enrollmentTxHash = enrollTx.transactionHash;

    // await evalContract.methods
    //   .markEnrollmentUpdated(evaluationId)
    //   .send({ from: accounts[0], gas: 150000 });

    console.log(`[${requestId}] Enrollment updated to destination institute: tx=${enrollmentTxHash}`);

    // Hydrate course names for the response (the on-chain call only stores ids).
    const courseIdsInPlay = evaluated.flatMap(r => [r.sourceCourseId, r.destinationCourseId]).filter(Boolean);
    const courses = courseIdsInPlay.length
      ? await Course.find({ _id: { $in: courseIdsInPlay } }).select('name code')
      : [];
    const courseMap = new Map(courses.map(c => [c._id.toString(), c]));

    const formatResult = (r) => ({
      certificateId: r.certificateId,
      courseName: r.courseName,
      candidateName: r.candidateName,
      sourceCourse: r.sourceCourseId
        ? { id: r.sourceCourseId, ...(courseMap.get(r.sourceCourseId) ? { name: courseMap.get(r.sourceCourseId).name, code: courseMap.get(r.sourceCourseId).code } : {}) }
        : null,
      destinationCourse: r.destinationCourseId
        ? { id: r.destinationCourseId, ...(courseMap.get(r.destinationCourseId) ? { name: courseMap.get(r.destinationCourseId).name, code: courseMap.get(r.destinationCourseId).code } : {}) }
        : null,
      reason: r.accepted ? null : (r.sourceCourseId ? 'NO_MATCHING_EQUIVALENCY_RULE' : 'COURSE_NOT_IN_CATALOG'),
    });

    return res.status(201).json(successResponse({
      evaluationId: evaluationId ? Number(evaluationId) : null,
      agreementId: agreement.id,
      sourceInstitute: { id: sourceInstitute._id, name: sourceInstitute.institutionName || sourceInstitute.name, walletAddress: sourceInstitute.walletAddress },
      destinationInstitute: { id: destinationInstitute._id, name: destinationInstitute.institutionName || destinationInstitute.name, walletAddress: destinationInstitute.walletAddress },
      accepted: acceptedResults.map(formatResult),
      rejected: evaluated.filter(r => !r.accepted).map(formatResult),
      excluded,
      enrollmentUpdated: acceptedResults.length > 0,
      txHashes: { evaluationTx: tx.transactionHash, enrollmentTx: enrollmentTxHash },
    }, acceptedResults.length > 0
      ? `Transfer evaluated — ${acceptedResults.length} course(s) accepted and your enrollment has been updated.`
      : 'Transfer evaluated — no courses matched an active equivalency rule.'));
  } catch (error) {
    console.error(`[${requestId}] applyForTransfer error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/transfers — every evaluation run for the logged-in student
export const listMyTransferEvaluations = async (req, res) => {
  try {
    const student = await getMe(req);
    if (!student?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Student wallet not found' });
    }

    const evalContract = getCreditTransferEvaluationContract();
    const ids = await evalContract.methods.getStudentEvaluations(student.walletAddress).call();

    const evaluations = await Promise.all(ids.map(id => hydrateEvaluation(id, evalContract)));
    evaluations.sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt));

    return res.status(200).json(successResponse({ count: evaluations.length, evaluations }, 'Transfer evaluations fetched'));
  } catch (error) {
    console.error('[Transfers] listMyTransferEvaluations error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/transfers/:id — single evaluation (student owner, or either institute involved)
export const getTransferEvaluationById = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid evaluation id' });
  }

  try {
    const me = await getMe(req);
    const evalContract = getCreditTransferEvaluationContract();
    const evaluation = await hydrateEvaluation(id, evalContract);

    const isOwner = me?.role === 'STUDENT' && evaluation.student.walletAddress === me.walletAddress?.toLowerCase();
    const isParty = me?.role === 'INSTITUTE' &&
      [evaluation.sourceInstitute.walletAddress, evaluation.destinationInstitute.walletAddress]
        .some(addr => addr === me.walletAddress?.toLowerCase());

    if (!isOwner && !isParty) {
      return res.status(403).json({ success: false, message: 'You do not have access to this evaluation' });
    }

    return res.status(200).json(successResponse({ evaluation }, 'Evaluation fetched'));
  } catch (error) {
    console.error('[Transfers] getTransferEvaluationById error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

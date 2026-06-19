import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Course from '../models/course.model.js';
import { getEquivalencyAgreementContract, getWeb3 } from '../utils/blockchain.js';
import { successResponse } from '../utils/responseUtils.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STATUS_LABELS = ['PROPOSED', 'ACTIVE', 'REVOKED'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidId = (id) => /^\d+$/.test(String(id)) && Number(id) > 0;

const toIso = (unixSeconds) => {
  const n = Number(unixSeconds);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
};

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

// Hydrate one on-chain agreement (by id) into a display-friendly object.
const hydrateAgreement = async (id, contract) => {
  const raw = await contract.methods.getAgreement(id).call();
  const { instituteACourseIds, instituteBCourseIds } = await contract.methods.getAllCoursePairs(id).call();

  const [instituteA, instituteB] = await Promise.all([
    hydrateInstitute(raw.instituteA),
    hydrateInstitute(raw.instituteB),
  ]);

  const validA = instituteACourseIds.filter(cid => mongoose.isValidObjectId(cid));
  const validB = instituteBCourseIds.filter(cid => mongoose.isValidObjectId(cid));

  const [coursesA, coursesB] = await Promise.all([
    Course.find({ _id: { $in: validA } }).select('name code'),
    Course.find({ _id: { $in: validB } }).select('name code'),
  ]);
  const mapA = new Map(coursesA.map(c => [c._id.toString(), c]));
  const mapB = new Map(coursesB.map(c => [c._id.toString(), c]));

  const pairs = instituteACourseIds.map((aId, i) => {
    const bId = instituteBCourseIds[i];
    const a = mapA.get(aId);
    const b = mapB.get(bId);
    return {
      instituteACourse: { id: aId, name: a?.name || 'Unknown course', code: a?.code || '' },
      instituteBCourse: { id: bId, name: b?.name || 'Unknown course', code: b?.code || '' },
    };
  });

  const revokedBy = raw.revokedBy && raw.revokedBy.toLowerCase() !== ZERO_ADDRESS ? raw.revokedBy.toLowerCase() : null;

  return {
    id: Number(id),
    status: STATUS_LABELS[Number(raw.status)],
    proposedAt: toIso(raw.proposedAt),
    respondedAt: toIso(raw.respondedAt),
    revokedBy,
    instituteA,
    instituteB,
    pairs,
  };
};

const getMyInstitute = async (req) => {
  const me = await User.findById(req.user.id).select('walletAddress institutionName name _id');
  return me;
};

// ─── Controllers ────────────────────────────────────────────────────────────

// POST /api/agreements — propose a new bilateral agreement
export const proposeAgreement = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const { counterpartyInstituteId, pairs } = req.body;

  if (!counterpartyInstituteId || !Array.isArray(pairs) || pairs.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'counterpartyInstituteId and at least one course pair are required',
    });
  }

  try {
    const proposer = await getMyInstitute(req);
    if (!proposer?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Your institute has no on-chain wallet address' });
    }

    const counterparty = await User.findOne({ _id: counterpartyInstituteId, role: 'INSTITUTE' })
      .select('walletAddress institutionName name');
    if (!counterparty?.walletAddress) {
      return res.status(404).json({ success: false, message: 'Counterparty institute not found or has no wallet' });
    }

    if (counterparty.walletAddress.toLowerCase() === proposer.walletAddress.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Cannot propose an agreement with your own institute' });
    }

    const courseAIds = pairs.map(p => p.instituteACourseId);
    const courseBIds = pairs.map(p => p.instituteBCourseId);

    if (courseAIds.some(id => !mongoose.isValidObjectId(id)) || courseBIds.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: 'Invalid course id in pairs' });
    }

    // Confirm every course actually belongs to the institute claimed for it.
    const [coursesA, coursesB] = await Promise.all([
      Course.find({ _id: { $in: courseAIds }, institute: proposer._id }),
      Course.find({ _id: { $in: courseBIds }, institute: counterparty._id }),
    ]);
    if (coursesA.length !== new Set(courseAIds).size || coursesB.length !== new Set(courseBIds).size) {
      return res.status(400).json({ success: false, message: 'One or more courses do not belong to the stated institute' });
    }

    const contract = getEquivalencyAgreementContract();
    const web3Instance = getWeb3();
    const accounts = await web3Instance.eth.getAccounts();

    const tx = await contract.methods
      .proposeAgreement(proposer.walletAddress, counterparty.walletAddress, courseAIds, courseBIds)
      .send({ from: accounts[0], gas: 1500000 });

    const agreementId = tx.events?.AgreementProposed?.returnValues?.agreementId;
    console.log(`[${requestId}] Agreement proposed: id=${agreementId} tx=${tx.transactionHash}`);

    return res.status(201).json(successResponse({
      agreementId: agreementId ? Number(agreementId) : null,
      txHash: tx.transactionHash,
    }, 'Agreement proposed successfully'));
  } catch (error) {
    console.error(`[${requestId}] proposeAgreement error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/agreements — every agreement my institute is a party to
export const listMyAgreements = async (req, res) => {
  try {
    const me = await getMyInstitute(req);
    if (!me?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Your institute has no on-chain wallet address' });
    }

    const contract = getEquivalencyAgreementContract();
    const ids = await contract.methods.getInstituteAgreements(me.walletAddress).call();
    console.log(ids)

    const agreements = await Promise.all(ids.map(id => hydrateAgreement(id, contract)));
    agreements.sort((a, b) => new Date(b.proposedAt) - new Date(a.proposedAt));

    return res.status(200).json(successResponse({ count: agreements.length, agreements }, 'Agreements fetched'));
  } catch (error) {
    console.error('[Agreements] listMyAgreements error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/agreements/:id — single agreement (must be a party)
export const getAgreementById = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid agreement id' });
  }

  try {
    const me = await getMyInstitute(req);
    const contract = getEquivalencyAgreementContract();
    const agreement = await hydrateAgreement(id, contract);

    const isParty = [agreement.instituteA.walletAddress, agreement.instituteB.walletAddress]
      .some(addr => addr === me?.walletAddress?.toLowerCase());
    if (!isParty) {
      return res.status(403).json({ success: false, message: 'You are not a party to this agreement' });
    }

    return res.status(200).json(successResponse({ agreement }, 'Agreement fetched'));
  } catch (error) {
    console.error('[Agreements] getAgreementById error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/agreements/:id/accept — countersign a proposed agreement
export const acceptAgreement = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid agreement id' });
  }

  try {
    const me = await getMyInstitute(req);
    if (!me?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Your institute has no on-chain wallet address' });
    }

    const contract = getEquivalencyAgreementContract();
    const raw = await contract.methods.getAgreement(id).call();

    if (raw.instituteB.toLowerCase() !== me.walletAddress.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Only the counterparty institute can accept this agreement' });
    }
    if (Number(raw.status) !== 0) {
      return res.status(409).json({ success: false, message: 'Agreement is not awaiting acceptance' });
    }

    const web3Instance = getWeb3();
    const accounts = await web3Instance.eth.getAccounts();

    const tx = await contract.methods
      .acceptAgreement(id, me.walletAddress)
      .send({ from: accounts[0], gas: 300000 });

    console.log(`[${requestId}] Agreement ${id} accepted: tx=${tx.transactionHash}`);

    return res.status(200).json(successResponse({ txHash: tx.transactionHash }, 'Agreement accepted — it is now active'));
  } catch (error) {
    console.error(`[${requestId}] acceptAgreement error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/agreements/:id/revoke — withdraw, decline, or terminate (either party, any time)
export const revokeAgreement = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid agreement id' });
  }

  try {
    const me = await getMyInstitute(req);
    if (!me?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Your institute has no on-chain wallet address' });
    }

    const contract = getEquivalencyAgreementContract();
    const raw = await contract.methods.getAgreement(id).call();

    const isParty = [raw.instituteA, raw.instituteB]
      .some(addr => addr.toLowerCase() === me.walletAddress.toLowerCase());
    if (!isParty) {
      return res.status(403).json({ success: false, message: 'You are not a party to this agreement' });
    }
    if (Number(raw.status) === 2) {
      return res.status(409).json({ success: false, message: 'Agreement is already revoked' });
    }

    const web3Instance = getWeb3();
    const accounts = await web3Instance.eth.getAccounts();

    const tx = await contract.methods
      .revokeAgreement(id, me.walletAddress)
      .send({ from: accounts[0], gas: 300000 });

    console.log(`[${requestId}] Agreement ${id} revoked by ${me.walletAddress}: tx=${tx.transactionHash}`);

    return res.status(200).json(successResponse({ txHash: tx.transactionHash }, 'Agreement revoked'));
  } catch (error) {
    console.error(`[${requestId}] revokeAgreement error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

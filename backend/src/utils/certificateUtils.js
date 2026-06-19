import crypto from 'crypto';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import Certificate from '../models/certificate.model.js';
import { contract } from './blockchain.js';
import * as pinata from './pinata.js';

/**
 * Resolve a certificate's transfer lineage (if any) into a display-friendly block:
 * which institute/course it replaced, what (if anything) later replaced it, and
 * which equivalency agreement justified the move. Returns null for certificates
 * that were never part of a credit transfer.
 */
export const resolveTransferLineage = async (certificate) => {
  if (!certificate.supersedes && !certificate.supersededBy && !certificate.transferAgreementId) {
    return null;
  }
  const ids = [certificate.supersedes, certificate.supersededBy].filter(Boolean);
  const docs = ids.length
    ? await Certificate.find({ certificateId: { $in: ids } })
        .select('certificateId institutionName courseName issuedDate revoked')
    : [];
  const map = new Map(docs.map(d => [d.certificateId, d]));
  const format = (id) => {
    const d = id && map.get(id);
    return d
      ? { certificateId: d.certificateId, institutionName: d.institutionName, courseName: d.courseName, issuedDate: d.issuedDate, revoked: d.revoked }
      : null;
  };
  return {
    agreementId: certificate.transferAgreementId,
    transferredFrom: format(certificate.supersedes), // the certificate this one replaced
    transferredTo: format(certificate.supersededBy),  // what later replaced this one, if anything
  };
};

/**
 * Generate a standardized certificate hash
 */
export const generateCertificateId = (uid, candidateName, courseName, orgName) => {
  const normalizedData = `${uid}|${candidateName.trim().toLowerCase()}|${courseName.trim().toLowerCase()}|${orgName.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(normalizedData).digest('hex');
};

/**
 * Same hash used by the main generateCertificate flow (certificate.controller.js),
 * duplicated here (instead of importing that controller) so lighter-weight callers
 * like transfer.controller.js don't have to pull in multer/PDF/email dependencies
 * just to compute a certificate id.
 */
export const generateCertificateHash = (
  referenceId,
  candidateName,
  courseName,
  institutionName,
  issuedDate = "") => {
  const normalizedData = `${referenceId}|${candidateName.trim().toLowerCase()}|${courseName.trim().toLowerCase()}|${institutionName.trim().toLowerCase()}|${issuedDate}`;
  return crypto.createHash('sha256').update(normalizedData).digest('hex');
};

/**
 * 4-character uppercase alphanumeric verification code (unambiguous character set).
 */
export const generateVerificationShortCode = () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomBytes = crypto.randomBytes(8);
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(randomBytes[i] % characters.length);
  }
  return result;
};

/**
 * Compute multiple hash formats for a PDF
 */
export const computePDFHashes = async (pdfBuffer) => {
  // Compute SHA-256 hash
  const sha256Hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  // Compute IPFS-compatible CID
  const bytes = await sha256.digest(pdfBuffer);
  const cid = CID.createV0(bytes);
  const cidHash = cid.toString();

  return { sha256Hash, cidHash };
};

/**
 * Upload certificate to IPFS and return hash
 */
export const uploadToIPFS = async (pdfBuffer, filename) => {
  // First compute our own CID
  const { sha256Hash, cidHash } = await computePDFHashes(pdfBuffer);

  // Upload to Pinata and get their CID
  const ipfsHash = await pinata.uploadBufferToPinata(pdfBuffer, filename);
  if (!ipfsHash) {
    throw new Error('Failed to upload to IPFS');
  }

  // Log the different hashes for debugging
  console.log('Hash comparison:', {
    sha256Hash,
    computedCID: cidHash,
    pinataCID: ipfsHash
  });

  // Return all hash formats
  return {
    sha256Hash,
    cidHash,
    ipfsHash  // This is Pinata's CID
  };
};

/**
 * Store certificate on blockchain
 */
export const storeOnBlockchain = async (certificateData) => {
  const { certificateId, uid, candidateName, courseName, orgName, ipfsHash } = certificateData;
  const accounts = await contract.methods.getAccounts();

  const tx = await contract.methods
    .generateCertificate(certificateId, uid, candidateName, courseName, orgName, ipfsHash)
    .send({ from: accounts[0], gas: 1000000 });

  return tx;
};

/**
 * Save certificate to database
 */
export const saveToDatabase = async (certificateData) => {
  const certificate = await Certificate.create(certificateData);
  return certificate;
};

/**
 * Find certificate by various hash formats
 */
export const findCertificateByHash = async (sha256Hash, cidHash) => {
  // Try exact matches first
  let certificate = await Certificate.findOne({ sha256Hash });
  if (certificate) return { certificate, matchType: 'exact_sha256' };

  certificate = await Certificate.findOne({ cidHash });
  if (certificate) return { certificate, matchType: 'exact_cid' };

  certificate = await Certificate.findOne({ ipfsHash: sha256Hash });
  if (certificate) return { certificate, matchType: 'exact_ipfs' };

  // Try partial matches
  const allCertificates = await Certificate.find({});

  for (const cert of allCertificates) {
    if (cert.sha256Hash?.includes(sha256Hash) || sha256Hash?.includes(cert.sha256Hash)) {
      return { certificate: cert, matchType: 'partial_sha256' };
    }
    if (cert.cidHash?.includes(cidHash) || cidHash?.includes(cert.cidHash)) {
      return { certificate: cert, matchType: 'partial_cid' };
    }
    if (cert.ipfsHash?.includes(sha256Hash) || sha256Hash?.includes(cert.ipfsHash)) {
      return { certificate: cert, matchType: 'partial_ipfs' };
    }
  }

  return { certificate: null, matchType: null };
};

/**
 * Validate CID format
 */
export const isValidCID = (cid) => {
  try {
    CID.parse(cid);
    return true;
  } catch {
    return false;
  }
};

/**
 * Format certificate response
 */
export const formatCertificateResponse = (certificate, matchType = null) => {
  return {
    status: 'VALID',
    certificate: {
      id: certificate._id,
      certificateId: certificate.certificateId,
      candidateName: certificate.candidateName,
      courseName: certificate.courseName,
      orgName: certificate.orgName,
      issuedAt: certificate.createdAt,
      source: certificate.source
    },
    hashes: {
      sha256Hash: certificate.sha256Hash,
      cidHash: certificate.cidHash,
      ipfsHash: certificate.ipfsHash
    },
    matchType,
    _links: {
      verification: `/api/certificates/${certificate.certificateId}/verify`,
      pdf: `/api/certificates/${certificate.certificateId}/pdf`,
      ipfs: `/api/certificates/external/${certificate.ipfsHash}`
    }
  };
};

// Add a new function to find certificates by any hash format
export const findCertificateByAnyHash = async (hash) => {
  // Try finding by any of the hash fields
  const certificate = await Certificate.findOne({
    $or: [
      { sha256Hash: hash },
      { cidHash: hash },
      { ipfsHash: hash },
      { certificateId: hash }
    ]
  });

  if (!certificate) {
    return null;
  }

  return certificate;
}; 
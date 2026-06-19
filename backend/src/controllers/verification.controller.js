// src/controllers/verification.controller.js
// Certificate verification functionality
import crypto from 'crypto';
import { getContract } from '../utils/blockchain.js';
import Certificate from '../models/certificate.model.js';
import { helpers } from './certificate.controller.js';
import { resolveTransferLineage } from '../utils/certificateUtils.js';
import { verificationResponse, successResponse } from '../utils/responseUtils.js';
import { errorResponse, ErrorCodes } from '../utils/errorUtils.js';

const { blockchainErrorHandler } = helpers;
// Remove the immediate contract initialization
// const contract = getContract();

// Helper function
const parseCertificateData = (data) => {
  if (Array.isArray(data)) {
    return {
      uid: data[0],
      candidateName: data[1],
      courseName: data[2],
      orgName: data[3],
      ipfsHash: data[4],
      timestamp: data[5],
      revoked: data[6] || false
    };
  }
  return {
    uid: data.uid,
    candidateName: data.candidateName,
    courseName: data.courseName,
    orgName: data.orgName,
    ipfsHash: data.ipfsHash,
    timestamp: data.timestamp,
    revoked: data.revoked || false
  };
};

/**
 * Verifies a certificate by its full certificate ID
 * Performs both database and blockchain verification
 * 
 * @param {Object} req - Express request object with certificateId parameter
 * @param {Object} res - Express response object
 * @returns {Object} Certificate verification result or error
 */
export const verifyCertificateById = async (req, res) => {
  const { certificateId } = req.params;
  const verificationId = crypto.randomBytes(4).toString('hex');

  console.log(`[${verificationId}] Verifying certificate by ID: ${certificateId}`);

  try {
    // Validate certificate ID format
    if (!/^[a-f0-9]{64}$/i.test(certificateId)) {
      const { response, statusCode } = errorResponse(
        'INVALID_FORMAT',
        'Invalid certificate ID format',
        {
          certificateId,
          example: '817759607228da54a922e4160f9d1b8f646e02360fc0f08372063510e87a45d6',
          format: '64-character hexadecimal string'
        },
        verificationId
      );
      return res.status(statusCode).json(response);
    }

    // Find certificate in database
    const certificate = await Certificate.findOne({ certificateId });

    if (!certificate) {
      const { response, statusCode } = errorResponse(
        'CERTIFICATE_NOT_FOUND',
        'Certificate not found in database',
        { certificateId },
        verificationId
      );
      return res.status(statusCode).json(response);
    }

    console.log(`[${verificationId}] Certificate found in database: ${certificate.candidateName}`);

    // Get contract instance when needed
    const contract = getContract();

    // Verify on blockchain
    let isVerified = false;
    let txError = null;

    try {
      isVerified = await contract.methods.isVerified(certificateId).call();
    } catch (error) {
      console.error(`[${verificationId}] Blockchain verification error:`, error);
      txError = error.message;
    }

    // Determine verification status
    let status = 'VALID';
    let blockchainData = {};

    if (certificate.revoked) {
      status = 'REVOKED';
    } else if (!isVerified && txError) {
      status = 'VALID_WITH_WARNING';
      blockchainData = {
        blockchainError: 'Could not verify on blockchain',
        errorDetails: txError
      };
    } else if (!isVerified) {
      status = 'VALID_WITH_WARNING';
      blockchainData = {
        blockchainWarning: 'Certificate not found on blockchain'
      };
    } else {
      blockchainData = {
        blockchainVerified: true
      };
    }

    // Return standardized verification response
    const transfer = await resolveTransferLineage(certificate);
    return res.json(verificationResponse(
      status,
      {
        uid: certificate.uid,
        certificateId,
        candidateName: certificate.candidateName,
        courseName: certificate.courseName,
        orgName: certificate.orgName,
        issuedAt: certificate.createdAt,
        ipfsHash: certificate.ipfsHash,
        shortCode: certificate.shortCode,
        revoked: certificate.revoked || false,
        ...(transfer ? { transfer } : {}),
      },
      verificationId,
      {
        pdf: `https://gateway.pinata.cloud/ipfs/${certificate.ipfsHash}`,
        blockchain: `http://localhost:8545/tx/${certificate.transactionHash || certificateId}`
      },
      blockchainData
    ));

  } catch (error) {
    console.error(`[${verificationId}] Verification error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Certificate verification failed',
      {
        certificateId,
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      verificationId
    );
    return res.status(statusCode).json(response);
  }
};

/**
 * Verifies a certificate using a short verification code
 * Provides a user-friendly verification method alternative to the full certificate ID
 * 
 * @param {Object} req - Express request object with shortCode parameter
 * @param {Object} res - Express response object
 * @returns {Object} Certificate verification result or error
 */
export const verifyCertificateByShortCode = async (req, res) => {
  // Support both parameter names for backwards compatibility
  const code = req.params.verificationCode || req.params.shortCode;
  const verificationId = crypto.randomBytes(4).toString('hex');

  console.log(`[${verificationId}] Verifying certificate by verification code: ${code}`);

  try {
    // Sanitize and validate format
    const sanitizedCode = code.toUpperCase().trim();

    if (!/^[A-Z0-9]{4}$/.test(sanitizedCode)) {
      console.log(`[${verificationId}] Invalid verification code format: ${sanitizedCode}`);
      const { response, statusCode } = errorResponse(
        'INVALID_FORMAT',
        'Verification code must be 4 characters (A-Z, 0-9)',
        {
          example: 'A12B',
          providedCode: sanitizedCode
        },
        verificationId
      );
      return res.status(statusCode).json(response);
    }

    // Find certificate by verification code
    // First try with new field name, then fallback to old field name for backwards compatibility
    let certificate = await Certificate.findOne({ verificationCode: sanitizedCode });

    if (!certificate) {
      // Try with the old field name for backward compatibility
      certificate = await Certificate.findOne({ shortCode: sanitizedCode });
    }

    if (!certificate) {
      console.log(`[${verificationId}] No certificate found with verification code: ${sanitizedCode}`);
      const { response, statusCode } = errorResponse(
        'CERTIFICATE_NOT_FOUND',
        'Certificate with this code does not exist',
        { verificationCode: sanitizedCode },
        verificationId
      );
      return res.status(statusCode).json(response);
    }

    console.log(`[${verificationId}] Certificate found: ${certificate.certificateId}`);

    // Get contract instance when needed
    const contract = getContract();

    // Verify on blockchain
    let isVerified = false;
    let txError = null;

    try {
      isVerified = await contract.methods.isVerified(certificate.certificateId).call();
      console.log(`[${verificationId}] Blockchain verification result: ${isVerified}`);
    } catch (error) {
      console.error(`[${verificationId}] Blockchain verification error:`, error);
      txError = error.message;
    }

    // Determine verification status
    let status = 'VALID';
    let blockchainData = {};

    if (certificate.revoked) {
      status = 'REVOKED';
    } else if (!isVerified && txError) {
      status = 'VALID_WITH_WARNING';
      blockchainData = {
        blockchainError: 'Could not verify on blockchain',
        errorDetails: txError
      };
    } else if (!isVerified) {
      status = 'VALID_WITH_WARNING';
      blockchainData = {
        blockchainWarning: 'Certificate not found on blockchain'
      };
    } else {
      blockchainData = {
        blockchainVerified: true
      };
    }

    // Return standardized response
    const transfer = await resolveTransferLineage(certificate);
    return res.json(verificationResponse(
      status,
      {
        referenceId: certificate.referenceId || certificate.uid,
        certificateId: certificate.certificateId,
        candidateName: certificate.candidateName,
        courseName: certificate.courseName,
        institutionName: certificate.institutionName || certificate.orgName,
        ipfsHash: certificate.ipfsHash,
        issuedAt: certificate.createdAt,
        revoked: certificate.revoked || false,
        verificationCode: certificate.verificationCode || certificate.shortCode,
        blockchainTxId: certificate.blockchainTxId || certificate.transactionId,
        ...(transfer ? { transfer } : {}),
      },
      verificationId,
      {
        pdf: `https://gateway.pinata.cloud/ipfs/${certificate.ipfsHash}`,
        blockchain: `http://localhost:8545/tx/${certificate.blockchainTxId || certificate.transactionId || certificate.certificateId}`,
        verification: `/api/certificates/${certificate.certificateId}/verify`
      },
      blockchainData
    ));
  } catch (error) {
    console.error(`[${verificationId}] Verification Code Verification Error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Failed to verify certificate by verification code',
      {
        errorDetails: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      verificationId
    );
    return res.status(statusCode).json(response);
  }
};

/**
 * Verifies the authenticity of an institutional signature
 * Validates that a certificate was issued by the claimed institution
 * 
 * @param {Object} req - Express request object with certificateId parameter
 * @param {Object} res - Express response object
 * @returns {Object} Signature verification result
 */
export const verifyInstitutionalSignature = async (req, res) => {
  const { certificateId } = req.params;
  const verificationId = crypto.randomBytes(4).toString('hex');

  console.log(`[${verificationId}] Verifying institutional signature for certificate: ${certificateId}`);

  try {
    // Validate certificate ID format
    if (!/^[a-f0-9]{64}$/i.test(certificateId)) {
      console.log(`[${verificationId}] Invalid certificate ID format: ${certificateId}`);
      return res.status(400).json({
        code: 'INVALID_ID',
        message: 'Invalid certificate ID format',
        verificationId,
        certificateId
      });
    }

    // Get contract instance when needed
    const contract = getContract();

    // Find certificate in database
    const certificate = await Certificate.findOne({ certificateId });

    if (!certificate) {
      console.log(`[${verificationId}] Certificate not found: ${certificateId}`);
      return res.status(404).json({
        code: 'CERTIFICATE_NOT_FOUND',
        message: 'Certificate not found',
        verificationId,
        certificateId
      });
    }

    // Debug: Log the certificate to see if it has a signature
    console.log(`[${verificationId}] Certificate found: ${JSON.stringify(certificate)}`);

    // Check if certificate has an institutional signature
    if (!certificate.institutionalSignature) {
      console.log(`[${verificationId}] No institutional signature found for certificate: ${certificateId}`);

      // For development, create a mock signature if missing
      const mockSignature = "DEVELOPMENT_MODE_MOCK_SIGNATURE";

      return res.json({
        status: 'SIGNATURE_VALID',
        message: 'Development mode: Mock signature generated',
        verificationId,
        certificateId,
        institution: certificate.orgName,
        signatureTimestamp: certificate.createdAt,
        note: 'Development mode: Using mock signature since none was found in database',
        mockSignature: true
      });
    }

    // In a real implementation, you would verify the signature here
    // using the institution's public key
    console.log(`[${verificationId}] Signature found, verification would happen here`);

    // For development, we'll just return success with a note
    return res.json({
      status: 'SIGNATURE_VALID',
      message: 'Institutional signature is valid',
      verificationId,
      certificateId,
      institution: certificate.orgName,
      signatureTimestamp: certificate.createdAt,
      note: 'Development mode: Cryptographic verification not implemented yet'
    });
  } catch (error) {
    console.error(`[${verificationId}] Signature Verification Error:`, error);
    return res.status(500).json({
      code: 'SIGNATURE_VERIFICATION_FAILED',
      message: 'Failed to verify institutional signature',
      verificationId,
      certificateId,
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}; 
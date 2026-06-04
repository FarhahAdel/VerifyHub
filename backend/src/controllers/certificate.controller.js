// src/controllers/certificate.controller.js
/* 
generateCertificateHash
generateCertificate
verifyCertificateById
verifyCertificatePdf
getCertificateMetadata
uploadExternalCertificate
searchByCID
getCertificateStats
getOrgCertificates


certificate.controller.js
  generateCertificate (main flow)
  getCertificateMetadata
  getCertificateStats
  getOrgCertificates
  handleCertificateWebhook
*/
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { generateCertificatePdf } from '../utils/pdfUtils.js';
import * as pinata from '../utils/pinata.js';
import { web3, contract, getWeb3, getContract, getStudentRegistryContract } from '../utils/blockchain.js';
import { PINATA_GATEWAY_BASE_URL } from '../constants.js';
import Certificate from '../models/certificate.model.js';
import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import { pdfUpload } from '../middlewares/fileUpload.middleware.js';
import multer from 'multer'; // Add multer import
import { computePDFHash, getStoredHashFromBlockchain } from '../utils/pdfHashUtils.js';
import {
  isValidCID,
  computePDFHashes,
  formatCertificateResponse,
  findCertificateByHash,
  uploadToIPFS,
  findCertificateByAnyHash
} from '../utils/certificateUtils.js';
import {
  successResponse,
  verificationResponse,
  warningResponse
} from '../utils/responseUtils.js';
import { errorResponse, ErrorCodes } from '../utils/errorUtils.js';
import { uploadBufferToPinata } from '../utils/pinata.js';
import { sendCertificateEmail } from '../utils/emailUtils.js';
import { estimateCost } from '../utils/ether.js'  // make sure this is at the top of the file

BigInt.prototype.toJSON = function () { return this.toString(); };
const BLOCK_EXPLORER_URL = 'http://localhost:8545'

// Helper functions
const generateCertificateHash = (
  referenceId,
  candidateName,
  courseName,
  institutionName,
  issuedDate = "") => {
  const normalizedData = `${referenceId}|${candidateName.trim().toLowerCase()}|${courseName.trim().toLowerCase()}|${institutionName.trim().toLowerCase()}|${issuedDate}`;
  return crypto.createHash('sha256').update(normalizedData).digest('hex');
};

const parseCertificateData = (data) => {
  if (Array.isArray(data)) {
    return {
      referenceId: data[0],
      candidateName: data[1],
      courseName: data[2],
      institutionName: data[3],
      issuedDate: data[4],
      institutionLogo: data[5],
      generationDate: data[6],
      blockchainTxId: data[7],
      cryptographicSignature: data[8],
      ipfsHash: data[9],
      timestamp: data[10],
      revoked: data[11] || false
    };
  }
  return {
    referenceId: data.referenceId || data.uid,
    candidateName: data.candidateName,
    courseName: data.courseName,
    institutionName: data.institutionName || data.orgName,
    issuedDate: data.issuedDate,
    institutionLogo: data.institutionLogo || data.collegeLogo,
    generationDate: data.generationDate,
    blockchainTxId: data.blockchainTxId || data.transactionId,
    cryptographicSignature: data.cryptographicSignature || data.digitalSignature,
    ipfsHash: data.ipfsHash,
    timestamp: data.timestamp,
    revoked: data.revoked || false
  };
};

const blockchainErrorHandler = (error, certificateId) => {
  console.error(`[${certificateId}] Blockchain Error:`, error);

  const isRevert = error.data?.startsWith('0x08c379a0');
  const statusCode = isRevert ? 404 : 500;
  const errorCodes = {
    'Certificate not found': 'NOT_FOUND',
    'Already revoked': 'REVOKED',
    default: 'BLOCKCHAIN_ERROR'
  };

  return {
    statusCode,
    error: {
      code: errorCodes[error.reason] || errorCodes.default,
      message: isRevert ? 'Blockchain operation reverted' : 'Blockchain operation failed',
      details: error.reason || error.message
    }
  };
};

/**
 * Generates a cryptographically secure 4-character alphanumeric verification code
 * Uses a more robust approach with better error handling
 * 
 * @returns {string} 4-character uppercase alphanumeric code (A-Z, 0-9)
 */
const generateVerificationShortCode = () => {
  try {
    console.log('[ShortCode] Generating new verification short code');
    // Use unambiguous characters (removing 0, O, 1, I, etc.)
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';

    // Generate 4 bytes of random data for better entropy
    const randomBytes = crypto.randomBytes(8);

    // Use 4 bytes to select characters from our set
    for (let i = 0; i < 4; i++) {
      // Extract a byte and get a modulo to pick from our character set
      const randomIndex = randomBytes[i] % characters.length;
      result += characters.charAt(randomIndex);
    }

    // Double-check the format is valid
    if (!/^[A-Z0-9]{4}$/.test(result)) {
      console.warn('[ShortCode] Generated invalid code format, retrying');
      return generateVerificationShortCode(); // Recursively retry
    }

    console.log(`[ShortCode] Generated code: ${result}`);
    return result;
  } catch (error) {
    console.error('[ShortCode] Error generating verification code:', error);
    // Return a fallback that's very unlikely to collide, but still notify us of the issue
    const fallback = `${Math.floor(Math.random() * 9000) + 1000}`.toUpperCase();
    console.warn(`[ShortCode] Using fallback code: ${fallback}`);
    return fallback;
  }
};

/**
 * Digitally signs certificate data using asymmetric cryptography
 * Creates an institutional signature for certificate authenticity verification
 * 
 * @param {Object} data - Certificate data to sign
 * @param {string} privateKey - Institution's private key in PEM format
 * @returns {string} Base64-encoded signature
 * @throws {Error} If signing fails
 */
const createInstitutionalSignature = (data, privateKey) => {
  console.log('[Signature] Creating institutional signature for certificate');

  if (!privateKey) {
    console.error('[Signature] Missing private key');
    throw new Error('Institution private key is required for signing');
  }

  try {
    // Create a deterministic representation of the data
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    console.log(`[Signature] Data to sign (truncated): ${dataString.substring(0, 100)}...`);

    // Create signature
    const sign = crypto.createSign('SHA256');
    sign.update(dataString);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');

    // Validate signature format
    if (!signature || signature.length < 20) {
      throw new Error('Generated signature is invalid or too short');
    }

    console.log(`[Signature] Signature created successfully (length: ${signature.length})`);
    return signature;
  } catch (error) {
    console.error('[Signature] Error creating signature:', error);
    throw new Error(`Signature creation failed: ${error.message}`);
  }
};

// Certificate Generation and Upload
export const generateCertificate = async (req, res) => {
  const startTime = Date.now();
  const generationId = crypto.randomBytes(8).toString('hex');
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 STARTING CERTIFICATE GENERATION [${generationId}]`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n📝 [${generationId}] STEP 1/5: Preparing metadata...`);
  
  try {
    const {
      referenceId,
      candidateName,
      courseName,
      institutionName: requestInstitutionName,
      issuedDate,
      institutionLogo: requestInstitutionLogo,
      validUntil,
      recipientEmail, // Extract recipient email
      recipientWalletAddress // Extract recipient wallet address (student wallet)
    } = req.body;

    // Auto-use institution from logged-in user (production-ready approach)
    const institutionName = req.user?.institutionName || requestInstitutionName || '';

    if (!institutionName) {
      return res.status(400).json({
        error: {
          code: 'MISSING_INSTITUTION',
          message: 'Institution name is required',
          details: 'Please update your profile with institution name'
        },
        meta: { generationId }
      });
    }

    // Auto-use logo from logged-in user's profile
    const institutionLogo = req.user?.institutionLogo || requestInstitutionLogo || '';
    console.log(`[${generationId}] Institution: ${institutionName}`);
    console.log(`[${generationId}] Using logo: ${institutionLogo || 'Default logo'}`);

    const metadata = {
      referenceId,
      candidateName,
      courseName,
      institutionName
    };

    const additionalMetadata = {
      issuedDate: issuedDate || new Date().toISOString(),
      institutionLogo,
      generationDate: new Date().toISOString(),
      blockchainTxId: "",
      cryptographicSignature: ""
    };

    // ======================
    // 1. Validation Phase
    // ======================
    const missingFields = Object.entries(metadata)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    // Also validate recipientEmail if provided
    if (recipientEmail && !recipientEmail.match(/\S+@\S+\.\S+/)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Invalid recipient email address',
          fields: ['recipientEmail'],
          documentation: 'https://api.yourservice.com/docs/certificates#required-fields'
        },
        meta: { generationId }
      });
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FIELDS',
          message: 'Required fields are missing',
          fields: missingFields,
          documentation: 'https://api.yourservice.com/docs/certificates#required-fields'
        },
        meta: { generationId }
      });
    }

    // ======================
    // 1b. Enrollment Check
    // ======================
    // The issuing institute can only generate a cert for a student enrolled in it.
    if (recipientWalletAddress) {
      try {
        const registry = getStudentRegistryContract();
        const instituteWallet = req.user?.walletAddress;

        if (!instituteWallet) {
          return res.status(400).json({
            error: { code: 'INSTITUTE_NO_WALLET', message: 'Institute account has no wallet address' },
            meta: { generationId }
          });
        }

        const isEnrolled = await registry.methods
          .isEnrolledIn(recipientWalletAddress, instituteWallet)
          .call();

        if (!isEnrolled) {
          return res.status(403).json({
            error: {
              code: 'STUDENT_NOT_ENROLLED',
              message: 'This student is not enrolled in your institute. They must enroll before you can issue them a certificate.',
            },
            meta: { generationId }
          });
        }
        console.log(`[${generationId}] Enrollment verified: student ${recipientWalletAddress} → institute ${instituteWallet}`);
      } catch (enrollErr) {
        // If StudentRegistry isn't deployed yet, log a warning but don't hard-block
        console.warn(`[${generationId}] Enrollment check failed (StudentRegistry may not be deployed):`, enrollErr.message);
      }
    }

    // ======================
    // 2. Certificate ID Generation
    // ======================
    const certificateId = generateCertificateHash(
      metadata.referenceId,
      candidateName,
      courseName,
      metadata.institutionName,
      additionalMetadata.issuedDate
    );

    // Generate verification code with retries and validation
    let verificationCode;
    let retries = 0;
    const maxRetries = 5;

    do {
      verificationCode = generateVerificationShortCode();
      console.log(`[${generationId}] Generated verification code: ${verificationCode}`);

      // Extra validation to ensure code format is correct
      if (!/^[A-Z0-9]{4}$/.test(verificationCode)) {
        console.error(`[${generationId}] Invalid verification code format: ${verificationCode}, regenerating...`);
        continue;
      }

      // Check if code already exists
      const codeExists = await Certificate.findOne({ verificationCode });
      if (!codeExists) break;

      console.log(`[${generationId}] Verification code ${verificationCode} already exists, regenerating...`);
      retries++;
    } while (retries < maxRetries);

    // Final verification that we have a valid code
    if (!verificationCode || !/^[A-Z0-9]{4}$/.test(verificationCode)) {
      console.error(`[${generationId}] Failed to generate valid verification code after ${retries} attempts`);
      return res.status(500).json({
        error: {
          code: 'VERIFICATION_CODE_GENERATION_FAILED',
          message: 'Failed to generate valid verification code',
          details: `Verification code generation failed after ${retries} attempts`
        },
        meta: { generationId }
      });
    }

    // Create digital signature using institute's secret key if available
    const instituteSignatureKey = req.user?.signatureKey || process.env.SIGNATURE_SECRET || 'veryhubsecretkey';
    const instituteId = req.user?.id || 'anonymous';

    // Include the institute's ID in the data to sign for better security
    const dataToSign = `${certificateId}|${metadata.referenceId}|${candidateName}|${metadata.institutionName}|${additionalMetadata.issuedDate}|${instituteId}`;
    additionalMetadata.cryptographicSignature = crypto.createHmac('sha256', instituteSignatureKey)
      .update(dataToSign)
      .digest('hex');

    console.log(`[${generationId}] Created cryptographic signature with institute key`);

    const certificateData = {
      certificateId,
      verificationCode,
      ...metadata,
      ...additionalMetadata,
      generationId,
      createdAt: new Date().toISOString()
    };

    // ======================
    // 3. Existence Checks
    // ======================
    try {
      // Get the actual contract instance using the getter function
      const contractInstance = getContract();

      const [blockchainExists, dbExists] = await Promise.all([
        contractInstance.methods.isVerified(certificateId).call(),
        Certificate.findOne({ certificateId }).lean()
      ]);

      if (blockchainExists) {
        return res.status(409).json({
          error: {
            code: 'CERTIFICATE_EXISTS',
            message: 'Certificate already exists on blockchain',
            resolution: [
              'If this is an update, revoke the existing certificate first',
              'Use different metadata for new certificate'
            ],
            existingRecord: dbExists || null,
            verificationUrl: `/api/certificates/${certificateId}/verify`
          },
          meta: certificateData
        });
      }
    } catch (checkError) {
      console.error(`[${generationId}] Existence check failed:`, checkError);
      // Don't fail if blockchain check fails, just log it and continue
      console.log(`[${generationId}] Continuing certificate generation despite blockchain check error`);
    }

    // ======================
    // 4. PDF Generation
    // ======================
    console.log(`\n📄 [${generationId}] STEP 2/4: Generating PDF...`);
    const pdfStartTime = Date.now();
    const outputDir = path.resolve('uploads');
    const pdfFilePath = path.join(outputDir, `cert_${generationId}.pdf`);

    // Check if developer page is requested (false by default)
    const includeDeveloperPage = req.query.developer === 'true';

    // Get certificate type (default to ACHIEVEMENT if not specified)
    const validCertTypes = ["ACHIEVEMENT", "COMPLETION", "PARTICIPATION"];
    let certificateType = (req.body.certificateType || "ACHIEVEMENT").toUpperCase();
    if (!validCertTypes.includes(certificateType)) {
      certificateType = "ACHIEVEMENT";
    }
    console.log(`[${generationId}] Creating certificate of type: ${certificateType}`);

    try {
      await fs.promises.mkdir(outputDir, { recursive: true });
      await generateCertificatePdf(
        pdfFilePath,
        metadata.referenceId,
        candidateName,
        courseName,
        metadata.institutionName,
        path.resolve('public/assets/logo.jpg'),
        verificationCode,
        `${req.protocol}://${req.get('host')}/api/certificates/code/${verificationCode}`,
        additionalMetadata.issuedDate,
        additionalMetadata.institutionLogo,
        additionalMetadata.cryptographicSignature,
        certificateId,
        includeDeveloperPage, // Pass the developer page flag
        validUntil, // Pass validUntil from the request
        additionalMetadata, // Pass all additional metadata
        certificateType // Pass the certificate type
      );
      const pdfTime = ((Date.now() - pdfStartTime) / 1000).toFixed(2);
      console.log(`✅ [${generationId}] PDF generated in ${pdfTime}s`);
    } catch (pdfError) {
      console.error(`❌ [${generationId}] PDF generation failed:`, pdfError.message);
      return res.status(500).json({
        error: {
          code: 'PDF_GENERATION_FAILED',
          message: 'Failed to create certificate PDF',
          details: pdfError.message,
          temporaryFile: pdfFilePath
        },
        meta: certificateData
      });
    }

    // ======================
    // 5. IPFS Upload
    // ======================
    console.log(`\n📤 [${generationId}] STEP 3/4: Uploading to IPFS...`);
    const ipfsStartTime = Date.now();
    let ipfsData;
    try {
      const pdfBuffer = await fs.promises.readFile(pdfFilePath);
      ipfsData = await uploadToIPFS(pdfBuffer, `cert_${generationId}.pdf`);
      const ipfsTime = ((Date.now() - ipfsStartTime) / 1000).toFixed(2);
      console.log(`✅ [${generationId}] IPFS upload completed in ${ipfsTime}s`);
      console.log(`   📦 IPFS Hash: ${ipfsData.ipfsHash}`);
    } catch (ipfsError) {
      console.error(`❌ [${generationId}] IPFS upload failed:`, ipfsError.message);
      return res.status(500).json({
        error: {
          code: 'IPFS_UPLOAD_FAILED',
          message: 'Failed to upload certificate to IPFS',
          details: ipfsError.message
        },
        meta: certificateData
      });
    }

    // ======================
    // 6. Blockchain Registration
    // ======================
    let tx = null; // Initialize tx variable outside the try-catch block
    // try {
    //   // Get the initialized instances
    //   const contractInstance = getContract();
    //   const web3Instance = getWeb3();

    //   const accounts = await web3Instance.eth.getAccounts();
    //   console.log(`[${generationId}] Using account for transaction: ${accounts[0]}`);

    //   tx = await contractInstance.methods
    //     .generateCertificate(
    //       certificateId,
    //       metadata.referenceId,
    //       candidateName,
    //       courseName,
    //       metadata.institutionName,
    //       additionalMetadata.issuedDate,
    //       additionalMetadata.institutionLogo,
    //       additionalMetadata.generationDate,
    //       "pending", // Placeholder for blockchainTxId, will be updated
    //       additionalMetadata.cryptographicSignature,
    //       ipfsData.ipfsHash
    //     )
    //     .send({ from: accounts[0], gas: 1000000 });

    //   certificateData.blockchainTx = tx.transactionHash;
    //   certificateData.blockchainTxId = tx.transactionHash;
    //   certificateData.blockNumber = tx.blockNumber;
    // } catch (blockchainError) {
    //   console.error(`[${generationId}] Blockchain registration failed:`, blockchainError);
    //   return res.status(500).json({
    //     error: {
    //       code: 'BLOCKCHAIN_REGISTRATION_FAILED',
    //       message: 'Failed to register certificate on blockchain',
    //       details: blockchainError.message
    //     },
    //     meta: certificateData
    //   });
    // }

    console.log(`\n⛓️  [${generationId}] STEP 4/4: Registering on blockchain...`);
    const blockchainStartTime = Date.now();
    
    try {
      // Get initialized web3 + contract
      const contractInstance = getContract();
      const web3Instance = getWeb3();

      // Pick your issuing account
      const accounts = await web3Instance.eth.getAccounts();

      // ─── A) Build the “dry” request for estimation ─────────────────────────────
      const txRequest = {
        to: contractInstance.options.address,
        data: contractInstance.methods
          .generateCertificate(
            certificateId,
            metadata.referenceId,
            candidateName,
            courseName,
            metadata.institutionName,
            additionalMetadata.issuedDate,
            additionalMetadata.institutionLogo,
            additionalMetadata.generationDate,
            "pending",                        // placeholder for blockchainTxId
            additionalMetadata.cryptographicSignature,
            ipfsData.ipfsHash
          )
          .encodeABI(),
        // value: 0,                       // omit or include if you ever send ETH
        // you can also override maxFeePerGas/maxPriorityFeePerGas here
      };

      // ─── B) Estimate & log gas + cost ──────────────────────────────────────────
      const cost = await estimateCost(txRequest);
      console.log(`   ⛽ Gas: ${cost.gasLimit} units | Cost: ${cost.costEth.toFixed(6)} ETH (₹${cost.costInr.toFixed(2)})`);

      // ─── C) Now actually sign & send the transaction ───────────────────────────
      tx = await contractInstance.methods
        .generateCertificate(
          certificateId,
          metadata.referenceId,
          candidateName,
          courseName,
          metadata.institutionName,
          additionalMetadata.issuedDate,
          additionalMetadata.institutionLogo,
          additionalMetadata.generationDate,
          "pending",
          additionalMetadata.cryptographicSignature,
          ipfsData.ipfsHash
        )
        .send({ from: accounts[0], gas: 1000000 });

      const blockchainTime = ((Date.now() - blockchainStartTime) / 1000).toFixed(2);
      console.log(`✅ [${generationId}] Blockchain registration completed in ${blockchainTime}s`);
      console.log(`   🔗 TX Hash: ${tx.transactionHash}`);
      console.log(`   📦 Block: ${tx.blockNumber}`);

      // Update your local data with the real tx info
      certificateData.blockchainTx = tx.transactionHash;
      certificateData.blockchainTxId = tx.transactionHash;
      certificateData.blockNumber = tx.blockNumber;

    } catch (blockchainError) {
      console.error(`❌ [${generationId}] Blockchain registration failed:`, blockchainError.message);
      return res.status(500).json({
        error: {
          code: 'BLOCKCHAIN_REGISTRATION_FAILED',
          message: 'Failed to register certificate on blockchain',
          details: blockchainError.message
        },
        meta: certificateData
      });
    }

    // ======================
    // 7. Database Save
    // ======================
    console.log(`\n💾 [${generationId}] STEP 5/5: Saving to database...`);
    try {
      const newCertificate = await Certificate.create({
        certificateId,
        verificationCode,
        referenceId: metadata.referenceId,
        candidateName,
        courseName,
        institutionName: metadata.institutionName,
        issuedDate: additionalMetadata.issuedDate,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        institutionLogo: additionalMetadata.institutionLogo,
        generationDate: additionalMetadata.generationDate,
        blockchainTxId: tx?.transactionHash || '',
        cryptographicSignature: additionalMetadata.cryptographicSignature,
        issuer: req.user?.id,
        recipientEmail: recipientEmail,
        recipientWalletAddress: recipientWalletAddress || null,
        ipfsHash: ipfsData.ipfsHash,
        sha256Hash: ipfsData.sha256Hash,
        cidHash: ipfsData.cidHash,
        blockchainTx: tx?.transactionHash,
        status: 'PENDING'
      });

      console.log(`✅ [${generationId}] Saved to database with ID: ${newCertificate._id}`);
    } catch (dbError) {
      console.error(`❌ [${generationId}] Database save failed:`, dbError.message);
      return res.status(500).json({
        error: {
          code: 'DATABASE_SAVE_FAILED',
          message: 'Failed to save certificate to database',
          details: dbError.message
        },
        meta: certificateData
      });
    }

    // ======================
    // 8b. Link Certificate to Student On-Chain
    // ======================
    if (recipientWalletAddress) {
      try {
        const registry = getStudentRegistryContract();
        const web3Instance = getWeb3();
        const accounts = await web3Instance.eth.getAccounts();
        await registry.methods
          .linkCertificate(recipientWalletAddress, certificateId)
          .send({ from: accounts[0], gas: 200000 });
        console.log(`[${generationId}] Certificate linked on-chain to student ${recipientWalletAddress}`);
      } catch (linkErr) {
        // Non-fatal: certificate is already on Certification.sol and in DB
        console.warn(`[${generationId}] linkCertificate on StudentRegistry failed (non-fatal):`, linkErr.message);
      }
    }

    // ======================
    // 9. Response and Cleanup
    // ======================
    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎉 [${generationId}] CERTIFICATE GENERATED SUCCESSFULLY`);
    console.log(`${'='.repeat(70)}`);
    console.log(`⏱️  Total Time: ${processingTime}s`);
    console.log(`📋 Certificate ID: ${certificateId}`);
    console.log(`🔐 Verification Code: ${verificationCode}`);
    console.log(`${'='.repeat(70)}\n`);

    // No immediate email sending - will be sent after blockchain confirmation
    let emailSent = false;
    if (recipientEmail) {
      console.log(`[${generationId}] Recipient email ${recipientEmail} stored for verification email after confirmation`);
    }

    // Return success response
    return res.status(201).json({
      success: true,
      status: "SUCCESS",
      message: "Certificate generated and registered successfully",
      data: {
        certificateId,
        referenceId: metadata.referenceId,
        verificationCode,
        sha256Hash: ipfsData.sha256Hash,
        ipfsHash: ipfsData.ipfsHash,
        cidHash: ipfsData.cidHash,
        transaction: {
          hash: certificateData.blockchainTx,
          block: certificateData.blockNumber,
          confirmations: 1
        },
        verificationUrl: `/api/certificates/${certificateId}/verify`,
        ipfsGateway: `${PINATA_GATEWAY_BASE_URL}/ipfs/${ipfsData.ipfsHash}`,
        emailSent, // Include whether email was sent
        computedHashes: {
          sha256Hash: ipfsData.sha256Hash,
          cidHash: ipfsData.cidHash,
          ipfsHash: ipfsData.ipfsHash
        }
      },
      _links: {
        self: `/api/certificates/generate`,
        certificate: `/api/certificates/${certificateId}`,
        verification: `/api/certificates/${certificateId}/verify`,
        shortCode: `/api/certificates/code/${verificationCode}`,
        transaction: `https://etherscan.io/tx/${certificateData.blockchainTx}`
      },
      meta: {
        generationId,
        processingTime: `${processingTime}s`,
        blockchain: {
          network: process.env.NETWORK || 'development',
          contract: process.env.CONTRACT_ADDRESS
        }
      }
    });
  } catch (error) {
    console.error(`[${generationId}] Critical failure:`, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected system failure',
        details: error.message
      },
      meta: { generationId }
    });
  }
};

export const uploadExternalCertificate = async (req, res) => {
  const uploadId = crypto.randomBytes(4).toString('hex');
  console.log(`[${uploadId}] Processing external certificate upload`);

  try {
    // Step 1: Validate request
    if (!req.file) {
      console.log(`[${uploadId}] No file uploaded`);
      return res.status(400).json({
        code: 'MISSING_FILE',
        message: 'No PDF file uploaded',
        uploadId
      });
    }

    // Validate required fields
    const {
      orgName,
      candidateName,
      courseName,
      validUntil, // New field for expiration
      certificateType = "", // New field for certificate type
      referenceId, // New field for custom reference ID
      recipientEmail, // New field for recipient email
      additionalFields = {} // For any other custom fields
    } = req.body;

    if (!orgName || !candidateName) {
      console.log(`[${uploadId}] Missing required fields: orgName=${orgName}, candidateName=${candidateName}`);
      return res.status(400).json({
        code: 'MISSING_FIELDS',
        message: 'Organization name and candidate name are required',
        uploadId
      });
    }

    // Also validate recipientEmail if provided
    if (recipientEmail && !recipientEmail.match(/\S+@\S+\.\S+/)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Invalid recipient email address',
          fields: ['recipientEmail']
        },
        meta: { uploadId }
      });
    }

    // Get certificate type (default to ACHIEVEMENT if not specified but provided)
    const validCertTypes = ["ACHIEVEMENT", "COMPLETION", "PARTICIPATION"];
    let finalCertificateType = (certificateType || "").toUpperCase();
    if (certificateType && !validCertTypes.includes(finalCertificateType)) {
      finalCertificateType = "ACHIEVEMENT";
    }
    if (certificateType) {
      console.log(`[${uploadId}] Certificate type: ${finalCertificateType}`);
    }

    // Step 2: Process file and compute hashes
    const pdfBuffer = req.file.buffer;
    console.log(`[${uploadId}] PDF received, size: ${pdfBuffer.length} bytes`);

    // Step 3: Upload to IPFS and get all hash formats
    let hashData;
    try {
      // Using your existing uploadToIPFS function that computes all three hash types
      hashData = await uploadToIPFS(pdfBuffer, req.file.originalname);
      const { sha256Hash, cidHash, ipfsHash } = hashData;
      console.log(`[${uploadId}] Computed hashes:`, { sha256Hash, cidHash, ipfsHash });
    } catch (ipfsError) {
      console.error(`[${uploadId}] IPFS upload failed:`, ipfsError);
      return res.status(500).json({
        code: 'IPFS_ERROR',
        message: 'Failed to upload to IPFS',
        uploadId,
        details: ipfsError.message
      });
    }

    // Step 4: Generate a unique certificate ID and UID
    const uid = crypto.randomBytes(16).toString('hex');
    const issuedDate = new Date().toISOString();
    const generationDate = new Date().toISOString();

    // Create digital signature
    const dataToSign = `${uid}|${candidateName}|${courseName || 'External Certificate'}|${orgName}|${issuedDate}`;
    const digitalSignature = crypto.createHmac('sha256', process.env.SIGNATURE_SECRET || 'veryhubsecretkey')
      .update(dataToSign)
      .digest('hex');

    const certificateId = generateCertificateHash(
      uid,
      candidateName,
      courseName || 'External Certificate',
      orgName,
      issuedDate
    );
    console.log(`[${uploadId}] Generated certificateId: ${certificateId}`);

    // Generate a short verification code
    const shortCode = generateVerificationShortCode();
    console.log(`[${uploadId}] Generated short code: ${shortCode}`);

    // Step 5: Store on blockchain
    let tx = null;
    try {
      // Get the initialized instances
      const contractInstance = getContract();
      const web3Instance = getWeb3();

      const accounts = await web3Instance.eth.getAccounts();
      console.log(`[${uploadId}] Using account for transaction: ${accounts[0]}`);

      tx = await contractInstance.methods
        .generateCertificate(
          certificateId,
          uid,
          candidateName,
          courseName || 'External Certificate',
          orgName,
          issuedDate,
          '', // collegeLogo
          generationDate,
          'pending', // transactionId - will update after transaction
          digitalSignature,
          hashData.ipfsHash
        )
        .send({ from: accounts[0], gas: 1000000 });

      console.log(`[${uploadId}] Certificate stored on blockchain: ${tx.transactionHash}`);
    } catch (blockchainError) {
      console.error(`[${uploadId}] Blockchain storage failed:`, blockchainError);
      return res.status(500).json({
        code: 'BLOCKCHAIN_ERROR',
        message: 'Failed to store certificate on blockchain',
        uploadId,
        details: blockchainError.message
      });
    }

    // Step 6: Save to database with all hash formats
    try {
      const newCertificate = await Certificate.create({
        certificateId,
        verificationCode: shortCode,
        uid, // Keep for backward compatibility
        referenceId: referenceId || uid, // Use provided referenceId or uid as fallback
        candidateName,
        courseName: courseName || 'External Certificate',
        institutionName: orgName, // Map orgName to institutionName
        issuedDate,
        validUntil: validUntil ? new Date(validUntil) : undefined, // Add the expiration date if provided
        generationDate,
        blockchainTxId: tx?.transactionHash,
        cryptographicSignature: digitalSignature, // Map digitalSignature to cryptographicSignature
        recipientEmail: recipientEmail, // Store recipient email
        ipfsHash: hashData.ipfsHash,
        sha256Hash: hashData.sha256Hash,
        cidHash: hashData.cidHash,
        blockchainTx: tx?.transactionHash,
        shortCode,
        source: 'external',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        additionalMetadata: additionalFields // Add any additional fields
      });

      console.log(`[${uploadId}] External certificate saved to database with ID: ${newCertificate._id}`);

      // No immediate email sending - will be sent after blockchain confirmation
      let emailSent = false;
      if (recipientEmail) {
        console.log(`[${uploadId}] Recipient email ${recipientEmail} stored for verification email after confirmation`);
      }

      // Step 7: Return success response
      return res.status(201).json({
        success: true,
        status: 'SUCCESS',
        message: 'Certificate uploaded and verified successfully',
        data: {
          certificateId,
          referenceId: referenceId || uid,
          shortCode,
          verificationCode: shortCode,
          verificationUrl: `/api/certificates/${certificateId}/verify`,
          ipfsGateway: `${PINATA_GATEWAY_BASE_URL}/ipfs/${hashData.ipfsHash}`,
          transaction: tx ? {
            hash: tx.transactionHash,
            block: tx.blockNumber
          } : null,
          emailSent: emailSent || false,
          computedHashes: {
            sha256Hash: hashData.sha256Hash,
            cidHash: hashData.cidHash,
            ipfsHash: hashData.ipfsHash
          },
          metadata: {
            candidateName,
            courseName: courseName || 'External Certificate',
            institutionName: orgName,
            certificateType: finalCertificateType || undefined,
            validUntil: validUntil || undefined
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (dbError) {
      console.error(`[${uploadId}] Database sync failed:`, dbError);

      // Even with DB failure, certificate is on blockchain, so return success with warning
      return res.status(201).json({
        success: true,
        status: 'SUCCESS_WITH_WARNING',
        message: 'Certificate uploaded but database sync failed',
        data: {
          certificateId,
          referenceId: referenceId || uid,
          shortCode,
          verificationCode: shortCode,
          verificationUrl: `/api/certificates/${certificateId}/verify`,
          ipfsGateway: `${PINATA_GATEWAY_BASE_URL}/ipfs/${hashData.ipfsHash}`,
          transaction: tx ? {
            hash: tx.transactionHash,
            block: tx.blockNumber
          } : null,
          emailSent: emailSent || false,
          computedHashes: {
            sha256Hash: hashData.sha256Hash,
            cidHash: hashData.cidHash,
            ipfsHash: hashData.ipfsHash
          },
          metadata: {
            candidateName,
            courseName: courseName || 'External Certificate',
            institutionName: orgName,
            certificateType: finalCertificateType || undefined,
            validUntil: validUntil || undefined
          }
        },
        warning: 'Certificate exists on blockchain but may not be retrievable from database',
        warningDetails: process.env.NODE_ENV === 'development' ? dbError.message : 'Database sync failed',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error(`[${uploadId}] Unhandled upload error:`, error);
    console.error(`[${uploadId}] Error stack:`, error.stack);

    return res.status(500).json({
      success: false,
      status: 'ERROR',
      code: 'UPLOAD_FAILED',
      message: 'Failed to store external certificate',
      requestId: uploadId,
      details: process.env.NODE_ENV === 'development' ? {
        error: error.message,
        stack: error.stack
      } : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// Certificate Verification
export const verifyCertificateById = async (req, res) => {
  const { certificateId } = req.params;
  const verificationId = crypto.randomBytes(4).toString('hex');

  console.log(`[${verificationId}] Verifying certificate by ID: ${certificateId}`);

  try {
    // First check if we have the certificate in our database
    const certificate = await Certificate.findOne({ certificateId });

    if (certificate) {
      console.log(`[${verificationId}] Certificate found in database: ${certificate._id}`);

      // Verify on blockchain
      try {
        const contractInstance = getContract();
        const blockchainData = await contractInstance.methods.getCertificate(certificateId).call();
        console.log(`[${verificationId}] Blockchain data:`, blockchainData);

        // Parse the blockchain data
        const parsedData = parseCertificateData(blockchainData);

        return res.json({
          status: 'VALID',
          certificate: {
            uid: certificate.uid,
            certificateId: certificate.certificateId,
            candidateName: certificate.candidateName,
            courseName: certificate.courseName,
            orgName: certificate.orgName,
            issuedDate: certificate.issuedDate,
            generationDate: certificate.generationDate,
            transactionId: certificate.transactionId,
            digitalSignature: certificate.digitalSignature,
            ipfsHash: certificate.ipfsHash,
            timestamp: parsedData.timestamp,
            revoked: parsedData.revoked
          },
          verificationId,
          _links: {
            pdf: `https://gateway.pinata.cloud/ipfs/${certificate.ipfsHash}`,
            blockchain: `${BLOCK_EXPLORER_URL}/tx/${certificate.blockchainTx}`
          }
        });
      } catch (blockchainError) {
        console.error(`[${verificationId}] Blockchain verification failed:`, blockchainError);

        // Still return the certificate but with a warning
        return res.status(200).json({
          status: 'VALID_WITH_WARNING',
          certificate: {
            uid: certificate.uid,
            certificateId: certificate.certificateId,
            candidateName: certificate.candidateName,
            courseName: certificate.courseName,
            orgName: certificate.orgName,
            issuedDate: certificate.issuedDate,
            generationDate: certificate.generationDate,
            transactionId: certificate.transactionId,
            digitalSignature: certificate.digitalSignature,
            ipfsHash: certificate.ipfsHash
          },
          verificationId,
          warning: 'Certificate found in database but blockchain verification failed',
          blockchainError: blockchainError.message,
          _links: {
            pdf: `https://gateway.pinata.cloud/ipfs/${certificate.ipfsHash}`
          }
        });
      }
    }

    // If not in database, try to verify directly on blockchain
    console.log(`[${verificationId}] Certificate not found in database, checking blockchain`);

    try {
      const contractInstance = getContract();
      const blockchainData = await contractInstance.methods.getCertificate(certificateId).call();
      console.log(`[${verificationId}] Certificate found on blockchain:`, blockchainData);

      // Parse the blockchain data
      const parsedData = parseCertificateData(blockchainData);

      return res.json({
        status: 'VALID',
        certificate: {
          ...parsedData,
          certificateId
        },
        verificationId,
        warning: 'Certificate verified on blockchain but not found in database',
        _links: {
          pdf: `https://gateway.pinata.cloud/ipfs/${parsedData.ipfsHash}`
        }
      });
    } catch (blockchainError) {
      console.error(`[${verificationId}] Blockchain verification failed:`, blockchainError);

      return res.status(404).json({
        status: 'INVALID',
        code: 'CERTIFICATE_NOT_FOUND',
        message: 'Certificate not found in database or blockchain',
        verificationId,
        certificateId
      });
    }
  } catch (error) {
    console.error(`[${verificationId}] Verification error:`, error);

    return res.status(500).json({
      status: 'ERROR',
      code: 'VERIFICATION_FAILED',
      message: 'Failed to verify certificate',
      verificationId,
      certificateId,
      details: error.message
    });
  }
};

export const verifyCertificatePdf = async (req, res) => {
  const verificationId = crypto.randomBytes(4).toString('hex');

  try {
    if (!req.file) {
      console.log(`[${verificationId}] No file uploaded for verification`);
      const { response, statusCode } = errorResponse(
        'MISSING_REQUIRED_FIELD',
        'No PDF file uploaded',
        null,
        verificationId
      );
      return res.status(statusCode).json(response);
    }

    // Get file info for logging
    const fileInfo = {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      fieldname: req.file.fieldname
    };

    console.log(`[${verificationId}] Verifying PDF: ${fileInfo.originalName} (${fileInfo.size} bytes), field: ${fileInfo.fieldname}`);

    // Compute hash of the uploaded PDF
    const pdfBuffer = req.file.buffer;
    const { sha256Hash, cidHash } = await computePDFHashes(pdfBuffer);

    console.log(`[${verificationId}] Computed SHA-256 hash: ${sha256Hash}`);
    console.log(`[${verificationId}] Computed CID hash: ${cidHash}`);

    // Find certificate using various match attempts
    let certificate = await findCertificateByHash(sha256Hash, cidHash);
    let matchType = 'exact_match';

    if (!certificate) {
      console.log(`[${verificationId}] No exact match found, trying partial matches`);
      const result = await findCertificateByAnyHash(sha256Hash, cidHash);
      if (result) {
        certificate = result.certificate;
        matchType = result.matchType;
      }
    }

    if (!certificate) {
      const { response, statusCode } = errorResponse(
        'CERTIFICATE_NOT_FOUND',
        'Certificate not found in our records',
        {
          computedHash: sha256Hash,
          cidHash
        },
        verificationId
      );
      return res.status(statusCode).json(response);
    }

    // Verification successful, determine status
    const status = certificate.revoked ? 'REVOKED' : 'VALID';

    // Return standardized verification response
    return res.json(verificationResponse(
      status,
      {
        certificateId: certificate.certificateId,
        candidateName: certificate.candidateName,
        courseName: certificate.courseName,
        orgName: certificate.orgName,
        issuedAt: certificate.createdAt,
        ipfsHash: certificate.ipfsHash,
        shortCode: certificate.shortCode
      },
      verificationId,
      {
        verification: `/api/certificates/${certificate.certificateId}/verify`,
        pdf: `/api/certificates/${certificate.certificateId}/pdf`,
        blockchain: `/api/certificates/${certificate.certificateId}/blockchain`
      },
      {
        computedHash: sha256Hash,
        cidHash,
        matchType
      }
    ));
  } catch (error) {
    console.error(`[${verificationId}] PDF Verification Error:`, error);
    const { response, statusCode } = errorResponse(
      'VERIFICATION_FAILED',
      'Failed to verify certificate PDF',
      { errorDetails: error.message },
      verificationId
    );
    return res.status(statusCode).json(response);
  }
};

export const debugPdfVerification = async (req, res) => {
  const debugId = crypto.randomBytes(4).toString('hex');

  try {
    if (!req.file) {
      const { response, statusCode } = errorResponse(
        'MISSING_REQUIRED_FIELD',
        'No PDF file uploaded',
        null,
        debugId
      );
      return res.status(statusCode).json(response);
    }

    // Get file info
    const fileInfo = {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    };

    console.log(`[${debugId}] Debugging PDF: ${fileInfo.originalName} (${fileInfo.size} bytes)`);

    // Step 1: Compute hash of the uploaded PDF
    const pdfBuffer = req.file.buffer;
    const { sha256Hash, cidHash } = await computePDFHashes(pdfBuffer);

    console.log(`[${debugId}] Computed SHA-256 hash: ${sha256Hash}`);
    console.log(`[${debugId}] Computed CID hash: ${cidHash}`);

    // Step 2: Get all certificates from the database for comparison
    const allCertificates = await Certificate.find({});
    console.log(`[${debugId}] Found ${allCertificates.length} certificates in database`);

    // Step 3: Check for matches
    const matches = [];

    // Check for exact matches
    for (const cert of allCertificates) {
      if (cert.sha256Hash === sha256Hash) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'exact_sha256',
          hash: cert.sha256Hash
        });
      }

      if (cert.cidHash === cidHash) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'exact_cid',
          hash: cert.cidHash
        });
      }

      if (cert.ipfsHash === sha256Hash) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'exact_ipfs_sha256',
          hash: cert.ipfsHash
        });
      }

      if (cert.ipfsHash === cidHash) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'exact_ipfs_cid',
          hash: cert.ipfsHash
        });
      }
    }

    // Check for partial matches
    for (const cert of allCertificates) {
      if (cert.sha256Hash && (
        cert.sha256Hash.includes(sha256Hash) ||
        sha256Hash.includes(cert.sha256Hash)
      )) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'partial_sha256',
          hash: cert.sha256Hash
        });
      }

      if (cert.cidHash && cidHash && (
        cert.cidHash.includes(cidHash) ||
        cidHash.includes(cert.cidHash)
      )) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'partial_cid',
          hash: cert.cidHash
        });
      }

      if (cert.ipfsHash && (
        cert.ipfsHash.includes(sha256Hash) ||
        sha256Hash.includes(cert.ipfsHash)
      )) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'partial_ipfs_sha256',
          hash: cert.ipfsHash
        });
      }

      if (cert.ipfsHash && cidHash && (
        cert.ipfsHash.includes(cidHash) ||
        cidHash.includes(cert.ipfsHash)
      )) {
        matches.push({
          certificateId: cert.certificateId,
          matchType: 'partial_ipfs_cid',
          hash: cert.ipfsHash
        });
      }
    }

    // Check for certificateId matches
    if (/^[a-f0-9]{64}$/i.test(sha256Hash)) {
      const certById = allCertificates.find(cert => cert.certificateId === sha256Hash);
      if (certById) {
        matches.push({
          certificateId: certById.certificateId,
          matchType: 'certificate_id',
          hash: certById.ipfsHash
        });
      }
    }

    // Return debug information
    return res.status(200).json(successResponse({
      fileInfo,
      hashes: {
        sha256Hash,
        cidHash
      },
      matches
    }, 'PDF verification debug information', 200));

  } catch (error) {
    console.error(`[${debugId}] Debug Error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Failed to process PDF for debugging',
      { errorDetails: error.message },
      debugId
    );
    return res.status(statusCode).json(response);
  }
};

// Certificate Retrieval
export const getCertificatePDF = async (req, res) => {
  const { certificateId } = req.params;
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    // 1. Validate certificate ID format
    if (!/^[a-f0-9]{64}$/i.test(certificateId)) {
      const { response, statusCode } = errorResponse(
        'INVALID_FORMAT',
        'Certificate ID must be 64-character hexadecimal string',
        {
          certificateId,
          example: '817759607228da54a922e4160f9d1b8f646e02360fc0f08372063510e87a45d6'
        },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // 2. Fetch certificate data from blockchain
    const contractInstance = getContract();
    const certificateData = await contractInstance.methods.getCertificate(certificateId).call();

    // 3. Extract IPFS hash with multiple fallbacks
    const ipfsHash = (
      certificateData[4] ||
      certificateData.ipfsHash ||
      certificateData._ipfs_hash ||
      certificateData.ipfs
    )?.trim();

    // 4. Validate CID existence
    if (!ipfsHash) {
      const { response, statusCode } = errorResponse(
        'NOT_FOUND',
        'No IPFS hash associated with certificate',
        {
          certificateId,
          resolution: 'Regenerate certificate with valid PDF upload'
        },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // 5. Strict CID validation
    try {
      const cid = CID.parse(ipfsHash);
      console.log('Valid CID:', {
        version: cid.version,
        codec: cid.code,
        type: cid.type
      });
    } catch (e) {
      const { response, statusCode } = errorResponse(
        'INVALID_FORMAT',
        'Malformed IPFS Content Identifier',
        {
          certificateId,
          ipfsHash,
          documentation: 'https://docs.ipfs.tech/concepts/content-addressing/'
        },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // 6. Permanent redirect with security headers
    const pdfUrl = `${PINATA_GATEWAY_BASE_URL}/${ipfsHash}`;
    res
      .set({
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
        'CDN-Cache-Control': 'public, max-age=31536000',
        'Content-Security-Policy': "default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Link': `<${pdfUrl}>; rel="canonical"` // SEO optimization
      })
      .redirect(301, pdfUrl); // Permanent redirect

  } catch (error) {
    console.error(`[${requestId}] PDF Retrieval Error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Failed to retrieve certificate PDF',
      {
        certificateId,
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      requestId
    );
    return res.status(statusCode).json(response);
  }
};

export const getCertificateMetadata = async (req, res) => {
  const { certificateId } = req.params;
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    // Validate certificate ID
    if (!/^[a-f0-9]{64}$/i.test(certificateId)) {
      const { response, statusCode } = errorResponse(
        'INVALID_FORMAT',
        'Certificate ID must be 64-character hexadecimal string',
        {
          certificateId,
          example: '817759607228da54a922e4160f9d1b8f646e02360fc0f08372063510e87a45d6'
        },
        requestId
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
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Return formatted certificate data
    return res.json(successResponse({
      certificateId: certificate.certificateId,
      candidateName: certificate.candidateName,
      courseName: certificate.courseName,
      orgName: certificate.orgName,
      issueDate: certificate.createdAt,
      hashes: {
        ipfsHash: certificate.ipfsHash,
        sha256Hash: certificate.sha256Hash,
        cidHash: certificate.cidHash
      },
      shortCode: certificate.shortCode,
      status: certificate.revoked ? 'REVOKED' : 'VALID',
      _links: {
        verification: `/api/certificates/${certificateId}/verify`,
        shortCodeVerification: `/api/certificates/code/${certificate.shortCode}`,
        pdf: `/api/certificates/${certificateId}/pdf`,
        blockchain: `/api/certificates/${certificateId}/blockchain`
      }
    }, 'Certificate metadata retrieved successfully'));
  } catch (error) {
    console.error(`[${requestId}] Metadata Retrieval Error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Failed to retrieve certificate metadata',
      {
        certificateId,
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      requestId
    );
    return res.status(statusCode).json(response);
  }
};

export const searchByCID = async (req, res) => {
  const { cid } = req.params;
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    // Try to find the certificate by any hash format
    const certificate = await findCertificateByAnyHash(cid);

    if (!certificate) {
      const { response, statusCode } = errorResponse(
        'CERTIFICATE_NOT_FOUND',
        'No certificate found with this identifier',
        {
          searchValue: cid,
          tip: 'Try searching with the IPFS hash (starts with Qm) or the certificate ID'
        },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Verify on blockchain
    let isValid = false;
    let blockchainError = null;

    try {
      const contractInstance = getContract();
      isValid = await contractInstance.methods.isVerified(certificate.certificateId).call();
    } catch (error) {
      console.error(`[${requestId}] Blockchain verification error:`, error);
      blockchainError = error.message;
    }

    // Create response based on verification result
    const status = certificate.revoked ? 'REVOKED' : (isValid ? 'VALID' : 'VALID_WITH_WARNING');
    const blockchainData = blockchainError ?
      { blockchainError, errorDetails: blockchainError } :
      { blockchainVerified: isValid };

    // Return formatted response
    return res.json(verificationResponse(
      status,
      {
        certificateId: certificate.certificateId,
        candidateName: certificate.candidateName,
        courseName: certificate.courseName,
        orgName: certificate.orgName,
        issuedAt: certificate.createdAt,
        ipfsHash: certificate.ipfsHash,
        shortCode: certificate.shortCode,
        revoked: certificate.revoked || false
      },
      requestId,
      {
        verification: `/api/certificates/${certificate.certificateId}/verify`,
        pdf: `https://gateway.pinata.cloud/ipfs/${certificate.ipfsHash}`,
        blockchain: `http://localhost:8545/tx/${certificate.transactionHash || certificate.certificateId}`
      },
      blockchainData
    ));

  } catch (error) {
    console.error(`[${requestId}] Search Error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Failed to search for certificate',
      {
        searchValue: cid,
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      requestId
    );
    return res.status(statusCode).json(response);
  }
};

// Certificate Management
export const getCertificateStats = async (req, res) => {
  try {
    if (statsCache && statsCache.has('latest')) {
      const { timestamp, data } = statsCache.get('latest');
      if (Date.now() - timestamp < 60000) { // 1 minute cache
        return res.json(data);
      }
    }

    const stats = await Certificate.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          internal: { $sum: { $cond: [{ $certificateId: { $exists: true } }, 1, 0] } },
          external: { $sum: { $cond: [{ $cid: { $exists: true } }, 1, 0] } },
          organizations: { $addToSet: "$orgName" }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          internal: 1,
          external: 1,
          organizations: { $size: "$organizations" }
        }
      }
    ]);

    const result = stats[0] || { total: 0, internal: 0, external: 0, organizations: 0 };
    if (statsCache) {
      statsCache.set('latest', {
        timestamp: Date.now(),
        data: result
      });
    }

    res.json(result);

  } catch (error) {
    res.status(500).json({
      code: 'STATS_ERROR',
      message: 'Failed to fetch statistics',
      details: error.message
    });
  }
};

export const getOrgCertificates = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  // Support both parameter names for backwards compatibility
  const institutionName = req.params.institutionName || req.params.orgName;
  const limit = parseInt(req.query.limit) || 10;

  try {
    // Query using both field names for backward compatibility
    const query = {
      $or: [
        { institutionName: new RegExp(institutionName, 'i') },
        { orgName: new RegExp(institutionName, 'i') }
      ]
    };

    const [certificates, count] = await Promise.all([
      Certificate.find(query)
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Certificate.countDocuments(query)
    ]);

    res.json({
      success: true,
      status: "SUCCESS",
      message: "Institution certificates retrieved",
      data: {
        institution: institutionName,
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        certificates: certificates.map(cert => ({
          certificateId: cert.certificateId || cert.cid,
          candidateName: cert.candidateName,
          courseName: cert.courseName,
          issuedDate: cert.createdAt,
          verificationCode: cert.verificationCode || cert.shortCode,
          status: cert.revoked ? "REVOKED" : "VALID"
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      code: 'INSTITUTION_CERTS_ERROR',
      message: 'Failed to fetch institution certificates',
      details: {
        institutionName,
        errorDetails: error.message
      },
      timestamp: new Date().toISOString()
    });
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

    // Check if certificate has an institutional signature
    if (!certificate.institutionalSignature) {
      console.log(`[${verificationId}] No institutional signature found for certificate: ${certificateId}`);
      return res.status(400).json({
        code: 'NO_SIGNATURE',
        message: 'Certificate does not have an institutional signature',
        verificationId,
        certificateId
      });
    }

    // In a real implementation, you would verify the signature here
    // using the institution's public key
    console.log(`[${verificationId}] Signature found, verification would happen here`);

    // TODO: Implement actual signature verification
    // This would require:
    // 1. Retrieving the institution's public key
    // 2. Recreating the data that was signed
    // 3. Verifying the signature against the data

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

/**
 * Simplified PDF serving function that primarily redirects to IPFS
 * Still handles download vs. view options
 */
export const serveCertificatePDF = async (req, res) => {
  const { certificateId } = req.params;
  const requestId = crypto.randomBytes(4).toString('hex');
  const isDownload = req.query.download === 'true';

  console.log(`[${requestId}] PDF request for ${certificateId}, download=${isDownload}`);

  try {
    // Validate the certificate ID
    if (!/^[a-f0-9]{64}$/i.test(certificateId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid certificate ID format',
        details: 'Certificate ID must be a 64-character hexadecimal string'
      });
    }

    // Find the certificate in the database
    const certificate = await Certificate.findOne({ certificateId });
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found',
        certificateId
      });
    }

    if (!certificate.ipfsHash) {
      return res.status(404).json({
        success: false,
        message: 'Certificate has no associated PDF',
        certificateId
      });
    }

    // Create direct IPFS URL
    const ipfsUrl = `${PINATA_GATEWAY_BASE_URL}/${certificate.ipfsHash}`;
    console.log(`[${requestId}] Redirecting to IPFS: ${ipfsUrl}`);

    if (isDownload) {
      // For downloads, provide a filename suggestion using Content-Disposition
      const filename = `certificate-${certificate.shortCode || certificate.certificateId.substring(0, 8)}.pdf`;

      // Simple HTML that automatically triggers download
      return res.set({
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache'
      }).send(`
        <html>
          <head>
            <title>Downloading Certificate</title>
            <script>
              window.onload = function() {
                const link = document.createElement('a');
                link.href = "${ipfsUrl}";
                link.download = "${filename}";
                document.body.appendChild(link);
                link.click();
                setTimeout(function() {
                  window.close();
                }, 1000);
              }
            </script>
          </head>
          <body>
            <p>Your download should start automatically. If not, <a href="${ipfsUrl}" download="${filename}">click here</a>.</p>
          </body>
        </html>
      `);
    } else {
      // For viewing, just redirect to the IPFS gateway
      return res.redirect(ipfsUrl);
    }

  } catch (error) {
    console.error(`[${requestId}] Error serving PDF:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to serve certificate PDF',
      details: error.message
    });
  }
};

// Get certificates by recipient email
export const getCertificatesByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const requestId = crypto.randomBytes(4).toString('hex');

    // Validate email format
    if (!email || !email.match(/\S+@\S+\.\S+/)) {
      const { response, statusCode } = errorResponse(
        'INVALID_EMAIL',
        'Invalid email format',
        { email },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Find certificates by recipient email
    const certificates = await Certificate.find({ recipientEmail: email })
      .sort({ createdAt: -1 }) // Sort by newest first
      .lean();

    if (!certificates || certificates.length === 0) {
      return res.status(200).json(successResponse({
        certificates: [],
        count: 0
      }, 'No certificates found for this email'));
    }

    // Format certificates for response
    const formattedCertificates = certificates.map(cert => ({
      certificateId: cert.certificateId,
      verificationCode: cert.verificationCode,
      candidateName: cert.candidateName,
      courseName: cert.courseName,
      institutionName: cert.institutionName,
      issuedDate: cert.issuedDate,
      validUntil: cert.validUntil,
      ipfsHash: cert.ipfsHash,
      status: cert.status,
      createdAt: cert.createdAt,
      _links: {
        verification: `/api/certificates/code/${cert.verificationCode}`,
        pdf: `${PINATA_GATEWAY_BASE_URL}/${cert.ipfsHash}`
      }
    }));

    return res.status(200).json(successResponse({
      certificates: formattedCertificates,
      count: formattedCertificates.length
    }, 'Certificates retrieved successfully'));
  } catch (error) {
    console.error('Error fetching certificates by email:', error);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch certificates',
        details: error.message
      }
    });
  }
};

// Export helper functions for use in other controllers
export const helpers = {
  generateCertificateHash,
  blockchainErrorHandler,
  generateVerificationShortCode,
  createInstitutionalSignature
};
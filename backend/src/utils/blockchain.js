import Web3 from 'web3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { sendConfirmedCertificateEmails, sendCertificateEmail, getAppBaseUrl } from './emailUtils.js';
import { PINATA_GATEWAY_BASE_URL } from '../constants.js';
import Certificate from '../models/certificate.model.js';

dotenv.config();

// ========== ENHANCEMENT 1: Centralized configuration ==========
const config = {
  providerURL: process.env.PROVIDER_URL || 'http://localhost:8545',
  contractPaths: {
    abi: path.join(process.cwd(), 'build/contracts/Certification.json'),
    studentRegistryAbi: path.join(process.cwd(), 'build/contracts/StudentRegistry.json'),
    equivalencyAgreementAbi: path.join(process.cwd(), 'build/contracts/EquivalencyAgreement.json'),
    creditTransferEvaluationAbi: path.join(process.cwd(), 'build/contracts/CreditTransferEvaluation.json'),
    deployment: path.join(process.cwd(), 'build/contracts/deployment_config.json')
  },
  healthCheck: {
    retries: 3,
    retryDelay: 2000
  }
};

// ========== ENHANCEMENT 2: Better initialization handling ==========
let isInitialized = false;
let contract = null;
let web3 = null;
let studentRegistryContract = null;
let equivalencyAgreementContract = null;
let creditTransferEvaluationContract = null;

// ========== ENHANCEMENT 3: Robust ABI validation ==========
const verifyABI = (abi) => {
  const requiredMethods = {
    getCertificate: {
      inputs: [{ type: 'string' }],
      outputs: [
        { type: 'string' }, { type: 'string' }, { type: 'string' },
        { type: 'string' }, { type: 'string' }, { type: 'uint256' },
        { type: 'bool' }
      ]
    }
  };

  Object.entries(requiredMethods).forEach(([methodName, signature]) => {
    const method = abi.find(m =>
      m.name === methodName &&
      m.type === 'function' &&
      m.inputs?.every((input, i) => input.type === signature.inputs[i]?.type)
    );

    if (!method) {
      throw new Error(`Missing required method: ${methodName}`);
    }
  });
};

// ========== ENHANCEMENT 4: Async initialization with retries ==========
export const initializeBlockchain = async (retries = config.healthCheck.retries) => {
  try {
    web3 = new Web3(config.providerURL);

    // Load contract artifacts
    const { abi } = JSON.parse(fs.readFileSync(config.contractPaths.abi, 'utf8'));
    const deploymentConfig = JSON.parse(fs.readFileSync(config.contractPaths.deployment, 'utf8'));
    const { Certification: address } = deploymentConfig;

    verifyABI(abi);
    contract = new web3.eth.Contract(abi, address);

    // Load StudentRegistry if deployed
    if (deploymentConfig.Certification && fs.existsSync(config.contractPaths.abi)) {
      const { abi: srAbi } = JSON.parse(fs.readFileSync(config.contractPaths.abi, 'utf8'));
      studentRegistryContract = new web3.eth.Contract(srAbi, deploymentConfig.Certification);
      console.log('Certification initialized at:', deploymentConfig.Certification);
    } else {
      console.warn('Certification not yet deployed — run: truffle migrate (migration 3)');
    }

    if (deploymentConfig.StudentRegistry && fs.existsSync(config.contractPaths.studentRegistryAbi)) {
      const { abi: srAbi } = JSON.parse(fs.readFileSync(config.contractPaths.studentRegistryAbi, 'utf8'));
      studentRegistryContract = new web3.eth.Contract(srAbi, deploymentConfig.StudentRegistry);
      console.log('StudentRegistry initialized at:', deploymentConfig.StudentRegistry);
    } else {
      console.warn('StudentRegistry not yet deployed — run: truffle migrate (migration 3)');
    }

    if (deploymentConfig.EquivalencyAgreement && fs.existsSync(config.contractPaths.equivalencyAgreementAbi)) {
      const { abi: eaAbi } = JSON.parse(fs.readFileSync(config.contractPaths.equivalencyAgreementAbi, 'utf8'));
      equivalencyAgreementContract = new web3.eth.Contract(eaAbi, deploymentConfig.EquivalencyAgreement);
      console.log('EquivalencyAgreement initialized at:', deploymentConfig.EquivalencyAgreement);
    } else {
      console.warn('EquivalencyAgreement not yet deployed — run: truffle migrate (migration 4)');
    }

    if (deploymentConfig.CreditTransferEvaluation && fs.existsSync(config.contractPaths.creditTransferEvaluationAbi)) {
      const { abi: cteAbi } = JSON.parse(fs.readFileSync(config.contractPaths.creditTransferEvaluationAbi, 'utf8'));
      creditTransferEvaluationContract = new web3.eth.Contract(cteAbi, deploymentConfig.CreditTransferEvaluation);
      console.log('CreditTransferEvaluation initialized at:', deploymentConfig.CreditTransferEvaluation);
    } else {
      console.warn('CreditTransferEvaluation not yet deployed — run: truffle migrate (migration 5)');
    }

    // Verify deployment
    const code = await web3.eth.getCode(address);
    if (code === '0x') throw new Error('Contract not deployed');

    isInitialized = true;
    console.log('Blockchain initialized successfully');
    return true;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying initialization... (${retries} left)`);
      await new Promise(res => setTimeout(res, config.healthCheck.retryDelay));
      return initializeBlockchain(retries - 1);
    }

    console.error('Blockchain initialization failed:', error.message);
    isInitialized = false;
    return false;
  }
};
// ========== ENHANCEMENT 5: Status-aware getters ==========
export const getWeb3 = () => {
  if (!web3) throw new Error('Web3 not initialized');
  return web3;
};

export const getContract = () => {
  if (!contract) throw new Error('Contract not initialized');
  return contract;
};

export const getStudentRegistryContract = () => {
  if (!studentRegistryContract) throw new Error('StudentRegistry contract not initialized. Run: truffle migrate (migration 3)');
  return studentRegistryContract;
};

export const getEquivalencyAgreementContract = () => {
  if (!equivalencyAgreementContract) throw new Error('EquivalencyAgreement contract not initialized. Run: truffle migrate (migration 4)');
  return equivalencyAgreementContract;
};

export const getCreditTransferEvaluationContract = () => {
  if (!creditTransferEvaluationContract) throw new Error('CreditTransferEvaluation contract not initialized. Run: truffle migrate (migration 5)');
  return creditTransferEvaluationContract;
};

// ========== ENHANCEMENT 6: Comprehensive health check ==========
export const checkBlockchainStatus = async () => {
  try {
    if (!isInitialized) {
      return {
        connected: false,
        initialized: false,
        error: 'Blockchain client not initialized'
      };
    }

    // Node connectivity check
    const blockNumber = await web3.eth.getBlockNumber();

    // Contract deployment check
    const code = await web3.eth.getCode(contract.options.address);

    return {
      connected: true,
      initialized: true,
      nodeUrl: config.providerURL,
      contractAddress: contract.options.address,
      latestBlock: blockNumber,
      contractDeployed: code !== '0x'
    };
  } catch (error) {
    return {
      connected: false,
      initialized: isInitialized,
      error: error.message,
      nodeUrl: config.providerURL,
      contractAddress: contract?.options.address || 'N/A'
    };
  }
};

// ========== Backward compatibility ==========
// Maintain original export structure but also ensure initialization
// Don't directly export null values
export { getWeb3 as web3, getContract as contract };

// Initialize blockchain connection by default
initializeBlockchain().catch(err => {
  console.error('Failed to initialize blockchain on startup:', err.message);
});

// ========== NEW FEATURE: Certificate verification event listener ==========
/**
 * Sets up a certificate verification system
 * Uses polling instead of subscriptions for maximum compatibility
 */
let blockchainIntervals = []; // Track blockchain-specific intervals

export const startCertificateConfirmationListener = async () => {
  try {
    if (!isInitialized || !contract) {
      console.error('Cannot start listener: Blockchain not initialized');
      return false;
    }

    // Import mongoose models - safely
    let Certificate;
    try {
      const mongoose = await import('../models/certificate.model.js');
      Certificate = mongoose.default || mongoose.Certificate;

      if (!Certificate) {
        throw new Error('Certificate model not found');
      }
    } catch (modelError) {
      console.error('⛔ Error loading Certificate model:', modelError.message);
      return false;
    }

    console.log('Starting blockchain certificate verification system...');

    // Check which events are available in the contract ABI
    const contractABI = contract._jsonInterface;
    const availableEvents = contractABI
      .filter(item => item.type === 'event')
      .map(item => item.name);

    console.log(`Available contract events: ${availableEvents.join(', ') || 'None found'}`);

    // Set up polling instead of subscriptions
    console.log('Setting up polling-based verification (no subscriptions required)');

    // Setup interval for periodic checks (every 30 seconds)
    const interval = setInterval(async () => {
      try {
        const count = await checkAndUpdateCertificates(Certificate);
        // Only log if there were updates or failures
        if (count.updated > 0 || count.failed > 0) {
          console.log(`✅ Periodic check: ${count.updated} updated, ${count.failed} failed`);
        }
      } catch (err) {
        console.error('❌ Error in periodic certificate check:', err.message);
      }
    }, 30 * 1000); // Every 30 seconds

    // Track this interval
    blockchainIntervals.push(interval);

    // Initial check
    setTimeout(async () => {
      try {
        console.log('Running initial certificate verification check...');
        const count = await checkAndUpdateCertificates(Certificate);
        console.log(`Initial check complete: ${count.updated} certificates updated`);
      } catch (err) {
        console.error('Error in initial certificate check:', err.message);
      }
    }, 5000); // 5 seconds after start

    console.log('📡 Certificate verification system started');
    return true;
  } catch (error) {
    console.error('Failed to start certificate verification system:', error.message);
    // Don't let this error stop the application
    return false;
  }
};

/**
 * Helper function to check and update certificates
 * Used by both the listener and periodic updates
 */
async function checkAndUpdateCertificates(Certificate, limit = null) {
  try {
    // Find all PENDING certificates
    const query = Certificate.find({ status: 'PENDING' }).sort({ createdAt: -1 });

    // Apply limit if provided
    if (limit) {
      query.limit(limit);
    }

    const pendingCertificates = await query;
    
    // Only log if there are pending certificates
    if (pendingCertificates.length > 0) {
      console.log(`📋 Found ${pendingCertificates.length} pending certificates to check`);
    }

    if (pendingCertificates.length === 0) {
      return { updated: 0, failed: 0, emailsSent: 0 };
    }

    // Get available methods
    const methods = Object.keys(contract.methods || {});

    let updatedCount = 0;
    let failedCount = 0;
    let confirmedCertificates = []; // Track confirmed certificates for email sending

    for (const cert of pendingCertificates) {
      try {
        // Skip certificates without certificateId - they're invalid
        if (!cert.certificateId) {
          console.log(`⚠️ Certificate without ID found, skipping`);
          continue;
        }

        console.log(`Checking certificate: ${cert.certificateId}`);

        // First check by transaction receipt if available
        if (cert.blockchainTx) {
          try {
            const receipt = await web3.eth.getTransactionReceipt(cert.blockchainTx);
            if (receipt && receipt.blockNumber) {
              // Transaction confirmed, update to CONFIRMED
              await Certificate.updateOne(
                { _id: cert._id },
                {
                  $set: {
                    status: 'CONFIRMED',
                    updatedAt: new Date()
                  }
                }
              );
              updatedCount++;
              console.log(`✅ Certificate ${cert.certificateId} confirmed via transaction receipt`);

              // Add to list of confirmed certificates for email sending
              confirmedCertificates.push(cert);

              continue; // Skip to next cert
            }
          } catch (err) {
            // Just log and continue to other verification methods
            console.log(`Transaction check failed: ${err.message}`);
          }
        }

        // Try verification methods in order of reliability
        let isVerified = false;

        // METHOD 1: isVerified
        if (!isVerified && methods.includes('isVerified')) {
          try {
            isVerified = await contract.methods.isVerified(cert.certificateId).call();
            if (isVerified) {
              console.log(`Verified via isVerified: ${cert.certificateId}`);
            }
          } catch (err) {
            // Just log and continue
          }
        }

        // METHOD 2: getCertificate
        if (!isVerified && methods.includes('getCertificate')) {
          try {
            await contract.methods.getCertificate(cert.certificateId).call();
            // If no error, cert exists
            isVerified = true;
            console.log(`Verified via getCertificate: ${cert.certificateId}`);
          } catch (err) {
            // Just log and continue
          }
        }

        // METHOD 3: getCertificateDetails
        if (!isVerified && methods.includes('getCertificateDetails')) {
          try {
            await contract.methods.getCertificateDetails(cert.certificateId).call();
            // If no error, cert exists
            isVerified = true;
            console.log(`Verified via getCertificateDetails: ${cert.certificateId}`);
          } catch (err) {
            // Just log and continue
          }
        }

        // Update cert status based on verification
        if (isVerified) {
          await Certificate.updateOne(
            { _id: cert._id },
            {
              $set: {
                status: 'CONFIRMED',
                updatedAt: new Date()
              }
            }
          );
          updatedCount++;
          console.log(`✅ Certificate ${cert.certificateId} verified and updated to CONFIRMED`);

          // Emit Socket.IO event for real-time update
          try {
            const app = (await import('../app.js')).default;
            const io = app.get('io');
            if (io) {
              io.emit('certificate:status', {
                certificateId: cert.certificateId,
                status: 'CONFIRMED',
                timestamp: new Date()
              });
            }
          } catch (err) {
            // Silently fail if Socket.IO not available
          }

          // Add to list of confirmed certificates for email sending
          confirmedCertificates.push(cert);
        } else {
          // Mark as FAILED if older than 15 minutes
          const fifteenMinutesAgo = new Date(Date.now() - (15 * 60 * 1000));
          if (cert.createdAt < fifteenMinutesAgo) {
            await Certificate.updateOne(
              { _id: cert._id },
              {
                $set: {
                  status: 'FAILED',
                  updatedAt: new Date()
                }
              }
            );
            failedCount++;
            console.log(`❌ Certificate ${cert.certificateId} marked as FAILED (too old)`);
          }
        }
      } catch (err) {
        console.error(`Error processing certificate: ${err.message}`);
      }
    }

    // Send confirmation emails for newly confirmed certificates
    let emailResults = { sent: 0, failed: 0, skipped: 0 };

    if (confirmedCertificates.length > 0) {
      console.log(`Sending confirmation emails for ${confirmedCertificates.length} certificates...`);

      try {
        emailResults = await sendConfirmedCertificateEmails(confirmedCertificates);

        // Mark certificates as having emails sent
        for (const cert of confirmedCertificates) {
          if (emailResults.details.find(detail =>
            detail.certificateId === cert.certificateId && detail.status === 'sent')) {

            await Certificate.updateOne(
              { _id: cert._id },
              {
                $set: {
                  emailSent: true,
                  emailSentAt: new Date()
                }
              }
            );
          }
        }
      } catch (emailError) {
        console.error('Error sending confirmation emails:', emailError);
      }
    }

    return {
      updated: updatedCount,
      failed: failedCount,
      emailsSent: emailResults.sent
    };
  } catch (error) {
    console.error('Error in certificate checking:', error.message);
    return { updated: 0, failed: 0, emailsSent: 0 };
  }
}

// Simplified version that uses the shared helper function
export const updatePendingCertificates = async (limit = null) => {
  try {
    // Fetch pending certificates (status: 'pending')
    const query = { status: 'pending', emailSent: { $ne: true } };

    // Apply limit if provided, otherwise check all pending
    const pendingCertificates = limit
      ? await Certificate.find(query).sort({ createdAt: -1 }).limit(limit)
      : await Certificate.find(query);

    if (pendingCertificates.length === 0) {
      return { updated: 0, message: 'No pending certificates found' };
    }

    console.log(`Found ${pendingCertificates.length} pending certificates to check`);

    // Use the getContract function to get the current contract instance
    try {
      const contractInstance = getContract();
      let updatedCount = 0;

      // Check each pending certificate
      for (const certificate of pendingCertificates) {
        try {
          // Get certificate ID to check on blockchain
          const certId = certificate.certificateId;

          // Call the contract to check if the certificate exists using one of our verification methods
          let verified = false;

          try {
            // First try isVerified if available
            verified = await contractInstance.methods.isVerified(certId).call();
          } catch (methodError) {
            try {
              // Then try getCertificate (this will throw an error if cert doesn't exist)
              await contractInstance.methods.getCertificate(certId).call();
              verified = true;
            } catch (getCertError) {
              // Certificate not verified - skip to next error handler
              console.log(`Certificate ${certId} verification failed`);
            }
          }

          if (verified) {
            // Update certificate status to 'confirmed'
            certificate.status = 'CONFIRMED';
            certificate.verifiedAt = new Date();

            // Send email notification if recipient email is provided
            if (certificate.recipientEmail) {
              try {
                // Generate IPFS gateway URL for the certificate
                const certificateLink = `${PINATA_GATEWAY_BASE_URL}/${certificate.ipfsHash}`;

                // Create verification URL using the getAppBaseUrl function
                const baseUrl = getAppBaseUrl().replace(':3000', ':5173');
                const verificationUrl = `${baseUrl}/verify?code=${certificate.verificationCode || ''}&auto=true`;

                // Prepare additional certificate information
                const additionalInfo = {
                  certificateId: certificate.certificateId,
                  institutionName: certificate.institutionName,
                  issuedDate: certificate.issuedDate,
                  expiryDate: certificate.validUntil
                };

                await sendCertificateEmail(
                  certificate.recipientEmail,
                  certificate.candidateName,
                  certificate.courseName,
                  certificateLink,
                  verificationUrl,
                  additionalInfo
                );

                certificate.emailSent = true;
                console.log(`✅ Confirmation email sent for certificate ${certificate._id}`);
              } catch (emailError) {
                console.error(`Failed to send confirmation email for certificate ${certificate._id}:`, emailError);
              }
            }

            await certificate.save();
            updatedCount++;
            console.log(`Certificate ${certificate._id} status updated to confirmed`);
          }
        } catch (certError) {
          console.error(`Error checking certificate ${certificate._id}:`, certError);
        }
      }

      return {
        updated: updatedCount,
        message: `${updatedCount} certificates updated to confirmed status`
      };
    } catch (contractError) {
      console.error('Failed to get contract instance:', contractError);
      return { updated: 0, message: 'Failed to get contract instance' };
    }
  } catch (error) {
    console.error('Error updating pending certificates:', error);
    throw error;
  }
};

// Add this function to specifically handle confirmed certificates that need email
/**
 * Sends emails for recently confirmed certificates that haven't had emails sent
 * Industry best practice is to separate the email sending logic from verification
 * This allows for better error handling and retry mechanisms
 */
export const sendEmailsForConfirmedCertificates = async () => {
  try {
    // Find all CONFIRMED certificates that haven't had emails sent
    const confirmedCertificates = await Certificate.find({
      status: 'CONFIRMED',
      emailSent: { $ne: true },
      recipientEmail: { $exists: true, $ne: null }
    }).sort({ updatedAt: -1 });

    console.log(`Found ${confirmedCertificates.length} confirmed certificates needing email notifications`);

    if (confirmedCertificates.length === 0) {
      return { sent: 0, message: 'No confirmed certificates needing emails' };
    }

    // Send emails
    const emailResults = await sendConfirmedCertificateEmails(confirmedCertificates);

    // Mark certificates as having emails sent
    for (const cert of confirmedCertificates) {
      if (emailResults.details.find(detail =>
        detail.certificateId === cert.certificateId && detail.status === 'sent')) {

        await Certificate.updateOne(
          { _id: cert._id },
          {
            $set: {
              emailSent: true,
              emailSentAt: new Date()
            }
          }
        );
      }
    }

    console.log(`Email sending complete: ${emailResults.sent} sent, ${emailResults.failed} failed`);
    return {
      sent: emailResults.sent,
      failed: emailResults.failed,
      skipped: emailResults.skipped,
      message: `${emailResults.sent} confirmation emails sent`
    };
  } catch (error) {
    console.error('Error sending emails for confirmed certificates:', error);
    return {
      sent: 0,
      failed: 0,
      error: error.message,
      message: 'Failed to send confirmation emails'
    };
  }
};

/**
 * Clean up all blockchain-related resources
 * This should be called when shutting down the application
 */
export const cleanupBlockchainResources = () => {
  try {
    // Clear all blockchain intervals
    blockchainIntervals.forEach(interval => {
      clearInterval(interval);
    });
    blockchainIntervals = [];

    // Disconnect Web3 if needed - properly check provider type
    if (web3 && web3.currentProvider) {
      // Only WebSocket and IPC providers have disconnect methods
      // HTTP providers don't need/have disconnect
      if (web3.currentProvider.constructor.name === 'WebsocketProvider' ||
        web3.currentProvider.constructor.name === 'IpcProvider') {
        if (typeof web3.currentProvider.disconnect === 'function') {
          web3.currentProvider.disconnect();
        }
      }
      // For HTTP providers (most common), no disconnect needed
    }

    console.log('Blockchain resources cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Error cleaning up blockchain resources:', error);
    return false;
  }
};
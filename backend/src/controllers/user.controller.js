import User from '../models/user.model.js';
import Certificate from '../models/certificate.model.js';
import { successResponse } from '../utils/responseUtils.js';
import { errorResponse, ErrorCodes } from '../utils/errorUtils.js';
import { generateKeyPair, deriveWalletAddress } from '../utils/cryptoUtils.js';
import mongoose from 'mongoose';
import { isWalletUser } from '../utils/userUtils.js';
import { getStudentRegistryContract } from '../utils/blockchain.js';

/**
 * Get the current user's profile
 */
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const includeKeys = req.query.includeKeys === 'true';

    console.log(`[getUserProfile] User ID: ${userId}, includeKeys: ${includeKeys}`);
    console.log(`[getUserProfile] Auth user info:`, JSON.stringify(req.user));

    // Initialize select with basic exclusion of sensitive data
    let select = { password: 0, refreshToken: 0 };

    // Handle case inconsistency by checking both formats
    const user = await User.findById(userId);
    console.log(`[getUserProfile] User role: ${user.role}`);

    // Check if this is an institute user (case insensitive check)
    const isInstitute = user.role.toUpperCase() === 'INSTITUTE';

    // For institute or student users, check if they need cryptographic keys generated
    if (isWalletUser) {
      let needsSave = false;
      
      // Only generate keys if they don't already exist
      if (!user.publicKey || !user.privateKey || !user.walletAddress) {
        console.log('[getUserProfile] Keys missing, generating cryptographic keys for institute user');

        try {
          // Generate a new key pair
          const { publicKey, privateKey } = generateKeyPair();
          const walletAddress = deriveWalletAddress(publicKey);

          console.log('[getUserProfile] Keys generated successfully:');
          console.log(`[getUserProfile] - Wallet address length: ${walletAddress.length}`);
          console.log(`[getUserProfile] - Public key length: ${publicKey.length}`);
          console.log(`[getUserProfile] - Private key length: ${privateKey.length}`);

          // Update the user with the new keys
          user.publicKey = publicKey;
          user.privateKey = privateKey;
          user.walletAddress = walletAddress;
          needsSave = true;
        } catch (error) {
          console.error('[getUserProfile] Error generating keys:', error.message);
        }
      } else {
        console.log('[getUserProfile] User already has cryptographic keys');
      }
      
      // Auto-populate institutionName if missing (for existing users)
      if (!user.institutionName && user.name) {
        console.log('[getUserProfile] Setting institutionName from name field');
        user.institutionName = user.name;
        needsSave = true;
      }
      
      // Save if any updates were made
      if (needsSave) {
        await user.save();
        console.log('[getUserProfile] User profile updated and saved to database');
      }
    }

    // Determine if cryptographic keys should be included in response
    if (!isWalletUser || !includeKeys) {
      // For non-institute users or when not explicitly requested, exclude crypto keys
      select.privateKey = 0;
      select.publicKey = 0;
      console.log('[getUserProfile] Excluding cryptographic keys');
    } else {
      console.log('[getUserProfile] Including cryptographic keys for INSTITUTE user');
    }

    // Fetch user with appropriate fields selected
    const profile = await User.findById(userId).select(select);

    if (!profile) {
      console.log(`User not found with ID: ${userId}`);
      const { response, statusCode } = errorResponse('USER_NOT_FOUND', 'User not found');
      return res.status(statusCode).json(response);
    }

    console.log(`User profile retrieved successfully for: ${profile.name}, role: ${profile.role}`);

    // Log crypto information availability (without exposing actual keys)
    if (includeKeys && isInstitute) {
      console.log(`Crypto data included in response: walletAddress=${!!profile.walletAddress}, publicKey=${!!profile.publicKey}, privateKey=${!!profile.privateKey}`);
    }

    // Add debug info to the response
    const userObject = profile.toObject();
    userObject.debug = {
      requestedIncludeKeys: includeKeys,
      userRole: profile.role,
      keysRequested: includeKeys && isInstitute,
      timestamp: new Date().toISOString(),
      hasPublicKey: !!userObject.publicKey,
      hasPrivateKey: !!userObject.privateKey,
      hasWalletAddress: !!userObject.walletAddress
    };

    console.log(`[getUserProfile] Response data:`, {
      role: userObject.role,
      name: userObject.name,
      hasPublicKey: !!userObject.publicKey,
      hasPrivateKey: !!userObject.privateKey,
      hasWalletAddress: !!userObject.walletAddress
    });

    return res.json(successResponse(userObject, 'User profile retrieved successfully'));
  } catch (error) {
    console.error('[getUserProfile] Error:', error.message);
    const { response, statusCode } = errorResponse('INTERNAL_ERROR', 'Failed to get user profile');
    return res.status(statusCode).json(response);
  }
};

/**
 * Update the current user's profile
 */
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;

    // Basic validation
    if (!name && !email) {
      const { response, statusCode } = errorResponse('INVALID_INPUT', 'No update data provided');
      return res.status(statusCode).json(response);
    }

    // Get user to check role
    const user = await User.findById(userId);
    if (!user) {
      const { response, statusCode } = errorResponse('USER_NOT_FOUND', 'User not found');
      return res.status(statusCode).json(response);
    }

    // Create update object with only provided fields
    const updateData = {};
    if (name) {
      updateData.name = name;
      // For INSTITUTE users, also update institutionName when name changes
      if (user.role.toUpperCase() === 'INSTITUTE') {
        updateData.institutionName = name;
        console.log(`[updateUserProfile] Updating institutionName to: ${name}`);
      }
    }
    if (email) updateData.email = email;

    // Update user and return updated document
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password -refreshToken');

    if (!updatedUser) {
      const { response, statusCode } = errorResponse('USER_NOT_FOUND', 'User not found');
      return res.status(statusCode).json(response);
    }

    return res.json(successResponse(updatedUser, 'Profile updated successfully'));
  } catch (error) {
    console.error('Error updating user profile:', error);
    const { response, statusCode } = errorResponse('INTERNAL_ERROR', 'Failed to update profile');
    return res.status(statusCode).json(response);
  }
};

/**
 * Get statistics for the current user
 */
export const getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      const { response, statusCode } = errorResponse('USER_NOT_FOUND', 'User not found');
      return res.status(statusCode).json(response);
    }

    // Get different stats based on user role
    let stats = {};

    if (user.role === 'INSTITUTE') {
      // For institute users, get counts of issued certificates by status
      const certificateCounts = await Certificate.aggregate([
        { $match: { issuer: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
      ]);

      // Format the results
      const formattedCounts = {
        total: 0,
        pending: 0,
        confirmed: 0,
        failed: 0
      };

      certificateCounts.forEach(item => {
        if (item._id === 'PENDING') formattedCounts.pending = item.count;
        if (item._id === 'CONFIRMED') formattedCounts.confirmed = item.count;
        if (item._id === 'FAILED') formattedCounts.failed = item.count;
        formattedCounts.total += item.count;
      });

      stats = {
        certificatesIssued: formattedCounts,
        lastLogin: user.lastLogin,
        accountCreated: user.createdAt
      };
    } else {
      // For regular users, get counts of certificates they own
      const certificateCount = await Certificate.countDocuments({
        candidateName: user.name
      });

      stats = {
        certificatesOwned: certificateCount,
        lastLogin: user.lastLogin,
        accountCreated: user.createdAt,
        loginHistory: user.loginHistory?.slice(0, 5) || []
      };
    }

    return res.json(successResponse(stats, 'User statistics retrieved successfully'));
  } catch (error) {
    console.error('Error getting user stats:', error);
    const { response, statusCode } = errorResponse('INTERNAL_ERROR', 'Failed to get user statistics');
    return res.status(statusCode).json(response);
  }
};

/**
 * List all certificates for the current user
 * - For regular users: certificates where they are the candidate
 * - For institutes: certificates they have issued
 */
export const getUserCertificates = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      const { response, statusCode } = errorResponse('USER_NOT_FOUND', 'User not found');
      return res.status(statusCode).json(response);
    }

    let certificates = [];
    const { status, search } = req.query;

    // Build the query based on user role and optional filters
    let query = {};

    if (user.role === 'INSTITUTE') {
      console.log(`[getUserCertificates] Fetching certificates for INSTITUTE user: ${userId}`);
      // Try using ObjectId or string depending on what works
      query.issuer = userId;
    } else {
      console.log(`[getUserCertificates] Fetching certificates for ${user.role} user: ${userId}, name: ${user.name}`);
      query.candidateName = user.name;
    }

    console.log('[getUserCertificates] Query:', JSON.stringify(query));

    // Add status filter if provided
    if (status && ['PENDING', 'CONFIRMED', 'FAILED'].includes(status.toUpperCase())) {
      query.status = status.toUpperCase();
      console.log(`[getUserCertificates] Adding status filter: ${status.toUpperCase()}`);
    }

    // Add search filter if provided
    if (search) {
      query.$or = [
        { courseName: { $regex: search, $options: 'i' } },
        { certificateId: { $regex: search, $options: 'i' } },
        { shortCode: { $regex: search, $options: 'i' } }
      ];

      // For institutes, also search by candidate name
      if (user.role === 'INSTITUTE') {
        query.$or.push({ candidateName: { $regex: search, $options: 'i' } });
      }
      console.log(`[getUserCertificates] Adding search filter: ${search}`);
    }

    // Execute the query
    certificates = await Certificate.find(query).sort({ createdAt: -1 });

    console.log(`[getUserCertificates] Found ${certificates.length} certificates`);

    // If no certificates found for institute user, try alternative query
    if (certificates.length === 0 && user.role === 'INSTITUTE') {
      console.log('[getUserCertificates] No certificates found for INSTITUTE, trying alternative query with orgName');

      // Try finding by organization name as fallback
      const altQuery = { orgName: user.name };
      if (status) altQuery.status = status.toUpperCase();

      const altCertificates = await Certificate.find(altQuery).sort({ createdAt: -1 });
      console.log(`[getUserCertificates] Alternative query found ${altCertificates.length} certificates`);

      if (altCertificates.length > 0) {
        // Update certificates with issuer field for future queries
        console.log('[getUserCertificates] Updating certificates with issuer field');
        for (const cert of altCertificates) {
          cert.issuer = userId;
          await cert.save();
        }
        certificates = altCertificates;
      }
    }

    // A certificate that's been revoked-and-replaced during a credit transfer stays
    // in the DB for history, but from the STUDENT's point of view it's the same
    // underlying credential as whatever replaced it — they shouldn't see it as a
    // second, separate certificate by default. Institutes still see everything they
    // issued (including ones later revoked via a transfer out) since that's useful
    // operational history for them. ?includeHistory=true opts a student back in.
    const includeHistory = String(req.query.includeHistory).toLowerCase() === 'true';
    const visibleCertificates = (user.role === 'INSTITUTE' || includeHistory)
      ? certificates
      : certificates.filter(c => !c.revoked);

    const lineageIds = [...new Set(
      visibleCertificates.flatMap(c => [c.supersedes, c.supersededBy]).filter(Boolean)
    )];
    const lineageDocs = lineageIds.length
      ? await Certificate.find({ certificateId: { $in: lineageIds } })
          .select('certificateId institutionName courseName issuedDate revoked')
      : [];
    const lineageMap = new Map(lineageDocs.map(d => [d.certificateId, d]));

    const formatLineage = (id) => {
      const d = id && lineageMap.get(id);
      return d
        ? { certificateId: d.certificateId, institutionName: d.institutionName, courseName: d.courseName, issuedDate: d.issuedDate, revoked: d.revoked }
        : null;
    };

    const formattedCertificates = visibleCertificates.map(cert => {
      const obj = cert.toObject();
      if (cert.supersedes || cert.supersededBy || cert.transferAgreementId) {
        obj.transfer = {
          agreementId: cert.transferAgreementId,
          transferredFrom: formatLineage(cert.supersedes), // the certificate this one replaced
          transferredTo: formatLineage(cert.supersededBy),  // what later replaced this one (if anything)
        };
      }
      return obj;
    });

    return res.json(successResponse(formattedCertificates, 'Certificates retrieved successfully'));
  } catch (error) {
    console.error('Error getting user certificates:', error);
    const { response, statusCode } = errorResponse('INTERNAL_ERROR', 'Failed to get certificates');
    return res.status(statusCode).json(response);
  }
}; 

/**
 * Update user's institution logo
 */
export const updateUserLogo = async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
    }

    // Upload logo to IPFS
    const { uploadBufferToPinata } = await import('../utils/pinata.js');
    const ipfsHash = await uploadBufferToPinata(req.file.buffer, `logo_${userId}_${Date.now()}.${req.file.mimetype.split('/')[1]}`);
    
    const logoUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

    // Update user's logo
    const user = await User.findByIdAndUpdate(
      userId,
      { institutionLogo: logoUrl },
      { new: true, select: '-password -refreshToken -privateKey' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Logo updated successfully',
      data: {
        institutionLogo: user.institutionLogo
      }
    });
  } catch (error) {
    console.error('Error updating logo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update logo',
      error: error.message
    });
  }
};

export const lookupStudent = async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ success: false, message: 'email query parameter is required' });
  }

  try {
    const student = await User.findOne({ email: email.toLowerCase(), role: 'STUDENT' })
      .select('name email walletAddress _id');

    if (!student) {
      return res.status(404).json({ success: false, message: 'No student found with that email' });
    }

    if (!student.walletAddress) {
      return res.status(400).json({ success: false, message: 'Student not registered on chain' });
    }

    const registry = getStudentRegistryContract();
    

    const enrolledWallet = await registry.methods.getEnrolledInstitute(student.walletAddress).call();
    const isEnrolled = enrolledWallet && enrolledWallet !== '0x0000000000000000000000000000000000000000';

    let institute = null;

    if (isEnrolled) {
      institute = await User.findOne({ walletAddress: enrolledWallet.toLowerCase() }).select('name walletAddress');
    }
    console.log(institute)
    console.log(req.user)
    console.log(institute.walletAddress === req.user.walletAddress)
    return res.status(200).json({
      success: true,
      data: {
        id: student._id,
        name: student.name,
        email: student.email,
        walletAddress: student.walletAddress,
        isEnrolled: institute.walletAddress === req.user.walletAddress
      }
    });
  } catch (error) {
    console.error('Student lookup error:', error);
    return res.status(500).json({ success: false, message: 'Lookup failed', error: error.message });
  }
};

import User from '../models/user.model.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { successResponse } from '../utils/responseUtils.js';
import { errorResponse, ErrorCodes } from '../utils/errorUtils.js';
import crypto from 'crypto';
import { generateKeyPair, deriveWalletAddress } from '../utils/cryptoUtils.js';
import { isWalletUser } from '../utils/userUtils.js';

const getRegistry = async () => {
  const { getStudentRegistryContract, getWeb3 } = await import('../utils/blockchain.js');
  return { registry: getStudentRegistryContract(), web3Instance: getWeb3() };
};

dotenv.config();

export const register = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    const { name, email, password, role } = req.body;

    console.log(`[${requestId}] Registration attempt for email: ${email}`);

    if (!name || !email || !password || !role) {
      const { response, statusCode } = errorResponse(
        'MISSING_REQUIRED_FIELD',
        'All fields are required',
        { required: ['name', 'email', 'password', 'role'] },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`[${requestId}] Email already exists: ${email}`);
      const { response, statusCode } = errorResponse(
        'DUPLICATE_RESOURCE',
        'Email already exists',
        { email },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Create user object with base fields
    const userFields = { name, email, password, role };

    // Generate cryptographic keys if user is an Institute
    if (isWalletUser(role)) {
      try {
        console.log(`[${requestId}] Generating cryptographic keys for ${role}: ${email}`);
        const { publicKey, privateKey } = generateKeyPair();
        const walletAddress = deriveWalletAddress(publicKey);

        // Add cryptographic fields to user
        userFields.publicKey = publicKey;
        userFields.privateKey = privateKey;
        userFields.walletAddress = walletAddress;
        
        // Set institutionName to the name field for INSTITUTE users
        if (role.toUpperCase() === 'INSTITUTE') {
          userFields.institutionName = name;
        }

        console.log(`[${requestId}] Cryptographic keys generated successfully:`);
        console.log(`[${requestId}] - Wallet address: ${walletAddress}`);
        console.log(`[${requestId}] - Public key length: ${publicKey.length} chars`);
        console.log(`[${requestId}] - Private key length: ${privateKey.length} chars`);
        if (role.toUpperCase() === 'INSTITUTE') {
          console.log(`[${requestId}] - Institution name: ${name}`);
        }
      } catch (keyError) {
        console.error(`[${requestId}] Error generating keys:`, keyError);
        // Continue with registration without keys if generation fails
      }
    }

    // Ensure role is uppercase for consistency
    userFields.role = role.toUpperCase();

    // Create new user
    const user = new User(userFields);
    await user.save();
    console.log(`[${requestId}] New user created with ID: ${user._id}`);

    // Auto-register on StudentRegistry smart contract
    if (user.walletAddress && isWalletUser(role)) {
      try {
        const { registry, web3Instance } = await getRegistry();
        const accounts = await web3Instance.eth.getAccounts();
        if (user.role === 'STUDENT') {
          await registry.methods
            .registerStudent(user.walletAddress, user.name)
            .send({ from: accounts[0], gas: 200000 });
          console.log(`[${requestId}] Student registered on-chain: ${user.walletAddress}`);
        } else {
          await registry.methods
            .registerInstitute(user.walletAddress, user.institutionName || user.name)
            .send({ from: accounts[0], gas: 200000 });
          console.log(`[${requestId}] Institute registered on-chain: ${user.walletAddress}`);
        }
      } catch (chainErr) {
        // Non-fatal: log but don't block registration
        console.error(`[${requestId}] On-chain registration failed (non-fatal):`, chainErr.message);
      }
    }

    // Generate tokens directly (bypass User model methods)
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET, // Using same secret for simplicity
      { expiresIn: '7d' }
    );

    // Store refresh token
    user.refreshToken = refreshToken;
    await user.save();
    console.log(`[${requestId}] Tokens generated for new user`);

    // Prepare user data for response (excluding sensitive fields)
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Include wallet address for institutes and students
    if (isWalletUser(user.role) && user.walletAddress) {
      userData.walletAddress = user.walletAddress;
    }

    return res.status(201).json(successResponse({
      user: userData,
      tokens: {
        access: token,
        refresh: refreshToken
      }
    }, 'Registration successful', 201));

  } catch (error) {
    console.error(`[${requestId}] Registration error:`, error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Registration failed',
      process.env.NODE_ENV === 'development' ? { error: error.message } : {},
      requestId
    );
    return res.status(statusCode).json(response);
  }
};

export const login = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    const { email, password } = req.body;

    console.log(`[${requestId}] Login attempt for email: ${email}`);

    if (!email || !password) {
      const { response, statusCode } = errorResponse(
        'MISSING_REQUIRED_FIELD',
        'Email and password are required',
        { required: ['email', 'password'] },
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Find user by email with better error handling
    let user;
    try {
      user = await User.findByEmail(email);
    } catch (dbError) {
      console.error(`[${requestId}] Database error while finding user:`, dbError);
      const { response, statusCode } = errorResponse(
        'DATABASE_ERROR',
        'Error accessing user database',
        process.env.NODE_ENV === 'development' ? { error: dbError.message } : {},
        requestId
      );
      return res.status(statusCode).json(response);
    }

    if (!user) {
      console.log(`[${requestId}] No user found with email: ${email}`);
      const { response, statusCode } = errorResponse(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        null,
        requestId
      );
      return res.status(statusCode).json(response);
    }

    console.log(`[${requestId}] User found: ${user._id}`);

    // Check password with better error handling
    let isPasswordValid = false;
    try {
      isPasswordValid = await user.comparePassword(password);
    } catch (passwordError) {
      console.error(`[${requestId}] Error comparing passwords:`, passwordError);
      const { response, statusCode } = errorResponse(
        'AUTHENTICATION_ERROR',
        'Error verifying password',
        process.env.NODE_ENV === 'development' ? { error: passwordError.message } : {},
        requestId
      );
      return res.status(statusCode).json(response);
    }

    if (!isPasswordValid) {
      console.log(`[${requestId}] Invalid password for user: ${user._id}`);
      const { response, statusCode } = errorResponse(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        null,
        requestId
      );
      return res.status(statusCode).json(response);
    }

    console.log(`[${requestId}] Password validation successful`);

    // Generate tokens with better error handling
    let token, refreshToken;
    try {
      // Generate access token
      token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      // Generate refresh token
      refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET, // Using same secret for simplicity
        { expiresIn: '7d' }
      );
    } catch (tokenError) {
      console.error(`[${requestId}] Error generating tokens:`, tokenError);
      const { response, statusCode } = errorResponse(
        'TOKEN_GENERATION_ERROR',
        'Error generating authentication tokens',
        process.env.NODE_ENV === 'development' ? { error: tokenError.message } : {},
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Store refresh token on user
    try {
      user.refreshToken = refreshToken;
      await user.save();
    } catch (saveError) {
      console.error(`[${requestId}] Error saving refresh token:`, saveError);
      // Continue despite this error, as login can still proceed
    }

    console.log(`[${requestId}] Tokens generated successfully`);

    // Track login if possible
    try {
      user.lastLogin = Date.now();
      if (Array.isArray(user.loginHistory)) {
        user.loginHistory.push({
          timestamp: Date.now(),
          ipAddress: req.ip || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown'
        });
        if (user.loginHistory.length > 10) user.loginHistory.shift();
      }
      await user.save();
    } catch (trackError) {
      console.error(`[${requestId}] Login tracking error:`, trackError);
      // Non-critical, continue
    }

    // Return successful response with tokens
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Include wallet address for institutes and students
    if (isWalletUser(user.role) && user.walletAddress) {
      userData.walletAddress = user.walletAddress;
    }

    console.log(`[${requestId}] Login successful for user: ${user._id}`);

    return res.status(200).json(successResponse({
      user: userData,
      tokens: {
        access: token,
        refresh: refreshToken
      }
    }, 'Login successful'));

  } catch (error) {
    console.error(`[${requestId}] Login error:`, error);

    // Determine the type of error for a more specific response
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = 'Login failed due to an internal error';

    if (error.name === 'ValidationError') {
      errorCode = 'VALIDATION_ERROR';
      errorMessage = 'Validation failed: ' + (error.message || '');
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      errorCode = 'DATABASE_ERROR';
      errorMessage = 'Database operation failed';
    } else if (error.name === 'JsonWebTokenError') {
      errorCode = 'TOKEN_ERROR';
      errorMessage = 'Error with authentication token';
    }

    const { response, statusCode } = errorResponse(
      errorCode,
      errorMessage,
      process.env.NODE_ENV === 'development' ? { error: error.message, stack: error.stack } : {},
      requestId
    );
    return res.status(statusCode).json(response);
  }
};

export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    if (!refreshToken) {
      const { response, statusCode } = errorResponse(
        'MISSING_REQUIRED_FIELD',
        'Refresh token is required',
        null,
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    } catch (err) {
      const { response, statusCode } = errorResponse(
        'TOKEN_EXPIRED',
        'Invalid or expired refresh token',
        null,
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Find user and check if refresh token matches
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      const { response, statusCode } = errorResponse(
        'UNAUTHORIZED',
        'Invalid refresh token',
        null,
        requestId
      );
      return res.status(statusCode).json(response);
    }

    // Generate new tokens
    const newAccessToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();
    await user.save();

    return res.status(200).json(successResponse({
      tokens: {
        access: newAccessToken,
        refresh: newRefreshToken
      }
    }, 'Tokens refreshed successfully'));

  } catch (error) {
    console.error('Token refresh error:', error);
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Failed to refresh token',
      {
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      requestId
    );
    return res.status(statusCode).json(response);
  }
};
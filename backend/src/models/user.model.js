// src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; // Added missing JWT import

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    // match: [/\S+@\S+\.\S+/, 'Please use a valid email address'] // Commented out as requested
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    // minlength: [6, 'Password must be at least 6 characters'], // Commented out as requested
    select: false
  },
  role: {
    type: String,
    enum: ['INSTITUTE', 'VERIFIER', 'STUDENT'],
    required: true
  },
  // Cryptographic fields for Institute role
  publicKey: {
    type: String,
    select: true,  // Always include public key
    trim: true,
    validate: {
      validator: function (v) {
        return !['INSTITUTE', 'STUDENT'].includes(this.role) || v;
      },
      message: props => 'Public key is required for Institute and Student users'
    }
  },
  privateKey: {
    type: String,
    select: true,  // Include private key in queries but filtered in controller
    trim: true,
    validate: {
      validator: function (v) {
        return !['INSTITUTE', 'STUDENT'].includes(this.role) || v;
      },
      message: props => 'Private key is required for Institute and Student users'
    }
  },
  walletAddress: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  lastLogin: Date,
  loginHistory: [{
    timestamp: Date,
    ipAddress: String,
    userAgent: String
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  refreshToken: String,
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  accountLockUntil: Date,
  // Institution-specific fields
  institutionName: {
    type: String,
    required: function() { return this.role === 'INSTITUTE'; },
    trim: true
  },
  institutionLogo: {
    type: String,
    default: null
  }
});

// Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ walletAddress: 1 }, { sparse: true });

// Pre-save hooks
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.updatedAt = Date.now();
    next();
  } catch (err) {
    next(err);
  }
});

// Instance methods
UserSchema.methods = {
  comparePassword: async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  },

  trackLogin: function (req) {
    this.lastLogin = Date.now();
    if (!this.loginHistory) this.loginHistory = [];
    this.loginHistory.push({
      timestamp: Date.now(),
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    if (this.loginHistory.length > 10) this.loginHistory.shift();
  },

  generateAuthToken: function () {
    try {
      // Make sure JWT_SECRET exists
      if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET environment variable is not defined');
        throw new Error('JWT configuration error');
      }

      return jwt.sign(
        { id: this._id, role: this.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    } catch (error) {
      console.error('Error generating auth token:', error);
      throw new Error('Failed to generate authentication token: ' + error.message);
    }
  },

  generateRefreshToken: function () {
    try {
      // Make sure REFRESH_SECRET exists
      if (!process.env.REFRESH_SECRET) {
        console.error('REFRESH_SECRET environment variable is not defined');
        throw new Error('Refresh token configuration error');
      }

      const refreshToken = jwt.sign(
        { id: this._id },
        process.env.REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      // Store the refresh token on the user model
      this.refreshToken = refreshToken;

      return refreshToken;
    } catch (error) {
      console.error('Error generating refresh token:', error);
      throw new Error('Failed to generate refresh token: ' + error.message);
    }
  },

  // Method to sign data with user's private key
  signData: async function (data) {
    if (!['INSTITUTE', 'STUDENT'].includes(this.role) || !this.privateKey) {
      throw new Error('Only institutes and students with private keys can sign data');
    }

    // Import the cryptoUtils dynamically to avoid circular dependencies
    const { createDigitalSignature } = await import('../utils/cryptoUtils.js');
    return createDigitalSignature(data, this.privateKey);
  }
};

// Static methods
UserSchema.statics = {
  findByEmail: async function (email) {
    return this.findOne({ email }).select('+password +refreshToken');
  },

  // Get user with cryptographic keys
  findWithKeys: async function (userId) {
    return this.findById(userId).select('+publicKey +privateKey');
  },

  // Verify a signature with a user's public key
  verifySignature: async function (userId, data, signature) {
    const user = await this.findById(userId).select('+publicKey');

    if (!user || !user.publicKey) {
      return false;
    }

    // Import the cryptoUtils dynamically
    const { verifyDigitalSignature } = await import('../utils/cryptoUtils.js');
    return verifyDigitalSignature(data, signature, user.publicKey);
  }
};

export default mongoose.model('User', UserSchema);
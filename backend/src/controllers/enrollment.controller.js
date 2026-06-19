import crypto from 'crypto';
import User from '../models/user.model.js';
import { getStudentRegistryContract, getWeb3 } from '../utils/blockchain.js';
import { successResponse } from '../utils/responseUtils.js';
import { errorResponse } from '../utils/errorUtils.js';

export const listInstitutes = async (req, res) => {
  try {
    const institutes = await User.find({ role: 'INSTITUTE', status: 'active' })
      .select('name email walletAddress institutionName institutionLogo');

    return res.status(200).json(successResponse({
      institutes: institutes.map(i => ({
        id: i._id,
        name: i.institutionName || i.name,
        email: i.email,
        walletAddress: i.walletAddress,
        logo: i.institutionLogo
      }))
    }, 'Institutes fetched successfully'));
  } catch (error) {
    return res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to fetch institutes', {}, crypto.randomBytes(4).toString('hex')).response);
  }
};

// ─── Get current student's enrollment status ────────────────────────────────
export const getEnrollmentStatus = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  try {
    const student = await User.findById(req.user.id).select('walletAddress name');
    if (!student?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Student has no wallet address' });
    }

    const registry = getStudentRegistryContract();

    // Check if registered on-chain
    const isRegistered = await registry.methods.isStudentRegistered(student.walletAddress).call();
    if (!isRegistered) {
      return res.status(200).json(successResponse({
        registered: false,
        enrolled: false,
        institute: null
      }, 'Student not yet registered on-chain'));
    }

    const enrolledWallet = await registry.methods.getEnrolledInstitute(student.walletAddress).call();
    const isEnrolled = enrolledWallet && enrolledWallet !== '0x0000000000000000000000000000000000000000';

    let institute = null;
    console.log(enrolledWallet)
    if (isEnrolled) {
      institute = await User.findOne({ walletAddress: enrolledWallet.toLowerCase() }).select('name institutionName walletAddress institutionLogo');
    }

    // Fetch student's linked certificate IDs
    const studentData = await registry.methods.getStudent(student.walletAddress).call();
    const certificateIds = studentData[3] || [];

    return res.status(200).json(successResponse({
      registered: true,
      enrolled: isEnrolled,
      institute: institute ? {
        id: institute._id,
        name: institute.institutionName || institute.name,
        walletAddress: institute.walletAddress,
        logo: institute.institutionLogo
      } : null,
      certificateCount: certificateIds.length,
      certificateIds
    }, 'Enrollment status fetched'));
  } catch (error) {
    console.error('[Enrollment] getEnrollmentStatus error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Student enrolls into an institute ──────────────────────────────────────
export const enrollInInstitute = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const { instituteId } = req.body; // MongoDB _id of the institute

  if (!instituteId) {
    return res.status(400).json({ success: false, message: 'instituteId is required' });
  }

  try {
    // Fetch student
    const student = await User.findById(req.user.id).select('walletAddress name');
    if (!student?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Student wallet not found' });
    }

    // Fetch institute
    const institute = await User.findOne({ _id: instituteId, role: 'INSTITUTE' }).select('walletAddress name institutionName');
    if (!institute?.walletAddress) {
      return res.status(404).json({ success: false, message: 'Institute not found or has no wallet' });
    }

    const registry = getStudentRegistryContract();
    const web3Instance = getWeb3();
    const accounts = await web3Instance.eth.getAccounts();

    // Verify student is registered on-chain
    const isRegistered = await registry.methods.isStudentRegistered(student.walletAddress).call();
    if (!isRegistered) {
      return res.status(400).json({
        success: false,
        message: 'Student is not registered on-chain. Please contact support.',
        code: 'STUDENT_NOT_ON_CHAIN'
      });
    }

    // Verify institute is registered on-chain
    console.log("institute.walletAddress");
    console.log(institute.walletAddress);
    const isInstRegistered = await registry.methods.isInstituteRegistered(institute.walletAddress).call();
    if (!isInstRegistered) {
      return res.status(400).json({
        success: false,
        message: 'This institute is not yet registered on-chain.',
        code: 'INSTITUTE_NOT_ON_CHAIN'
      });
    }

    // Check current enrollment — prevent no-op or same-institute re-enroll
    const currentEnrolled = await registry.methods.getEnrolledInstitute(student.walletAddress).call();
    if (currentEnrolled.toLowerCase() === institute.walletAddress.toLowerCase()) {
      return res.status(409).json({ success: false, message: 'Already enrolled in this institute' });
    }

    // Call enrollStudent on-chain
    const tx = await registry.methods
      .enrollStudent(student.walletAddress, institute.walletAddress)
      .send({ from: accounts[0], gas: 300000 });

    console.log(`[${requestId}] Enrollment tx: ${tx.transactionHash}`);

    return res.status(200).json(successResponse({
      studentWallet: student.walletAddress,
      instituteWallet: institute.walletAddress,
      instituteName: institute.institutionName || institute.name,
      txHash: tx.transactionHash
    }, 'Enrollment successful'));
  } catch (error) {
    console.error('[Enrollment] enrollInInstitute error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Student unenrolls from current institute ────────────────────────────────
export const unenroll = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  try {
    const student = await User.findById(req.user.id).select('walletAddress');
    if (!student?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Student wallet not found' });
    }

    const registry = getStudentRegistryContract();
    const web3Instance = getWeb3();
    const accounts = await web3Instance.eth.getAccounts();

    const currentEnrolled = await registry.methods.getEnrolledInstitute(student.walletAddress).call();
    const isEnrolled = currentEnrolled && currentEnrolled !== '0x0000000000000000000000000000000000000000';
    if (!isEnrolled) {
      return res.status(400).json({ success: false, message: 'Not currently enrolled in any institute' });
    }

    const tx = await registry.methods
      .unenrollStudent(student.walletAddress)
      .send({ from: accounts[0], gas: 200000 });

    return res.status(200).json(successResponse({ txHash: tx.transactionHash }, 'Unenrolled successfully'));
  } catch (error) {
    console.error('[Enrollment] unenroll error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Institute views its enrolled students ──────────────────────────────────
export const getInstituteEnrollments = async (req, res) => {
  try {
    const institute = await User.findById(req.user.id).select('walletAddress');
    if (!institute?.walletAddress) {
      return res.status(400).json({ success: false, message: 'Institute wallet not found' });
    }

    const registry = getStudentRegistryContract();

    const studentWallets = await registry.methods.getInstituteStudents(institute.walletAddress).call();

    // Hydrate with DB info
    const students = await User.find({
      walletAddress: { $in: studentWallets },
      role: 'STUDENT'
    }).select('name email walletAddress');

    return res.status(200).json(successResponse({
      count: students.length,
      students: students.map(s => ({
        id: s._id,
        name: s.name,
        email: s.email,
        walletAddress: s.walletAddress
      }))
    }, 'Enrolled students fetched'));
  } catch (error) {
    console.error('[Enrollment] getInstituteEnrollments error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
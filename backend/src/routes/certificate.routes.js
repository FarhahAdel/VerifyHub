// src/routes/certificate.routes.js
import express from 'express';
import { pdfUpload, pdfUploadMemory } from '../middlewares/fileUpload.middleware.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import rateLimit from 'express-rate-limit';
import {
  generateCertificate,
  verifyCertificateById,
  verifyCertificatePdf,
  getCertificateMetadata,
  uploadExternalCertificate,
  searchByCID,
  getCertificateStats,
  getOrgCertificates,
  getCertificatePDF,
  debugPdfVerification,
  serveCertificatePDF,
  getCertificatesByEmail
} from '../controllers/certificate.controller.js';

// Import from the verification controller
import {
  verifyCertificateByShortCode,
  verifyInstitutionalSignature
} from '../controllers/verification.controller.js';

const router = express.Router();

// Rate limiting for public endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later'
  }
});

// Certificate Generation and Upload Routes (Protected)
router.post('/generate', authMiddleware, requireRole('INSTITUTE'), generateCertificate);
router.post('/upload/external', authMiddleware, pdfUploadMemory.single('certificate'), uploadExternalCertificate);

// Certificate Verification Routes (Public)
router.get('/:certificateId/verify', apiLimiter, verifyCertificateById);
router.post('/verify/pdf', apiLimiter, pdfUploadMemory.single('certificate'), verifyCertificatePdf);
router.post('/debug/pdf', apiLimiter, pdfUploadMemory.single('certificate'), debugPdfVerification);

// Certificate Verification Route (Public) - Supports both shortCode and verificationCode
router.get('/code/:verificationCode', apiLimiter, verifyCertificateByShortCode);

// New Institutional Signature Verification Route (Public) - Now using the new controller
router.get('/:certificateId/signature/verify', apiLimiter, verifyInstitutionalSignature);

// Certificate Retrieval Routes (Public)
router.get('/:certificateId/pdf', apiLimiter, getCertificatePDF);
router.get('/:certificateId/view-pdf', apiLimiter, serveCertificatePDF);
router.get('/:certificateId/metadata', apiLimiter, getCertificateMetadata);
router.get('/search/cid/:cid', apiLimiter, searchByCID);

// Certificate Management Routes (Protected)
router.get('/stats', authMiddleware, getCertificateStats);
// Support both old and new naming in routes
router.get('/institution/:institutionName', authMiddleware, getOrgCertificates);
router.get('/organization/:orgName', authMiddleware, getOrgCertificates); // Keep for backward compatibility

// Public endpoints (with rate limiting)
router.get('/email/:email', apiLimiter, getCertificatesByEmail);

export default router;


// // src/routes/certificate.routes.js
// import express from 'express';
// import { pdfUpload } from '../middlewares/fileUpload.middleware.js';
// import authMiddleware from '../middlewares/auth.middleware.js';
// import rateLimit from 'express-rate-limit';
// import {
//   generateCertificate,
//   verifyCertificateById,
//   verifyCertificatePdf,
//   getCertificateMetadata,
//   uploadExternalCertificate,
//   searchByCID,
//   getCertificateStats,
//   getOrgCertificates,
//   getCertificatePDF,
//   debugPdfVerification
// } from '../controllers/certificate.controller.js';

// const router = express.Router();

// // Rate limiting for public endpoints
// const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: {
//     code: 'RATE_LIMIT_EXCEEDED',
//     message: 'Too many requests, please try again later'
//   }
// });

// // Certificate Generation and Upload Routes (Protected)
// router.post('/generate', authMiddleware, generateCertificate);
// router.post('/upload/external', authMiddleware, pdfUploadMemory.single('pdf'), uploadExternalCertificate);

// // Certificate Verification Routes (Public)
// router.get('/verify/:certificateId', apiLimiter, verifyCertificateById);
// router.post('/verify/pdf', apiLimiter, pdfUploadMemory.single('pdf'), verifyCertificatePdf);
// router.post('/verify/debug', apiLimiter, pdfUploadMemory.single('pdf'), debugPdfVerification);

// // Certificate Retrieval Routes (Public)
// router.get('/:certificateId/pdf', apiLimiter, getCertificatePDF);
// router.get('/:certificateId/metadata', apiLimiter, getCertificateMetadata);
// router.get('/search/cid/:cid', apiLimiter, searchByCID);

// // Certificate Management Routes (Protected)
// router.get('/stats', authMiddleware, getCertificateStats);
// router.get('/organization/:orgName', authMiddleware, getOrgCertificates);

// export default router;
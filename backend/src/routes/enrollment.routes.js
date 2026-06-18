import express from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import {
  listInstitutes,
  getEnrollmentStatus,
  enrollInInstitute,
  unenroll,
  getInstituteEnrollments
} from '../controllers/enrollment.controller.js';

const router = express.Router();

// Public: list all institutes (students need this to pick one)
router.get('/institutes', listInstitutes);

// Student-only routes
router.get('/status', authMiddleware, requireRole('STUDENT'), getEnrollmentStatus);
router.post('/enroll', authMiddleware, requireRole('STUDENT'), enrollInInstitute);
router.post('/unenroll', authMiddleware, requireRole('STUDENT'), unenroll);

// Institute-only: see who is enrolled
router.get('/students', authMiddleware, requireRole('INSTITUTE'), getInstituteEnrollments);

export default router;
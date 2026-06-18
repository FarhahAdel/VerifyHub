// src/routes/user.routes.js
import express from 'express';
import multer from 'multer';
import authMiddleware from '../middlewares/auth.middleware.js';
import { getUserProfile, updateUserProfile, getUserStats, getUserCertificates, updateUserLogo } from '../controllers/user.controller.js';
import { lookupStudent } from '../controllers/user.controller.js';
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes in this file require authentication
router.use(authMiddleware);

// User profile routes
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);
router.post('/profile/logo', upload.single('logo'), updateUserLogo);

// User statistics route
router.get('/stats', getUserStats);

// User certificates route
router.get('/certificates', getUserCertificates);

// Student lookup — used by institutes when generating a certificate
// GET /api/users/lookup-student?email=student@example.com
router.get('/lookup-student', lookupStudent);

export default router; 
import express from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import {
  proposeAgreement,
  listMyAgreements,
  getAgreementById,
  acceptAgreement,
  revokeAgreement,
} from '../controllers/equivalency.controller.js';

const router = express.Router();

// Every route here is institute-only — agreements are between institutions.
router.use(authMiddleware, requireRole('INSTITUTE'));

router.get('/', listMyAgreements);
router.post('/', proposeAgreement);
router.get('/:id', getAgreementById);
router.post('/:id/accept', acceptAgreement);
router.post('/:id/revoke', revokeAgreement);

export default router;

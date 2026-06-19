import express from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import {
  applyForTransfer,
  listMyTransferEvaluations,
  getTransferEvaluationById,
} from '../controllers/transfer.controller.js';

const router = express.Router();

router.use(authMiddleware);

// Student-only: apply for a transfer and view their own evaluation history
router.post('/apply', requireRole('STUDENT'), applyForTransfer);
router.get('/', requireRole('STUDENT'), listMyTransferEvaluations);

// Student (owner) or Institute (source/destination party) may view one evaluation
router.get('/:id', requireRole('STUDENT', 'INSTITUTE'), getTransferEvaluationById);

export default router;

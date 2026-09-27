import { Router } from 'express';
import {
  getRemedies,
  getRemedyById,
  createRemedy,
  updateRemedy,
  deleteRemedy,
} from '../controllers/remedy.controller.js';

const router = Router();

// Public & Admin routes for remedies
router.get('/', getRemedies);
router.get('/:id', getRemedyById);
router.post('/', createRemedy);
router.put('/:id', updateRemedy);
router.delete('/:id', deleteRemedy);

export default router;

import { Router } from 'express';
import { login, logout, refresh } from '../controllers/auth.controller.js';
import {
  validateSetPasswordToken,
  setPassword,
} from '../controllers/setPassword.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  loginSchema,
  validateSetPasswordTokenQuerySchema,
  setPasswordBodySchema,
} from '../validators/auth.validators.js';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refresh);

router.get(
  '/set-password/validate',
  validate(validateSetPasswordTokenQuerySchema),
  validateSetPasswordToken
);
router.post('/set-password', validate(setPasswordBodySchema), setPassword);

export default router;

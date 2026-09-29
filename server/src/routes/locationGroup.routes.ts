import { Router } from 'express';
import {
  assignLocationToGroup,
  createLocationGroup,
  deleteLocationGroup,
  getLocationGroup,
  getLocationGroups,
  getLocationGroupsForManagement,
  reorderLocationGroups,
  updateLocationGroup,
} from '../controllers/locationGroup.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  assignLocationGroupSchema,
  createLocationGroupSchema,
  deleteLocationGroupSchema,
  getLocationGroupSchema,
  reorderLocationGroupsSchema,
  updateLocationGroupSchema,
} from '../validators/locationGroup.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission, requireLocationAccess } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);

// List groups for the navbar switcher: any authenticated user. The controller
// narrows each group's member ids to the caller's allowed locations and drops
// groups left with none, so no access middleware is involved here.
router.get('/', getLocationGroups);

// Group mutations require location-management permission.
//
// NOTE: `requireLocationAccess` is deliberately NOT applied router-wide here.
// It reads `req.params.id` and would treat a *group* id as a location id,
// 403-ing any user with a restricted location allow-list. It is applied to the
// one route below whose `:id` genuinely is a location.
router.use(requirePermission('location-management'));

// Registered before '/:id' so 'order' and 'management' are not captured as ids.
// The management list is unfiltered so empty groups stay visible to an admin.
router.get('/management', getLocationGroupsForManagement);
router.put('/order', validate(reorderLocationGroupsSchema), reorderLocationGroups);
router.put('/locations/:id', validate(assignLocationGroupSchema), requireLocationAccess, assignLocationToGroup);

router.get('/:id', validate(getLocationGroupSchema), getLocationGroup);
router.post('/', validate(createLocationGroupSchema), createLocationGroup);
router.put('/:id', validate(updateLocationGroupSchema), updateLocationGroup);
router.delete('/:id', validate(deleteLocationGroupSchema), deleteLocationGroup);

export default router;

import { Router } from 'express';
import inventoryRouter from './inventory';

const router = Router();

// Shopping list is backed by inventory items with status=In_List.
router.use('/', inventoryRouter);

export default router;

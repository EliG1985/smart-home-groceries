import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ApiErrorResponse,
  SupermarketChainsResponse,
  SupermarketPriceLookupRequest,
  SupermarketPriceLookupResponse,
} from '../contracts/supermarketPricing';
import {
  getAvailableChains,
  lookupSupermarketPrices,
  validatePriceLookupRequest,
} from '../utils/supermarketPricing';

const router = Router();

const errorResponse = (
  res: Response<ApiErrorResponse>,
  status: number,
  code: string,
  message: string,
  details?: string[],
) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

router.get('/chains', async (req: Request, res: Response<SupermarketChainsResponse | ApiErrorResponse>) => {
  try {
    const chains = await getAvailableChains();
    res.json({
      source: 'clean_room_snapshot',
      chains,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return errorResponse(res, 500, 'DB_ERROR', message);
  }
});

router.post(
  '/prices/by-barcode',
  async (
    req: Request<any, SupermarketPriceLookupResponse | ApiErrorResponse, SupermarketPriceLookupRequest, any>,
    res: Response,
  ) => {
    const errors = validatePriceLookupRequest(req.body ?? {});
    if (errors.length > 0) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid supermarket price lookup payload', errors);
    }

    try {
      const response = await lookupSupermarketPrices(req.body);
      return res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      return errorResponse(res, 500, 'DB_ERROR', message);
    }
  },
);

export default router;

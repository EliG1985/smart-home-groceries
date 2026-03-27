import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
	ApiErrorResponse,
	InventoryBatchBuyRequest,
	InventoryBatchBuyResponse,
	InventoryBatchDeleteRequest,
	InventoryBatchDeleteResponse,
	InventoryCreateRequest,
	InventoryItemDto,
	InventoryListResponse,
	InventoryStatus,
	InventoryStatusPatchRequest,
	InventoryUpdateRequest,
	SubscriptionTier,
	UserRole,
} from '../contracts/inventory';
import { supabase } from '../utils/supabaseClient';

const router = Router();

const INVENTORY_STATUSES: InventoryStatus[] = ['In_List', 'At_Home'];
const USER_ROLES: UserRole[] = ['owner', 'editor', 'viewer'];
const SUBSCRIPTION_TIERS: SubscriptionTier[] = ['Free', 'Premium'];
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapDbRow = (row: Record<string, unknown>): InventoryItemDto => ({
	id: String(row.id),
	familyId: String(row.family_id),
	productName: String(row.product_name),
	category: String(row.category),
	expiryDate: String(row.expiry_date ?? ''),
	status: row.status === 'At_Home' ? 'At_Home' : 'In_List',
	price: Number(row.price),
	quantity: Number(row.quantity),
	addedBy: String(row.added_by),
	createdAt: String(row.created_at),
	updatedAt: String(row.updated_at),
});

const errorResponse = (
	res: Response<ApiErrorResponse>,
	status: number,
	code: string,
	message: string,
	details?: string[],
) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

const normalizeString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value.trim() : undefined;

const normalizeNumber = (value: unknown): number | undefined => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
};

const isIsoDate = (value: string): boolean => !Number.isNaN(Date.parse(value));

const getFamilyContext = (req: Request<any, any, any, any>) => {
	const familyId = normalizeString(req.header('x-family-id')) || 'demo-family';

	const rawRole = normalizeString(req.header('x-user-role')) || 'owner';
	const role: UserRole = USER_ROLES.includes(rawRole as UserRole)
		? (rawRole as UserRole)
		: 'owner';

	const rawTier = normalizeString(req.header('x-subscription-tier')) || 'Free';
	const subscriptionTier: SubscriptionTier = SUBSCRIPTION_TIERS.includes(rawTier as SubscriptionTier)
		? (rawTier as SubscriptionTier)
		: 'Free';

	const membersCountHeader = normalizeNumber(req.header('x-family-members-count'));
	const familyMembersCount = membersCountHeader && membersCountHeader > 0 ? membersCountHeader : 1;

	const userId = normalizeString(req.header('x-user-id')) || 'demo-user';

	return { familyId, role, subscriptionTier, familyMembersCount, userId };
};

const canWriteForFamily = (
	req: Request<any, any, any, any>,
	res: Response<ApiErrorResponse>,
): boolean => {
	const { role, subscriptionTier, familyMembersCount } = getFamilyContext(req);

	if (role === 'viewer') {
		errorResponse(
			res,
			403,
			'FORBIDDEN_ROLE',
			'Viewer role is not allowed to modify inventory or shopping list data.',
		);
		return false;
	}

	if (familyMembersCount > 1 && subscriptionTier !== 'Premium') {
		errorResponse(
			res,
			402,
			'PREMIUM_REQUIRED',
			'Premium subscription is required for shared family write operations.',
		);
		return false;
	}

	return true;
};

const mapCreatePayload = (
	req: Request<any, any, InventoryCreateRequest, any>,
): {
	payload: Omit<InventoryItemDto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
	errors: string[];
} => {
	const { familyId, userId } = getFamilyContext(req);
	const body = req.body || {};
	const id = normalizeString(body.id);

	const productName = normalizeString(body.product_name ?? body.productName);
	const category = normalizeString(body.category);
	const expiryDate = normalizeString(body.expiry_date ?? body.expiryDate);
	const statusRaw = normalizeString(body.status) || 'In_List';
	const status = INVENTORY_STATUSES.includes(statusRaw as InventoryStatus)
		? (statusRaw as InventoryStatus)
		: undefined;
	const price = normalizeNumber(body.price);
	const quantity = normalizeNumber(body.quantity);
	const addedBy = normalizeString(body.added_by ?? body.addedBy) || userId;

	const errors: string[] = [];

	if (!productName) {
		errors.push('product_name is required');
	}
	if (id && !UUID_PATTERN.test(id)) {
		errors.push('id must be a valid uuid');
	}
	if (!category) {
		errors.push('category is required');
	}
	if (status === 'At_Home' && !expiryDate) {
		errors.push('expiry_date is required for At_Home items');
	} else if (expiryDate && !isIsoDate(expiryDate)) {
		errors.push('expiry_date must be a valid date');
	}
	if (!status) {
		errors.push('status must be one of In_List | At_Home');
	}
	if (price === undefined) {
		errors.push('price is required');
	} else if (price < 0) {
		errors.push('price must be >= 0');
	}
	if (quantity === undefined) {
		errors.push('quantity is required');
	} else if (quantity <= 0) {
		errors.push('quantity must be > 0');
	}

	return {
		payload: {
			...(id ? { id } : {}),
			familyId,
			productName: productName || '',
			category: category || '',
			expiryDate: expiryDate || '',
			status: status || 'In_List',
			price: price ?? 0,
			quantity: quantity ?? 1,
			addedBy,
		},
		errors,
	};
};

router.get(
	'/',
	async (req: Request<any, InventoryListResponse | ApiErrorResponse, any, any>, res: Response) => {
		try {
			const { familyId } = getFamilyContext(req);
			const requestedStatus = normalizeString(req.query.status);

			let query = supabase
				.from('inventory')
				.select('*')
				.eq('family_id', familyId)
				.order('updated_at', { ascending: false });

			if (requestedStatus && INVENTORY_STATUSES.includes(requestedStatus as InventoryStatus)) {
				query = query.eq('status', requestedStatus);
			}

			const { data, error } = await query;

			if (error) {
				return errorResponse(res, 500, 'DB_ERROR', error.message);
			}

			const items = (data ?? []).map(mapDbRow);
			return res.json({ items, total: items.length });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			return errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

router.post(
	'/',
	async (
		req: Request<any, InventoryItemDto | ApiErrorResponse, InventoryCreateRequest, any>,
		res: Response,
	) => {
		if (!canWriteForFamily(req, res)) {
			return;
		}

		const { payload, errors } = mapCreatePayload(req);
		if (errors.length > 0) {
			errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid inventory create payload.', errors);
			return;
		}

		try {
			const { data, error } = await supabase
				.from('inventory')
				.insert({
					...(payload.id ? { id: payload.id } : {}),
					family_id: payload.familyId,
					product_name: payload.productName,
					category: payload.category,
					expiry_date: payload.expiryDate,
					status: payload.status,
					price: payload.price,
					quantity: payload.quantity,
					added_by: payload.addedBy,
				})
				.select()
				.single();

			if (error) {
				errorResponse(res, 500, 'DB_ERROR', error.message);
				return;
			}

			res.status(201).json(mapDbRow(data as Record<string, unknown>));
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

router.patch(
	'/:id',
	async (req: Request<{ id: string }, InventoryItemDto | ApiErrorResponse, InventoryUpdateRequest>, res: Response) => {
		if (!canWriteForFamily(req, res)) {
			return;
		}

		const { familyId } = getFamilyContext(req);

		const body = req.body || {};
		const nextProductName = normalizeString(body.product_name ?? body.productName);
		const nextCategory = normalizeString(body.category);
		const nextExpiryDate = normalizeString(body.expiry_date ?? body.expiryDate);
		const nextPrice = normalizeNumber(body.price);
		const nextQuantity = normalizeNumber(body.quantity);

		const errors: string[] = [];
		if (nextExpiryDate && !isIsoDate(nextExpiryDate)) {
			errors.push('expiry_date must be a valid date');
		}
		if (nextPrice !== undefined && nextPrice < 0) {
			errors.push('price must be >= 0');
		}
		if (nextQuantity !== undefined && nextQuantity <= 0) {
			errors.push('quantity must be > 0');
		}

		if (errors.length > 0) {
			errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid inventory update payload.', errors);
			return;
		}

		try {
			const updates: Record<string, unknown> = {};
			if (nextProductName) updates.product_name = nextProductName;
			if (nextCategory) updates.category = nextCategory;
			if (nextExpiryDate) updates.expiry_date = nextExpiryDate;
			if (nextPrice !== undefined) updates.price = nextPrice;
			if (nextQuantity !== undefined) updates.quantity = nextQuantity;

			const { data, error } = await supabase
				.from('inventory')
				.update(updates)
				.eq('id', req.params.id)
				.eq('family_id', familyId)
				.select()
				.single();

			if (error) {
				errorResponse(res, 404, 'NOT_FOUND', 'Inventory item was not found or update failed.');
				return;
			}

			res.json(mapDbRow(data as Record<string, unknown>));
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

router.patch(
	'/:id/status',
	async (
		req: Request<{ id: string }, InventoryItemDto | ApiErrorResponse, InventoryStatusPatchRequest>,
		res: Response,
	) => {
		if (!canWriteForFamily(req, res)) {
			return;
		}

		const statusRaw = normalizeString(req.body?.status);
		const status = INVENTORY_STATUSES.includes(statusRaw as InventoryStatus)
			? (statusRaw as InventoryStatus)
			: undefined;

		if (!status) {
			errorResponse(res, 400, 'VALIDATION_ERROR', 'status must be one of In_List | At_Home');
			return;
		}

		const { familyId } = getFamilyContext(req);

		try {
			const { data, error } = await supabase
				.from('inventory')
				.update({ status })
				.eq('id', req.params.id)
				.eq('family_id', familyId)
				.select()
				.single();

			if (error) {
				errorResponse(res, 404, 'NOT_FOUND', 'Inventory item was not found or update failed.');
				return;
			}

			res.json(mapDbRow(data as Record<string, unknown>));
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

router.delete(
	'/:id',
	async (req: Request<{ id: string }, { deletedId: string } | ApiErrorResponse>, res: Response) => {
		if (!canWriteForFamily(req, res)) {
			return;
		}

		const { familyId } = getFamilyContext(req);

		try {
			const { error } = await supabase
				.from('inventory')
				.delete()
				.eq('id', req.params.id)
				.eq('family_id', familyId);

			if (error) {
				errorResponse(res, 404, 'NOT_FOUND', 'Inventory item was not found or delete failed.');
				return;
			}

			res.json({ deletedId: req.params.id });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

router.post(
	'/batch/buy',
	async (
		req: Request<any, InventoryBatchBuyResponse | ApiErrorResponse, InventoryBatchBuyRequest, any>,
		res: Response,
	) => {
		if (!canWriteForFamily(req, res)) {
			return;
		}

		const itemIds = req.body?.itemIds;
		if (!Array.isArray(itemIds) || itemIds.length === 0) {
			errorResponse(res, 400, 'VALIDATION_ERROR', 'itemIds must be a non-empty array of ids.');
			return;
		}

		const { familyId } = getFamilyContext(req);

		try {
			const { data, error } = await supabase
				.from('inventory')
				.update({ status: 'At_Home' })
				.in('id', itemIds)
				.eq('family_id', familyId)
				.select('id');

			if (error) {
				errorResponse(res, 500, 'DB_ERROR', error.message);
				return;
			}

			const updatedIds = (data ?? []).map((row: Record<string, unknown>) => String(row.id));
			res.json({ updatedCount: updatedIds.length, updatedIds });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

router.post(
	'/batch/delete',
	async (
		req: Request<any, InventoryBatchDeleteResponse | ApiErrorResponse, InventoryBatchDeleteRequest, any>,
		res: Response,
	) => {
		if (!canWriteForFamily(req, res)) {
			return;
		}

		const itemIds = req.body?.itemIds;
		if (!Array.isArray(itemIds) || itemIds.length === 0) {
			errorResponse(res, 400, 'VALIDATION_ERROR', 'itemIds must be a non-empty array of ids.');
			return;
		}

		const { familyId } = getFamilyContext(req);

		try {
			const { data, error } = await supabase
				.from('inventory')
				.delete()
				.in('id', itemIds)
				.eq('family_id', familyId)
				.select('id');

			if (error) {
				errorResponse(res, 500, 'DB_ERROR', error.message);
				return;
			}

			const deletedIds = (data ?? []).map((row: Record<string, unknown>) => String(row.id));
			res.json({ deletedCount: deletedIds.length, deletedIds });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unexpected server error.';
			errorResponse(res, 500, 'INTERNAL_ERROR', message);
		}
	},
);

export default router;

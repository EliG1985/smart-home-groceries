import type { NextFunction, Request, Response } from 'express';

type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
};

export type CollaborationUserRole = 'admin' | 'editor' | 'viewer';

export type CollaborationShoppingPermissions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  markDone: boolean;
  viewProgress: boolean;
};

const normalizeBooleanHeader = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
};

export const normalizeRole = (input: unknown): CollaborationUserRole => {
  if (input === 'owner') return 'admin';
  if (input === 'admin' || input === 'editor' || input === 'viewer') return input;
  return 'viewer';
};

export const defaultPermissionsForRole = (
  role: CollaborationUserRole,
): CollaborationShoppingPermissions => {
  if (role === 'viewer') {
    return {
      create: false,
      edit: false,
      delete: false,
      markDone: true,
      viewProgress: true,
    };
  }

  return {
    create: true,
    edit: true,
    delete: true,
    markDone: true,
    viewProgress: true,
  };
};

export const getFamilyId = (req: Request): string =>
  req.header('x-family-id')?.trim() || 'demo-family';

export const getRequesterRole = (req: Request): CollaborationUserRole =>
  normalizeRole(req.header('x-user-role')?.trim() || 'viewer');

export const getRequesterUserId = (req: Request): string =>
  req.header('x-user-id')?.trim() || '';

export const getRequesterPermissions = (req: Request): CollaborationShoppingPermissions => {
  const role = getRequesterRole(req);
  const defaults = defaultPermissionsForRole(role);

  return {
    create: normalizeBooleanHeader(req.header('x-perm-shopping-create')) ?? defaults.create,
    edit: normalizeBooleanHeader(req.header('x-perm-shopping-edit')) ?? defaults.edit,
    delete: normalizeBooleanHeader(req.header('x-perm-shopping-delete')) ?? defaults.delete,
    markDone: normalizeBooleanHeader(req.header('x-perm-shopping-mark-done')) ?? defaults.markDone,
    viewProgress:
      normalizeBooleanHeader(req.header('x-perm-shopping-view-progress')) ?? defaults.viewProgress,
  };
};

const errorResponse = (
  res: Response<ApiErrorResponse>,
  status: number,
  code: string,
  message: string,
) => res.status(status).json({ error: { code, message } });

export const requireAdminRole = (
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction,
): void => {
  if (getRequesterRole(req) !== 'admin') {
    errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Only Admin can manage members.');
    return;
  }

  next();
};

export const requireAuthenticatedUser = (
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction,
): void => {
  if (!getRequesterUserId(req)) {
    errorResponse(res, 400, 'INVALID_USER', 'Authenticated user id is required.');
    return;
  }

  next();
};

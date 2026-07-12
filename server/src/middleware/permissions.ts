import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';

export type Permission =
  | 'hackathon:create'
  | 'hackathon:edit'
  | 'hackathon:delete'
  | 'hackathon:close'
  | 'team:create'
  | 'team:edit'
  | 'team:delete'
  | 'team:checkin'
  | 'team:view'
  | 'team:search'
  | 'certificate:generate'
  | 'certificate:view'
  | 'message:broadcast'
  | 'message:view'
  | 'admin:manage'
  | 'admin:create'
  | 'admin:edit'
  | 'admin:disable'
  | 'admin:delete'
  | 'import:csv'
  | 'judge:manage'
  | 'problem:manage'
  | 'report:export'
  | 'settings:manage'
  | 'analytics:view'
  | 'activity:view'
  | 'qrcode:manage'
  | 'announcement:view'
  | 'room:manage'
  | 'room:view'
  | 'room:assign'
  | 'print:documents'
  | 'automation:manage'
  | 'registration:manage'
  | 'registration:view'
  | 'reliability:view'
  | 'reliability:manage'
  | 'email:manage'
  | 'email:send'
  | 'operations:view'
  | 'milestone:manage';

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    'hackathon:create', 'hackathon:edit', 'hackathon:delete', 'hackathon:close',
    'team:create', 'team:edit', 'team:delete',
    'team:checkin', 'team:view', 'team:search',
    'certificate:generate', 'certificate:view',
    'message:broadcast', 'message:view',
    'admin:manage', 'admin:create', 'admin:edit', 'admin:disable', 'admin:delete',
    'import:csv',
    'judge:manage',
    'problem:manage',
    'report:export',
    'settings:manage',
    'analytics:view',
    'activity:view',
    'qrcode:manage',
    'announcement:view',
    'room:manage', 'room:view', 'room:assign',
    'print:documents',
    'automation:manage',
    'registration:manage', 'registration:view',
    'reliability:view', 'reliability:manage',
    'email:manage', 'email:send',
    'operations:view',
    'milestone:manage',
  ],
  SUB_ADMIN: [
    'team:checkin', 'team:view', 'team:search',
    'announcement:view',
    'room:view',
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasAny = permissions.some((p) => hasPermission(authReq.user!.role, p));
    if (!hasAny) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(authReq.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  return requireRole('SUPER_ADMIN')(req, res, next);
}

export function requireSubAdmin(req: Request, res: Response, next: NextFunction) {
  return requireRole('SUB_ADMIN')(req, res, next);
}

export { ROLE_PERMISSIONS };

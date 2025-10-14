import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  id: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
  email?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'development-secret';

export const signToken = (userId: string, workspaceId: string, role: 'owner' | 'admin' | 'member') =>
  jwt.sign({ sub: userId, workspaceId, role }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' });

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.get('authorization');
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const [, token] = authHeader.split(' ');
  if (!token) {
    return res.status(401).json({ error: 'Invalid authorization header' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
      sub: string;
      workspaceId?: string;
      role?: 'owner' | 'admin' | 'member';
      email?: string | null;
    };
    if (!decoded.sub || !decoded.workspaceId) {
      return res.status(401).json({ error: 'Token missing subject' });
    }
    req.user = {
      id: decoded.sub as string,
      workspaceId: decoded.workspaceId,
      role: decoded.role ?? 'member',
      email: decoded.email,
    } satisfies AuthenticatedUser;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

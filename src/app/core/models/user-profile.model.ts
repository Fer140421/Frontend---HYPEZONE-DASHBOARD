import { AuditableEntity } from './base.model';
import { PermissionKey } from '../authorization/permission-catalog';

export type UserRole = 'owner' | 'admin' | 'seller';

export interface UserProfile extends AuditableEntity {
  uid: string;
  email: string;
  displayName: string;
  /** Legacy transition field. Use roleId for new documents. */
  role?: UserRole;
  roleId?: string;
  active: boolean;
  permissionOverrides?: Partial<Record<PermissionKey, boolean>>;
  effectivePermissions?: Partial<Record<PermissionKey, boolean>>;
  protectedOwner?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

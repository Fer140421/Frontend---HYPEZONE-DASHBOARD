import { AuditableEntity } from './base.model';
import { PermissionKey } from '../authorization/permission-catalog';

export interface Role extends AuditableEntity {
  name: string;
  description?: string;
  active: boolean;
  system: boolean;
  permissions: Partial<Record<PermissionKey, boolean>>;
  createdBy?: string;
  updatedBy?: string;
}

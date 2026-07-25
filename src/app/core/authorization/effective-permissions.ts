import { Role } from '../models/role.model';
import { UserProfile, UserRole } from '../models/user-profile.model';
import { ALL_PERMISSIONS, PermissionKey, defaultPermissions } from './permission-catalog';

export function resolveEffectivePermissions(profile: UserProfile, role: Role): Readonly<Record<PermissionKey, boolean>> {
  if (profile.protectedOwner) return ALL_PERMISSIONS;
  const roleName = (profile.roleId ?? profile.role) as UserRole;
  return { ...defaultPermissions(roleName), ...role.permissions, ...profile.permissionOverrides };
}

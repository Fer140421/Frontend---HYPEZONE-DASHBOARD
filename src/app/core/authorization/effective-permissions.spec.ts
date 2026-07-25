import { resolveEffectivePermissions } from './effective-permissions';
import { isPermissionKey } from './permission-catalog';
import { Role } from '../models/role.model';
import { UserProfile } from '../models/user-profile.model';

describe('dynamic permissions', () => {
  const role: Role = { id: 'seller', name: 'seller', active: true, system: true, permissions: { 'products.view': true, 'products.update': false } };
  const profile: UserProfile = { uid: 'u1', email: 'seller@test.dev', displayName: 'Seller', roleId: 'seller', active: true };

  it('inherits role defaults and role document permissions', () => {
    const permissions = resolveEffectivePermissions(profile, role);
    expect(permissions['products.view']).toBeTrue();
    expect(permissions['products.update']).toBeFalse();
    expect(permissions['sales.create']).toBeTrue();
  });

  it('applies true and false overrides last', () => {
    expect(resolveEffectivePermissions({ ...profile, permissionOverrides: { 'products.update': true } }, role)['products.update']).toBeTrue();
    expect(resolveEffectivePermissions({ ...profile, permissionOverrides: { 'sales.create': false } }, role)['sales.create']).toBeFalse();
  });

  it('keeps a protected owner fully authorized and rejects unknown keys', () => {
    expect(resolveEffectivePermissions({ ...profile, protectedOwner: true }, role)['users.managePermissions']).toBeTrue();
    expect(isPermissionKey('products.view')).toBeTrue();
    expect(isPermissionKey('products.publish')).toBeFalse();
  });
});

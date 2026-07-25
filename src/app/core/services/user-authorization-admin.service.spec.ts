import { firstValueFrom } from 'rxjs';
import { PermissionKey } from '../authorization/permission-catalog';
import { UpdateUserAuthorizationCommand } from './user-authorization-admin.service';
import { UserAuthorizationAdminTestDouble } from '../testing/user-authorization-admin.test-double';

describe('UserAuthorizationAdminService local adapter', () => {
  let service: UserAuthorizationAdminTestDouble;

  beforeEach(() => {
    service = new UserAuthorizationAdminTestDouble();
  });

  it('loads the local users and completes the loading state', async () => {
    const resultPromise = firstValueFrom(service.loadUsers({ delayMs: 0 }));
    expect(service.loading()).toBeTrue();
    expect(service.error()).toBeNull();

    const result = await resultPromise;

    expect(result.length).toBe(4);
    expect(result.map((record) => record.uid)).toEqual([
      'local-owner',
      'local-admin',
      'local-seller',
      'local-inactive',
    ]);
    expect(service.loading()).toBeFalse();
  });

  it('returns copies independent from the canonical source and public view', async () => {
    const result = await firstValueFrom(service.loadUsers({ delayMs: 0 }));

    result[0].displayName = 'Mutated outside';
    result[0].permissionOverrides!['dashboard.view'] = false;

    expect(service.users()[0].displayName).toBe('Ana Owner');
    expect(service.users()[0].permissionOverrides?.['dashboard.view']).toBeUndefined();

    const reloaded = await firstValueFrom(service.loadUsers({ delayMs: 0 }));
    expect(reloaded[0].displayName).toBe('Ana Owner');
    expect(reloaded[0].permissionOverrides?.['dashboard.view']).toBeUndefined();
  });

  it('defers emission by delayMs', () => {
    jasmine.clock().install();
    let emitted = false;
    try {
      service.loadUsers({ delayMs: 50 }).subscribe(() => {
        emitted = true;
      });

      expect(service.loading()).toBeTrue();
      jasmine.clock().tick(49);
      expect(emitted).toBeFalse();
      expect(service.loading()).toBeTrue();

      jasmine.clock().tick(1);
      expect(emitted).toBeTrue();
      expect(service.loading()).toBeFalse();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('simulates an empty result without deleting the canonical fixtures', async () => {
    const empty = await firstValueFrom(
      service.loadUsers({ delayMs: 0, simulateEmpty: true }),
    );
    expect(empty).toEqual([]);
    expect(service.users()).toEqual([]);

    const retry = await firstValueFrom(service.loadUsers({ delayMs: 0 }));
    expect(retry.length).toBe(4);
  });

  it('simulates a controlled load failure and preserves users', async () => {
    const before = structuredClone(service.users());

    await expectAsync(
      firstValueFrom(
        service.loadUsers({ delayMs: 0, simulateFailure: true }),
      ),
    ).toBeRejectedWithError('No se pudieron cargar los usuarios locales.');

    expect(service.error()).toBe('No se pudieron cargar los usuarios locales.');
    expect(service.loading()).toBeFalse();
    expect(service.users()).toEqual(before);
  });

  it('clears the previous error immediately when retrying', async () => {
    await expectAsync(
      firstValueFrom(
        service.loadUsers({ delayMs: 0, simulateFailure: true }),
      ),
    ).toBeRejected();
    expect(service.error()).not.toBeNull();

    const retryPromise = firstValueFrom(service.loadUsers({ delayMs: 0 }));
    expect(service.error()).toBeNull();
    expect(service.loading()).toBeTrue();
    await retryPromise;

    expect(service.error()).toBeNull();
    expect(service.loading()).toBeFalse();
  });

  it('updates role, active and overrides in local memory', async () => {
    const updated = await service.updateUserAuthorization(
      command('local-admin', {
        roleId: 'seller',
        active: false,
        permissionOverrides: { 'sales.create': true },
      }),
    );

    expect(updated.roleId).toBe('seller');
    expect(updated.active).toBeFalse();
    expect(updated.permissionOverrides).toEqual({ 'sales.create': true });
    expect(
      service.users().find((record) => record.uid === 'local-admin'),
    ).toEqual(updated);
  });

  it('updates only the target and leaves unrelated records untouched', async () => {
    const ownerBefore = service
      .users()
      .find((record) => record.uid === 'local-owner');
    if (!ownerBefore) throw new Error('Expected local-owner before update.');
    const ownerSnapshot = structuredClone(ownerBefore);

    await service.updateUserAuthorization(
      command('local-admin', {
        roleId: 'seller',
        active: false,
        permissionOverrides: {},
      }),
    );

    expect(
      service.users().find((record) => record.uid === 'local-owner'),
    ).toEqual(ownerSnapshot);
  });

  it('does not mutate the update command or its override object', async () => {
    const updateCommand = command('local-admin', {
      roleId: 'seller',
      permissionOverrides: { 'products.delete': false },
    });
    const snapshot = structuredClone(updateCommand);

    await service.updateUserAuthorization(updateCommand);

    const updatedRecord = service
      .users()
      .find((record) => record.uid === 'local-admin');
    if (!updatedRecord) throw new Error('Expected local-admin after update.');
    const updatedOverrides = updatedRecord.permissionOverrides;
    if (!updatedOverrides) throw new Error('Expected overrides after update.');

    expect(updateCommand).toEqual(snapshot);
    expect(updateCommand.permissionOverrides).not.toBe(
      updatedOverrides,
    );
  });

  it('rejects deactivating the protected owner without partial writes', async () => {
    const before = structuredClone(service.users());

    await expectAsync(
      service.updateUserAuthorization(
        command('local-owner', { active: false }),
      ),
    ).toBeRejectedWithError(
      'El owner protegido no puede desactivarse ni cambiar de rol.',
    );

    expect(service.users()).toEqual(before);
  });

  it('rejects changing the protected owner role', async () => {
    const before = structuredClone(service.users());

    await expectAsync(
      service.updateUserAuthorization(
        command('local-owner', { roleId: 'admin' }),
      ),
    ).toBeRejectedWithError(
      'El owner protegido no puede desactivarse ni cambiar de rol.',
    );

    expect(service.users()).toEqual(before);
  });

  it('rejects denying critical permissions to the protected owner', async () => {
    const before = structuredClone(service.users());

    await expectAsync(
      service.updateUserAuthorization(
        command('local-owner', {
          permissionOverrides: {
            'dashboard.view': false,
            'users.view': false,
            'permissions.managePermissions': false,
          },
        }),
      ),
    ).toBeRejectedWithError(
      'El owner protegido no puede perder permisos críticos.',
    );

    expect(service.users()).toEqual(before);
  });

  it('preserves all records when local save failure is simulated', async () => {
    const before = structuredClone(service.users());
    service.simulateFailure = true;

    await expectAsync(
      service.updateUserAuthorization(
        command('local-admin', {
          roleId: 'seller',
          active: false,
          permissionOverrides: { 'products.delete': false },
        }),
      ),
    ).toBeRejectedWithError('Error local simulado.');

    expect(service.users()).toEqual(before);
  });

  it('rejects unknown permission keys before writing any record', async () => {
    const before = structuredClone(service.users());
    const unknownKey = 'unknown.permission' as PermissionKey;

    await expectAsync(
      service.updateUserAuthorization(
        command('local-admin', {
          permissionOverrides: { [unknownKey]: true },
        }),
      ),
    ).toBeRejectedWithError('La solicitud contiene un permiso desconocido.');

    expect(service.users()).toEqual(before);
  });

  function command(
    uid: string,
    overrides: Partial<UpdateUserAuthorizationCommand> = {},
  ): UpdateUserAuthorizationCommand {
    return {
      uid,
      roleId: 'owner',
      active: true,
      permissionOverrides: {},
      ...overrides,
    };
  }
});

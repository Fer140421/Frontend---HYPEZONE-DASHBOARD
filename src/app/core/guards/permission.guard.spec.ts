import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { permissionGuard } from './permission.guard';
import { AuthService, SessionState } from '../services/auth.service';

describe('permissionGuard', () => {
  const state$ = new BehaviorSubject<SessionState>({ status: 'initializing', user: null, profile: null });
  const can = jasmine.createSpy('can').and.returnValue(false);
  const auth = { sessionState$: state$.asObservable(), can, canAny: jasmine.createSpy('canAny').and.returnValue(false), canAll: jasmine.createSpy('canAll').and.returnValue(false) };
  const router = { createUrlTree: jasmine.createSpy('tree').and.returnValue('redirect') };

  beforeEach(() => {
    state$.next({ status: 'initializing', user: null, profile: null });
    can.calls.reset();
    can.and.returnValue(false);
    auth.canAny.calls.reset();
    auth.canAny.and.returnValue(false);
    auth.canAll.calls.reset();
    auth.canAll.and.returnValue(false);
    router.createUrlTree.calls.reset();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: AuthService, useValue: auth }, { provide: Router, useValue: router }] });
  });

  it('waits loading and allows a current permission decision', async () => {
    const result = TestBed.runInInjectionContext(() => permissionGuard({ data: { permission: 'products.view' } } as never, {} as never));
    can.and.returnValue(true);
    state$.next({ status: 'authenticated', user: {} as never, profile: {} as never });
    await expectAsync(firstValueFrom(result as Observable<boolean | string>)).toBeResolvedTo(true);
  });

  it('redirects unauthenticated users and denied permissions', async () => {
    state$.next({ status: 'unauthenticated', user: null, profile: null });
    let result = TestBed.runInInjectionContext(() => permissionGuard({ data: { permission: 'products.view' } } as never, {} as never));
    await expectAsync(firstValueFrom(result as Observable<boolean | string>)).toBeResolvedTo('redirect');
    can.and.returnValue(false);
    state$.next({ status: 'authenticated', user: {} as never, profile: {} as never });
    result = TestBed.runInInjectionContext(() => permissionGuard({ data: { permission: 'products.view' } } as never, {} as never));
    await expectAsync(firstValueFrom(result as Observable<boolean | string>)).toBeResolvedTo('redirect');
  });

  it('allows a route when any configured permission is granted', async () => {
    const permissions = ['products.view', 'sales.view'] as const;
    auth.canAny.and.returnValue(true);
    state$.next({ status: 'authenticated', user: {} as never, profile: {} as never });

    const result = TestBed.runInInjectionContext(() => permissionGuard(
      { data: { anyPermissions: permissions } } as never,
      {} as never,
    ));

    await expectAsync(firstValueFrom(result as Observable<boolean | string>)).toBeResolvedTo(true);
    expect(auth.canAny).toHaveBeenCalledOnceWith(permissions);
  });

  it('requires every configured permission for allPermissions', async () => {
    const permissions = ['users.view', 'permissions.managePermissions'] as const;
    state$.next({ status: 'authenticated', user: {} as never, profile: {} as never });
    auth.canAll.and.returnValue(false);

    let result = TestBed.runInInjectionContext(() => permissionGuard(
      { data: { allPermissions: permissions } } as never,
      {} as never,
    ));

    await expectAsync(firstValueFrom(result as Observable<boolean | string>)).toBeResolvedTo('redirect');
    expect(auth.canAll).toHaveBeenCalledOnceWith(permissions);

    auth.canAll.and.returnValue(true);
    result = TestBed.runInInjectionContext(() => permissionGuard(
      { data: { allPermissions: permissions } } as never,
      {} as never,
    ));
    await expectAsync(firstValueFrom(result as Observable<boolean | string>)).toBeResolvedTo(true);
  });
});

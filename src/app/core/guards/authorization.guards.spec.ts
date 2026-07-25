import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, take, timeout } from 'rxjs';
import { authGuard } from './auth.guard';
import { publicGuard } from './public.guard';
import { AuthService, SessionState } from '../services/auth.service';

describe('authorization guards', () => {
  const state$ = new BehaviorSubject<SessionState>({ status: 'initializing', user: null, profile: null });
  const router = { createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue('redirect' as never) };
  const roleSpy = jasmine.createSpy('role').and.returnValue(null);
  const auth = {
    sessionState$: state$.asObservable(),
    role: roleSpy,
  };

  beforeEach(() => {
    state$.next({ status: 'initializing', user: null, profile: null });
    router.createUrlTree.calls.reset();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: AuthService, useValue: auth as unknown as AuthService }, { provide: Router, useValue: router }] });
  });

  it('does not redirect while auth/profile are loading, then admits an active user', async () => {
    const result$ = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    const pending = firstValueFrom(asObservable(result$).pipe(take(1), timeout(50))).catch(() => 'pending');
    await expectAsync(pending).toBeResolvedTo('pending');
    state$.next({ status: 'loading-profile', user: {} as never, profile: null });
    state$.next({ status: 'authenticated', user: {} as never, profile: activeProfile('seller') });
    await expectAsync(firstValueFrom(asObservable(result$))).toBeResolvedTo(true);
  });

  it('blocks a signed-in user without a profile and an inactive profile', async () => {
    state$.next({ status: 'missing-profile', user: {} as never, profile: null });
    let result$ = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    await expectAsync(firstValueFrom(asObservable(result$))).toBeResolvedTo('redirect');
    state$.next({ status: 'inactive', user: {} as never, profile: { ...activeProfile('admin'), active: false } });
    result$ = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    await expectAsync(firstValueFrom(asObservable(result$))).toBeResolvedTo('redirect');
  });

  it('allows login after logout and redirects only an authenticated profile', async () => {
    state$.next({ status: 'unauthenticated', user: null, profile: null });
    let result$ = TestBed.runInInjectionContext(() => publicGuard({} as never, {} as never));
    await expectAsync(firstValueFrom(asObservable(result$))).toBeResolvedTo(true);

    state$.next({ status: 'authenticated', user: {} as never, profile: activeProfile('owner') });
    result$ = TestBed.runInInjectionContext(() => publicGuard({} as never, {} as never));
    await expectAsync(firstValueFrom(asObservable(result$))).toBeResolvedTo('redirect');
  });

});

function activeProfile(role: 'owner' | 'admin' | 'seller') {
  return { uid: 'uid', email: 'dev@example.com', displayName: 'DEV', role, active: true };
}

function asObservable(result: unknown): Observable<boolean | string> {
  return result as Observable<boolean | string>;
}

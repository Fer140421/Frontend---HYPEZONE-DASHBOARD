import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import {
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, Permission } from '../../../core/services/auth.service';
import { DashboardLayoutComponent } from './dashboard-layout.component';

describe('DashboardLayoutComponent authorization', () => {
  let fixture: ComponentFixture<DashboardLayoutComponent>;
  const grantedPermissions = signal<ReadonlySet<Permission>>(new Set());
  const auth = {
    can: jasmine.createSpy('can').and.callFake(
      (permission: Permission) => grantedPermissions().has(permission),
    ),
    profile: signal({
      uid: 'local-admin',
      email: 'admin@example.com',
      displayName: 'Admin local',
      role: 'admin',
      active: true,
    }),
    role: signal('admin'),
    logout: jasmine.createSpy('logout').and.resolveTo(),
  };
  const breakpointObserver = {
    observe: jasmine.createSpy('observe').and.returnValue(
      of<BreakpointState>({ matches: false, breakpoints: {} }),
    ),
  };

  beforeEach(async () => {
    grantedPermissions.set(new Set());
    auth.can.calls.reset();
    await TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: BreakpointObserver, useValue: breakpointObserver },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
  });

  it('shows Usuarios y permisos only when users.view is granted', () => {
    expect(sidebarText()).not.toContain('Usuarios y permisos');

    grantedPermissions.set(new Set<Permission>(['users.view']));
    fixture.detectChanges();

    expect(sidebarText()).toContain('Usuarios y permisos');
    expect(auth.can).toHaveBeenCalledWith('users.view');
  });

  it('reacts when a session permission is removed', () => {
    grantedPermissions.set(new Set<Permission>([
      'dashboard.view',
      'users.view',
    ]));
    fixture.detectChanges();
    expect(sidebarText()).toContain('Resumen');
    expect(sidebarText()).toContain('Usuarios y permisos');

    grantedPermissions.set(new Set<Permission>(['dashboard.view']));
    fixture.detectChanges();

    expect(sidebarText()).toContain('Resumen');
    expect(sidebarText()).not.toContain('Usuarios y permisos');
  });

  function sidebarText(): string {
    return fixture.nativeElement.querySelector('mat-nav-list')?.textContent ?? '';
  }
});

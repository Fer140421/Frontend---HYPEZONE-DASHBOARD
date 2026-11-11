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

  it('keeps the sidebar open with accessible icon links when collapsed on desktop', () => {
    grantedPermissions.set(new Set<Permission>(['dashboard.view']));
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('mat-sidenav-container');
    const sidebar = fixture.nativeElement.querySelector('mat-sidenav');
    const content = fixture.nativeElement.querySelector('mat-sidenav-content');
    const menuButton = fixture.nativeElement.querySelector('.topbar button');
    expect(getComputedStyle(sidebar).width).toBe('280px');
    expect(getComputedStyle(content).marginLeft).toBe('280px');
    expect(menuButton.getBoundingClientRect().left).toBeGreaterThanOrEqual(sidebar.getBoundingClientRect().right);

    fixture.componentInstance.toggleSidebar();
    fixture.detectChanges();

    const summaryLink = fixture.nativeElement.querySelector('a[aria-label="Resumen"]');
    expect(fixture.componentInstance.sidebarOpened()).toBeTrue();
    expect(sidebar.classList.contains('sidebar-compact')).toBeTrue();
    expect(shell.classList.contains('shell-compact')).toBeTrue();
    expect(getComputedStyle(shell).getPropertyValue('--sidebar-width').trim()).toBe('72px');
    expect(summaryLink.querySelector('[matListItemTitle]')?.textContent).toContain('Resumen');
    expect(summaryLink.getAttribute('title')).toBe('Resumen');

    fixture.componentInstance.toggleSidebar();
    fixture.detectChanges();
    expect(sidebar.classList.contains('sidebar-compact')).toBeFalse();
    expect(shell.classList.contains('shell-compact')).toBeFalse();
    expect(sidebarText()).toContain('Resumen');
  });

  function sidebarText(): string {
    return fixture.nativeElement.querySelector('mat-nav-list')?.textContent ?? '';
  }
});

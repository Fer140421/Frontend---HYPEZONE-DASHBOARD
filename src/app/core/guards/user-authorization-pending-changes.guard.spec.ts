import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { UsuariosPermisosComponent } from '../../features/dashboard/usuarios-permisos/usuarios-permisos.component';
import { permissionGuard } from './permission.guard';
import { userAuthorizationPendingChangesGuard } from './user-authorization-pending-changes.guard';

describe('userAuthorizationPendingChangesGuard', () => {
  const currentRoute = new ActivatedRouteSnapshot();
  const currentState = { url: '/dashboard/usuarios-permisos' } as RouterStateSnapshot;
  const nextState = { url: '/dashboard/resumen' } as RouterStateSnapshot;

  it('delegates a clean navigation result to the component', () => {
    const component = componentStub(true);

    const result = userAuthorizationPendingChangesGuard(
      component,
      currentRoute,
      currentState,
      nextState,
    );

    expect(result).toBeTrue();
    expect(component.confirmNavigationAway).toHaveBeenCalledTimes(1);
  });

  it('returns the component confirmation observable unchanged', () => {
    const confirmation = of(false);
    const component = componentStub(confirmation);

    const result = userAuthorizationPendingChangesGuard(
      component,
      currentRoute,
      currentState,
      nextState,
    );

    expect(result).toBe(confirmation);
  });

  it('is registered beside permissionGuard on the lazy standalone route', () => {
    const dashboard = routes.find((route) => route.path === 'dashboard');
    const userAuthorizationRoute = dashboard?.children?.find(
      (route) => route.path === 'usuarios-permisos',
    );

    expect(userAuthorizationRoute?.canActivate).toContain(permissionGuard);
    expect(userAuthorizationRoute?.canDeactivate).toContain(
      userAuthorizationPendingChangesGuard,
    );
    expect(userAuthorizationRoute?.data?.['permission']).toBe('users.view');
    expect(userAuthorizationRoute?.loadComponent).toBeDefined();
  });

  function componentStub(
    result: ReturnType<UsuariosPermisosComponent['confirmNavigationAway']>,
  ): UsuariosPermisosComponent {
    return {
      confirmNavigationAway: jasmine
        .createSpy('confirmNavigationAway')
        .and.returnValue(result),
    } as unknown as UsuariosPermisosComponent;
  }
});

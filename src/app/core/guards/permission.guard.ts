import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { PermissionKey } from '../authorization/permission-catalog';
import { AuthService } from '../services/auth.service';

export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const data = route.data as { permission?: PermissionKey; anyPermissions?: PermissionKey[]; allPermissions?: PermissionKey[] };
  return auth.sessionState$.pipe(
    filter((state) => !['initializing', 'loading-profile', 'loading-role'].includes(state.status)),
    take(1),
    map((state) => {
      if (state.status !== 'authenticated') return router.createUrlTree(['/auth/access'], { queryParams: { reason: state.status } });
      const allowed = data.permission ? auth.can(data.permission) : data.anyPermissions ? auth.canAny(data.anyPermissions) : data.allPermissions ? auth.canAll(data.allPermissions) : false;
      return allowed ? true : router.createUrlTree(['/auth/access'], { queryParams: { reason: 'forbidden' } });
    }),
  );
};

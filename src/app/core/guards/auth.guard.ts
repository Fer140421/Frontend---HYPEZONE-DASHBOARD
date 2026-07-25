import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.sessionState$.pipe(
    filter((state) => !['initializing', 'loading-profile', 'loading-role'].includes(state.status)),
    take(1),
    map((state) => {
      if (state.status === 'authenticated') return true;
      if (state.status === 'unauthenticated') return router.createUrlTree(['/auth/login']);
      return router.createUrlTree(['/auth/access'], { queryParams: { reason: state.status } });
    }),
  );
};

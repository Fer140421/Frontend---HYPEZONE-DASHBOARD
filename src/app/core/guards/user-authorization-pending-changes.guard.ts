import { CanDeactivateFn } from '@angular/router';
import type { UsuariosPermisosComponent } from '../../features/dashboard/usuarios-permisos/usuarios-permisos.component';

export const userAuthorizationPendingChangesGuard: CanDeactivateFn<
  UsuariosPermisosComponent
> = (component) => component.confirmNavigationAway();

import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { publicGuard } from './core/guards/public.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { userAuthorizationPendingChangesGuard } from './core/guards/user-authorization-pending-changes.guard';

export const routes: Routes = [
  {
    path: 'auth/login',
    canActivate: [publicGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/access',
    loadComponent: () =>
      import('./features/auth/access-state/access-state.component').then((m) => m.AccessStateComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/layout/dashboard-layout.component').then(
        (m) => m.DashboardLayoutComponent,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      {
        path: 'resumen',
        canActivate: [permissionGuard],
        data: { permission: 'dashboard.view' },
        loadComponent: () =>
          import('./features/dashboard/resumen/resumen.component').then((m) => m.ResumenComponent),
      },
      {
        path: 'lotes',
        canActivate: [permissionGuard], data: { permission: 'lots.view' },
        loadComponent: () =>
          import('./features/dashboard/lotes/lotes.component').then((m) => m.LotesComponent),
      },
      {
        path: 'lotes/nuevo',
        canActivate: [permissionGuard], data: { permission: 'lots.create' },
        loadComponent: () =>
          import('./features/dashboard/lotes/lotes.component').then((m) => m.LotesComponent),
      },
      {
        path: 'lotes/:id/editar',
        canActivate: [permissionGuard], data: { permission: 'lots.update' },
        loadComponent: () =>
          import('./features/dashboard/lotes/lotes.component').then((m) => m.LotesComponent),
      },
      {
        path: 'lotes/:id',
        canActivate: [permissionGuard], data: { permission: 'lots.view' },
        loadComponent: () =>
          import('./features/dashboard/lotes/lotes.component').then((m) => m.LotesComponent),
      },
      {
        path: 'productos',
        canActivate: [permissionGuard],
        data: { permission: 'products.view' },
        loadComponent: () =>
          import('./features/dashboard/productos/productos.component').then(
            (m) => m.ProductosComponent,
          ),
      },
      {
        path: 'productos/nuevo',
        canActivate: [permissionGuard], data: { permission: 'products.create' },
        loadComponent: () =>
          import('./features/dashboard/productos/productos.component').then(
            (m) => m.ProductosComponent,
          ),
      },
      {
        path: 'productos/:id',
        canActivate: [permissionGuard], data: { permission: 'products.view' },
        loadComponent: () =>
          import('./features/dashboard/productos/productos.component').then(
            (m) => m.ProductosComponent,
          ),
      },
      {
        path: 'ventas',
        canActivate: [permissionGuard], data: { permission: 'sales.view' },
        loadComponent: () =>
          import('./features/dashboard/ventas/ventas.component').then((m) => m.VentasComponent),
      },
      {
        path: 'proveedores',
        canActivate: [permissionGuard], data: { permission: 'providers.view' },
        loadComponent: () =>
          import('./features/dashboard/proveedores/proveedores.component').then(
            (m) => m.ProveedoresComponent,
          ),
      },
      {
        path: 'clientes',
        canActivate: [permissionGuard], data: { permission: 'clients.view' },
        loadComponent: () =>
          import('./features/dashboard/clientes/clientes.component').then((m) => m.ClientesComponent),
      },
      {
        path: 'ventas/nueva',
        canActivate: [permissionGuard], data: { permission: 'sales.create' },
        loadComponent: () =>
          import('./features/dashboard/ventas/ventas.component').then((m) => m.VentasComponent),
      },
      {
        path: 'ventas/:id/editar',
        canActivate: [permissionGuard], data: { permission: 'sales.update' },
        loadComponent: () =>
          import('./features/dashboard/ventas/ventas.component').then((m) => m.VentasComponent),
      },
      {
        path: 'configuracion',
        canActivate: [permissionGuard],
        data: { permission: 'settings.view' },
        loadComponent: () =>
          import('./features/dashboard/configuracion/configuracion.component').then(
            (m) => m.ConfiguracionComponent,
          ),
      },
      {
        path: 'catalogos',
        canActivate: [permissionGuard], data: { permission: 'catalogs.view' },
        loadComponent: () =>
          import('./features/dashboard/catalogos/catalogos.component').then((m) => m.CatalogosComponent),
      },
      {
        path: 'marcas',
        canActivate: [permissionGuard], data: { permission: 'catalogs.view' },
        loadComponent: () =>
          import('./features/dashboard/marcas/marcas.component').then((m) => m.MarcasComponent),
      },
      {
        path: 'tallas',
        canActivate: [permissionGuard], data: { permission: 'catalogs.view' },
        loadComponent: () =>
          import('./features/dashboard/tallas/tallas.component').then((m) => m.TallasComponent),
      },

      {
        path: 'usuarios-permisos',
        canActivate: [permissionGuard],
        canDeactivate: [userAuthorizationPendingChangesGuard],
        data: { permission: 'users.view' },
        loadComponent: () => import('./features/dashboard/usuarios-permisos/usuarios-permisos.component').then((m) => m.UsuariosPermisosComponent),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];

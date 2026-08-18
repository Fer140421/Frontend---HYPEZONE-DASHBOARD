import { BreakpointObserver } from '@angular/cdk/layout';
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map, shareReplay } from 'rxjs';
import { AuthService, Permission } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission: Permission;
}

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [
    AsyncPipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './dashboard-layout.html',
  styleUrl: './dashboard-layout.css',
})
export class DashboardLayoutComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  readonly auth = inject(AuthService);
  readonly showEnvironmentBanner = environment.showEnvironmentBanner;
  readonly environmentName = environment.environmentName;

  readonly isHandset$ = this.breakpointObserver.observe('(max-width: 900px)').pipe(
    map((result) => result.matches),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly sidebarOpened = signal(true);

  constructor() {
    this.isHandset$.pipe(takeUntilDestroyed()).subscribe((isHandset) => {
      this.sidebarOpened.set(!isHandset);
    });
  }

  toggleSidebar(): void {
    this.sidebarOpened.update((opened) => !opened);
  }

  private readonly navItems: NavItem[] = [
    { label: 'Resumen', icon: 'dashboard', route: '/dashboard/resumen', permission: 'dashboard.view' },
    { label: 'Lotes', icon: 'local_shipping', route: '/dashboard/lotes', permission: 'lots.view' },
    { label: 'Productos', icon: 'inventory_2', route: '/dashboard/productos', permission: 'products.view' },
    { label: 'Descuentos', icon: 'sell', route: '/dashboard/descuentos', permission: 'products.update' },
    { label: 'Ventas', icon: 'point_of_sale', route: '/dashboard/ventas', permission: 'sales.view' },
    { label: 'Proveedores', icon: 'local_shipping', route: '/dashboard/proveedores', permission: 'providers.view' },
    { label: 'Clientes', icon: 'groups', route: '/dashboard/clientes', permission: 'clients.view' },
    { label: 'Categorias', icon: 'category', route: '/dashboard/catalogos', permission: 'catalogs.view' },
    { label: 'Marcas', icon: 'branding_watermark', route: '/dashboard/marcas', permission: 'catalogs.view' },
    { label: 'Tallas', icon: 'straighten', route: '/dashboard/tallas', permission: 'catalogs.view' },
    { label: 'Usuarios y permisos', icon: 'manage_accounts', route: '/dashboard/usuarios-permisos', permission: 'users.view' },
  ];
  readonly visibleNavItems = computed(() => this.navItems.filter((item) => this.auth.can(item.permission)));

  logout(): void {
    void this.auth.logout();
  }
}

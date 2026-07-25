import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PermissionDefinition, PermissionKey } from '../../../core/authorization/permission-catalog';
import { CreateUserCommand } from '../../../core/services/user-authorization-admin.service';

export interface UserCreateDialogData {
  permissions: readonly PermissionDefinition[];
}

@Component({
  selector: 'app-user-create-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './user-create-dialog.html',
  styleUrl: './user-create-dialog.css',
})
export class UserCreateDialogComponent {
  readonly data = inject<UserCreateDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<UserCreateDialogComponent>);
  private readonly fb = inject(FormBuilder);
  readonly saving = signal(false);
  readonly overrides = signal<Partial<Record<PermissionKey, boolean>>>({});

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    roleId: ['seller' as 'owner' | 'admin' | 'seller', Validators.required],
    active: [true],
  });

  overrideFor(key: PermissionKey): 'inherit' | 'allow' | 'deny' {
    const value = this.overrides()[key];
    return value === undefined ? 'inherit' : value ? 'allow' : 'deny';
  }

  setOverride(key: PermissionKey, value: 'inherit' | 'allow' | 'deny'): void {
    this.overrides.update((current) => {
      const next = { ...current };
      if (value === 'inherit') delete next[key];
      else next[key] = value === 'allow';
      return next;
    });
  }

  cancel(): void {
    if (!this.saving()) this.ref.close();
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const command: CreateUserCommand = {
      displayName: value.displayName,
      email: value.email,
      roleId: value.roleId,
      active: value.active,
      permissionOverrides: this.overrides(),
    };
    this.saving.set(true);
    this.ref.close(command);
  }
}

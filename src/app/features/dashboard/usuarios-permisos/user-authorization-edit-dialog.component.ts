import {
  Component,
  DestroyRef,
  Signal,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { finalize } from 'rxjs';
import {
  PermissionDefinition,
  PermissionKey,
} from '../../../core/authorization/permission-catalog';
import { UserProfile } from '../../../core/models/user-profile.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

export type UserAuthorizationForm = FormGroup<{
  roleId: FormControl<string>;
  active: FormControl<boolean>;
}>;

export type UserAuthorizationOverrideValue = 'inherit' | 'allow' | 'deny';

export interface UserAuthorizationEditDialogData {
  user: Signal<UserProfile | null>;
  form: UserAuthorizationForm;
  permissions: readonly PermissionDefinition[];
  dirty: Signal<boolean>;
  saving: Signal<boolean>;
  canManage: Signal<boolean>;
  overrideFor: (key: PermissionKey) => UserAuthorizationOverrideValue;
  setOverride: (
    key: PermissionKey,
    value: UserAuthorizationOverrideValue,
  ) => void;
  effective: (key: PermissionKey) => boolean;
  discard: () => void;
  save: () => Promise<boolean>;
}

@Component({
  selector: 'app-user-authorization-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './user-authorization-edit-dialog.html',
  styleUrl: './user-authorization-edit-dialog.css',
})
export class UserAuthorizationEditDialogComponent {
  readonly data = inject<UserAuthorizationEditDialogData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(
    MatDialogRef<UserAuthorizationEditDialogComponent>,
  );
  private readonly destroyRef = inject(DestroyRef);
  private closeConfirmationOpen = false;

  requestClose(): void {
    if (!this.data.dirty()) {
      this.dialogRef.close();
      return;
    }
    if (this.closeConfirmationOpen) return;

    this.closeConfirmationOpen = true;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Cambios sin guardar',
          message:
            'Si cierras el editor, se descartarán los cambios realizados para este usuario.',
          cancelText: 'Continuar editando',
          confirmText: 'Descartar y cerrar',
        },
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      })
      .afterClosed()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.closeConfirmationOpen = false;
        }),
      )
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.data.discard();
        this.dialogRef.close();
      });
  }

  async save(): Promise<void> {
    if (await this.data.save()) {
      this.dialogRef.close(true);
    }
  }
}

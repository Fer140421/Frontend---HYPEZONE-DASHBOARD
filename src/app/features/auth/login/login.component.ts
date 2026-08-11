import { Component, inject, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const { email, password } = this.form.getRawValue();
    try {
      const state = await this.authService.login(email, password);
      if (state.status === 'authenticated') {
        await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
        return;
      }

      await this.router.navigate(['/auth/access'], {
        replaceUrl: true,
        queryParams: { reason: state.status },
      });
    } catch (error: unknown) {
      this.error.set(this.loginErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private loginErrorMessage(error: unknown): string {
    if (error instanceof FirebaseError && error.code === 'auth/user-disabled') {
      return 'Esta cuenta de Firebase Authentication está deshabilitada.';
    }
    return 'No pudimos iniciar sesión. Revisa tu email y contraseña.';
  }
}

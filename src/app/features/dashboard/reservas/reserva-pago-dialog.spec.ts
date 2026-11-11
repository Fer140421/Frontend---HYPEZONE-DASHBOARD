import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ReservaPagoDialogComponent } from './reservas.component';

describe('ReservaPagoDialogComponent', () => {
  it('omite la nota vacía del abono enviado a Firestore', () => {
    const close = jasmine.createSpy('close');
    TestBed.configureTestingModule({
      imports: [ReservaPagoDialogComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: { title: 'Registrar abono', maximo: 50 } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });

    const fixture = TestBed.createComponent(ReservaPagoDialogComponent);
    fixture.componentInstance.form.controls.monto.setValue(20);
    fixture.componentInstance.save();

    expect(close).toHaveBeenCalledTimes(1);
    expect(close.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ monto: 20 }));
    expect(Object.hasOwn(close.calls.mostRecent().args[0], 'notas')).toBeFalse();
  });
});

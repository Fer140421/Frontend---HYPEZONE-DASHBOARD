import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SearchableSelectComponent } from './searchable-select.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <app-searchable-select
      label="Marca"
      [formControl]="marca"
      [options]="brands"
      valueKey="id"
      labelKey="nombre"
    />
  `,
})
class TestHostComponent {
  readonly marca = new FormControl('');
  readonly brands = [
    { id: 'n', nombre: 'Nike' },
    { id: 'a', nombre: 'Adidas' },
  ];
}

describe('SearchableSelectComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('filters while typing and writes the selected option value', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.focus();
    input.value = 'nik';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('mat-option')).map((option) => option.textContent?.trim());
    expect(options).toContain('Nike');
    expect(options).not.toContain('Adidas');

    (document.querySelector('mat-option') as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.marca.value).toBe('n');
    expect(input.value).toBe('Nike');
  });

  it('keeps the search text without selecting an option when the panel closes', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.value = 'sin coincidencias';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.value).toBe('sin coincidencias');
    expect(fixture.componentInstance.marca.value).toBe('');

    input.value = 'nik';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.value).toBe('nik');
    expect(fixture.componentInstance.marca.value).toBe('');
    expect(Array.from(document.querySelectorAll('mat-option')).map((option) => option.textContent?.trim())).toContain('Nike');
  });
});

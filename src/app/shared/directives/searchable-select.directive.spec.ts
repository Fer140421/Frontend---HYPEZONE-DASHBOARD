import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { SearchableSelectDirective } from './searchable-select.directive';

@Component({
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule, SearchableSelectDirective],
  template: `
    <mat-form-field>
      <mat-label>Marca</mat-label>
      <mat-select value="item-29">
        <mat-option value="nike">Nike</mat-option>
        <mat-option value="adidas">Adidas</mat-option>
        @for (item of items; track item) {
          <mat-option [value]="'item-' + item">Marca {{ item }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
})
class TestSelectComponent {
  readonly items = Array.from({ length: 30 }, (_, index) => index);
}

describe('SearchableSelectDirective', () => {
  let fixture: ComponentFixture<TestSelectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestSelectComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TestSelectComponent);
    fixture.detectChanges();
  });

  it('shows a search input and filters options in an open Material select', async () => {
    const select = fixture.debugElement.query(By.directive(MatSelect)).componentInstance as MatSelect;
    select.open();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(select.panelOpen).toBeTrue();
    expect(select.panel?.nativeElement).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(SearchableSelectDirective))).not.toBeNull();

    const input = document.querySelector<HTMLInputElement>('.select-search-input');
    expect(input).not.toBeNull();
    expect(input!.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(document.activeElement).toBe(input);
    input!.value = 'nik';
    input!.dispatchEvent(new Event('input'));

    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    expect(options.find((option) => option.textContent?.includes('Nike'))?.classList.contains('select-search-hidden')).toBeFalse();
    expect(options.find((option) => option.textContent?.includes('Adidas'))?.classList.contains('select-search-hidden')).toBeTrue();
  });
});

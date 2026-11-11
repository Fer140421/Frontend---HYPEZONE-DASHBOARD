import { Component, forwardRef, input, computed, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

interface SearchOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [MatAutocompleteModule, MatFormFieldModule, MatIconModule, MatInputModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SearchableSelectComponent),
    multi: true,
  }],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>{{ label() }}</mat-label>
      <input
        #searchInput
        matInput
        type="text"
        autocomplete="off"
        [value]="editing() ? query() : displayValue()"
        [matAutocomplete]="auto"
        [required]="required()"
        [disabled]="disabled()"
        (focus)="onFocus()"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />
      <mat-icon matSuffix>search</mat-icon>
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="displayWith"
        [autoActiveFirstOption]="false"
        [autoSelectActiveOption]="false"
        (optionSelected)="onSelected($event)"
        (closed)="onClosed(searchInput)"
      >
        @for (option of filteredOptions(); track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    mat-form-field { width: 100%; }
  `],
})
export class SearchableSelectComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly options = input<readonly object[]>([]);
  readonly additionalOptions = input<readonly string[]>([]);
  readonly emptyLabel = input<string | null>(null);
  readonly valueKey = input('value');
  readonly labelKey = input('label');
  readonly required = input(false);

  readonly value = signal('');
  readonly query = signal('');
  readonly editing = signal(false);
  readonly disabled = signal(false);

  readonly normalizedOptions = computed<SearchOption[]>(() => [
    ...(this.emptyLabel() === null ? [] : [{ value: '', label: this.emptyLabel()! }]),
    ...this.options().map((item) => ({
      value: String((item as Record<string, unknown>)[this.valueKey()] ?? ''),
      label: String((item as Record<string, unknown>)[this.labelKey()] ?? ''),
    })),
    ...this.additionalOptions().map((item) => ({ value: item, label: item })),
  ]);
  readonly displayValue = computed(() =>
    this.normalizedOptions().find((option) => option.value === this.value())?.label ?? this.value()
  );
  readonly filteredOptions = computed(() => {
    const query = this.editing() ? this.query().trim().toLocaleLowerCase() : '';
    return this.normalizedOptions().filter((option) => option.label.toLocaleLowerCase().includes(query));
  });

  readonly displayWith = (value: string): string =>
    this.normalizedOptions().find((option) => option.value === value)?.label ?? value;

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
    this.editing.set(false);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  onFocus(): void {
    this.query.set('');
    this.editing.set(true);
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.editing.set(true);
    if (this.value()) {
      this.value.set('');
      this.onChange('');
    }
  }

  onBlur(): void {
    this.onTouched();
  }

  onClosed(input: HTMLInputElement): void {
    // El panel también se cierra si el filtro se queda temporalmente sin opciones.
    // Mientras el campo tenga foco, lo escrito sigue siendo una búsqueda.
    if (document.activeElement !== input && this.editing()) {
      this.editing.set(false);
      this.query.set('');
    }
  }

  onSelected(event: MatAutocompleteSelectedEvent): void {
    const value = String(event.option.value ?? '');
    this.value.set(value);
    this.editing.set(false);
    this.onChange(value);
    this.onTouched();
  }
}

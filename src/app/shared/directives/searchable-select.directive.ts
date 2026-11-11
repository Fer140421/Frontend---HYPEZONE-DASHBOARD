import { Directive, OnDestroy, inject } from '@angular/core';
import { MatOption } from '@angular/material/core';
import { MatSelect } from '@angular/material/select';
import { Subscription } from 'rxjs';

/** Adds a search field to Material select panels. */
@Directive({
  selector: 'mat-select',
  standalone: true,
})
export class SearchableSelectDirective implements OnDestroy {
  private readonly select = inject(MatSelect);
  private readonly subscription = this.select.openedChange.subscribe((open) => {
    if (open) queueMicrotask(() => this.attachSearch());
    else this.resetOptions();
  });
  private observer?: MutationObserver;
  private readonly initialDisabled = new Map<MatOption, boolean>();

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.observer?.disconnect();
    this.resetOptions();
  }

  private resetOptions(): void {
    this.initialDisabled.forEach((disabled, option) => (option.disabled = disabled));
    this.initialDisabled.clear();
    this.observer?.disconnect();
  }

  private attachSearch(): void {
    const panel = this.select.panel?.nativeElement as HTMLElement | undefined;
    if (!panel || panel.querySelector('.select-search')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'select-search';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'select-search-input';
    input.placeholder = 'Buscar opción...';
    input.setAttribute('aria-label', 'Buscar opciones');
    input.autocomplete = 'off';
    wrapper.append(input);
    panel.prepend(wrapper);
    input.focus();

    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase();
      const elements = panel.querySelectorAll<HTMLElement>('mat-option');
      this.select.options.toArray().forEach((option, index) => {
        const element = elements[index];
        if (!element) return;
        if (!this.initialDisabled.has(option)) this.initialDisabled.set(option, option.disabled);
        const label = option.viewValue.toLocaleLowerCase();
        const hidden = !!query && !label.includes(query);
        option.disabled = this.initialDisabled.get(option)! || hidden;
        element.classList.toggle('select-search-hidden', hidden);
      });
    };

    input.addEventListener('input', filter);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.select.close();
      } else {
        event.stopPropagation();
      }
    });
    input.addEventListener('click', (event) => event.stopPropagation());

    this.observer?.disconnect();
    this.observer = new MutationObserver(filter);
    this.observer.observe(panel, { childList: true, subtree: true, characterData: true });
  }
}

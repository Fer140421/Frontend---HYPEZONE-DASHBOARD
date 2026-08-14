import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-filter-drawer',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './filter-drawer.component.html',
  styleUrl: './filter-drawer.component.css',
})
export class FilterDrawerComponent {
  @Input() open = false;
  @Input() title = 'Filtros';
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly applied = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }

  apply(): void {
    this.applied.emit();
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.close();
    }
  }
}

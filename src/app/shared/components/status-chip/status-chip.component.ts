import { Component, computed, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [MatChipsModule],
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.css',
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly labelInput = input<string>('', { alias: 'label' });
  readonly label = computed(() => this.labelInput() || this.status().replace('_', ' '));
  readonly tone = computed(() => `status-${this.status()}`);
}

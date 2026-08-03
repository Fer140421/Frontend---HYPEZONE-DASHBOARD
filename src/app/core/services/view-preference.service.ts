import { Injectable, signal, WritableSignal } from '@angular/core';

export type ViewType = 'table' | 'cards';

@Injectable({
  providedIn: 'root',
})
export class ViewPreferenceService {
  private readonly PREFIX = 'hypezone_view_pref_';

  getViewSignal(moduleKey: string, defaultView: ViewType = 'table'): WritableSignal<ViewType> {
    const saved = this.load(moduleKey);
    const initial: ViewType = saved === 'table' || saved === 'cards' ? saved : defaultView;
    const s = signal<ViewType>(initial);

    const wrappedSignal = (() => s()) as WritableSignal<ViewType>;
    wrappedSignal.set = (val: ViewType) => {
      this.save(moduleKey, val);
      s.set(val);
    };
    wrappedSignal.update = (fn: (val: ViewType) => ViewType) => {
      const next = fn(s());
      this.save(moduleKey, next);
      s.set(next);
    };
    wrappedSignal.asReadonly = () => s.asReadonly();

    return wrappedSignal;
  }

  private load(key: string): ViewType | null {
    try {
      return localStorage.getItem(this.PREFIX + key) as ViewType | null;
    } catch {
      return null;
    }
  }

  private save(key: string, val: ViewType): void {
    try {
      localStorage.setItem(this.PREFIX + key, val);
    } catch {
      // Ignore storage errors
    }
  }
}

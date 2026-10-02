import type { UnitObject, Service } from '@tac-tics/types'

export class UnitService implements Service<UnitObject> {
  private store = new Map<string, UnitObject>();

  load(id: string): UnitObject {
    const unit = this.store.get(id);
    if (!unit) throw new Error(`Unit ${id} not found`);
    return unit;
  }

  save(unit: UnitObject): string {
    this.store.set(unit.id, unit);
    return unit.id;
  }
}
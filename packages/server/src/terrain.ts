import type { TerrainObject, Service } from '@tac-tics/types'

export class TerrainService implements Service<TerrainObject> {
  private store = new Map<string, TerrainObject>();

  load(id: string): TerrainObject {
    const terrain = this.store.get(id);
    if (!terrain) throw new Error(`Terrain ${id} not found`);
    return terrain;
  }

  save(terrain: TerrainObject): string {
    this.store.set(terrain.id, terrain);
    return terrain.id;
  }
}
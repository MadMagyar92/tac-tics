import type { GameObject, Service } from '@tac-tics/types'

export class GameService implements Service<GameObject> {
  private database = new Map<string, GameObject>();

  load(id: string): GameObject {
    const game = this.database.get(id);
    if (!game) throw new Error(`Game ${id} not found`);
    return game;
  }

  save(game: GameObject): string {
    this.database.set(game.id, game);
    return game.id;
  }
}
import {
    type AppConfig,
    type DefinitionHandler,
    type GameObject,
    type GameReferenceId,
    type Id,
    type MapDefinition,
    type ObjectHandler,
    Scope,
    type TerrainObject,
} from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

type Position = { x: number, y: number };

const getVirtualId = ({ x, y }: Position, { size, defaultTerrain }: MapDefinition): string => `${defaultTerrain.name}-${y * size.x + x + 1}`;

const getVirtualPosition = (id: string, { size, defaultTerrain }: MapDefinition): Position | undefined => {
    const split = id.lastIndexOf("-");
    const number = id.slice(split + 1);
    const index = split > 0 && id.slice(0, split) === defaultTerrain.name && /^\d+$/.test(number) ? Number(number) - 1 : -1;
    if (index < 0 || index >= size.x * size.y) {
        return undefined;
    }
    return { x: index % size.x, y: Math.floor(index / size.x) };
};

const getPositionKey = ({ x, y }: Position): string => `${x},${y}`;

/**
 * Holds the terrain of every game, of which the object file only keeps the terrain that is not the default terrain of the map of its game.
 * The ids of that terrain mean nothing but which terrain it is, whatever its position or the size of the map.
 *
 * Every other square of a map is virtual terrain: it is made from the default terrain of the map definition whenever it is loaded, and is only kept once it is saved.
 * It has no record to say where it is, so its id is the name of the default terrain and the number of its square: `sea-1` is the first square of a map of sea, and `sea-16` is the first of the second row of one 15 squares wide.
 */
export class TerrainObjectHandler extends MemoryObjectHandler<GameReferenceId, TerrainObject> {
    constructor(
        appConfigPath: string,
        appConfig: AppConfig,
        private games: ObjectHandler<Id, GameObject>,
        private mapDefinitions: DefinitionHandler<MapDefinition>,
    ) {
        super(Scope.Terrain, appConfigPath, appConfig);
    }

    loadAll(): Map<GameReferenceId, TerrainObject> {
        const terrain = super.loadAll();
        const stored = [...terrain.values()];
        for (const game of this.games.loadAll().values()) {
            const map = this.mapDefinitions.get(game.mapDefinition);
            for (const virtual of map ? this.loadAllVirtual(game, map, stored) : []) {
                terrain.set(virtual.identifier, virtual);
            }
        }
        return terrain;
    }

    load(identifier: GameReferenceId): TerrainObject | undefined {
        return super.load(identifier) ?? this.loadVirtual(identifier);
    }

    private loadVirtual({ id, gameId }: GameReferenceId): TerrainObject | undefined {
        const game = this.games.load({ id: gameId });
        const map = game && this.mapDefinitions.get(game.mapDefinition);
        const position = map && getVirtualPosition(id, map);
        if (!game || !map || !position) {
            return undefined;
        }
        return this.getStoredPositions(game, [...super.loadAll().values()]).has(getPositionKey(position)) ? undefined : this.fillVirtual(game, map, position);
    }

    private loadAllVirtual(game: GameObject, map: MapDefinition, stored: TerrainObject[]): TerrainObject[] {
        const storedPositions = this.getStoredPositions(game, stored);
        return Array.from({ length: map.size.x * map.size.y }, (_, index) => ({ x: index % map.size.x, y: Math.floor(index / map.size.x) }))
            .filter((position) => !storedPositions.has(getPositionKey(position)))
            .map((position) => this.fillVirtual(game, map, position));
    }

    private getStoredPositions({ identifier }: GameObject, stored: TerrainObject[]): Set<string> {
        return new Set(stored.filter((terrain) => terrain.identifier.gameId === identifier.id).map(({ position }) => getPositionKey(position)));
    }

    private fillVirtual({ identifier }: GameObject, map: MapDefinition, position: Position): TerrainObject {
        return {
            identifier: { id: getVirtualId(position, map), gameId: identifier.id },
            definition: { ...map.defaultTerrain },
            position,
            playerId: undefined,
        };
    }
};

import { UiBaseObject } from "./app";
import { MapReferenceId } from "./map";

export type TerrainReferenceId = MapReferenceId & {
  terrainId: string;
};

export type TerrainObject = UiBaseObject<MapReferenceId>;

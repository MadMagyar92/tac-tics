import { BaseObject, Id } from "./app";

export type MapReferenceId = Id & {
  mapId: string;
};

export type MapObject = BaseObject<Id>;

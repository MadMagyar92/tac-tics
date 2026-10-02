import { Object } from "./object";

export interface Service<O extends Object> {
  load(id: string): O;
  save(object: O): string;
}
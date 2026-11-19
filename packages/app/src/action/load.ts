import {
  BaseActionService,
  type DefinitionService,
  type LoadActionInput,
  type LoadActionOutput,
  type LoadActionPlan,
  type LoadActionResult,
  type ObjectService,
  Scope,
  type TransportDefinition,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canLoad, isLoaded } from "../common";

export const LOAD_ACTION = { scope: "action", name: "load" };

/**
 * Loads a unit into the ally carrier on its square, adding the unit to the units the carrier transports. The multi-move
 * service plans a load for a path that ends on another unit, handing over the unit as it stands at the end of the path.
 *
 * Only a carrier whose definition names a transport definition can load, only the units that definition allows, up to
 * the most it holds, and neither unit may already be loaded. The loaded unit itself is left as it was.
 */
export class LoadActionService extends BaseActionService<LoadActionInput, LoadActionPlan, LoadActionResult, LoadActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: LoadActionInput): LoadActionPlan | undefined {
    const { definition, game, unit, target } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id) {
      return undefined;
    }

    const targetDefinition = this.definitionService.get<UnitDefinition>(target.definition);
    if (!targetDefinition?.transport) {
      return undefined;
    }

    const transportDefinition = this.definitionService.get<TransportDefinition>(targetDefinition.transport);
    if (!transportDefinition) {
      return undefined;
    }

    const units = this.getUnitsFromGame(game.identifier.id);
    if (isLoaded(units, unit.identifier.id) || isLoaded(units, target.identifier.id)) {
      return undefined;
    }

    if (!canLoad(unit, target, transportDefinition.allowed, transportDefinition.maxUnits)) {
      return undefined;
    }

    return { definition, unit, target };
  }

  private getUnitsFromGame(gameId: string): UnitObject[] {
    return [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()].filter(({ identifier }) => identifier.gameId === gameId);
  }

  preview({ unit, target }: LoadActionPlan): LoadActionResult {
    return { unit, target: { ...target, transportIds: [...target.transportIds, unit.identifier.id] } };
  }

  commit({ unit, target }: LoadActionResult): LoadActionOutput {
    this.objectService.save<UnitObject>(Scope.Unit, target);
    return { definition: LOAD_ACTION, unit, target };
  }
};

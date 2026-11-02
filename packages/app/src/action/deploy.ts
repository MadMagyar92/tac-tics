import {
  type ActionService,
  type DefinitionKey,
  type DefinitionService,
  type DeployAction,
  type ObjectService,
  type OffenseDefinition,
  type OffenseObject,
  type PlayerObject,
  Scope,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canDeploy } from "./validate";

export const DEPLOY_ACTION = { scope: "action", name: "deploy" };

type Deploy = {
  definition: UnitDefinition;
  unit: UnitObject;
  offenses: OffenseObject[];
};

const nextUnitId = (ids: string[]): string => {
  const numbers = ids.map((id) => /^unit-(\d+)$/.exec(id)).flatMap((match) => (match ? [Number(match[1])] : []));
  return `unit-${Math.max(0, ...numbers) + 1}`;
};

export class DeployActionService implements ActionService<DeployAction> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(action: DeployAction): boolean {
    return this._plan(action) !== undefined;
  }

  preview(action: DeployAction): DeployAction {
    return this._act(action, true);
  }

  execute(action: DeployAction): DeployAction {
    return this._act(action, false);
  }

  private _act(action: DeployAction, preview: boolean): DeployAction {
    const deploy = this._plan(action);
    if (!deploy) {
      return action;
    }

    return preview ? this._preview(action, deploy) : this._commit(action, deploy);
  }

  private _plan(action: DeployAction): Deploy | undefined {
    const { game, player, terrain, unitDefinition } = action;
    if (player.identifier.gameId !== game.identifier.id || terrain.identifier.gameId !== game.identifier.id) {
      return undefined;
    }
    if (unitDefinition.scope !== Scope.Unit) {
      return undefined;
    }

    const definition = this.definitionService.get<UnitDefinition>(unitDefinition);
    if (!definition) {
      return undefined;
    }

    const units = [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()].filter((unit) => unit.identifier.gameId === game.identifier.id);
    if (!canDeploy(game, player, terrain, definition, units)) {
      return undefined;
    }

    const id = nextUnitId(units.map((unit) => unit.identifier.id));
    const offenses: OffenseObject[] = [];
    for (const key of definition.offenses) {
      const offense = this.definitionService.get<OffenseDefinition>(key);
      if (!offense) {
        return undefined;
      }
      offenses.push(this.fillNewOffense(action, id, offenses.length + 1, key, offense));
    }

    return { definition, unit: this.fillNewUnit(action, definition, id, offenses), offenses };
  }

  private fillNewOffense({ game }: DeployAction, unitId: string, number: number, key: DefinitionKey, definition: OffenseDefinition): OffenseObject {
    return {
      identifier: { id: `offense-${number}`, gameId: game.identifier.id, unitId },
      definition: { ...key },
      ammo: definition.ammoMax,
    };
  }

  private fillNewUnit({ game, player, terrain, unitDefinition }: DeployAction, definition: UnitDefinition, id: string, offenses: OffenseObject[], position: { x: number, y: number}): UnitObject {
    return {
      identifier: { id, gameId: game.identifier.id },
      definition: { ...definition.definition },
      position: { ...position },
      moved: false,
      acted: false,
      health: 100,
      fuel: definition.fuelMax,
      playerId: player.identifier.id,
      offenseIds: offenses.map((offense) => offense.identifier.id),
    };
  }

  private _commit(action: DeployAction, deploy: Deploy): DeployAction {
    const result = this._preview(action, deploy);
    this.objectService.save<UnitObject>(Scope.Unit, deploy.unit);
    for (const offense of deploy.offenses) {
      this.objectService.save<OffenseObject>(Scope.Offense, offense);
    }
    this.objectService.save<PlayerObject>(Scope.Player, result.player);
    return result;
  }

  private _preview(action: DeployAction, deploy: Deploy): DeployAction {
    const { player } = action;
    return { ...action, player: { ...player, funds: player.funds - deploy.definition.fundsCost }, unit: deploy.unit };
  }
};

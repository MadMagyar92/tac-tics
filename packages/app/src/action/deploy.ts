import {
  type ActionService,
  type DefinitionKey,
  type DefinitionService,
  type DeployActionInput,
  type DeployActionOutput,
  type DeployInstance,
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

const nextUnitId = (ids: string[]): string => {
  const numbers = ids.map((id) => /^unit-(\d+)$/.exec(id)).flatMap((match) => (match ? [Number(match[1])] : []));
  return `unit-${Math.max(0, ...numbers) + 1}`;
};

export class DeployActionService implements ActionService<DeployActionInput, DeployActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(input: DeployActionInput): boolean {
    return this._plan(input) !== undefined;
  }

  preview(input: DeployActionInput): DeployActionOutput | undefined {
    return this._act(input, false);
  }

  execute(input: DeployActionInput): DeployActionOutput | undefined {
    return this._act(input, true);
  }

  private _act(input: DeployActionInput, commit: boolean): DeployActionOutput | undefined {
    const deploy = this._plan(input);
    if (!deploy) {
      return undefined;
    }

    const result = this._preview(deploy);
    if (commit) {
      this._commit(result);
    }
    return { definition: input.definition, unitId: result.unit.identifier.id };
  }

  private _plan(input: DeployActionInput): DeployInstance | undefined {
    const { game, terrain, unitDefinition } = input;
    if (terrain.identifier.gameId !== game.identifier.id) {
      return undefined;
    }
    if (unitDefinition.scope !== Scope.Unit) {
      return undefined;
    }

    const player = this.getPlayerFromTurn(game.identifier.id, game.playerTurn);
    if (!player) {
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
      offenses.push(this.fillNewOffense(input, id, offenses.length + 1, key, offense));
    }

    return { input, player, unitDefinition: definition, unit: this.fillNewUnit(input, player, definition, id, offenses, terrain.position), offenses };
  }

  private getPlayerFromTurn(gameId: string, turn: number): PlayerObject | undefined {
    return [...this.objectService.loadAll<PlayerObject>(Scope.Player).values()].find((player) => player.identifier.gameId === gameId && player.order === turn);
  }

  private fillNewOffense({ game }: DeployActionInput, unitId: string, number: number, key: DefinitionKey, definition: OffenseDefinition): OffenseObject {
    return {
      identifier: { id: `offense-${number}`, gameId: game.identifier.id, unitId },
      definition: { ...key },
      ammo: definition.ammoMax,
    };
  }

  private fillNewUnit({ game }: DeployActionInput, player: PlayerObject, definition: UnitDefinition, id: string, offenses: OffenseObject[], position: { x: number, y: number}): UnitObject {
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

  private _preview(deploy: DeployInstance): DeployInstance {
    const { player, unitDefinition } = deploy;
    return { ...deploy, player: { ...player, funds: player.funds - unitDefinition.fundsCost } };
  }

  private _commit({ player, unit, offenses }: DeployInstance): void {
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    for (const offense of offenses) {
      this.objectService.save<OffenseObject>(Scope.Offense, offense);
    }
    this.objectService.save<PlayerObject>(Scope.Player, player);
  }
};

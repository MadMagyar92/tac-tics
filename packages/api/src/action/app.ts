import { Definition, DefinitionKey } from "../definition";
import { BaseObject, CaptureObject, GameObject, Id, TerrainObject, UnitObject } from "../object";

/**
 * Contains the action definition, game state, and all other parameters to
 * formulate an {@link ActionPlan}. The action definition follows the pattern
 * `@action/<name>`
 */
export type ActionInput = {
  definition: DefinitionKey;
};

/**
 * Contains the game objects to transform and any other action properties.
 * The action plan has all the  necessary informationto generate an
 * {@link ActionResult} without any additional object loads.
 */
export type ActionPlan = ActionInput;

/**
 * Contains the transformed objects of an {@link ActionPlan}, which can then be
 * committed.
 */
export type ActionResult = {};

/**
 * Contains {@link ActionResult} for the UI.
 */
export type ActionOutput = {
  definition: DefinitionKey;
};

/**
 * A service for executing an action. Fundementally, actions transform objects.
 * Before an action can be executed, it must be processed as a plan, which serves
 * as a cacheable representation of the input.
 */
export interface ActionService<I extends ActionInput, P extends ActionPlan, R extends ActionResult, O extends ActionOutput> {
  
  /**
   * Formulate an {@link ActionPlan} that can yield an {@link ActionResult}.
   * All the context for executing the action should be within the {@link ActionPlan}.
   * 
   * @param input The action definition key and properties to formulate a plan.
   * @returns An {@link ActionPlan} if the action is possible, otherwise `undefined`.
   */
  plan(input: I): P | undefined;
  
  preview(plan: P): R;
  commit(result: R): O;

  /**
   * Used for previewing and then committing an action in one step.
   * 
   * @param plan The action plan to commit.
   * @returns The output of the action.
   */
  execute(plan: P): O;
};

export abstract class BaseActionService<I extends ActionInput, P extends ActionPlan, R extends ActionResult, O extends ActionOutput> implements ActionService<I, P, R, O> {
  abstract plan(input: I): P | undefined;
  abstract preview(plan: P): R;
  abstract commit(result: R): O;
  execute(plan: P): O {
    const result = this.preview(plan);
    return this.commit(result);
  }
};

export type GameActionInput = ActionInput & {
  game: GameObject;
};

export type TerrainActionInput = GameActionInput & {
  terrain: TerrainObject | CaptureObject;
};

export type UnitActionInput = GameActionInput & {
  unit: UnitObject;
};
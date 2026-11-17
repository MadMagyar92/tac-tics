import type { ActionInput, ActionOutput, ActionPlan, ActionResult, ActionService } from "@tac-tics/api";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The app config of the repo, which maps the definition and object files in `packages/config`. */
export const realAppConfig = resolve(__dirname, "../../config/app.config.json");

const directories: string[] = [];

/** Copies the whole config directory of the repo to a new temporary directory. */
export const copyConfig = (): { directory: string; appConfig: string } => {
  const directory = mkdtempSync(join(tmpdir(), "tac-tics-server-"));
  directories.push(directory);
  cpSync(resolve(__dirname, "../../config"), directory, { recursive: true });
  return { directory, appConfig: join(directory, "app.config.json") };
};

/** Appends `objects` to the object file of `scope` in a config directory made by `copyConfig`. */
export const addObjects = (directory: string, scope: string, objects: unknown[]): void => {
  const file = join(directory, "object", `${scope}.json`);
  writeFileSync(file, JSON.stringify([...JSON.parse(readFileSync(file, "utf8")), ...objects]));
};

/** Removes the directories made by `copyConfig`. */
export const cleanUp = (): void => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
};

/** Lets `change` edit the objects of the object file of `scope` in a config directory made by `copyConfig`. */
export const editObjects = (directory: string, scope: string, change: (objects: any[]) => void): void => {
  const file = join(directory, "object", `${scope}.json`);
  const objects = JSON.parse(readFileSync(file, "utf8"));
  change(objects);
  writeFileSync(file, JSON.stringify(objects));
};

/**
 * An action service that plans the inputs `canPlan` accepts, then previews and executes the input of each plan with
 * `preview` and `execute`. Its commit, and its preview when `preview` is not given, throw when they run.
 */
export const createStubActionService = <I extends ActionInput, P extends ActionPlan, R extends ActionResult, O extends ActionOutput>(handlers: {
  canPlan: (input: I) => boolean;
  preview?: (input: I) => R;
  execute: (input: I) => O;
}): ActionService<I, P, R, O> => {
  const inputs = new Map<P, I>();
  const unstubbed = (): never => {
    throw new Error("This stage of a stub action service is not stubbed");
  };
  return {
    plan(input) {
      if (!handlers.canPlan(input)) {
        return undefined;
      }
      const plan = { definition: input.definition } as P;
      inputs.set(plan, input);
      return plan;
    },
    preview: (plan) => (handlers.preview ?? unstubbed)(inputs.get(plan)!),
    commit: unstubbed,
    execute: (plan) => handlers.execute(inputs.get(plan)!),
  };
};

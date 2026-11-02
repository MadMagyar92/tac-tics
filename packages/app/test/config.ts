import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** The app config of the repo, with the real definition and object files it maps. */
export const realAppConfig = resolve(__dirname, "../../config/app.config.json");

const created: string[] = [];

/** A new empty temporary directory, removed by `cleanUp`. */
export function tempDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "tac-tics-types-"));
    created.push(directory);
    return directory;
}

/** A copy of the repo's config directory in a temporary directory, so a test may change or write the files. */
export function copyConfig(): { directory: string; appConfig: string } {
    const directory = tempDirectory();
    cpSync(dirname(realAppConfig), directory, { recursive: true });
    return { directory, appConfig: join(directory, "app.config.json") };
}

/** Removes every temporary directory made since the last call. */
export function cleanUp(): void {
    for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
};

/** The item of `scope` in a parsed app config, to change. */
export const scopeItem = (config: any[], scope: string): any => config.find((item) => item.scope === scope);

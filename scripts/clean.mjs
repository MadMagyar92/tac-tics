import { rmSync } from "node:fs";

// Removes each path given on the command line, relative to the current directory.
for (const path of process.argv.slice(2)) {
  rmSync(path, { recursive: true, force: true });
}

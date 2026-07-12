import * as fs from "fs";
import * as path from "path";

import { runTests, runVSCodeCommand } from "@vscode/test-electron";

async function main(): Promise<void> {
  const repositoryPath = path.resolve(__dirname, "../..");
  const extensionDevelopmentPath = path.resolve(
    repositoryPath,
    "test/extension/runner",
  );
  const extensionTestsPath = path.resolve(__dirname, "suite/index.js");
  const testWorkspace = path.resolve(
    repositoryPath,
    "test/fixtures/frameworks/nox/projects/sample-nox-project",
  );
  const manifest = JSON.parse(
    await fs.promises.readFile(
      path.join(repositoryPath, "package.json"),
      "utf8",
    ),
  ) as { version: string };
  const version = "1.101.0";
  await runVSCodeCommand(
    [
      "--install-extension",
      path.join(repositoryPath, `taskmosaic-${manifest.version}.vsix`),
      "--force",
    ],
    { version },
  );

  await runTests({
    version,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [testWorkspace],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

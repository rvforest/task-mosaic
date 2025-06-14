import * as path from "path";
import * as fs from "fs";

/**
 * Helper utilities for accessing test fixtures in a framework-scoped structure.
 * 
 * Fixtures are organized as:
 * - test/fixtures/frameworks/{framework}/outputs/ - Command outputs for parsing tests
 * - test/fixtures/frameworks/{framework}/projects/ - Sample projects for integration tests
 * - test/fixtures/core/{category}/ - Core system fixtures
 */
export class FixtureHelper {
  private static fixturesRoot = path.join(__dirname);

  /**
   * Get path to a framework output fixture file.
   * @param framework - Framework name (e.g., "nox", "tox")
   * @param filename - Output file name (e.g., "valid-sessions.txt")
   */
  static getFrameworkOutputFixture(framework: string, filename: string): string {
    return path.join(this.fixturesRoot, 'frameworks', framework, 'outputs', filename);
  }

  /**
   * Get path to a framework project fixture directory.
   * @param framework - Framework name (e.g., "nox", "tox")
   * @param projectName - Project directory name (e.g., "sample-nox-project")
   */
  static getFrameworkProjectFixture(framework: string, projectName: string): string {
    return path.join(this.fixturesRoot, 'frameworks', framework, 'projects', projectName);
  }

  /**
   * Get path to a core system fixture file.
   * @param category - Category name (e.g., "tasks", "execution")
   * @param filename - File name (e.g., "sample-tasks.json")
   */
  static getCoreFixture(category: string, filename: string): string {
    return path.join(this.fixturesRoot, 'core', category, filename);
  }

  /**
   * Read the contents of a framework output fixture file.
   * @param framework - Framework name (e.g., "nox", "tox")
   * @param filename - Output file name (e.g., "valid-sessions.txt")
   */
  static readFrameworkOutputFixture(framework: string, filename: string): string {
    const filePath = this.getFrameworkOutputFixture(framework, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Read the contents of a core fixture file.
   * @param category - Category name (e.g., "tasks", "execution")
   * @param filename - File name (e.g., "sample-tasks.json")
   */
  static readCoreFixture(category: string, filename: string): string {
    const filePath = this.getCoreFixture(category, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }

  // Legacy helper methods for backward compatibility during migration
  
  /**
   * @deprecated Use getFrameworkOutputFixture("nox", filename) instead
   */
  static getNoxOutputFixture(filename: string): string {
    return this.getFrameworkOutputFixture("nox", filename);
  }

  /**
   * @deprecated Use getFrameworkProjectFixture("nox", "sample-nox-project") instead
   */
  static getSampleNoxProject(): string {
    return this.getFrameworkProjectFixture("nox", "sample-nox-project");
  }

  /**
   * @deprecated Use getCoreFixture("tasks", filename) instead
   */
  static getTasksFixture(filename: string): string {
    return this.getCoreFixture("tasks", filename);
  }
}

import * as path from "path";
import { NoxFramework } from "../src/frameworks/nox/nox-framework";
import { FrameworkRegistry } from "../src/core/framework/framework-registry";
import { OutputChannel } from "../src/core/types";
import { FixtureHelper } from "./fixtures/fixture-helpers";

// Mock OutputChannel that captures output
class TestOutputChannel implements OutputChannel {
  public output: string[] = [];

  append(value: string): void {
    this.output.push(value);
  }

  appendLine(value: string): void {
    this.output.push(value + "\n");
  }

  clear(): void {
    this.output = [];
  }

  getOutput(): string {
    return this.output.join("");
  }
}

describe("Integration Tests", () => {
  let outputChannel: TestOutputChannel;
  let sampleProjectPath: string;

  beforeAll(() => {
    sampleProjectPath = FixtureHelper.getFrameworkProjectFixture("nox", "sample-nox-project");
    outputChannel = new TestOutputChannel();
  });

  beforeEach(() => {
    // Clear the registry before each test
    (FrameworkRegistry as any).frameworks = [];
    outputChannel.clear();
  });

  describe("Framework Registration and Detection", () => {
    it("should register and detect NoxFramework", async () => {
      const noxFramework = new NoxFramework(outputChannel);
      FrameworkRegistry.register(noxFramework);

      // Check that framework is registered
      const registeredFramework = FrameworkRegistry.getFramework("nox");
      expect(registeredFramework).toBeDefined();
      expect(registeredFramework?.name).toBe("nox");

      // Note: Detection test would require actual nox executable
      // For now, just test that the method doesn't throw
      const isAvailable = await FrameworkRegistry.isAvailable("nox", [sampleProjectPath]);
      expect(typeof isAvailable).toBe("boolean");
    });

    it("should list all registered frameworks", () => {
      const noxFramework = new NoxFramework(outputChannel);
      FrameworkRegistry.register(noxFramework);

      const allFrameworks = FrameworkRegistry.getAll();
      expect(allFrameworks).toHaveLength(1);
      expect(allFrameworks[0].name).toBe("nox");
    });

    it("should handle framework detection with empty directory list", async () => {
      const noxFramework = new NoxFramework(outputChannel);
      FrameworkRegistry.register(noxFramework);

      const availableProviders = await FrameworkRegistry.getAvailableProviders([]);
      expect(availableProviders).toEqual([]);
    });

    it("should handle framework detection with non-existent directories", async () => {
      const noxFramework = new NoxFramework(outputChannel);
      FrameworkRegistry.register(noxFramework);

      const nonExistentPaths = ["/does/not/exist", "/also/does/not/exist"];
      const availableProviders = await FrameworkRegistry.getAvailableProviders(nonExistentPaths);
      
      // Should handle gracefully even if detection fails
      expect(Array.isArray(availableProviders)).toBe(true);
    });
  });

  describe("Sample Project Structure", () => {
    it("should have the expected project files", () => {
      const fs = require("fs");
      
      // Check that our sample project files exist
      expect(fs.existsSync(path.join(sampleProjectPath, "noxfile.py"))).toBe(true);
      expect(fs.existsSync(path.join(sampleProjectPath, "mypackage.py"))).toBe(true);
      expect(fs.existsSync(path.join(sampleProjectPath, "tests", "test_mypackage.py"))).toBe(true);
    });

    it("should have a valid noxfile.py structure", () => {
      const fs = require("fs");
      const noxfileContent = fs.readFileSync(
        path.join(sampleProjectPath, "noxfile.py"), 
        "utf-8"
      );
      
      // Check for expected session definitions
      expect(noxfileContent).toContain("def tests(session):");
      expect(noxfileContent).toContain("def lint(session):");
      expect(noxfileContent).toContain("def docs(session):");
      expect(noxfileContent).toContain("@nox.session");
      expect(noxfileContent).toContain('nox.options.sessions = ["tests", "lint"]');
    });
  });

  describe("Error Handling", () => {
    it("should handle framework registration errors gracefully", () => {
      // Try to register the same framework twice
      const noxFramework1 = new NoxFramework(outputChannel);
      const noxFramework2 = new NoxFramework(outputChannel);

      FrameworkRegistry.register(noxFramework1);
      // Should not throw when registering duplicate
      expect(() => FrameworkRegistry.register(noxFramework2)).toThrow();

      // Should only have one instance (no duplicates)
      const allFrameworks = FrameworkRegistry.getAll();
      expect(allFrameworks).toHaveLength(1);
      expect(allFrameworks[0].name).toBe("nox");
    });

    it("should handle undefined framework queries", () => {
      const result = FrameworkRegistry.getFramework("nonexistent");
      expect(result).toBeUndefined();
    });
  });
});

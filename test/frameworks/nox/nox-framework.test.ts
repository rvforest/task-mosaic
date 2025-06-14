import { NoxFramework } from "../../../src/frameworks/nox/nox-framework";
import { NoxTaskProvider } from "../../../src/frameworks/nox/nox-task-provider";
import { NoxTaskRunner } from "../../../src/frameworks/nox/nox-task-runner";
import { OutputChannel } from "../../../src/core/types";

// Mock the Nox provider and runner
jest.mock("../../../src/frameworks/nox/nox-task-provider");
jest.mock("../../../src/frameworks/nox/nox-task-runner");

const MockNoxTaskProvider = NoxTaskProvider as jest.MockedClass<typeof NoxTaskProvider>;
const MockNoxTaskRunner = NoxTaskRunner as jest.MockedClass<typeof NoxTaskRunner>;

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

describe("NoxFramework", () => {
  let framework: NoxFramework;
  let mockProvider: jest.Mocked<NoxTaskProvider>;
  let mockRunner: jest.Mocked<NoxTaskRunner>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocked instances
    mockProvider = new MockNoxTaskProvider(mockOutputChannel) as jest.Mocked<NoxTaskProvider>;
    mockRunner = new MockNoxTaskRunner(mockOutputChannel) as jest.Mocked<NoxTaskRunner>;
    
    // Configure mock constructor return values
    MockNoxTaskProvider.mockImplementation(() => mockProvider);
    MockNoxTaskRunner.mockImplementation(() => mockRunner);
    
    framework = new NoxFramework(mockOutputChannel);
  });

  describe("initialization", () => {
    it("should create with correct name", () => {
      expect(framework.name).toBe("nox");
    });

    it("should create NoxTaskProvider and NoxTaskRunner instances", () => {
      expect(MockNoxTaskProvider).toHaveBeenCalledWith(mockOutputChannel);
      expect(MockNoxTaskRunner).toHaveBeenCalledWith(mockOutputChannel);
    });
  });

  describe("getCommand method", () => {
    it("should return 'nox'", () => {
      expect(framework.getCommand()).toBe("nox");
    });
  });

  describe("detectInDirectory method", () => {
    beforeEach(() => {
      // Reset the listTasks mock before each test
      mockProvider.listTasks = jest.fn();
    });

    it("should return true when provider can list tasks successfully", async () => {
      mockProvider.listTasks.mockResolvedValue([]);
      
      const result = await (framework as any).detectInDirectory("/valid/path");
      
      expect(result).toBe(true);
      expect(mockProvider.listTasks).toHaveBeenCalledWith(["/valid/path"]);
    });

    it("should return false and log when ENOENT error occurs", async () => {
      const error = new Error("Command not found");
      (error as any).code = "ENOENT";
      mockProvider.listTasks.mockRejectedValue(error);
      
      const result = await (framework as any).detectInDirectory("/invalid/path");
      
      expect(result).toBe(false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Nox executable not found in /invalid/path."
      );
    });

    it("should return false and log when other error occurs", async () => {
      const error = new Error("Some other error");
      mockProvider.listTasks.mockRejectedValue(error);
      
      const result = await (framework as any).detectInDirectory("/error/path");
      
      expect(result).toBe(false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Nox not detected in /error/path: Some other error"
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockProvider.listTasks.mockRejectedValue("String error");
      
      const result = await (framework as any).detectInDirectory("/error/path");
      
      expect(result).toBe(false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Nox not detected in /error/path: String error"
      );
    });

    it("should handle null/undefined exceptions", async () => {
      mockProvider.listTasks.mockRejectedValue(null);
      
      const result = await (framework as any).detectInDirectory("/error/path");
      
      expect(result).toBe(false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Nox not detected in /error/path: null"
      );
    });
  });

  describe("provider and runner access", () => {
    it("should provide access to the NoxTaskProvider", () => {
      expect(framework.provider).toBe(mockProvider);
    });

    it("should provide access to the NoxTaskRunner", () => {
      expect(framework.runner).toBe(mockRunner);
    });
  });
});

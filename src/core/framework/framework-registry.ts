// Singleton registry for all task providers. UI and logic use this registry to get available providers
import { Framework } from "./framework";

export class FrameworkRegistry {
  private static frameworks: Framework[] = [];

  // Add to FrameworkRegistry, throw error on duplicate by name
  static register(framework: Framework) {
    if (this.frameworks.some(f => f.name === framework.name)) {
      throw new Error(`Framework with name '${framework.name}' is already registered.`);
    }
    this.frameworks.push(framework);
  }

  static async isAvailable(
    name: string,
    directories: string[],
  ): Promise<boolean> {
    const fw = this.getFramework(name);
    if (!fw) return false;
    return fw ? await fw.detect(directories) : false;
  }

  static getFramework(name: string): Framework | undefined {
    return this.frameworks.find((fw) => fw.name === name);
  }

  static getAll(): Framework[] {
    return this.frameworks.slice();
  }

  static async getAvailableProviders(
    directoryList: string[],
  ): Promise<Framework[]> {
    const detected: Framework[] = [];
    for (const provider of this.frameworks) {
      try {
        if (await provider.detect(directoryList)) {
          detected.push(provider);
        }
      } catch {
        // Silently ignore detection errors for individual frameworks
        // This allows other frameworks to still be detected
        continue;
      }
    }
    return detected;
  }
}

import { FrameworkAdapter } from "./framework";

export class FrameworkRegistry {
  private readonly frameworks = new Map<string, FrameworkAdapter>();

  register(framework: FrameworkAdapter): void {
    if (this.frameworks.has(framework.id)) {
      throw new Error(`Framework '${framework.id}' is already registered.`);
    }
    this.frameworks.set(framework.id, framework);
  }

  get(id: string): FrameworkAdapter | undefined {
    return this.frameworks.get(id);
  }

  getAll(): FrameworkAdapter[] {
    return [...this.frameworks.values()];
  }

  clear(): void {
    this.frameworks.clear();
  }
}

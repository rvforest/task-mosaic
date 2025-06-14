import { FrameworkRegistry } from '../../../src/core/framework/framework-registry';
import { Framework } from '../../../src/core/framework/framework';

// Mock framework for testing
class MockFramework extends Framework {
  public name: string;

  constructor(
    name: string,
    private shouldDetect: boolean = true,
    private detectError?: Error
  ) {
    super({} as any, {} as any, {} as any);
    this.name = name;
  }

  protected async detectInDirectory(directory: string): Promise<boolean> {
    if (this.detectError) {
      throw this.detectError;
    }
    return this.shouldDetect;
  }

  getCommand(): string {
    return this.name;
  }
}

describe('FrameworkRegistry', () => {
  beforeEach(() => {
    // Clear the registry before each test
    (FrameworkRegistry as any).frameworks = [];
  });

  describe('register', () => {
    it('should register a new framework', () => {
      const framework = new MockFramework('test-framework');
      FrameworkRegistry.register(framework);
      expect(FrameworkRegistry.getAll()).toHaveLength(1);
      expect(FrameworkRegistry.getFramework('test-framework')).toBe(framework);
    });

    it('should throw an error on duplicate framework registration', () => {
      const framework1 = new MockFramework('test-framework');
      const framework2 = new MockFramework('test-framework');
      FrameworkRegistry.register(framework1);
      expect(() => FrameworkRegistry.register(framework2)).toThrow(
        /Framework with name 'test-framework' is already registered\./
      );
      expect(FrameworkRegistry.getAll()).toHaveLength(1);
    });
  });

  describe('getFramework', () => {
    it('should retrieve a registered framework by name', () => {
      const framework = new MockFramework('test-framework');
      FrameworkRegistry.register(framework);
      
      const retrieved = FrameworkRegistry.getFramework('test-framework');
      
      expect(retrieved).toBe(framework);
    });

    it('should return undefined for non-existent framework', () => {
      const retrieved = FrameworkRegistry.getFramework('non-existent');
      
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should list all registered frameworks', () => {
      const framework1 = new MockFramework('framework-1');
      const framework2 = new MockFramework('framework-2');
      
      FrameworkRegistry.register(framework1);
      FrameworkRegistry.register(framework2);
      
      const all = FrameworkRegistry.getAll();
      
      expect(all).toHaveLength(2);
      expect(all).toContain(framework1);
      expect(all).toContain(framework2);
    });

    it('should return a copy of the frameworks array', () => {
      const framework = new MockFramework('test-framework');
      FrameworkRegistry.register(framework);
      
      const all1 = FrameworkRegistry.getAll();
      const all2 = FrameworkRegistry.getAll();
      
      expect(all1).not.toBe(all2);
      expect(all1).toEqual(all2);
    });
  });

  describe('isAvailable', () => {
    it('should return true when framework exists and detects successfully', async () => {
      const framework = new MockFramework('test-framework', true);
      FrameworkRegistry.register(framework);
      
      const result = await FrameworkRegistry.isAvailable('test-framework', ['/test/dir']);
      
      expect(result).toBe(true);
    });

    it('should return false when framework does not exist', async () => {
      const result = await FrameworkRegistry.isAvailable('non-existent', ['/test/dir']);
      
      expect(result).toBe(false);
    });

    it('should return false when framework exists but detection fails', async () => {
      const framework = new MockFramework('test-framework', false);
      FrameworkRegistry.register(framework);
      
      const result = await FrameworkRegistry.isAvailable('test-framework', ['/test/dir']);
      
      expect(result).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return frameworks that detect successfully', async () => {
      const framework1 = new MockFramework('framework-1', true);
      const framework2 = new MockFramework('framework-2', false);
      const framework3 = new MockFramework('framework-3', true);
      
      FrameworkRegistry.register(framework1);
      FrameworkRegistry.register(framework2);
      FrameworkRegistry.register(framework3);
      
      const available = await FrameworkRegistry.getAvailableProviders(['/test/dir']);
      
      expect(available).toHaveLength(2);
      expect(available).toContain(framework1);
      expect(available).toContain(framework3);
      expect(available).not.toContain(framework2);
    });

    it('should return empty array when no frameworks detect', async () => {
      const framework1 = new MockFramework('framework-1', false);
      const framework2 = new MockFramework('framework-2', false);
      
      FrameworkRegistry.register(framework1);
      FrameworkRegistry.register(framework2);
      
      const available = await FrameworkRegistry.getAvailableProviders(['/test/dir']);
      
      expect(available).toHaveLength(0);
    });

    it('should handle detection errors gracefully', async () => {
      const framework1 = new MockFramework('framework-1', true);
      const framework2 = new MockFramework('framework-2', false, new Error('Detection failed'));
      const framework3 = new MockFramework('framework-3', true);
      
      FrameworkRegistry.register(framework1);
      FrameworkRegistry.register(framework2);
      FrameworkRegistry.register(framework3);
      
      const available = await FrameworkRegistry.getAvailableProviders(['/test/dir']);
      
      expect(available).toHaveLength(2);
      expect(available).toContain(framework1);
      expect(available).toContain(framework3);
    });
  });
});

import { DiscoveryErrorCode } from "../tasks/types";

export class FrameworkDiscoveryError extends Error {
  constructor(
    public readonly code: DiscoveryErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "FrameworkDiscoveryError";
  }
}

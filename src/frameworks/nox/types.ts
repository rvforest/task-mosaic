export interface NoxListSessionsJson {
  // JSON item returned by `nox --list-sessions --json`
  session: string;
  name: string;
  description: string;
  python: string | undefined;
  tags: string[];
  call_spec: Record<string, string>;
}

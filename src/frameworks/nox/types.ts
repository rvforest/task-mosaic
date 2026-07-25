export interface NoxListSessionsJson {
  session: string;
  name: string;
  description: string;
  python: string | null;
  tags: string[];
  call_spec: Record<string, string>;
}

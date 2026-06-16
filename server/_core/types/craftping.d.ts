declare module "craftping" {
  export class JavaPingClient {
    constructor();
    ping(host: string, port: number, options?: { signal?: AbortSignal; protocolVersion?: number; hostname?: string; port?: number; resolveSrvRecords?: boolean; }): Promise<any>;
  }

  export class BedrockPingClient {
    constructor();
    ping(host: string, port: number, signal?: AbortSignal): Promise<any>;
    close(): Promise<void>;
  }

  export class QueryClient {
    constructor();
    queryBasic(host: string, port: number, signal?: AbortSignal, useLegacyStringEncoding?: boolean | null): Promise<any>;
    queryFull(host: string, port: number, signal?: AbortSignal, useLegacyStringEncoding?: boolean | null): Promise<any>;
    close(): Promise<void>;
  }
}

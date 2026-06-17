declare module "ioredis" {
  interface Redis {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<"OK">;
    del(key: string): Promise<number>;
    quit(): Promise<"OK">;
    disconnect(): Promise<void>;
  }

  export default class Redis {
    constructor(url: string);
  }
}
export class ClientError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    let message = body || `Server returned ${status}.`;
    try {
      const parsed: unknown = JSON.parse(body);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
      ) {
        message = (parsed as { error: string }).error;
      }
    } catch {
      // keep raw body
    }

    super(message);
    this.name = "ClientError";
    this.status = status;
    this.body = body;
  }
}
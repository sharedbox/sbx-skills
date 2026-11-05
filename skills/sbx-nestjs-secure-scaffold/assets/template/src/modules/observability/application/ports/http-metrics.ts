export interface HttpRequestObservation {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

export abstract class HttpMetrics {
  abstract observeRequest(observation: HttpRequestObservation): void;
}

export abstract class MetricsExporter {
  abstract readonly contentType: string;
  abstract export(): Promise<string>;
}

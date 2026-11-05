import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../../shared/presentation/decorators/public.decorator';
import { MetricsExporter } from '../../application/ports/metrics-exporter';
import { MetricsTokenGuard } from '../guards/metrics-token.guard';

@ApiExcludeController()
@Public() // not a user endpoint: protected by MetricsTokenGuard instead of JWT
@SkipThrottle()
@UseGuards(MetricsTokenGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly exporter: MetricsExporter) {}

  @Get()
  async metrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', this.exporter.contentType);
    return this.exporter.export();
  }
}

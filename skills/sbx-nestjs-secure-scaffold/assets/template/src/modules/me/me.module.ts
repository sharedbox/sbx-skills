import { Module } from '@nestjs/common';
import { MeController } from './presentation/controllers/me.controller';

@Module({ controllers: [MeController] })
export class MeModule {}

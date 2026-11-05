import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../../../../domain/entities/refresh-token';
import { RefreshTokenRepository } from '../../../../domain/repositories/refresh-token.repository';
import { RefreshTokenOrmEntity } from '../entities/refresh-token.orm-entity';
import { RefreshTokenMapper } from '../mappers/refresh-token.mapper';

@Injectable()
export class TypeOrmRefreshTokenRepository extends RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenOrmEntity) private readonly orm: Repository<RefreshTokenOrmEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<RefreshToken | null> {
    const raw = await this.orm.findOne({ where: { id } });
    return raw ? RefreshTokenMapper.toDomain(raw) : null;
  }

  async create(token: RefreshToken): Promise<void> {
    await this.orm.insert(RefreshTokenMapper.toPersistence(token));
  }

  async save(token: RefreshToken): Promise<void> {
    await this.orm.save(RefreshTokenMapper.toPersistence(token));
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.orm.update({ familyId, revokedAt: IsNull() }, { revokedAt });
  }
}

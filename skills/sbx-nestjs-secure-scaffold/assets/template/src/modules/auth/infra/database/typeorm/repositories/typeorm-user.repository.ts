import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../../domain/entities/user';
import { UserRepository } from '../../../../domain/repositories/user.repository';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class TypeOrmUserRepository extends UserRepository {
  constructor(@InjectRepository(UserOrmEntity) private readonly orm: Repository<UserOrmEntity>) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    const raw = await this.orm.findOne({ where: { id } });
    return raw ? UserMapper.toDomain(raw) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const raw = await this.orm.findOne({ where: { email } });
    return raw ? UserMapper.toDomain(raw) : null;
  }

  async create(user: User): Promise<void> {
    await this.orm.insert(UserMapper.toPersistence(user));
  }
}

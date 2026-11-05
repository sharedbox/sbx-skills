import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: '<tokenId>.<secret> as returned by /auth/login' })
  @IsString()
  @MaxLength(256)
  @Matches(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/, { message: 'refreshToken has an invalid format' })
  refreshToken: string;
}

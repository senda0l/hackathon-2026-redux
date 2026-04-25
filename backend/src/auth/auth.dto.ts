import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator'
import { Role } from '@prisma/client'

export class RegisterDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  password: string

  @IsEnum(Role)
  role: Role

  @IsOptional()
  @IsString()
  companyName?: string
}

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  password: string
}

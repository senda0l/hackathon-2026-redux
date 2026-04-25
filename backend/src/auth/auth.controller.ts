import { Controller, Post, Body, UseGuards, Get, Param } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { AuthService } from './auth.service'
import { RegisterDto, LoginDto } from './auth.dto'
import { Roles, RolesGuard } from './roles.guard'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }

  @Get('pending-companies')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  getPendingCompanies() {
    return this.auth.listPendingCompanies()
  }

  @Post('companies/:id/verify')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  verifyCompany(@Param('id') id: string) {
    return this.auth.verifyCompany(id)
  }
}

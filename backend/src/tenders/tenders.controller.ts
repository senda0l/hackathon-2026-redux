import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TendersService } from './tenders.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

@Controller('tenders')
export class TendersController {
  constructor(private tenders: TendersService) {}

  @Get()
  listTenders() {
    return this.tenders.listTenders();
  }

  @Get('proposals/mine')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COMPANY')
  myProposals(@Request() req) {
    return this.tenders.getMyProposals(req.user.id);
  }

  @Get(':id')
  getTender(@Param('id') id: string) {
    return this.tenders.getTender(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  createTender(@Body() body: { zoneId: string; deadline: string }) {
    return this.tenders.createTender(body.zoneId, new Date(body.deadline));
  }

  @Post(':id/proposals')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COMPANY')
  submitProposal(
    @Param('id') id: string,
    @Body()
    body: {
      description: string;
      constructionType: string;
      estimatedCompletion: string;
      budget: number;
      documentUrl?: string;
    },
    @Request() req,
  ) {
    return this.tenders.submitProposal(id, req.user.id, {
      ...body,
      estimatedCompletion: new Date(body.estimatedCompletion),
    });
  }

  @Post('proposals/:proposalId/score')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  scoreProposal(
    @Param('proposalId') proposalId: string,
    @Body()
    body: { designScore: number; timelineScore: number; socialScore: number },
    @Request() req,
  ) {
    return this.tenders.scoreProposal(proposalId, req.user.id, body);
  }

  @Post(':id/award')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  award(@Param('id') id: string) {
    return this.tenders.awardWinner(id);
  }
}

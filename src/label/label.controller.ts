import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SwaggerAdminAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { LabelService } from './label.service';
import { PrintLabelsDto } from './dto/print-labels.dto';

@ApiTags('Admin — Цінники')
@Controller('admin/labels')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerAdminAuth()
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Post('print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'HTML-лист ценников со штрихкодами (для печати)' })
  print(@Body() dto: PrintLabelsDto) {
    return this.labelService.renderLabels(dto.items);
  }
}

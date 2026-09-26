import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SwaggerAdminAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { InstagramService } from './instagram.service';
import {
  CreateInstagramPostDto,
  CreateInstagramPostFromLinkDto,
  UpdateInstagramPostDto,
} from './dto/instagram.dto';

@ApiTags('Admin — Instagram')
@Controller('admin/instagram')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerAdminAuth()
export class AdminInstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get()
  @ApiOperation({ summary: 'Список постів (адмін)' })
  list() {
    return this.instagramService.listAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Додати пост' })
  create(@Body() dto: CreateInstagramPostDto) {
    return this.instagramService.create(dto);
  }

  @Post('refresh-stats')
  @ApiOperation({ summary: 'Оновити лайки й коментарі всіх постів з Instagram' })
  refreshStats() {
    return this.instagramService.refreshAllStats();
  }

  @Post('from-link')
  @ApiOperation({ summary: 'Додати пост за посиланням (фото підтягується автоматично)' })
  createFromLink(@Body() dto: CreateInstagramPostFromLinkDto) {
    return this.instagramService.createFromLink(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Оновити пост' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInstagramPostDto) {
    return this.instagramService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Видалити пост' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.instagramService.remove(id);
  }
}

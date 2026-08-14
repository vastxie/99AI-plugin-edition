import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateShareDto } from './dto/createShare.dto';
import { ShareService } from './share.service';

@ApiTags('share')
@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建分享' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  async createShare(@Body() body: CreateShareDto, @Req() req: Request) {
    try {
      const user = req.user;
      const payloadCount = [body.groupId, body.htmlContent].filter(
        value => value !== undefined && value !== null && value !== '',
      ).length;
      if (payloadCount !== 1) {
        throw new HttpException(
          '必须且只能提供 groupId 或 htmlContent 其中一项',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (body.groupId) {
        // 对话分享仅接受服务端可校验所有权的对话组 ID。
        const result = await this.shareService.createShareFromGroup(body.groupId, user);
        return result;
      } else if (body.htmlContent) {
        // HTML 分享在前端通过不带 allow-same-origin 的 sandbox iframe 展示。
        const result = await this.shareService.createShareFromHtml(body.htmlContent);
        return result;
      } else {
        throw new HttpException(
          'groupId or htmlContent is required',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      Logger.error('创建分享失败', error?.stack, 'ShareController');
      throw new HttpException(
        error.message || 'Failed to create share',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':shareCode')
  @ApiOperation({ summary: '获取分享内容' })
  async getShare(@Param('shareCode') shareCode: string) {
    const shareResult = await this.shareService.getShareByCode(shareCode);
    if (!shareResult) {
      throw new HttpException('分享不存在或已过期', HttpStatus.NOT_FOUND);
    }

    return shareResult;
  }
}

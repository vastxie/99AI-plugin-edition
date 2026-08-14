import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '../../common/auth/superAuth.guard';
import { ChatService } from './chat.service';

import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatProcessDto } from './dto/chatProcess.dto';
import { SystemChatDto } from './dto/systemChat.dto';
import { TtsProcessDto } from './dto/ttsProcess.dto';
// import { MjDrawDto } from './dto/mjDraw.dto';
import { AiPptService } from '../aiTool/other/aiPPT';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@ApiTags('chatgpt')
@Controller('chatgpt')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly aiPptService: AiPptService,
  ) {}

  @Post('chat-process')
  @ApiOperation({ summary: 'gpt聊天对话' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  chatProcess(@Body() body: ChatProcessDto, @Req() req: Request, @Res() res: Response) {
    return this.chatService.chatProcess(body, req, res);
  }

  @Post('tts-process')
  @ApiOperation({ summary: 'tts语音播报' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  ttsProcess(@Body() body: TtsProcessDto, @Req() req: Request, @Res() res: Response) {
    return this.chatService.ttsProcess(body, req, res);
  }

  @Post('ppt-cover')
  @ApiOperation({ summary: 'ppt封面获取' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  pptCover(
    @Body() body: any,
    // @Req() req: Request,
  ) {
    return this.aiPptService.pptCover(body);
  }

  @Post('system-chat')
  @ApiOperation({ summary: '系统AI对话（仅超级管理员）' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async systemChat(@Body() body: SystemChatDto, @Req() req: Request) {
    return this.chatService.systemChat(body, req);
  }
}

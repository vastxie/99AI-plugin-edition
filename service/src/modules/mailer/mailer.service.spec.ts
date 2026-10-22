import { createServer, Socket } from 'node:net';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { MailerService } from './mailer.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('../globalConfig/globalConfig.service', () => ({
  GlobalConfigService: class {},
}));

describe('MailerService SMTP compatibility', () => {
  it('sends a verification message through the configured SMTP transport', async () => {
    const sockets = new Set<Socket>();
    const commands: string[] = [];
    const message: string[] = [];
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.setEncoding('utf8');
      socket.write('220 localhost test SMTP\r\n');
      let buffer = '';
      let receivingMessage = false;
      socket.on('data', (chunk) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (receivingMessage) {
            if (line === '.') {
              receivingMessage = false;
              socket.write('250 message accepted\r\n');
            } else {
              message.push(line);
            }
          } else if (line.startsWith('EHLO')) {
            socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
          } else if (line.startsWith('AUTH PLAIN')) {
            socket.write('235 authentication accepted\r\n');
          } else if (line === 'DATA') {
            receivingMessage = true;
            socket.write('354 end with a dot\r\n');
          } else if (line === 'QUIT') {
            socket.end('221 bye\r\n');
          } else {
            commands.push(line);
            socket.write('250 OK\r\n');
          }
        }
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('SMTP did not bind');
      const config = {
        getConfigs: jest.fn().mockResolvedValue({
          MAILER_HOST: '127.0.0.1',
          MAILER_PORT: String(address.port),
          MAILER_USER: 'sender@example.invalid',
          MAILER_PASS: 'synthetic-smtp-fixture',
          MAILER_SECURE: '0',
          siteName: 'SMTP test',
          siteUrl: 'https://example.invalid',
        }),
      };
      const service = new MailerService(config as unknown as GlobalConfigService);
      await service.sendMail({ to: 'recipient@example.invalid', context: { code: '482195' } });

      expect(commands).toContain('MAIL FROM:<sender@example.invalid>');
      expect(commands).toContain('RCPT TO:<recipient@example.invalid>');
      expect(message.join('\n')).toContain('Content-Type: text/html');
      expect(message.join('\n')).toContain('482195');
      expect(message.join('\n')).toContain('Subject:');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

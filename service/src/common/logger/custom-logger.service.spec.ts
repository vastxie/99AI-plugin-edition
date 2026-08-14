import { CustomLoggerService } from './custom-logger.service';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('CustomLoggerService sensitive value sanitization', () => {
  it('redacts common tokens and cloud signed URL credentials', () => {
    const logger = new CustomLoggerService();
    const sanitize = (logger as any).sanitizeLogMessage.bind(logger);
    const input =
      'https://storage.example.test/object?X-Amz-Credential=AKIA/private&X-Amz-Signature=deadbeef&token=plain-secret';

    const output = sanitize(input);

    expect(output).not.toContain('AKIA/private');
    expect(output).not.toContain('deadbeef');
    expect(output).not.toContain('plain-secret');
    expect(output).not.toContain('storage.example.test');
    expect(output).toBe('[REDACTED_URL]');
  });

  it('redacts signed URL fields inside nested objects', () => {
    const logger = new CustomLoggerService();
    const sanitize = (logger as any).sanitizeLogMessage.bind(logger);

    const output = sanitize({
      result: {
        signature: 'private-signature',
        credential: 'private-credential',
      },
    });

    expect(output).not.toContain('private-signature');
    expect(output).not.toContain('private-credential');
  });

  it('redacts contact details embedded in plain string messages', () => {
    const logger = new CustomLoggerService();
    const sanitize = (logger as any).sanitizeLogMessage.bind(logger);

    const output = sanitize('contact alice@example.test or 13800138000');

    expect(output).toBe('contact [REDACTED_EMAIL] or [REDACTED_PHONE]');
  });
});

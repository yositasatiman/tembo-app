import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { MailService } from '../src/mail/mail.service';

/** จำลอง Apps Script: POST /exec → 302 ไป /result → ตอบ JSON */
describe('MailService ผ่าน MAIL_WEBHOOK_URL (Gmail Apps Script)', () => {
  let server: Server;
  let base = '';
  let received: Record<string, string> | null = null;
  let reply = { ok: true };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/exec') {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => { received = JSON.parse(data); res.writeHead(302, { Location: '/result' }).end(); });
      } else if (req.url === '/result') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
      } else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); delete process.env.MAIL_WEBHOOK_URL; delete process.env.MAIL_WEBHOOK_SECRET; });

  it('ส่งข้อมูลพร้อม secret และตามรอย redirect ได้', async () => {
    process.env.MAIL_WEBHOOK_URL = `${base}/exec`;
    process.env.MAIL_WEBHOOK_SECRET = 's3cret';
    reply = { ok: true };
    await new MailService().send({ to: 'a@test.dev', subject: 'รหัส', text: '123456' });
    expect(received).toEqual({ secret: 's3cret', to: 'a@test.dev', subject: 'รหัส', text: '123456' });
  });

  it('ตัวส่งต่อตอบ ok:false → โยน error', async () => {
    reply = { ok: false } as never;
    await expect(new MailService().send({ to: 'a@test.dev', subject: 'x', text: 'y' })).rejects.toThrow('Failed to send email');
  });
});

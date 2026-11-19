/**
 * TEMBO — ตัวส่งอีเมลด้วย Gmail ผ่าน Google Apps Script
 *
 * ใช้แทน SMTP เพราะ Render แพ็กเกจฟรีบล็อกพอร์ต SMTP
 * วิธีติดตั้งอยู่ใน docs/deploy.md หัวข้อ "ส่งอีเมลด้วย Gmail (Apps Script)"
 *
 * Script Properties ที่ต้องตั้ง: SECRET = ค่าเดียวกับ MAIL_WEBHOOK_SECRET บน Render
 * โควตา Gmail บัญชีทั่วไป ~100 ผู้รับ/วัน
 */
function doPost(e) {
  var out = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  };
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || body.secret !== secret) return out({ ok: false, error: 'forbidden' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to || '')) return out({ ok: false, error: 'bad recipient' });
    MailApp.sendEmail({ to: body.to, subject: String(body.subject || 'TEMBO'), body: String(body.text || ''), name: 'TEMBO' });
    return out({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

/** กด Run ฟังก์ชันนี้ 1 ครั้งในหน้า Apps Script เพื่อให้สิทธิ์ส่งอีเมล และดูโควตาที่เหลือ */
function testQuota() {
  Logger.log('ส่งได้อีก ' + MailApp.getRemainingDailyQuota() + ' ผู้รับวันนี้');
}

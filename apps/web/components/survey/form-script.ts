/**
 * Apps Script ที่ผู้โพสต์วางใน Google Form ของตัวเอง
 * - setup(): สร้าง trigger "เมื่อส่งฟอร์ม" + แจ้ง TEMBO ว่าเชื่อมแล้ว (กด Run ครั้งเดียว)
 * - onTemboSubmit(): ทุกครั้งที่มีคนส่ง หา "รหัส TEMBO" ในคำตอบแล้วส่งให้ TEMBO จ่าย Coin
 * ลองส่งซ้ำ 3 ครั้ง เผื่อเซิร์ฟเวอร์ฟรีกำลังตื่น (ใช้เวลาราว 1 นาที)
 */
export function buildFormScript(endpoint: string, secret: string) {
  return `// TEMBO — แจ้งผลการส่งฟอร์มไปที่ TEMBO อัตโนมัติ (อย่าแชร์โค้ดนี้ มีรหัสลับของแบบสอบถาม)
var TEMBO_URL = '${endpoint}';
var TEMBO_SECRET = '${secret}';

/** กด Run ฟังก์ชันนี้ 1 ครั้งหลังวางโค้ด */
function setup() {
  var form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onTemboSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onTemboSubmit').forForm(form).onFormSubmit().create();
  var ok = sendToTembo_({ secret: TEMBO_SECRET, ping: true });
  Logger.log(ok ? 'เชื่อม TEMBO สำเร็จ กลับไปที่ TEMBO ได้เลย' : 'เชื่อมไม่สำเร็จ ลองกด Run อีกครั้ง');
}

function onTemboSubmit(e) {
  var codes = e.response.getItemResponses()
    .map(function (r) { return String(r.getResponse() || '').trim().toUpperCase(); })
    .filter(function (v) { return /^TB[A-Z0-9]{8}$/.test(v); });
  if (codes.length) sendToTembo_({ secret: TEMBO_SECRET, codes: codes });
}

function sendToTembo_(body) {
  for (var i = 0; i < 3; i++) {
    try {
      var res = UrlFetchApp.fetch(TEMBO_URL, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) return true;
      if (res.getResponseCode() === 403) return false;
    } catch (err) { /* เซิร์ฟเวอร์อาจกำลังตื่น */ }
    Utilities.sleep(10000);
  }
  return false;
}
`;
}

import type { Lang } from '@tembo/shared';

/**
 * Apps Script ที่ผู้โพสต์วางใน Google Form ของตัวเอง
 * - setup(): เพิ่มคำถาม "รหัส TEMBO" (ถ้ายังไม่มี) + trigger "เมื่อส่งฟอร์ม" + แจ้ง TEMBO ว่าเชื่อมแล้ว
 *   พร้อมลิงก์กรอกล่วงหน้า เพื่อให้ TEMBO ใส่รหัสของผู้ตอบแต่ละคนลงในฟอร์มได้
 * - onTemboSubmit(): ทุกครั้งที่มีคนส่ง หารหัส TEMBO ในคำตอบแล้วส่งให้ TEMBO จ่าย Coin
 * ลองส่งซ้ำ 3 ครั้ง เผื่อเซิร์ฟเวอร์ฟรีกำลังตื่น (ใช้เวลาราว 1 นาที)
 * ข้อความในฟอร์มและในสคริปต์ใช้ภาษาที่ผู้สร้างเลือกอยู่ตอนคัดลอก
 */
export function buildFormScript(endpoint: string, secret: string, lang: Lang) {
  const th = lang === 'th';
  const L = {
    header: th ? 'TEMBO — แจ้งผลการส่งฟอร์มไปที่ TEMBO อัตโนมัติ (อย่าแชร์โค้ดนี้ มีรหัสลับของแบบสอบถาม)' : 'TEMBO — reports form submissions to TEMBO automatically (do not share: contains your survey secret)',
    title: th ? 'รหัส TEMBO (ห้ามแก้)' : 'TEMBO code (do not edit)',
    help: th ? 'TEMBO ใส่รหัสนี้ให้อัตโนมัติ เพื่อให้คุณได้รับเหรียญหลังส่งฟอร์ม' : 'TEMBO fills this in for you so you get your Coin after submitting.',
    run: th ? 'กด Run ฟังก์ชันนี้ 1 ครั้งหลังวางโค้ด' : 'Run this function once after pasting the code',
    ok: th ? 'เชื่อม TEMBO สำเร็จ กลับไปที่ TEMBO ได้เลย' : 'Connected to TEMBO. You can go back to TEMBO now.',
    fail: th ? 'เชื่อมไม่สำเร็จ ลองกด Run อีกครั้ง' : 'Could not connect. Please press Run again.',
    waking: th ? 'เซิร์ฟเวอร์อาจกำลังตื่น' : 'the server may be waking up',
  };
  return `// ${L.header}
var TEMBO_URL = '${endpoint}';
var TEMBO_SECRET = '${secret}';
var CODE_TITLE = '${L.title}';

/** ${L.run} */
function setup() {
  var form = FormApp.getActiveForm();
  var item = temboCodeItem_(form);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onTemboSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onTemboSubmit').forForm(form).onFormSubmit().create();
  var prefillUrl = form.createResponse().withItemResponse(item.createResponse('TEMBO')).toPrefilledUrl();
  var ok = sendToTembo_({ secret: TEMBO_SECRET, ping: true, prefillUrl: prefillUrl });
  Logger.log(ok ? '${L.ok}' : '${L.fail}');
}

function temboCodeItem_(form) {
  var items = form.getItems(FormApp.ItemType.TEXT);
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === CODE_TITLE) return items[i].asTextItem();
  }
  var item = form.addTextItem().setTitle(CODE_TITLE).setHelpText('${L.help}').setRequired(true);
  form.moveItem(item.getIndex(), 0);
  return item;
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
    } catch (err) { /* ${L.waking} */ }
    Utilities.sleep(10000);
  }
  return false;
}
`;
}

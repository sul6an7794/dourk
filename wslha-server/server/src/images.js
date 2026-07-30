// ضغط الصور قبل التخزين: تصغير العرض الأقصى + جودة JPEG معقولة.
// يقلّل الحجم بشكل كبير (غالبًا 10x+) بفرق غير ملحوظ على شاشة اللعبة.
// jimp مكتبة JavaScript خالصة — بدون اعتماديات native تحتاج أدوات بناء.

const MAX_WIDTH = 1600; // أقصى عرض؛ الصور الأعرض تُصغَّر مع الحفاظ على النسبة
const QUALITY = 82; // جودة JPEG (1-100) — 82 توازن ممتاز بين الحجم والوضوح

// يرجّع { buffer, contentType, ext } للصورة المضغوطة، أو null لو تعذّر الضغط (نخزّن الأصل).
async function compressImage(buffer) {
  try {
    const { Jimp } = require('jimp');
    let readable = buffer;
    try {
      await Jimp.read(readable);
    } catch (e) {
      // jimp ما يدعم HEIC/HEIF (صيغة صور آيفون الافتراضية) — لو خزّناها كما هي بدون تحويل
      // تُقبل بالرفع (المتصفح/الجوال يبلغ عنها image/heic فتمر فحص الأمان) بس تظهر "صورة
      // مكسورة" بكل متصفح غير Safari لأنه ببساطة ما يقدر يعرض HEIC. نحوّلها لـJPEG أولًا.
      readable = await require('heic-convert')({ buffer, format: 'JPEG', quality: 0.92 });
    }
    const img = await Jimp.read(readable);
    if (img.width > MAX_WIDTH) {
      const h = Math.round((img.height / img.width) * MAX_WIDTH);
      img.resize({ w: MAX_WIDTH, h });
    }
    const out = await img.getBuffer('image/jpeg', { quality: QUALITY });
    return { buffer: out, contentType: 'image/jpeg', ext: '.jpg' };
  } catch (e) {
    // صيغة غير مدعومة (SVG مثلًا) أو ملف تالف فعلًا — نرجع null لنخزّن الأصل كما هو.
    return null;
  }
}

module.exports = { compressImage };

const functions = require('@google-cloud/functions-framework');
const ee = require('@google/earthengine');
const eeKey = require('./eeKey.json');  

const { runSoilDownload } = require('./soil');   // 引入 soil.js
const { runVIDownload }   = require('./vi');
const { runPRISMDownload } = require('./prism');
const { runLSTDownload } = require('./lst');
const { runGLDASDownload } = require('./gldas');

// Earth Engine Initialization
function initEE() {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      eeKey,
      () => ee.initialize(null, null, resolve, reject),
      reject
    );
  });
}

// ---------- 统一日期窗口（America/Chicago） ----------
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/**
 * 取“芝加哥时区的今天”
 */
function todayChicago() {
  const tz = 'America/Chicago';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  return { y, m, d, ymd: `${parts.year}-${parts.month}-${parts.day}` };
}

/**
 * 统一规则：
 * - 目标窗口：当年 3-01 → 今天；
 * - 如果今天在 3-01 之前（1/1～2/29/30），则使用“上一年 3-01 → 今天”
 * - 返回给子模块的参数格式保持不变：
 *   { years:[Y,Y], window:{ start:'-03-01', end:'-MM-DD' }, year:Y, today:'YYYY-MM-DD' }
 */
function buildSeasonWindow() {
  const t = todayChicago();
  const isBeforeMarch1 = (t.m < 3) || (t.m === 3 && t.d < 1); // 实际就是 t.m < 3
  const Y = isBeforeMarch1 ? (t.y - 1) : t.y;
  const endRel = `-${pad2(t.m)}-${pad2(t.d)}`; // 例如 -08-28

  return {
    years: [Y, Y],                         // 维持你各模块的 [start,end] 形式
    window: { start: '-03-01', end: endRel }, // 各模块里仍然用 `${year}${window.start}` 这种拼接
    year: Y,                               // 有的模块可能直接需要 year
    today: t.ymd,                          // 备用：绝对“今天”字符串
    // 如果某些模块希望用绝对日期而非“year+相对”，也顺便提供：
    windowAbs: { start: `${Y}-03-01`, end: t.ymd } // 注意：EE filterDate 是 [start, end)
  };
}

// Pub/Sub CloudEvent 入口
functions.cloudEvent('download', async (cloudEvent) => {
  try {
    await initEE();

    // 1) 统一生成本次执行的日期窗口
    const AUTO = buildSeasonWindow();

    // 2) 解析消息（允许覆盖默认参数）
    let msg = {};
    const m = cloudEvent?.data?.message;
    if (m?.data) {
      try {
        msg = JSON.parse(Buffer.from(m.data, 'base64').toString());
      } catch {}
    }

    const task = (msg.task || 'all').toLowerCase();  // 默认 all
    const params = { ...AUTO, ...(msg.params || {}) }; // 统一窗口，可被消息覆盖

    console.info('ENTRY task:', task, 'params:', params);

    runGLDASDownload(params);
    runLSTDownload(params);
    runPRISMDownload(params);
    runVIDownload(params);
    runSoilDownload(params);

  } catch (err) {
    console.error(err);
    throw err;
  }
});

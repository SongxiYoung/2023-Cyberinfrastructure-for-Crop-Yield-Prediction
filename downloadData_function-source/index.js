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

// ---------- Update Time Zone: Chicago ----------
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/**
 * today
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
 *   { years:[Y,Y], window:{ start:'-03-01', end:'-MM-DD' }, year:Y, today:'YYYY-MM-DD' }
 */
function buildSeasonWindow() {
  const t = todayChicago();
  const isBeforeMarch1 = (t.m < 3) || (t.m === 3 && t.d < 1); 
  const Y = isBeforeMarch1 ? (t.y - 1) : t.y;
  const endRel = `-${pad2(t.m)}-${pad2(t.d)}`; // -08-28

  return {
    years: [Y, Y],                         // 
    window: { start: '-03-01', end: endRel }, //
    year: Y,                               // 
    today: t.ymd,                          //
    // 
    windowAbs: { start: `${Y}-03-01`, end: t.ymd } // 
  };
}

// Pub/Sub CloudEvent entrance
functions.cloudEvent('download', async (cloudEvent) => {
  try {
    await initEE();

    // 1) 
    const AUTO = buildSeasonWindow();

    // 2) 
    let msg = {};
    const m = cloudEvent?.data?.message;
    if (m?.data) {
      try {
        msg = JSON.parse(Buffer.from(m.data, 'base64').toString());
      } catch {}
    }

    const task = (msg.task || 'all').toLowerCase();  //  all parameters
    const params = { ...AUTO, ...(msg.params || {}) }; // 

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

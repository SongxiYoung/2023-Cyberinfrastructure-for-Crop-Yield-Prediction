const ee = require('@google/earthengine');
var comp = require('./composites.js');

function runLSTDownload(params = {}) {
    

/**
 * Extract MODIS LST (daily) for each county in the US
 */

var stackCollection = function (collection) {
  return ee.Image(collection.iterate(appendBand));
};

function appendBand(current, previous) {
  var bandName = ee.Algorithms.If(
    ee.List(current.propertyNames()).contains('bandname'),
    current.get('bandname'),
    current.get('system:index')
  );
  current = ee.Image(current).select([0], [bandName]);
  var accum = ee.Algorithms.If(
    ee.Algorithms.IsEqual(previous, null),
    current,
    ee.Image(previous).addBands(current)
  );
  return accum;
}

/** 给影像设置 bandname（yyyy_doy） */
var addBandname = function (img) {
  var datestring = ee.String(img.get('system:index'));
  var format = 'YYYY_MM_dd';
  var eedate = ee.Date.parse(format, datestring);
  var doy = eedate.getRelative('day', 'year').add(1);
  var year = eedate.get('year');
  var bandname = ee.String(year).cat('_').cat(doy);
  return img.set('bandname', bandname).set('DOY', doy);
};

/** 叠 LST 日度影像 */
function stackLST(start, end, region, mask, mode) {
  // mode: 'Day' or 'Night'
  var band = 'LST_' + mode + '_1km';
  var qcband = 'QC_' + mode;
  var coll;

  if (start.substring(0, 4) == '2001' | start.substring(0, 4) == '2002') {
    coll = 'MODIS/006/MOD11A1';
    // coll = 'MODIS/061/MOD11A1';
  } else {
    // coll = 'MODIS/006/MYD11A1';
    coll = 'MODIS/061/MYD11A1';
  }

  var LST = ee.ImageCollection(coll)
    .filterDate(start, end)
    .filterBounds(region)
    // .map(function(img){ return img.updateMask(img.select(qcband).eq(0)); }) // 如需严格 QC
    .map(function (img) { return img.updateMask(img.select(qcband)); })
    .map(function (img) { return img.select(band).float().multiply(0.02).updateMask(mask); })
    .map(addBandname)
    .sort('DOY', true);

  return stackCollection(LST);
}

/** 导出到 GCS：gs://bnntraining2-bucket/input2/<prefix>.csv */
var exportTable = function (table, prefix) {
  var safeDesc = prefix.replace(/[^a-zA-Z0-9._:;_-]/g, '-'); // description 不能有 '/'
  var params = {
    collection: table.select(['.*'], null, false),
    description: safeDesc,
    bucket: 'bnntraining2-bucket',             // ✅ 改 bucket
    fileNamePrefix: 'downloaded/' + prefix,        // corn/... 或 soybean/...
    fileFormat: 'CSV'
  };
  var task = ee.batch.Export.table.toCloudStorage(params);
  task.start();
  setTimeout(function () {
    try { console.info(ee.data.getTaskStatus(task.id)); } catch(e) {}
  }, 24000);
};

var counties = ee.FeatureCollection('projects/bnntraining2/assets/cb_2016_us_county_500k');

const [Y0, Y1] = params.years;
const win = params.window; // {start:'-03-01', end:'-08-28'}

var start = `${win.start}`;
var end = `${win.end}`;

// 年份循环
for (var i = Y0; i <= Y1; i++) {
  var year = i.toString();

  // ✅ corn 与 soybean 都跑
  var crops = [
    { code: 1, name: 'corn' },
    { code: 5, name: 'soybean' }
  ];

  crops.forEach(function (crop) {
    var cropMask;
    if (i > 2006) {
      var start_day = (i - 1) + '-01-01';
      var end_day   = (i - 1) + '-12-31';
      var dataset = ee.ImageCollection('USDA/NASS/CDL')
        .filter(ee.Filter.date(start_day, end_day))
        .first();
      cropMask = dataset.select('cropland').eq(crop.code); // 1=corn, 5=soybean
    } else {
      var mcdband = 'MODIS/006/MCD12Q1/' + year + '_01_01';
      // var mcdband = 'MODIS/061/MCD12Q1/' + year + '_01_01';
      cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
    }

    // Day
    var LSTday_stack = stackLST(year + start, year + end, counties, cropMask, 'Day')
      .reproject('EPSG:4326', null, 500);
    var meanLSTday = LSTday_stack.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportTable(meanLSTday, crop.name + '/LSTday_daily_mean_' + year);

    // Night
    var LSTnight_stack = stackLST(year + start, year + end, counties, cropMask, 'Night')
      .reproject('EPSG:4326', null, 500);
    var meanLSTnight = LSTnight_stack.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportTable(meanLSTnight, crop.name + '/LSTnight_daily_mean_' + year);
  });
}


}

module.exports = { runLSTDownload };
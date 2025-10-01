const ee = require('@google/earthengine');
var comp = require('./composites.js');

function runGLDASDownload(params = {}) {

/**
 * Extract county average value from GLDAS2.1 (3-hourly) → daily → county mean
 */


var addDOY = function (img) {
  var doy = img.get('DOY');
  var names = img.bandNames().map(function (name) {
    return ee.String(name).cat('_').cat(doy);
  });
  return img.select(img.bandNames(), names);
};


function daily_func(date) {
  return ee.Feature(null, {
    DATE: ee.Date(date).format('YYYY-MM-dd'),
    DOY: ee.Date(date).getRelative('day', 'year').add(1),
    'system:time_start': ee.Number(date),
    'system:time_end': ee.Number(date).add(24 * 60 * 60 * 1000),
  });
}


function set_date_func(obj) {
  var date = ee.Date(obj.get('system:time_start'));
  return obj.set({
    DATE: date.format('YYYY-MM-dd'),
    DOY: date.getRelative('day', 'year').add(1),
  });
}


function gldas_daily_func(ft) {
  var gcoll = ee.ImageCollection.fromImages(ft.get('gldas_images'));
  return gcoll.mean().set({
    DATE: ft.get('DATE'),
    DOY: ft.get('DOY'),
  });
}


function appendBand(current, previous) {
  return ee.Algorithms.If(
    ee.Algorithms.IsEqual(previous, null),
    current,
    ee.Image(previous).addBands(ee.Image(current))
  );
}

// export to GCS
var exportTable = function (table, prefix) {
  var safeDesc = prefix.replace(/[^a-zA-Z0-9._:;_-]/g, '-');
  var params = {
    collection: table.select(['.*'], null, false),
    description: safeDesc,
    bucket: 'bnntraining2-bucket',            // GCS bucket
    fileNamePrefix: 'downloaded/' + prefix,       // corn/... 或 soybean/...
    fileFormat: 'CSV',
  };
  var task = ee.batch.Export.table.toCloudStorage(params);
  task.start();
  setTimeout(function () {
    try { console.info(ee.data.getTaskStatus(task.id)); } catch (e) {}
  }, 24000);
};


var counties = ee.FeatureCollection('projects/bnntraining2/assets/cb_2016_us_county_500k');

const [Y0, Y1] = params.years;
const win = params.window; // {start:'-03-01', end:'-08-28'}

var start = `${win.start}`;
var end = `${win.end}`;

// year loop
for (var i = Y0; i <= Y1; i++) {
  var year = i.toString();
  var p_year = (i - 1).toString();

  var start_date = ee.Date(year + start);
  var end_date   = ee.Date(year + end);

  // 
  var crops = [
    { code: 1, name: 'corn' },
    { code: 5, name: 'soybean' },
  ];

  crops.forEach(function (crop) {
    // cropmask
    var cropMask;
    if (i > 2006) {
      var start_day = p_year + '-01-01';
      var end_day   = p_year + '-12-31';
      var dataset = ee.ImageCollection('USDA/NASS/CDL')
        .filter(ee.Filter.date(start_day, end_day))
        .first();
      cropMask = dataset.select('cropland').eq(crop.code);
    } else {
      var mcdband = 'MODIS/006/MCD12Q1/' + p_year + '_01_01';
      cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
    }

    // 
    var gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H')
      .filterDate(year + start, year + end)
      .filterBounds(counties)
      .select(['Evap_tavg', 'PotEvap_tavg', 'RootMoist_inst'])
      .map(set_date_func)
      .map(addDOY);

    // 
    var daily_coll = ee.List.sequence(
      start_date.millis(),
      end_date.millis(),
      24 * 60 * 60 * 1000
    ).map(daily_func);

    var daily_filter = ee.Filter.equals({ leftField: 'DATE', rightField: 'DATE' });
    var gldas_daily = ee.ImageCollection(
      ee.Join.saveAll({ matchesKey: 'gldas_images' }).apply(daily_coll, gldas, daily_filter)
    );

    // 
    var gldas_daily_mean = gldas_daily.map(gldas_daily_func).iterate(appendBand);

    // 
    var gldas_table = ee.Image(gldas_daily_mean).reduceRegions({
      collection: counties,
      reducer: ee.Reducer.mean(),
      scale: 1000,
      tileScale: 16,
    });

    // 
    exportTable(gldas_table, crop.name + '/GLDAS_mean_' + year);
  });
}

    
}
    
module.exports = { runGLDASDownload };

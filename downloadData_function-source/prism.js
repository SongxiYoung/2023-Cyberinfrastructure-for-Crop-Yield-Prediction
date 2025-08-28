const ee = require('@google/earthengine');
var comp = require('./composites.js');

function runPRISMDownload(params = {}) {


var addDOY = function (img) {
  var datestring = ee.String(img.get('system:index')).slice(0, 8);
  var format = 'YYYYMMdd';
  var eedate = ee.Date.parse(format, datestring);
  var doy = eedate.getRelative('day', 'year').add(1);

  var names = img.bandNames().map(function (name) {
    return ee.String(name).cat('_').cat(doy);
  });

  return img.select(img.bandNames(), names).set('DOY', doy);
};


function appendBand(current, previous) {
  return ee.Algorithms.If(
    ee.Algorithms.IsEqual(previous, null),
    current,
    ee.Image(previous).addBands(ee.Image(current))
  );
}

function stackPRISM(start, end, region, mask, feature_type) {
  var prism = ee
    .ImageCollection('OREGONSTATE/PRISM/AN81d')
    .filterDate(start, end)
    .filterBounds(region)
    .select(feature_type)
    .map(addDOY)
    .map(function (img) {
      return img.updateMask(mask);
    })
    .iterate(appendBand);

  return ee.Image(prism);
}


var exportTable = function (table, prefix) {
  var safeDesc = prefix.replace(/[^a-zA-Z0-9._:;_-]/g, '-'); 

  var params = {
    collection: table.select(['.*'], null, false),
    description: safeDesc,
    bucket: 'bnntraining2-bucket',                
    fileNamePrefix: 'downloaded/' + prefix,      
    fileFormat: 'CSV',
  };

  var task = ee.batch.Export.table.toCloudStorage(params);
  task.start();

  setTimeout(function () {
    console.info(ee.data.getTaskStatus(task.id));
  }, 24000);
};

const counties = ee.FeatureCollection('projects/bnntraining2/assets/cb_2016_us_county_500k');


const [Y0, Y1] = params.years;
const win = params.window; // {start:'-03-01', end:'-08-28'}

var start = `${win.start}`;
var end = `${win.end}`;


for (var i = Y0; i <= Y1; i++) {
  var year   = i.toString();
  var p_year = (i - 1).toString(); 


  var crops = [
    { code: 1, name: 'corn' },
    { code: 5, name: 'soybean' }
  ];

  crops.forEach(function (crop) {
    var cropMask;
    if (i > 2006) {
      var start_day = p_year + '-01-01';
      var end_day   = p_year + '-12-31';
      var dataset = ee
        .ImageCollection('USDA/NASS/CDL')
        .filter(ee.Filter.date(start_day, end_day))
        .first();

      cropMask = dataset.select('cropland').eq(crop.code);
    } else {
      var mcdband = 'MODIS/006/MCD12Q1/' + p_year + '_01_01';
      cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
    }

    // --- 降水 ppt ---
    var pptBands = ['ppt'];
    var prism_ppt = stackPRISM(year + start, year + end, counties, cropMask, pptBands);
    var mean_ppt = prism_ppt.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportTable(mean_ppt, crop.name + '/PRISM_mean_ppt_' + year);

    // --- 温度 tmin/tmean/tmax ---
    var tempBands = ['tmin', 'tmean', 'tmax'];
    var prism_temp = stackPRISM(year + start, year + end, counties, cropMask, tempBands);
    var mean_temp = prism_temp.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportTable(mean_temp, crop.name + '/PRISM_mean_temp_' + year);

    // --- VPD 相关（tdmean、vpdmin、vpdmax 及温度/降水）---
    var vpdBands = ['tdmean', 'vpdmin', 'vpdmax', 'tmin', 'tmean', 'tmax', 'ppt'];
    var prism_vpd = stackPRISM(year + start, year + end, counties, cropMask, vpdBands);
    var mean_vpd = prism_vpd.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportTable(mean_vpd, crop.name + '/PRISM_mean_vpd_' + year);
  });
}
}

module.exports = { runPRISMDownload };
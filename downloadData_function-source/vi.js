const ee = require('@google/earthengine');
var comp = require('./composites.js');

function runVIDownload(params = {}) {

/**
 * 各种指数函数
 */
var getEVI = function (image) {
  var evi = image.expression(
    '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 10000)',
    {
      red: image.select([0]).float(),
      nir: image.select([1]).float(),
      blue: image.select([2]).float(),
    }
  );
  return evi.updateMask(evi.gt(0)).updateMask(evi.lt(1));
};

var getGCI = function (image) {
  var gci = image.expression('nir / green - 1', {
    nir: image.select([1]).float(),
    green: image.select([3]).float(),
  });
  return gci.updateMask(gci.gt(0));
};

var getNDWI = function (image) {
  var ndwi = image.expression('(nir - swir) / (nir + swir)', {
    nir: image.select([1]).float(),
    swir: image.select([4]).float(),
  });
  return ndwi.updateMask(ndwi.gt(-1)).updateMask(ndwi.lt(1));
};

var getNDVI = function (image) {
  var ndvi = image.expression('(nir - red) / (nir + red)', {
    nir: image.select([1]).float(),
    red: image.select([0]).float(),
  });
  return ndvi.updateMask(ndvi.gt(-1)).updateMask(ndvi.lt(1));
};

/**
 * 给影像添加 bandname 属性
 */
var addBandname = function (img) {
  var datestring = ee.String(img.get('system:index'));
  var format = 'YYYY_MM_dd';
  var eedate = ee.Date.parse(format, datestring);
  var doy = eedate.getRelative('day', 'year').add(1);
  var year = eedate.get('year');
  var bandname = ee.String(year).cat('_').cat(doy);
  return img.set('bandname', bandname);
};

/**
 * 生成一个 VI 堆栈
 */
var stackVI = function (start, end, region, mask, func) {
  var modVI = ee
    .ImageCollection('MODIS/061/MCD43A4')
    .filterDate(start, end)
    .filterBounds(region)
    .map(function (img) {
      return img.updateMask(mask);
    })
    .map(func)
    .map(addBandname);
  var modVIStack = comp.stackCollection(modVI);
  return modVIStack;
};

/**
 * 导出到 GCS
 */
var exportVI = function (table, prefix) {
  // description 不能有斜杠
  var safeDesc = prefix.replace(/[^a-zA-Z0-9._:;_-]/g, '-');

  var params = {
    collection: table.select(['.*'], null, false),
    description: safeDesc,
    bucket: 'bnntraining2-bucket', // ✅ 改掉 bucket
    fileNamePrefix: 'downloaded/' + prefix, // corn/soybean 会体现在 prefix 里
    fileFormat: 'CSV',
  };

  var exportTask = ee.batch.Export.table.toCloudStorage(params);
  exportTask.start();

  setTimeout(function () {
    console.info(ee.data.getTaskStatus(exportTask.id));
  }, 24000);
};

const UScounties = ee.FeatureCollection('projects/bnntraining2/assets/cb_2016_us_county_500k');
var counties = UScounties; 

// 年份
const [Y0, Y1] = params.years;
const win = params.window; // {start:'-03-01', end:'-08-28'}

var years = ee.List.sequence(Y0, Y1).getInfo();
var start = `${win.start}`;
var end = `${win.end}`;

// 遍历年份
for (var i = 0; i < years.length; i++) {
  var year = years[i];

  // 遍历作物：1=corn, 5=soybean
  var crops = [
    { code: 1, name: 'corn' },
    { code: 5, name: 'soybean' },
  ];

  crops.forEach(function (crop) {
    var cropMask;

    if (year > 2007) {
      var start_day = year-1 + '-01-01';
      var end_day = year-1 + '-12-31';
      var dataset = ee
        .ImageCollection('USDA/NASS/CDL')
        .filter(ee.Filter.date(start_day, end_day))
        .first();
      cropMask = dataset.select('cropland').eq(crop.code);
    } else {
      var mcdband = 'MODIS/006/MCD12Q1/' + year + '_01_01';
      cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
    }

    // EVI
    var modEVIstack = stackVI(year + start, year + end, counties, cropMask, getEVI);
    var modEVIstack = modEVIstack.reproject('EPSG:4326', null, 500);
    var meanEVI = modEVIstack.reduceRegions({
      collection: counties,
      reducer: ee.Reducer.mean(),
      scale: 500,
      tileScale: 16,
    });
    exportVI(meanEVI, crop.name + '/EVI_mean_' + year);

    // GCI
    var modGCIstack = stackVI(year + start, year + end, counties, cropMask, getGCI);
    var modGCIstack = modGCIstack.reproject('EPSG:4326', null, 500);
    var meanGCI = modGCIstack.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportVI(meanGCI, crop.name + '/GCI_mean_' + year);

    // NDWI
    var modNDWIstack = stackVI(year + start, year + end, counties, cropMask, getNDWI);
    var modNDWIstack = modNDWIstack.reproject('EPSG:4326', null, 500);
    var meanNDWI = modNDWIstack.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportVI(meanNDWI, crop.name + '/NDWI_mean_' + year);

    // NDVI
    var modNDVIstack = stackVI(year + start, year + end, counties, cropMask, getNDVI);
    var modNDVIstack = modNDVIstack.reproject('EPSG:4326', null, 500);
    var meanNDVI = modNDVIstack.reduceRegions(counties, ee.Reducer.mean(), 500);
    exportVI(meanNDVI, crop.name + '/NDVI_mean_' + year);
  });
}
}

module.exports = { runVIDownload };

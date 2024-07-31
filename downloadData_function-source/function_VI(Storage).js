const ee = require('@google/earthengine');
var eeKey = require('./eeKey.json');
var comp = require('./composites.js');


exports.download = function (message, context) {

  console.info('----------FUNCTION ENTRY----------');

  ee.data.authenticateViaPrivateKey(eeKey, () => {
        ee.initialize(null, null, () => {
              
      console.info('----------GEE ENTRY----------');

      var UScounties = ee.FeatureCollection("projects/bnntraining/assets/cb_2016_us_county_500k");

      /**
 * Export county-averaged EVI, GCI, NDWI value from 
 * NBAR (MCD43A4) collection
 */

/**
 * Calcualte EVI for MODIS image
 */
var getEVI = function(image) {
  var evi = image.expression(
      '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 10000)',
        {
          red: image.select([0]).float(),    // 620-670nm, RED
          nir: image.select([1]).float(),    // 841-876nm, NIR
          blue: image.select([2]).float()   // 459-479nm, BLUE
        });
  
  return evi.updateMask(evi.gt(0)).updateMask(evi.lt(1));
};

/**
 * Calculate GCI
 */
var getGCI = function(image) {
  var gci = image.expression(
    'nir / green - 1', {
      nir: image.select([1]).float(),
      green: image.select([3]).float()
    });
  return gci.updateMask(gci.gt(0));
};

/**
 * Calculate NDWI
 */
var getNDWI = function(image) {
  var ndwi = image.expression(
    '(nir - swir) / (nir + swir)', {
      nir: image.select([1]).float(),
      swir: image.select([4]).float()
    });
  return ndwi.updateMask(ndwi.gt(-1)).updateMask(ndwi.lt(1));
};


/**
 * Calculate NDVI
 */
var getNDVI = function(image) {
  var ndvi = image.expression(
    '(nir - red) / (nir + red)', {
      nir: image.select([1]).float(),
      red: image.select([0]).float()
    });
  return ndvi.updateMask(ndvi.gt(-1)).updateMask(ndvi.lt(1));
};

/**
 * Function to add "DOY" as bandname
 */ 
var addBandname = function(img) {
    var datestring = ee.String(img.get('system:index'));
    var format = 'YYYY_MM_dd';
    var eedate = ee.Date.parse(format, datestring);
    var doy = eedate.getRelative('day', 'year').add(1);
    var year = eedate.get('year');
    var bandname = ee.String(year).cat('_').cat(doy);
    return img.set('bandname',bandname);
};

/**
 * Function to get a stacked VI image
 * from MCD43A4
 */ 
var stackVI = function(start, end, region, mask, func) {
  var modVI = ee.ImageCollection('MODIS/006/MCD43A4')
               .filterDate(start, end)
               .filterBounds(region)
               .map(function(img){return img.updateMask(mask)})
               .map(func)   // calcualte VI
               .map(addBandname);
  var modVIStack = comp.stackCollection(modVI);
  return modVIStack;
};

/**
 * Export ************
 */
var exportVI = function(table, prefix) {

// export
  // Export the table to Google Storage
      var params = {
        collection: table.select([".*"], null, false),
        description: prefix,
        bucket: 'bnntraining-bucket',  //bucket name
        fileNamePrefix: 'input2/' + prefix, // folder + file name
        fileFormat: 'CSV'              // Specify the file format (e.g., CSV)
      };

      // Start export to Google Drive
      var exportTask = ee.batch.Export.table.toCloudStorage(params);
      exportTask.start();

      // Check task status after a delay
      setTimeout(function () {
        // Get the status after the delay
        console.info(ee.data.getTaskStatus(exportTask.id));
      }, 24000); // Adjust the delay as needed
}


// get only counties with corn and soy
// var counties = UScounties.filter(ee.Filter.eq('corn_soy',1));
var counties = UScounties; // Question

// year
var years = ee.List.sequence(2001,2003).getInfo(); //**************
var start = '-03-01';  //**************
var end = '-11-30';  //**************

// loop through each year
for(var i = 1; i <= years.length; i++) { // Question

  var year = years[i];
  var p_year = years[i];
  
  // get crop mask
  var cropMask;
  if(i>0) // Question
  {
    //cropMask = ee.Image('USDA/NASS/CDL/'+year + '_01_01').select('LC_Type1').eq(12);
    var start_day = year + '-01-01'
    var end_day = year + '-12-31'
    
    var dataset = ee.ImageCollection('USDA/NASS/CDL')
                  .filter(ee.Filter.date(start_day, end_day))
                  .first();
    cropMask = dataset.select('cropland').eq(1); //1 - corn, 5 -soybeans

    
  }
  else{
    
    var mcdband = 'MODIS/006/MCD12Q1/' + year + '_01_01';
    cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
  }
    
  
  // get EVI stack
  var modEVIstack = stackVI(year+start, year+end, counties, cropMask, getEVI);
  // aggregate the observations to county level
  var meanEVI = modEVIstack.reduceRegions({
    collection:counties,
    reducer:ee.Reducer.mean(), 
    scale:500, 
    tileScale:16});
  exportVI(meanEVI, 'EVI_mean_' + year);
  

  // get GCI stack
  var modGCIstack = stackVI(year+start, year+end, counties, cropMask, getGCI);
  var meanGCI = modGCIstack.reduceRegions(
    counties, ee.Reducer.mean(), 500);
  exportVI(meanGCI, 'GCI_mean_' + year);
    
  // print(meanGCI);
  
  // get NDWI stack
  var modNDWIstack = stackVI(year+start, year+end, counties, cropMask, getNDWI);
  var meanNDWI = modNDWIstack.reduceRegions(
    counties, ee.Reducer.mean(), 500);
  exportVI(meanNDWI, 'NDWI_mean_' + year);
  
  // get NDVI stack
  var modNDVIstack = stackVI(year+start, year+end, counties, cropMask, getNDVI);
  var meanNDVI = modNDVIstack.reduceRegions(
    counties, ee.Reducer.mean(), 500);
  exportVI(meanNDVI, 'NDVI_mean_' + year);
  
}

      
    });
  });
};

const ee = require('@google/earthengine');
var eeKey = require('./eeKey.json');

exports.download = function (message, context) {

  console.info('----------FUNCTION ENTRY----------');

  ee.data.authenticateViaPrivateKey(eeKey, () => {
        ee.initialize(null, null, () => {
              
      console.info('----------GEE ENTRY----------');

      var UScounties = ee.FeatureCollection("projects/tidy-resolver-404613/assets/cb_2016_us_county_500k");

      /**
 * Extract county average value from
 * GLDAS2.1 soil moisture
 */

// function to add doy property to each band and image

var addDOY = function(img) {
  var doy = img.get('DOY');
  // get bandnames
  var names = img.bandNames()
                 .map(function(name) {
                   return ee.String(name).cat('_').cat(doy);
                 });
  return img.select(ee.List.sequence(0,null,1,names.length()),names);
};
 
// Create a list of "daily" features to join the GLDAS images to
// Assign a Date string property for joining/grouping by day
function daily_func(date){
  return ee.Feature(
    null, 
    {
      'DATE': ee.Date(date).format('YYYY-MM-dd'),
      'DOY': ee.Date(date).getRelative('day','year').add(1),
      'system:time_start': ee.Number(date), 
      'system:time_end': ee.Number(date).add(24*60*60*1000)
    });
}

// Assign a Date string property to the GLDAS images
function set_date_func(obj){
  var date = ee.Date(obj.get('system:time_start'));
  return obj.set({
    'DATE': date.format('YYYY-MM-dd'),
    'DOY': date.getRelative('day','year').add(1)
  });
}

// Compute daily GLDAS
function gldas_daily_func(ft){

  // Get joined images for each day of year
  var gcoll = ee.ImageCollection.fromImages(ft.get('gldas_images'));

  // Get average
  return gcoll.mean().set({
    'DATE': ft.get('DATE'),
    'DOY': ft.get('DOY')
  });
}

// Function to transform weather collection to an image
function appendBand(current, previous){
  // Append it to the result (only return current item on first element)
  var accum = ee.Algorithms.If(ee.Algorithms.IsEqual(previous,null), current, ee.Image(previous).addBands(ee.Image(current)));
  // return the accumulation
  return accum;
}

/**
 * Export
 */
var exportTable = function(table, prefix) {
  Export.table.toDrive({
    collection: table.select([".*"], null, false),
    description: prefix,
    folder: '2020_CDL',
    fileNamePrefix: prefix
  });
};

// get only counties with corn and soy
// var counties = UScounties.filter(ee.Filter.eq('corn_soy',1));
var counties = UScounties; // Question

var start = '-03-01';
var end = '-12-1';

// loop through each year
for(var i = 2002; i <= 2020; i++) {

  var year = i.toString();
  var p_year = (i-1).toString();
  
  var start_date = ee.Date(year+start);
  var end_date = ee.Date(year+end);
  
  // get crop mask
  var cropMask;
  if(i > 2006)// Question
  {
    //cropMask = ee.Image('USDA/NASS/CDL/'+year + '_01_01').select('LC_Type1').eq(12);
    var start_day = year + '-01-01'
    var end_day = year + '-12-31'
    
    var dataset = ee.ImageCollection('USDA/NASS/CDL')
                  .filter(ee.Filter.date(start_day, end_day))
                  .first();
    cropMask = dataset.select('cropland').eq(1); // 5 - soybean; 1 - corn

    
  }
  else{
    
    var mcdband = 'MODIS/006/MCD12Q1/' + p_year + '_01_01';
    cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
  }

  var gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H')
                .filterDate(year+start, year+end)
                .filterBounds(counties)
                .select(['Evap_tavg','PotEvap_tavg','RootMoist_inst'])
                .map(set_date_func)
                .map(addDOY);

  var daily_coll = ee.List.sequence(
    start_date.millis(), end_date.millis(), 24*60*60*1000);
  daily_coll = daily_coll.map(daily_func);

  // Join the GLDAS 3 hourly images to the daily collection
  var daily_filter = ee.Filter.equals(
      {leftField: "DATE", rightField: "DATE"});
  var gldas_daily = ee.ImageCollection(
    ee.Join.saveAll({matchesKey: 'gldas_images'})
      .apply(daily_coll, gldas, daily_filter));

  var gldas_daily_mean = gldas_daily.map(gldas_daily_func)
                                    .iterate(appendBand);

  var gldas_table = ee.Image(gldas_daily_mean).reduceRegions({
    collection:counties,
    reducer:ee.Reducer.mean(), 
    scale:1000, 
    tileScale:16});
  
  // export
  // Export the table to Google Drive
      var params = {
        collection: gldas_table,
        description: 'ExportedTable', // Specify the export description
        fileNamePrefix: 'GLDAS_mean_'+year, // Prefix for exported file(s)
        folder: 'download',   // Specify the folder name directly
        fileFormat: 'CSV'              // Specify the file format (e.g., CSV)
      };

      // Start export to Google Drive
      var exportTask = ee.batch.Export.table.toDrive(params);
      exportTask.start();

      // Check task status after a delay
      setTimeout(function () {
        // Get the status after the delay
        console.info(ee.data.getTaskStatus(exportTask.id));
      }, 24000); // Adjust the delay as needed
}

      
    });
  });
};

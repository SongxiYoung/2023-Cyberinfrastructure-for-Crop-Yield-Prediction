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
 * Extract MODIS LST (daily) for each county in the US
 */

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
    return img.set('bandname', bandname);
};

/**
 * Function to import LST
 */
function stackLST(start, end, region, mask, mode) {
    // mode: 'Day' or 'Night'
    var band = 'LST_' + mode + '_1km';
    var qcband = 'QC_' + mode;
    var coll;
    if (start.substring(0, 4) == '2001' | start.substring(0, 4) == '2002') {
        coll = 'MODIS/006/MOD11A1';
    } else {
        coll = 'MODIS/006/MYD11A1';
    }
    var LST = ee.ImageCollection(coll)
        .filterDate(start, end)
        .filterBounds(region)
        .map(function(img) { return img.updateMask(img.select(qcband).eq(0)) })
        .map(function(img) { return img.select(band).float().multiply(0.02).updateMask(mask) })
        .map(addBandname)
        .sort('DOY', true);

    // print(start,end,region,LST);            
    var LSTstack = comp.stackCollection(LST);

    return LSTstack;
}

/**
 * Export to Cloud Storage
 */
var exportTable = function(table, prefix) {
    var params = {
        collection: table.select([".*"], null, false),
        description: prefix,
        bucket: 'bnntraining-bucket',  // bucket name
        fileNamePrefix: 'input2/' + prefix, // folder + file name
        fileFormat: 'CSV'  // Specify the file format (e.g., CSV)
    };

    // Start export to Google Cloud Storage
    var exportTask = ee.batch.Export.table.toCloudStorage(params);
    exportTask.start();

    // Check task status after a delay
    setTimeout(function() {
        // Get the status after the delay
        console.info(ee.data.getTaskStatus(exportTask.id));
    }, 24000); // Adjust the delay as needed
};

// get only counties with corn and soy
// var counties = UScounties.filter(ee.Filter.eq('corn_soy',1)); // Question
var counties = UScounties;
// print(counties);
// Map.addLayer(counties, {}, 'ctn');

var start = '-03-01';  //*********
var end = '-11-30';   //*********

// loop through each year ***************
for (var i = 2002; i <= 2003; i++) { //for(var i = 2002; i < 2021; i++) {

    var year = i.toString();
    var p_year = (i - 1).toString();
    // get crop mask
    var cropMask;
    if (i > 2006) {
        //cropMask = ee.Image('USDA/NASS/CDL/'+year + '_01_01').select('LC_Type1').eq(12);
        var start_day = year + '-01-01'
        var end_day = year + '-12-31'

        var dataset = ee.ImageCollection('USDA/NASS/CDL')
            .filter(ee.Filter.date(start_day, end_day))
            .first();
        cropMask = dataset.select('cropland').eq(1); // 1- corn, 5 - soybean


    } else {

        var mcdband = 'MODIS/006/MCD12Q1/' + p_year + '_01_01';
        cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
    }

    // get LST day stack
    var LSTday_stack = stackLST(year + start, year + end, counties, cropMask, 'Day');
    // print(LSTday_stack);
    // print(LSTday_stack)
    var meanLSTday = LSTday_stack.reduceRegions(
        counties, ee.Reducer.mean(), 500);
    exportTable(meanLSTday, 'LSTday_daily_mean_' + year);

    // get LST night stack
    var LSTnight_stack = stackLST(year + start, year + end, counties, cropMask, 'Night');
    var meanLSTnight = LSTnight_stack.reduceRegions(
        counties, ee.Reducer.mean(), 500);

    exportTable(meanLSTnight, 'LSTnight_daily_mean_' + year);

}

      
    });
  });
};

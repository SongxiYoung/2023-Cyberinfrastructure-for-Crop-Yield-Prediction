const ee = require('@google/earthengine');
var eeKey = require('./eeKey.json');
var comp = require('./composites.js');


exports.download = function (message, context) {

  console.info('----------FUNCTION ENTRY----------');

  ee.data.authenticateViaPrivateKey(eeKey, () => {
        ee.initialize(null, null, () => {
              
      console.info('----------GEE ENTRY----------');

      var UScounties = ee.FeatureCollection("projects/tidy-resolver-404613/assets/cb_2016_us_county_500k");

      /**
 * Extract from PRISM
 */
 
// function to add doy property to each band and image
var addDOY = function(img) {
    var datestring = ee.String(img.get('system:index')).slice(0,8);
    var format = 'YYYYMMdd';
    var eedate = ee.Date.parse(format, datestring);
    var doy = eedate.getRelative('day', 'year').add(1);
    
    // get bandnames
    var names = img.bandNames()
                   .map(function(name) {
                     return ee.String(name).cat('_').cat(doy);
                   });
                   
    return img.select(ee.List.sequence(0,null,1,names.length()),names)
              .set('DOY',doy);
};

// Function to transform weather collection to an image
function appendBand(current, previous){
  // Append it to the result (only return current item on first element)
  var accum = ee.Algorithms.If(ee.Algorithms.IsEqual(previous,null), current, ee.Image(previous).addBands(ee.Image(current)));
  // return the accumulation
  return accum;
}

function stackPRISM(start, end, region, mask, feature_type) {
  var prism = ee.ImageCollection('OREGONSTATE/PRISM/AN81d')
              .filterDate(start, end)
              .filterBounds(region)
              .select(feature_type)
              .map(addDOY)
              .map(function(img) {return img.updateMask(mask)})
              .iterate(appendBand);
  return ee.Image(prism);
}



// get only counties with corn and soy
// var counties = UScounties.filter(ee.Filter.eq('corn_soy',1));
var counties = UScounties; // Question

var start = '-03-01';
var end = '-11-30';

// loop through each year
for(var i = 2002; i <= 2023; i++) {

  var year = i.toString();
  var p_year = (i-1).toString();
  // get crop mask
  var cropMask;
  if(i > 2006) // Question
  {
    //cropMask = ee.Image('USDA/NASS/CDL/'+year + '_01_01').select('LC_Type1').eq(12);
    var start_day = year + '-01-01'
    var end_day = year + '-12-31'
    
    var dataset = ee.ImageCollection('USDA/NASS/CDL')
                  .filter(ee.Filter.date(start_day, end_day))
                  .first();
    cropMask = dataset.select('cropland').eq(1);
    
  }
  else{
    
    var mcdband = 'MODIS/006/MCD12Q1/' + p_year + '_01_01';
    cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
  }
  
  // get prism collection
  var ppt = ['ppt']
  var prism_ppt = stackPRISM(year+start,year+end, counties, cropMask, ppt);



  var mean_ppt = prism_ppt.reduceRegions(
    counties, ee.Reducer.mean(), 500); // origin: 1000

  /**
 * Export
 */
var params = {
        collection: mean_ppt.select([".*"], null, false),
        description: 'PRISM_mean_ppt_'+year, // Specify the export description
        fileNamePrefix: 'PRISM_mean_ppt_'+year, // Prefix for exported file(s)
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
  
  // get prism temp
  var temp = ['tmin','tmean','tmax']
  var prism_temp = stackPRISM(year+start,year+end, counties, cropMask, temp);



  var mean_temp = prism_temp.reduceRegions(
    counties, ee.Reducer.mean(), 500); // origin: 1000



  /**
 * Export
 */
var params = {
        collection: mean_temp.select([".*"], null, false),
        description: 'PRISM_mean_temp_'+year, // Specify the export description
        fileNamePrefix: 'PRISM_mean_temp_'+year, // Prefix for exported file(s)
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
  
  // get prism vpd
  var vpd = ['tdmean','vpdmin','vpdmax','tmin','tmean','tmax','ppt']
  var prism_vpd = stackPRISM(year+start,year+end, counties, cropMask, vpd);



  var mean_vpd = prism_vpd.reduceRegions(
    counties, ee.Reducer.mean(), 500); // origin: 1000

  var params = {
        collection: mean_vpd.select([".*"], null, false),
        description: 'PRISM_mean_'+year, // Specify the export description
        fileNamePrefix: 'PRISM_mean_'+year, // Prefix for exported file(s)
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

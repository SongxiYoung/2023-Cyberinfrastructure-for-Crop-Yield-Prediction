const ee = require('@google/earthengine');
var eeKey = require('./eeKey.json');

exports.download = function (message, context) {

  console.info('----------FUNCTION ENTRY----------');

  ee.data.authenticateViaPrivateKey(eeKey, () => {
        ee.initialize(null, null, () => {
              
      console.info('----------GEE ENTRY----------');

      // A Lansat 8 TOA image collection for a specific year and location.
      var col = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA")
        .filterBounds(ee.Geometry.Point([-122.073, 37.188]))
        .filterDate('2018', '2019');

      // An image property of interest, percent cloud cover in this case.
      var prop = 'CLOUD_COVER';
      
      console.info('List of property values:', col.aggregate_array(prop).getInfo());

      // Define export parameters
      var params = {
        image: col.mean().toFloat(),
        description: 'export_TOA',
        crs: 'EPSG:4326',
        scale: 960,
        // bucket: 'gcs-bucket-name',
        folder: 'download', // Replace with your desired Google Drive folder
        fileNamePrefix: 'TOA', // Prefix for exported file(s)
        region: ee.Geometry.Point([-122.073, 37.188]), // Adjust region as needed
        maxPixels: 1e12,
        fileFormat: 'GeoTIFF',
      };

      // Start export to Google Drive
      var exportTask = ee.batch.Export.image.toDrive(params);
      exportTask.start();

      // Check task status after a delay
      setTimeout(function () {
        // Get the status after the delay
        console.info(ee.data.getTaskStatus(exportTask.id));
      }, 24000); // Adjust the delay as needed
    });
  });
};
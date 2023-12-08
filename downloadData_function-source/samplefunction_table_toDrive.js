const ee = require('@google/earthengine');
var eeKey = require('./eeKey.json');

exports.download = function (message, context) {

  console.info('----------FUNCTION ENTRY----------');

  ee.data.authenticateViaPrivateKey(eeKey, () => {
        ee.initialize(null, null, () => {
              
      console.info('----------GEE ENTRY----------');

      // Load a sample table
      var table = ee.FeatureCollection([
        ee.Feature(ee.Geometry.Point(-122.082, 37.42), {name: 'Point 1'}),
        ee.Feature(ee.Geometry.Point(-122.076, 37.41), {name: 'Point 2'}),
        ee.Feature(ee.Geometry.Point(-122.086, 37.43), {name: 'Point 3'})
      ]);

      // Export the table to Google Drive
      var params = {
        collection: table,
        description: 'ExportedTable', // Specify the export description
        fileNamePrefix: 'TOA', // Prefix for exported file(s)
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
    });
  });
};

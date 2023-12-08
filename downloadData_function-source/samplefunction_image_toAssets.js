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
        
        // create task id
        var newTaskId = ee.data.newTaskId(1)[0];
        
        // define export parameters
        params = {
          element: col.mean(),
          type: 'EXPORT_IMAGE',
          description: 'TOA',
          crs: 'EPSG:4326',
          scale: 960,
          maxPixels: 1e12,
          assetId: 'projects/tidy-resolver-404613/assets/TOA',
        }
          
        // start export
ee.data.startProcessing(newTaskId, params, function(result) {
    console.info('task:', result.taskId);
    console.info('name:', result.name);
    console.info('started:', result.started);
    // console.info('note:', result.note);

    // Check task status after completion
    checkTaskStatus(result.taskId);
});

function checkTaskStatus(taskId) {
    // Wait for a moment before checking the status
    setTimeout(function () {
        console.info(ee.data.getTaskStatus(taskId));
    }, 240000); // Adjust the delay as needed
}
    });
  });
  
}



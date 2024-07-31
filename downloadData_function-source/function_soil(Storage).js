const ee = require('@google/earthengine');
var eeKey = require('./eeKey.json');

exports.download = function (message, context) {

  console.info('----------FUNCTION ENTRY----------');

  ee.data.authenticateViaPrivateKey(eeKey, () => {
    ee.initialize(null, null, () => {
      
      console.info('----------GEE ENTRY----------');

      var UScounties = ee.FeatureCollection("projects/bnntraining/assets/cb_2016_us_county_500k");
      var awc = ee.Image("projects/bnntraining/assets/awc"),
      var cec = ee.Image("projects/bnntraining/assets/cec"),
      var som = ee.Image("projects/bnntraining/assets/som");

      /**
       * Extract soil properties for each county
       */

      // 定义要处理的土壤属性类型
      var soilTypes = ['cec', 'awc', 'som'];

      // 定义导出表格的函数
      var exportTable = function(table, prefix) {
        var params = {
          collection: table.select([".*"], null, false),
          description: prefix,
          bucket: 'bnntraining-bucket',  //bucket name
          fileNamePrefix: 'input2/' + prefix, // folder + file name
          fileFormat: 'CSV'              // Specify the file format (e.g., CSV)
        };

        // Start export to Google Storage
        var exportTask = ee.batch.Export.table.toCloudStorage(params);
        exportTask.start();

        // Check task status after a delay
        setTimeout(function () {
          // Get the status after the delay
          console.info(ee.data.getTaskStatus(exportTask.id));
        }, 24000); // Adjust the delay as needed
      };

      // 获取仅包含玉米和大豆的县
      var datelist = ee.List(['17', '18', '19', '20', '21', '26', '27', '29', '31', '38', '39', '46', '55']);
      var counties = UScounties.filter(ee.Filter.inList('STATEFP', datelist));
      Map.addLayer(counties, {}, 'ctn');

      // 定义一个函数来处理每种土壤属性类型
      var processSoilType = function(type, soil_avg) {
        Map.addLayer(soil_avg, {}, type);

        // 循环处理每个年份
        for (var i = 2001; i <= 2003; i++) {
          var year = i.toString();

          // 获取作物掩膜
          var cropMask;
          if (year > 2007) {
            var start_date = year + '-01-01';
            var end_date = year + '-12-31';
            var dataset = ee.ImageCollection('USDA/NASS/CDL')
                            .filter(ee.Filter.date(start_date, end_date))
                            .first();
            cropMask = dataset.select('cropland').eq(5); // 1 - 玉米, 5 - 大豆
          } else {
            var mcdband = 'MODIS/061/MCD12Q1/' + year + '_01_01';
            // var mcdband = 'MODIS/006/MCD12Q1/' + year + '_01_01';
            cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
          }

          // 根据土壤属性类型进行相应的处理
          var county_data = soil_avg.updateMask(cropMask)
                                   .reduceRegions({
                                     collection: counties,
                                     reducer: ee.Reducer.mean(),
                                     scale: 250,
                                     tileScale: 16
                                   });
          exportTable(county_data, type + '_mean_' + year);
        }
      };

      // 使用循环来处理每种土壤属性类型
      soilTypes.forEach(function(type) {
        var soil_avg;
        if (type === 'cec') {
          soil_avg = ee.Image("projects/bnntraining/assets/cec");
        } else if (type === 'awc') {
          soil_avg = ee.Image("projects/bnntraining/assets/awc");
        } else if (type === 'som') {
          soil_avg = ee.Image("projects/bnntraining/assets/som");
        }
        processSoilType(type, soil_avg);
      });
      
    });
  });
};

const ee = require('@google/earthengine');

function runSoilDownload(params = {}) {
  const UScounties = ee.FeatureCollection('projects/bnntraining2/assets/cb_2016_us_county_500k');
  const cec = ee.Image('projects/bnntraining2/assets/cec');
  const awc = ee.Image('projects/bnntraining2/assets/awc');
  const som = ee.Image('projects/bnntraining2/assets/som');

  const soilTypes = [
    { type: 'cec', img: cec },
    { type: 'awc', img: awc },
    { type: 'som', img: som },
  ];

  const datelist = ee.List(['17','18','19','20','21','26','27','29','31','38','39','46','55']);
  const counties = UScounties.filter(ee.Filter.inList('STATEFP', datelist));

    function exportTable(table, prefix) {
    const safeDesc = prefix.replace(/[^a-zA-Z0-9._:;_-]/g, '-'); 

    const params = {
        collection: table.select(['.*'], null, false),
        description: safeDesc,               
        bucket: 'bnntraining2-bucket',
        fileNamePrefix: `downloaded/${prefix}`, 
        fileFormat: 'CSV',
    };
    const task = ee.batch.Export.table.toCloudStorage(params);
    task.start();
    console.info(`Export started: desc=${safeDesc}; path=downloaded/${prefix}; taskId=${task.id}`);
    }

    const [Y0, Y1] = params.years;
    
    function processSoilType(type, soilImg) {
    for (let year = Y0; year <= Y1; year++) {
        const crops = [
        { code: 1, name: 'corn' },
        { code: 5, name: 'soybean' }
        ];

        crops.forEach(({ code, name }) => {
        let cropMask;
        if (year > 2007) {
            const start = `${year-1}-01-01`;
            const end   = `${year-1}-12-31`;
            const dataset = ee.ImageCollection('USDA/NASS/CDL')
            .filter(ee.Filter.date(start, end))
            .first();
            cropMask = dataset.select('cropland').eq(code);
        } else {
            const mcdband = `MODIS/061/MCD12Q1/${year}_01_01`;
            cropMask = ee.Image(mcdband).select('LC_Type1').clip(counties).eq(12);
        }

        const countyData = soilImg.updateMask(cropMask).reduceRegions({
            collection: counties,
            reducer: ee.Reducer.mean(),
            scale: 250,
            tileScale: 16,
        });

        exportTable(countyData, `${name}/${type}_mean_${year}`);
        });
    }
    }

  soilTypes.forEach(({ type, img }) => {
    processSoilType(type, img);
  });

  console.info('Soil export tasks submitted.');
}

module.exports = { runSoilDownload };

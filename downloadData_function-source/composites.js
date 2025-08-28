/**
 * A COMPOSITES OF USEFUL COLLECTION FUNCTIONS
 * 
 * USE:
 * 
 *   mosaicCollection(collection): 
 *     mosaic images of the same day in this collection
 *   
 *   stackCollection(collection):
 *     convert a collection to a single image with bands representing
 *     each image in the collection
 *     Note: the band will be in reverse order
 */


/**
 * Mosaic images on the same day within a collection
 * Return a new collection with only one image at each day
 * 
 * collection: can only contain images of one year and requires a DOY property;
 * 
 */ 
const ee = require('@google/earthengine');

exports.mosaicCollection = function(collection) {

  // get unique DOY image
  var m1 = ee.ImageCollection(collection.distinct(['DOY']));
  // equal DOY filter
  var date_eq_filter = ee.Filter.equals({leftField: 'DOY',
                                       rightField: 'DOY'});
  // initiate Join
  var saveall = ee.Join.saveAll("to_mosaic");
  // Join collection to itself grouped by date
  var m2 = ee.ImageCollection(saveall.apply(m1, collection, date_eq_filter)); 
  // Mosaic images of the same day
  var mosaic = m2.map(function(img) {
      var img2 = ee.ImageCollection.fromImages(img.get('to_mosaic')).mosaic();
      img2 = ee.Algorithms.If(img.propertyNames().contains('DOY'),ee.Image(img2).set('DOY',img.get('DOY')),img2);
      img2 = ee.Algorithms.If(img.propertyNames().contains('sensor'),ee.Image(img2).set('sensor',img.get('sensor')),img2);
      img2 = ee.Algorithms.If(img.propertyNames().contains('bandname'),ee.Image(img2).set('bandname',img.get('bandname')),img2)
      return img2;
    });
  
  return mosaic;
};

/**
 * Convert a collection to an image with each band representing an image
 * in previous collection
 */
exports.stackCollection = function(collection) {
  
  return ee.Image(collection.iterate(appendBand));
  
};

// Function to transform EVI collection to an image
function appendBand(current, previous){
  // create band name as sensor_DOY if the band has properties DOY and sensor
  // otherwise, band name as system:index
  var bandName = ee.Algorithms.If(ee.List(current.propertyNames()).contains('bandname'),
                                  current.get('bandname'),
                                  current.get('system:index'));
  // var bandName = current.get('system:index');
  // rename the band
  current = ee.Image(current).select([0],[bandName]);
  // Append it to the result (only return current item on first element)
  var accum = ee.Algorithms.If(ee.Algorithms.IsEqual(previous,null), current, ee.Image(previous).addBands(current));
  // return the accumulation
  return accum;
}
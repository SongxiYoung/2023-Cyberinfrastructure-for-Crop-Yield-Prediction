# 2023-Cyberinfrastructure-for-Crop-Yield-Prediction

## 1. Source code from: 

https://github.com/allredbw/ee-scheduler

## 2. Official Documentation:
https://cloud.google.com/scheduler/docs/tut-pub-sub

## 3. Code in Cloud Function:
inside the folder: downloadData_function-source.

package.json: import essential packages, such as GEE.

eeKey.json: authorization file.

function.js: main file, the entry of the Cloud Function.

composites.js: not essential, some self-defined functions for main file.

<img width="1792" alt="image" src="https://github.com/SongxiYoung/2023-Cyberinfrastructure-for-Crop-Yield-Prediction/assets/37897076/a0ce62cb-6819-4d7c-ac51-ed6254b283d6">


## 4. Remember to give permission from Google Drive:

Here are the general steps to give permissions to export datasets to Google Drive:

1.Open Google Drive.

2.Go to Google Drive and log in with the Google Account that owns the Google Drive folder.

3.Navigate to the specific folder where you want to export the Earth Engine data.

4.Right-click on the folder, select "Share," and add the email address associated with your Earth Engine service account (you can find this in the client_email field in your service account JSON key). Assign the necessary permissions (e.g., "Editor" or "Viewer" depending on your needs).

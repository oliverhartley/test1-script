function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getSentUrls(sheet) {
  var urls = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // Asumimos que en 'GWS Sent News' el link está en la Columna A (como hipervínculo o texto)
    var range = sheet.getRange(2, 1, lastRow - 1, 1);
    var richTextValues = range.getRichTextValues();
    
    for (var i = 0; i < richTextValues.length; i++) {
      var url = richTextValues[i][0].getLinkUrl();
      if (url) {
        urls[url] = true;
      }
    }
  }
  return urls;
}

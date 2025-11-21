function fetchWorkspaceUpdates() {
  var url = 'https://workspaceupdates.googleblog.com/feeds/posts/default?alt=rss';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Hojas requeridas
  var sheetGWS = getOrCreateSheet(ss, 'GWS');
  var sheetSent = getOrCreateSheet(ss, 'GWS Sent News');
  var sheetYoutube = getOrCreateSheet(ss, 'GWS Youtube');
  
  try {
    // 1. Obtener URLs ya enviadas para filtrar
    var sentUrls = getSentUrls(sheetSent);
    
    // 2. Obtener y parsear RSS
    var xml = UrlFetchApp.fetch(url).getContentText();
    var document = XmlService.parse(xml);
    var root = document.getRootElement();
    var atom = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    var entries = root.getChildren('entry', atom);
    
    // Configurar cabeceras si están vacías
    if (sheetGWS.getLastRow() === 0) {
      sheetGWS.appendRow(['Noticia', 'Fecha', 'Sección', 'Sub-sección']);
      sheetGWS.getRange('A1:D1').setFontWeight('bold');
    }
    
    var twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    var itemsToProcess = [];
    
    // 3. Filtrar y recolectar datos
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var publishedStr = entry.getChildText('published', atom);
      var pubDate = new Date(publishedStr);
      
      if (pubDate >= twoWeeksAgo) {
        var title = entry.getChildText('title', atom);
        
        // Obtener Link
        var links = entry.getChildren('link', atom);
        var linkUrl = '';
        for (var j = 0; j < links.length; j++) {
          var link = links[j];
          var rel = link.getAttribute('rel');
          if (!rel || rel.getValue() === 'alternate') {
            linkUrl = link.getAttribute('href').getValue();
            break;
          }
        }
        
        // CHEQUEO DE DUPLICADOS: Si la URL ya está en 'GWS Sent News', la saltamos
        if (sentUrls[linkUrl]) {
          continue; 
        }
        
        itemsToProcess.push({
          title: title,
          date: pubDate,
          url: linkUrl
        });
      }
    }
    
    if (itemsToProcess.length === 0) {
      Logger.log("No se encontraron noticias NUEVAS en las últimas 2 semanas.");
      return;
    }

    // 4. Clasificar con Gemini (Sección/Sub-sección)
    var classifications = classifyWithGemini(itemsToProcess.map(function(item) { return item.title; }));
    
    // 5. Escribir en 'GWS'
    sheetGWS.clear();
    sheetGWS.appendRow(['Noticia', 'Fecha', 'Sección', 'Sub-sección']);
    sheetGWS.getRange('A1:D1').setFontWeight('bold');
    
    var rowsRichText = [];
    var rowsDates = [];
    var rowsSections = [];
    var rowsSubSections = [];
    
    for (var i = 0; i < itemsToProcess.length; i++) {
      var item = itemsToProcess[i];
      var cls = classifications[i] || {section: 'Other', sub_section: 'General'};
      
      // Col A: Title with Link
      var richTextTitle = SpreadsheetApp.newRichTextValue()
        .setText(item.title)
        .setLinkUrl(item.url)
        .build();
      rowsRichText.push([richTextTitle]);
      rowsDates.push([item.date]);
      rowsSections.push([cls.section]);
      rowsSubSections.push([cls.sub_section]);
    }
    
    var numRows = itemsToProcess.length;
    sheetGWS.getRange(2, 1, numRows, 1).setRichTextValues(rowsRichText);
    sheetGWS.getRange(2, 2, numRows, 1).setValues(rowsDates);
    sheetGWS.getRange(2, 2, numRows, 1).setNumberFormat("dd/MM/yyyy");
    sheetGWS.getRange(2, 3, numRows, 1).setValues(rowsSections);
    sheetGWS.getRange(2, 4, numRows, 1).setValues(rowsSubSections);
    sheetGWS.autoResizeColumns(1, 4);
    
    // 6. Generar Contenido para YouTube
    generateYoutubeContent(itemsToProcess, sheetYoutube);
    
  } catch (e) {
    Logger.log("Error: " + e.toString());
    SpreadsheetApp.getUi().alert("Error: " + e.toString());
  }
}

function moveNewsToSent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetGWS = getOrCreateSheet(ss, 'GWS');
  var sheetSent = getOrCreateSheet(ss, 'GWS Sent News');
  
  var lastRow = sheetGWS.getLastRow();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("No hay noticias en 'GWS' para mover.");
    return;
  }
  
  var range = sheetGWS.getRange(2, 1, lastRow - 1, 4);
  
  var sentLastRow = sheetSent.getLastRow();
  var destRow = sentLastRow + 1;
  
  if (sentLastRow === 0) {
    sheetSent.appendRow(['Noticia', 'Fecha', 'Sección', 'Sub-sección']);
    sheetSent.getRange('A1:D1').setFontWeight('bold');
    destRow = 2;
  }
  
  range.copyTo(sheetSent.getRange(destRow, 1), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
  sheetGWS.deleteRows(2, lastRow - 1);
  
  SpreadsheetApp.getUi().alert("Se movieron " + (lastRow - 1) + " noticias a 'GWS Sent News'.");
}

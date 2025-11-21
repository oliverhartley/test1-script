function setupApiKey() {
  var key = 'AIzaSyBMvA-erSqoCDVytNeJYsT-6uTqEl9x2CY'; // Tu clave
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  Logger.log('¡Listo! API Key configurada correctamente. Ahora puedes ejecutar fetchWorkspaceUpdates.');
}

function getGeminiApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error("Por favor configura la propiedad 'GEMINI_API_KEY'. Puedes ejecutar la función 'setupApiKey' una vez para configurarla automáticamente.");
  }
  return key;
}

var GEMINI_API_KEY = getGeminiApiKey();

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
    
    // 5. Escribir en 'GWS' (Limpiamos GWS antes para dejar solo lo nuevo de esta ejecución, o añadimos? 
    // El usuario dijo: "delete the news in GWS that already exist in GWS Sent News... the remaining news in GWS will be the ones we work with"
    // Asumiré que GWS es un "staging" limpio cada vez.
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

// --- Helpers ---

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
    // Para simplificar, leeremos el texto o la URL si es posible. 
    // El usuario dijo "same format as GWS", así que Col A es Título con Link.
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

function classifyWithGemini(titles) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY;
  
  var prompt = "You are a classifier for Google Workspace Updates. Classify the following news titles into the correct 'Section' and 'Sub-section'.\n" +
    "Return ONLY a raw JSON array of objects with 'section' and 'sub_section' keys. Array length must match input.\n" +
    "Titles:\n" + JSON.stringify(titles);

  var payload = { "contents": [{ "parts": [{ "text": prompt }] }] };
  var options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    if (json.error) {
      Logger.log("Gemini Error: " + JSON.stringify(json.error));
      return [];
    }
    var text = json.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    Logger.log("Gemini Classify Error: " + e.toString());
    return [];
  }
}

function generateYoutubeContent(items, sheetYoutube) {
  var titles = items.map(function(i) { return i.title; }).join("\n- ");
  
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY;
  var prompt = "Create a YouTube Video Title and Description for a video covering these Google Workspace updates.\n" +
    "The description should be engaging, use bullet points for the news, and include relevant hashtags at the end.\n" +
    "News Updates:\n" + titles + "\n\n" +
    "Output Format:\n" +
    "TITLE: [Video Title]\n\n" +
    "DESCRIPTION:\n[Video Description]";

  var payload = { "contents": [{ "parts": [{ "text": prompt }] }] };
  var options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    if (json.error) {
      Logger.log("Gemini YouTube Error: " + JSON.stringify(json.error));
      return;
    }
    
    var content = json.candidates[0].content.parts[0].text;
    
    // Crear Google Doc
    var docTitle = "YouTube Content - " + new Date().toLocaleDateString();
    var doc = DocumentApp.create(docTitle);
    var body = doc.getBody();
    body.setText(content);
    var docUrl = doc.getUrl();
    
    // Guardar en GWS Youtube
    if (sheetYoutube.getLastRow() === 0) {
      sheetYoutube.appendRow(['Youtube Doc', 'Youtube Link']);
      sheetYoutube.getRange('A1:B1').setFontWeight('bold');
    }
    sheetYoutube.appendRow([docUrl, ""]);
    
  } catch (e) {
    Logger.log("Error generating YouTube content: " + e.toString());
  }
}

function moveNewsToSent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetGWS = getOrCreateSheet(ss, 'GWS');
  var sheetSent = getOrCreateSheet(ss, 'GWS Sent News');
  
  var lastRow = sheetGWS.getLastRow();
  
  // Verificar si hay datos (asumiendo fila 1 es encabezado)
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("No hay noticias en 'GWS' para mover.");
    return;
  }
  
  // Obtener datos (excluyendo encabezados)
  // getRange(row, column, numRows, numColumns)
  var range = sheetGWS.getRange(2, 1, lastRow - 1, 4); // 4 columnas: Noticia, Fecha, Sección, Sub-sección
  
  // Copiar a Sent News
  // Usamos copyTo para mantener formatos (links, negritas, etc) o getValues/setValues?
  // copyTo es mejor para mantener los RichText (links).
  
  // Determinar dónde pegar en Sent News
  var sentLastRow = sheetSent.getLastRow();
  var destRow = sentLastRow + 1;
  
  // Si Sent News está vacía, poner encabezados primero
  if (sentLastRow === 0) {
    sheetSent.appendRow(['Noticia', 'Fecha', 'Sección', 'Sub-sección']);
    sheetSent.getRange('A1:D1').setFontWeight('bold');
    destRow = 2;
  }
  
  // Copiar valores y formatos
  range.copyTo(sheetSent.getRange(destRow, 1), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
  
  // Borrar datos de GWS (mantener encabezados)
  sheetGWS.deleteRows(2, lastRow - 1);
  
  SpreadsheetApp.getUi().alert("Se movieron " + (lastRow - 1) + " noticias a 'GWS Sent News'.");
}

function getGeminiApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error("Por favor configura la propiedad 'GEMINI_API_KEY' en la configuración del proyecto (Icono de engranaje > Propiedades del script).");
  }
  return key;
}

var GEMINI_API_KEY = getGeminiApiKey();

function fetchWorkspaceUpdates() {
  var url = 'https://workspaceupdates.googleblog.com/feeds/posts/default?alt=rss';
  
  try {
    var xml = UrlFetchApp.fetch(url).getContentText();
    var document = XmlService.parse(xml);
    var root = document.getRootElement();
    var atom = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    var entries = root.getChildren('entry', atom);
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Setup Sheet
    sheet.clear();
    sheet.appendRow(['Noticia', 'Fecha', 'Sección', 'Sub-sección']);
    sheet.getRange('A1:D1').setFontWeight('bold');
    
    var twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    var itemsToProcess = [];
    
    // 1. Filter and Collect Data
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var publishedStr = entry.getChildText('published', atom);
      var pubDate = new Date(publishedStr);
      
      if (pubDate >= twoWeeksAgo) {
        var title = entry.getChildText('title', atom);
        
        // Get Link
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
        
        itemsToProcess.push({
          title: title,
          date: pubDate,
          url: linkUrl
        });
      }
    }
    
    if (itemsToProcess.length === 0) {
      Logger.log("No se encontraron noticias en las últimas 2 semanas.");
      return;
    }

    // 2. Classify with Gemini
    var classifications = classifyWithGemini(itemsToProcess.map(function(item) { return item.title; }));
    
    // 3. Write to Sheet
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
      
      // Col B: Date
      rowsDates.push([item.date]);
      
      // Col C: Section
      rowsSections.push([cls.section]);
      
      // Col D: Sub-section
      rowsSubSections.push([cls.sub_section]);
    }
    
    var numRows = itemsToProcess.length;
    sheet.getRange(2, 1, numRows, 1).setRichTextValues(rowsRichText);
    sheet.getRange(2, 2, numRows, 1).setValues(rowsDates);
    sheet.getRange(2, 2, numRows, 1).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, 3, numRows, 1).setValues(rowsSections);
    sheet.getRange(2, 4, numRows, 1).setValues(rowsSubSections);
    
    sheet.autoResizeColumns(1, 4);
    
  } catch (e) {
    Logger.log("Error: " + e.toString());
    SpreadsheetApp.getUi().alert("Error: " + e.toString());
  }
}

function classifyWithGemini(titles) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY;
  
  var prompt = "You are a classifier for Google Workspace Updates. Classify the following news titles into the correct 'Section' and 'Sub-section' based on the official Google Workspace Updates blog structure.\n\n" +
    "Common Sections: 'Comms & Meetings', 'Content & Collaboration', 'Gemini', 'Admin & Security', 'Education', 'Developers'.\n" +
    "Common Sub-sections: 'Gmail', 'Google Chat', 'Google Meet', 'Google Calendar', 'Google Drive', 'Google Docs', 'Google Sheets', 'Google Slides'.\n\n" +
    "Return ONLY a raw JSON array of objects (no markdown formatting), where each object has 'section' and 'sub_section' keys. The array must have exactly " + titles.length + " items, corresponding to the input order.\n\n" +
    "Titles:\n" + JSON.stringify(titles);

  var payload = {
    "contents": [{
      "parts": [{"text": prompt}]
    }]
  };
  
  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    
    if (json.error) {
      Logger.log("Gemini Error: " + JSON.stringify(json.error));
      return [];
    }
    
    var text = json.candidates[0].content.parts[0].text;
    // Clean markdown if present
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text);
    
  } catch (e) {
    Logger.log("Gemini API Call Failed: " + e.toString());
    return [];
  }
}

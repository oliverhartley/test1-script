function classifyWithGemini(titles) {
  var url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=' + GEMINI_API_KEY;
  
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
  
  var url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=' + GEMINI_API_KEY;
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

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

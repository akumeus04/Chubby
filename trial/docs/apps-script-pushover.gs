/**
 * ADD THIS TO YOUR GOOGLE APPS SCRIPT  (not for GitHub — it only runs inside Apps Script)
 *
 * The website sends this for every message:
 *   { secret, action: "pushover", userKey, title, message, url }
 *
 * ── 1. Store your Pushover API token safely (NOT in the website) ────────────────
 *   Apps Script editor → ⚙ Project Settings → Script Properties → Add script property
 *     Property: PUSHOVER_API_TOKEN      Value: <your Pushover application token>
 *   (Create the token at https://pushover.net/apps/build → "Create an Application/API Token")
 *
 * ── 2. Route the new action in your existing doPost(e) ─────────────────────────
 *   Put this right AFTER you parse the request body and check `secret`
 *   (use the same variable names you already have for the parsed data):
 *
 *       if (data.action === 'pushover') {
 *         return ContentService
 *           .createTextOutput(JSON.stringify(sendPushover_(data)))
 *           .setMimeType(ContentService.MimeType.JSON);
 *       }
 *
 * ── 3. DEPLOY A NEW VERSION  (easy to forget!) ─────────────────────────────────
 *   Deploy → Manage deployments → ✏ Edit → Version: "New version" → Deploy.
 *   Saving the script alone does NOT update the live /exec URL.
 */
function sendPushover_(d) {
  var token = PropertiesService.getScriptProperties().getProperty('PUSHOVER_API_TOKEN');
  if (!token) return { status: 'error', message: 'PUSHOVER_API_TOKEN is not set in Script Properties' };

  var userKey = String(d.userKey || '').trim();
  if (!/^[A-Za-z0-9]{30}$/.test(userKey)) return { status: 'error', message: 'Invalid Pushover user key' };

  var payload = {
    token:   token,
    user:    userKey,
    title:   String(d.title   || 'Chubby Chat').slice(0, 250),
    message: String(d.message || '…').slice(0, 1024),
    priority: 0            // 0 = normal. Use 1 to bypass quiet hours.
    // sound: 'pushover',  // optional: https://pushover.net/api#sounds
  };
  if (d.url) {
    payload.url = String(d.url).slice(0, 512);   // tapping the notification opens the app
    payload.url_title = 'Open Chubby Chat';
  }

  var res  = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
    method: 'post',
    payload: payload,                 // sent as a form, same as the curl --form-string example
    muteHttpExceptions: true
  });
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}

  if (code === 200 && body.status === 1) return { status: 'success' };
  return { status: 'error', message: (body.errors && body.errors.join(', ')) || ('Pushover HTTP ' + code) };
}

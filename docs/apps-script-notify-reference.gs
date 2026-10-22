/**
 * REFERENCE ONLY — do not upload to GitHub. Paste into your Google Apps Script project.
 *
 * The website POSTs this to your Apps Script for every message:
 *   { secret, action: "notify", targetToken, title, body, url }
 *
 * Your "notify" action should send an FCM HTTP v1 message shaped like this.
 * The two settings that matter most for Android are the HIGH priority / Urgency headers:
 * without them, Android can hold the push back for minutes while the phone is idle (Doze mode).
 * `data` must be data-only (no "notification" block) because sw.js draws the notification itself.
 */
function buildFcmMessage_(token, title, body, url) {
  return {
    message: {
      token: token,
      data: {                                   // all values must be strings
        title: String(title || "New message"),
        body:  String(body  || ""),
        url:   String(url   || "")
      },
      android: { priority: "HIGH", ttl: "86400s" },
      webpush: { headers: { Urgency: "high", TTL: "86400" } }
    }
  };
}

// Then POST buildFcmMessage_(...) to:
//   https://fcm.googleapis.com/v1/projects/ourmessenger-76636/messages:send
// with header  Authorization: Bearer <your service-account access token>
// If FCM answers 404 / UNREGISTERED for a token, that device was uninstalled — ignore it.

// notifications.js - Audio sound, in-app banner alerts, and Pushover push notifications
import { pushoverAppToken as configToken, pushoverUserKey as configUser } from "./config.js";

/**
 * Retrieves the currently active Pushover credentials from window, localStorage, or config.js
 */
export function getPushoverCredentials() {
  const token = 
    (typeof window !== "undefined" && (window.pushoverAppToken || window.PUSHOVER_APP_TOKEN)) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("pushover_app_token")) ||
    configToken ||
    "";

  const user = 
    (typeof window !== "undefined" && (window.pushoverUserKey || window.PUSHOVER_USER_KEY)) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("pushover_user_key")) ||
    configUser ||
    "";

  return { token: token.trim(), user: user.trim() };
}

/**
 * Configures or updates Pushover credentials at runtime
 */
export function setPushoverCredentials(appToken, userKey) {
  if (typeof window !== "undefined") {
    if (appToken !== undefined) window.pushoverAppToken = appToken;
    if (userKey !== undefined) window.pushoverUserKey = userKey;
  }
  if (typeof localStorage !== "undefined") {
    if (appToken) localStorage.setItem("pushover_app_token", appToken);
    if (userKey) localStorage.setItem("pushover_user_key", userKey);
  }
}

/**
 * Sends a push notification to Pushover API
 * @param {Object} options
 * @param {string} options.message - The notification message text (required)
 * @param {string} [options.title] - Notification title (optional)
 * @param {number} [options.priority] - -2 to 2 (-2 lowest, 0 normal, 1 high, 2 emergency)
 * @param {string} [options.sound] - Pushover notification sound (e.g. 'falling', 'siren', 'magic')
 * @param {string} [options.url] - Optional supplementary URL
 * @param {string} [options.urlTitle] - Title for the URL
 */
export async function sendPushoverNotification({ message, title = "Messenger Alert", priority = 0, sound = "", url = "", urlTitle = "" }) {
  if (!message) {
    console.warn("[Pushover] Cannot send empty notification message.");
    return { success: false, error: "Empty message" };
  }

  const { token, user } = getPushoverCredentials();

  if (!token || !user) {
    console.warn("[Pushover] Credentials not set. Notification skipped:", { title, message });
    return { 
      success: false, 
      skipped: true, 
      error: "Missing Pushover credentials. Set window.pushoverAppToken and window.pushoverUserKey or localStorage." 
    };
  }

  try {
    const params = new URLSearchParams();
    params.append("token", token);
    params.append("user", user);
    params.append("message", String(message).slice(0, 1024)); // Pushover message character limit
    if (title) params.append("title", String(title).slice(0, 250));
    if (priority !== undefined) params.append("priority", String(priority));
    if (sound) params.append("sound", sound);
    if (url) params.append("url", url);
    if (urlTitle) params.append("url_title", urlTitle);

    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data && data.status === 1) {
      return { success: true, status: 1, request: data.request };
    } else {
      const errMsg = (data && data.errors && data.errors.join(", ")) || `HTTP ${response.status}`;
      console.error("[Pushover] API Error:", errMsg);
      return { success: false, error: errMsg, details: data };
    }
  } catch (err) {
    console.error("[Pushover] Network exception delivering notification:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Dedicated helper to route error messages straight to Pushover
 * @param {string|Error} errorOrMessage - Error object or string message
 * @param {Object} [details]
 * @param {string} [details.context] - Where the error happened (e.g. 'Upload', 'Edit', 'Firestore')
 * @param {string} [details.title] - Custom title (defaults to '🚨 Messenger Error')
 * @param {number} [details.priority=1] - Priority level (defaults to 1 high priority for errors)
 * @param {string} [details.sound='falling'] - Notification sound
 */
export async function sendPushoverError(errorOrMessage, details = {}) {
  const errorText = typeof errorOrMessage === "string" 
    ? errorOrMessage 
    : (errorOrMessage?.message || errorOrMessage?.name || JSON.stringify(errorOrMessage));

  const contextPrefix = details.context ? `[${details.context}] ` : "";
  const fullMessage = `${contextPrefix}${errorText}`;
  const title = details.title || "🚨 Messenger Error";
  const priority = details.priority !== undefined ? details.priority : 1;
  const sound = details.sound || "falling";

  // Retain console log for local browser diagnostics
  console.error(`[Pushover Route] ${title}: ${fullMessage}`, errorOrMessage);

  return sendPushoverNotification({
    title,
    message: fullMessage,
    priority,
    sound,
    url: details.url || "",
    urlTitle: details.urlTitle || ""
  });
}

/**
 * Sends a standard partner alert notification (also dispatches to Pushover if configured)
 */
export async function notifyPartner(text, details = {}) {
  if (!text) return;
  
  const title = details.title || "💬 New Message";
  const { token, user } = getPushoverCredentials();

  if (token && user) {
    sendPushoverNotification({
      title,
      message: text,
      priority: 0,
      sound: details.sound || "pushover"
    }).catch(err => console.warn("[Pushover notifyPartner]", err));
  }
}

export const getSound = () => ({ 
  play: async () => {} 
});

export const showInAppBanner = (title, body) => {
  if (typeof document === "undefined") return;
  const banner = document.getElementById("in-app-banner");
  if (banner) {
    banner.textContent = `${title}: ${body}`;
    banner.classList.add("visible");
    setTimeout(() => banner.classList.remove("visible"), 4000);
  }
};

// Expose on window for easy testing and legacy compatibility
if (typeof window !== "undefined") {
  window.sendPushoverError = sendPushoverError;
  window.sendPushoverNotification = sendPushoverNotification;
  window.setPushoverCredentials = setPushoverCredentials;
  window.notifyPartner = notifyPartner;
}

export default { 
  getSound, 
  showInAppBanner, 
  notifyPartner, 
  sendPushoverError, 
  sendPushoverNotification, 
  setPushoverCredentials, 
  getPushoverCredentials 
};

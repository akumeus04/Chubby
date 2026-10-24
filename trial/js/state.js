// Shared mutable app state (ES module imports are read-only, so values that
// several files change live on this one object).
export const state = {
  uploadSecret: "",
  currentUser: null,
  partnerName: "Partner",
  editingDocId: null,
  replyingToDocId: null,
  replyingToText: "",
  replyingToName: "",
  replyingToMedia: "",
  replyingToMime: "",
  selectedFiles: [],
  _lightboxCurrentUrl: "",
  _lightboxCurrentType: "",
};

// Simple versioning for cache busting
// Update this when you need to force reload of JS/CSS files
const CACHE_VERSION = "20250728-050800";

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CACHE_VERSION };
}

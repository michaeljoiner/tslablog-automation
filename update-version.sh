#!/bin/bash

# Script to update cache version when you need to bust cache
# Usage: ./update-version.sh

# Generate new version based on current timestamp
NEW_VERSION=$(date +"%Y%m%d-%H%M%S")

# Update version.js
cat > version.js << EOF
// Simple versioning for cache busting
// Update this when you need to force reload of JS/CSS files
const CACHE_VERSION = "${NEW_VERSION}";

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CACHE_VERSION };
}
EOF

echo "Cache version updated to: ${NEW_VERSION}"
echo "Changes will take effect on next page load"
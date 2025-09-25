#!/bin/bash

# Script to delete malformed blog entries
# Usage: ./cleanup-blogs.sh

echo "🧹 Cleaning up malformed blog entries..."

# Delete blog with malformed title (ID 395)
echo "Deleting blog ID 395 (malformed JSON title)..."
wrangler d1 execute NEWS_BLOG_D1 --remote --command "DELETE FROM blog_posts WHERE id = 395;" --config wrangler-blog.toml

# Optional: Clean up any other malformed entries
echo "Cleaning up any entries with backticks in title..."
wrangler d1 execute NEWS_BLOG_D1 --remote --command "DELETE FROM blog_posts WHERE title LIKE '%json%' OR title LIKE '%```%';" --config wrangler-blog.toml

echo "✅ Cleanup completed!"
echo "🔗 Check: https://tslablog.com/archive"
#!/bin/bash

# Simple script to manually trigger blog generation
# Usage: ./generate-blog.sh

echo "🚀 Generating Tesla blog post..."

# Check if GENERATE_SECRET is provided as environment variable
if [ -z "$GENERATE_SECRET" ]; then
    echo "❌ Error: GENERATE_SECRET environment variable not set"
    echo "Usage: GENERATE_SECRET=your_secret ./generate-blog.sh"
    echo "Or: export GENERATE_SECRET=your_secret && ./generate-blog.sh"
    exit 1
fi

SECRET="$GENERATE_SECRET"

# Trigger blog generation
response=$(curl -s -X POST \
    -H "x-gen-auth: $SECRET" \
    -H "Content-Type: application/json" \
    -w "HTTPSTATUS:%{http_code}" \
    https://tslablog.com/generate)

# Extract HTTP status code
http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
content=$(echo $response | sed -E 's/HTTPSTATUS:[0-9]{3}$//')

echo "📡 HTTP Status: $http_code"

if [ "$http_code" = "200" ]; then
    echo "✅ Blog generated successfully!"
    echo "🔗 View at: https://tslablog.com/archive"

    # Pretty print the JSON response if it's valid JSON
    if echo "$content" | jq . >/dev/null 2>&1; then
        echo ""
        echo "📄 Generated blog preview:"
        echo "$content" | jq -r '.title'
    fi
else
    echo "❌ Blog generation failed"
    echo "Response: $content"
fi
#!/bin/bash

# RSS feed URLs from workercode.js
FEEDS=(
  "https://ir.tesla.com/press?format=rss"
  "https://www.tesla.com/blog.rss"
  "https://www.reuters.com/rssFeed/teslaNews"
  "https://www.nasdaq.com/feed/rssoutbound?symbol=TSLA"
  "https://seekingalpha.com/api/sa/combined/tsla.xml"
  "https://insideevs.com/rss/category/tesla/"
  "https://cleantechnica.com/tag/tesla/feed/"
  "https://www.reddit.com/r/TeslaMotors/.rss"
  "https://twitrss.me/twitter_user_to_rss/?user=SawyerMerritt"
  "https://api.gdeltproject.org/api/v2/doc/docsearch?query=tesla&format=RSS"
)

echo "Testing RSS feeds..."

for FEED in "${FEEDS[@]}"; do
  echo -n "Checking $FEED ... "
  STATUS=$(curl -s -o /tmp/rss_test.xml -w "%{http_code}" "$FEED")
  if [ "$STATUS" = "200" ]; then
    # Check for <rss or <feed or <xml in the file
    if grep -qiE '<(rss|feed|xml)' /tmp/rss_test.xml; then
      echo "OK"
    else
      echo "Invalid XML"
    fi
  else
    echo "HTTP $STATUS"
  fi
  sleep 1
  rm -f /tmp/rss_test.xml
done 
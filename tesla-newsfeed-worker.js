// Tesla Newsfeed Worker - RSS News Fetching Only
// Handles /newsfeed endpoint and RSS caching independently

async function sendErrorNotification(env, error, context = 'Newsfeed Update') {
  try {
    const timestamp = new Date().toISOString();
    const pacificTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date());

    const errorData = {
      site: 'TSLAblog.com',
      context: context,
      timestamp: timestamp,
      pacificTime: pacificTime,
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack || 'No stack trace available'
      },
      email: 'michaeljoiner@gmail.com'
    };

    await env.NEWS_CACHE.put(`error_${timestamp}`, JSON.stringify(errorData), { expirationTtl: 604800 });
    
    console.error(`=== TSLAblog.com ${context} FAILURE ===`);
    console.error(`Time (Pacific): ${pacificTime}`);
    console.error(`Time (UTC): ${timestamp}`);
    console.error(`Error: ${error.message || 'Unknown error'}`);
    console.error(`Stack: ${error.stack || 'No stack trace available'}`);
    console.error('='.repeat(50));
    
  } catch (notificationError) {
    console.error('Failed to send error notification:', notificationError);
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      console.log("Newsfeed Worker - Request path:", url.pathname, "Method:", request.method);

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-gen-auth',
          },
        });
      }

      // Main newsfeed endpoint
      if (url.pathname === "/newsfeed") {
        try {
          // Try to get cached news from KV first
          const cachedNews = await env.NEWS_CACHE.get("newsfeed_cache", { type: "json" });
          
          if (cachedNews && cachedNews.length > 0) {
            console.log(`Serving ${cachedNews.length} cached news items from KV`);
            return new Response(JSON.stringify(cachedNews), { 
              headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=1800"
              } 
            });
          }

          // Fallback: try to get recent items from D1 if KV cache is empty
          console.log("KV cache empty, trying D1 fallback...");
          try {
            await env.NEWS_BLOG_D1.prepare("CREATE TABLE IF NOT EXISTS news_items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, link TEXT UNIQUE, description TEXT, source TEXT, pubDate TEXT, topics TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);").run();
            
            const { results } = await env.NEWS_BLOG_D1.prepare("SELECT title, link, description, source, pubDate, topics FROM news_items ORDER BY created_at DESC LIMIT 50").all();
            
            if (results && results.length > 0) {
              const newsItems = results.map(item => ({
                ...item,
                topics: item.topics ? JSON.parse(item.topics) : ['tesla']
              }));
              
              console.log(`Serving ${newsItems.length} items from D1 fallback`);
              return new Response(JSON.stringify(newsItems), { 
                headers: { 
                  "Content-Type": "application/json", 
                  "Access-Control-Allow-Origin": "*",
                  "Cache-Control": "public, max-age=600"
                } 
              });
            }
          } catch (d1Error) {
            console.error("D1 fallback failed:", d1Error);
          }

          // Last resort: return empty array
          console.error("Both KV cache and D1 fallback failed - returning empty array");
          return new Response(JSON.stringify([]), { 
            status: 200,
            headers: { 
              "Content-Type": "application/json", 
              "Access-Control-Allow-Origin": "*",
              "X-Cache-Status": "empty"
            } 
          });

        } catch (error) {
          console.error("Error in newsfeed endpoint:", error);
          return new Response(JSON.stringify({ error: "Internal server error" }), { 
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }
      }

      // Manual refresh endpoint  
      if (url.pathname === "/admin/refresh-news") {
        const auth = request.headers.get("x-gen-auth");
        if (auth !== env.GENERATE_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }

        const result = await refreshNewsCache(env);
        return new Response(JSON.stringify(result), { 
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*" 
          } 
        });
      }

      // Errors endpoint
      if (url.pathname === "/errors") {
        try {
          const { keys } = await env.NEWS_CACHE.list({ prefix: "error_" });
          const errors = [];
          for (const key of keys.slice(0, 10)) {
            const errorData = await env.NEWS_CACHE.get(key.name, { type: "json" });
            if (errorData) {
              const publicError = {
                site: errorData.site,
                context: errorData.context,
                timestamp: errorData.timestamp,
                pacificTime: errorData.pacificTime,
                error: errorData.error
              };
              errors.push(publicError);
            }
          }
          errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          return new Response(JSON.stringify(errors), { 
            headers: { 
              "Content-Type": "application/json", 
              "Access-Control-Allow-Origin": "*" 
            } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to retrieve errors" }), { 
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }
      }

      return new Response("Not found", { status: 404 });
      
    } catch (error) {
      console.error("Newsfeed Worker error:", error);
      return new Response("Internal server error", { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    console.log("Newsfeed Worker - Scheduled task triggered:", event.cron);
    
    try {
      console.log("Starting scheduled news cache refresh");
      const newsResult = await refreshNewsCache(env);
      if (newsResult.success) {
        console.log(`News cache refreshed with ${newsResult.itemsCount} items`);
      } else {
        console.error("Scheduled news refresh failed:", newsResult.error);
        await sendErrorNotification(env, new Error(newsResult.error), 'Scheduled News Refresh');
      }
    } catch (e) {
      console.error("Scheduled newsfeed task failed:", e);
      await sendErrorNotification(env, e, 'Scheduled Newsfeed Task');
    }
  }
};

// Refresh news cache function
async function refreshNewsCache(env) {
  try {
    console.log("Starting RSS feed refresh for cache");
    
    const rssUrls = [
      'https://www.bing.com/news/search?q=%22tesla%22+&format=rss&count=20',
      'https://www.bing.com/news/search?q=%22TSLA%22+&format=rss&count=15',
      'https://news.google.com/rss/search?q=tesla&hl=en-US&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=TSLA+stock&hl=en-US&gl=US&ceid=US:en',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=TSLA&region=US&lang=en-US',
      'https://seekingalpha.com/api/sa/combined/TSLA.xml'
    ];

    const newsItems = await fetchRssNewsItems(rssUrls);
    console.log(`Fetched ${newsItems.length} news items from RSS feeds`);

    if (newsItems.length === 0) {
      return {
        success: false,
        error: "No news items retrieved from RSS feeds"
      };
    }

    // Store in KV cache with 12-hour TTL (43200 seconds)
    await env.NEWS_CACHE.put("newsfeed_cache", JSON.stringify(newsItems), { expirationTtl: 43200 });
    console.log(`Stored ${newsItems.length} items in KV cache`);

    // Also store individual items in D1 for historical data and fallback
    try {
      await env.NEWS_BLOG_D1.prepare("CREATE TABLE IF NOT EXISTS news_items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, link TEXT UNIQUE, description TEXT, source TEXT, pubDate TEXT, topics TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);").run();
      
      let insertedCount = 0;
      for (const item of newsItems) {
        try {
          await env.NEWS_BLOG_D1.prepare(
            "INSERT OR REPLACE INTO news_items (title, link, description, source, pubDate, topics, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
          ).bind(
            item.title,
            item.link,
            item.description || '',
            item.source,
            item.pubDate,
            JSON.stringify(item.topics || ['tesla'])
          ).run();
          insertedCount++;
        } catch (insertError) {
          if (!insertError.message.includes('UNIQUE constraint')) {
            console.error(`Error inserting item ${item.title}:`, insertError);
          }
        }
      }
      
      console.log(`Inserted/updated ${insertedCount} items in D1 database`);
      
      // Clean up old entries (keep last 1000 items)
      await env.NEWS_BLOG_D1.prepare("DELETE FROM news_items WHERE id NOT IN (SELECT id FROM news_items ORDER BY created_at DESC LIMIT 1000)").run();
      
    } catch (d1Error) {
      console.error("D1 storage failed, but KV cache succeeded:", d1Error);
    }

    return {
      success: true,
      itemsCount: newsItems.length,
      sources: rssUrls.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("Error refreshing news cache:", error);
    await sendErrorNotification(env, error, 'News Cache Refresh');
    return {
      success: false,
      error: error.message
    };
  }
}

// RSS news fetching function
async function fetchRssNewsItems(rssUrls) {
  const newsItems = [];
  
  for (const rssUrl of rssUrls) {
    try {
      console.log(`Fetching RSS: ${rssUrl}`);
      
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TeslaBlogBot/1.0)'
        }
      });
      
      if (!response.ok) {
        console.error(`RSS fetch failed for ${rssUrl}: ${response.status}`);
        continue;
      }
      
      const xmlText = await response.text();
      const items = parseRssXmlForNewsfeed(xmlText, rssUrl);
      newsItems.push(...items);
      
    } catch (error) {
      console.error(`Error fetching RSS ${rssUrl}:`, error);
    }
  }
  
  // Remove duplicates and sort by date
  const uniqueItems = newsItems.filter((item, index, array) => 
    array.findIndex(i => i.link === item.link) === index
  );
  
  return uniqueItems
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 50);
}

function parseRssXmlForNewsfeed(xmlText, sourceUrl) {
  const items = [];
  
  // Extract RSS items
  const itemMatches = xmlText.match(/<item>(.*?)<\/item>/gs) || [];
  
  for (const itemMatch of itemMatches) {
    try {
      const titleMatch = itemMatch.match(/<title>(.*?)<\/title>/s);
      const linkMatch = itemMatch.match(/<link>(.*?)<\/link>/s);
      const descMatch = itemMatch.match(/<description>(.*?)<\/description>/s);
      const pubDateMatch = itemMatch.match(/<pubDate>(.*?)<\/pubDate>/s);
      const sourceMatch = itemMatch.match(/<source[^>]*>(.*?)<\/source>/s) || 
                          itemMatch.match(/<News:Source>(.*?)<\/News:Source>/s);
      
      if (!titleMatch || !linkMatch) continue;
      
      const title = decodeHtml(titleMatch[1].trim());
      const link = cleanUrl(linkMatch[1].trim());
      const description = descMatch ? decodeHtml(descMatch[1].trim()) : '';
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString();
      const source = sourceMatch ? decodeHtml(sourceMatch[1].trim()) : getSourceName(sourceUrl);
      
      const topics = identifyTopics({ title, description });
      
      items.push({
        title,
        link,
        description,
        source,
        pubDate,
        topics
      });
      
    } catch (error) {
      console.error('Error parsing RSS item:', error);
    }
  }
  
  return items;
}

function cleanUrl(url) {
  try {
    if (url.includes('news.google.com') || url.includes('/url?')) {
      const urlMatch = url.match(/url=([^&]+)/);
      if (urlMatch && urlMatch[1]) {
        return decodeURIComponent(urlMatch[1]);
      }
    }
    return url;
  } catch (error) {
    return url;
  }
}

function decodeHtml(html) {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '');
}

function getSourceName(url) {
  if (url.includes('bing.com')) return 'Bing News';
  if (url.includes('google.com')) return 'Google News';
  if (url.includes('yahoo.com')) return 'Yahoo Finance';
  if (url.includes('seekingalpha.com')) return 'Seeking Alpha';
  return 'News Source';
}

function identifyTopics(item) {
  const textToCheck = `${item.title} ${item.description}`.toLowerCase();
  
  const teslaKeywords = [
    'tesla', 'tsla', 'elon musk', 'model 3', 'model y', 'model s', 'model x', 
    'cybertruck', 'autopilot', 'fsd', 'supercharger', 'gigafactory'
  ];
  
  const hasTeslaContent = teslaKeywords.some(keyword => 
    textToCheck.includes(keyword.toLowerCase())
  );
  
  return hasTeslaContent ? ['tesla'] : ['general'];
}
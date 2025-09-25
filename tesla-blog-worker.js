// Tesla Blog Worker - AI Blog Generation Only
// Handles blog generation for Archive page

async function sendErrorNotification(env, error, context = 'Blog Generation') {
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

    await env.NEWS_BLOG_KV.put(`blog_error_${timestamp}`, JSON.stringify(errorData), { expirationTtl: 604800 });
    
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
      console.log("Blog Worker - Request path:", url.pathname, "Method:", request.method);

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

      // Latest blog endpoint
      if (url.pathname === "/latest") {
        const latest = await env.NEWS_BLOG_KV.get("latest_blog", { type: "json" });
        return new Response(JSON.stringify(latest), { 
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*" 
          } 
        });
      }

      // Blog archive endpoint
      if (url.pathname === "/api/archive") {
        try {
          await env.NEWS_BLOG_D1.prepare("CREATE TABLE IF NOT EXISTS blog_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, created_at TEXT, grounding TEXT);").run();
          const { results } = await env.NEWS_BLOG_D1.prepare("SELECT id, title, content, created_at, grounding FROM blog_posts ORDER BY created_at DESC LIMIT 100").all();
          
          return new Response(JSON.stringify(results || []), { 
            headers: { 
              "Content-Type": "application/json", 
              "Access-Control-Allow-Origin": "*" 
            } 
          });
        } catch (error) {
          console.error("Archive endpoint error:", error);
          return new Response(JSON.stringify([]), { 
            headers: { 
              "Content-Type": "application/json", 
              "Access-Control-Allow-Origin": "*" 
            } 
          });
        }
      }

      // Manual blog generation endpoint
      if (url.pathname === "/generate" || url.pathname === "/generate/") {
        try {
          const auth = request.headers.get("x-gen-auth");
          if (auth !== env.GENERATE_SECRET) {
            return new Response("Unauthorized", { status: 401 });
          }
          
          await env.NEWS_BLOG_D1.prepare("CREATE TABLE IF NOT EXISTS blog_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, created_at TEXT, grounding TEXT);").run();
          const blog = await generateGeminiBlog(env);
          if (!blog) return new Response("Blog generation failed", { status: 500 });
          
          await env.NEWS_BLOG_KV.put("latest_blog", JSON.stringify(blog));
          await env.NEWS_BLOG_D1.prepare(
            "INSERT INTO blog_posts (title, content, created_at, grounding) VALUES (?, ?, ?, ?)"
          ).bind(blog.title, blog.content, new Date().toISOString(), JSON.stringify(blog.grounding || {})).run();
          
          return new Response(JSON.stringify(blog), { 
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            } 
          });
        } catch (error) {
          console.error("Generate endpoint error:", error);
          return new Response("Generation failed", { status: 500 });
        }
      }

      // Sitemap endpoint
      if (url.pathname === "/sitemap.xml") {
        try {
          const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://tslablog.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://tslablog.com/blog.html</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://tslablog.com/archive.html</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
          return new Response(sitemap, { 
            headers: { 
              "Content-Type": "application/xml",
              "Access-Control-Allow-Origin": "*"
            } 
          });
        } catch (error) {
          return new Response("Sitemap generation failed", { status: 500 });
        }
      }

      return new Response("Not found", { status: 404 });
      
    } catch (error) {
      console.error("Blog Worker error:", error);
      return new Response("Internal server error", { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    console.log("Blog Worker - Scheduled task triggered:", event.cron);
    
    try {
      console.log("Starting scheduled blog generation");
      const blog = await generateGeminiBlog(env);
      if (blog) {
        await env.NEWS_BLOG_KV.put("latest_blog", JSON.stringify(blog));
        await env.NEWS_BLOG_D1.prepare("CREATE TABLE IF NOT EXISTS blog_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, created_at TEXT, grounding TEXT);").run();
        await env.NEWS_BLOG_D1.prepare(
          "INSERT INTO blog_posts (title, content, created_at, grounding) VALUES (?, ?, ?, ?)"
        ).bind(blog.title, blog.content, new Date().toISOString(), JSON.stringify(blog.grounding || {})).run();
        console.log("Scheduled blog generated successfully");
      } else {
        const error = new Error("Blog generation returned null/undefined result");
        console.error("Scheduled blog generation failed:", error);
        await sendErrorNotification(env, error, 'Scheduled Blog Generation');
      }
    } catch (e) {
      console.error("Scheduled blog task failed:", e);
      await sendErrorNotification(env, e, 'Scheduled Blog Task');
    }
  }
};

async function generateGeminiBlog(env) {
  try {
    console.log("Starting blog generation with RSS + AI...");
    
    // Tesla-filtered RSS feeds for comprehensive coverage
    const rssUrls = [
      'https://www.bing.com/news/search?q=%22tesla%22+&format=rss&count=20',
      'https://www.bing.com/news/search?q=%22TSLA%22+&format=rss&count=15',
      'https://news.google.com/rss/search?q=tesla&hl=en-US&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=TSLA+stock&hl=en-US&gl=US&ceid=US:en',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=TSLA&region=US&lang=en-US',
      'https://seekingalpha.com/api/sa/combined/TSLA.xml'
    ];

    // Fetch articles from Tesla-filtered RSS feeds
    const { urls: articleUrls, feedStatus } = await fetchArticleUrlsFromRss(rssUrls);
    console.log(`Fetched ${articleUrls.length} Tesla article URLs from RSS feeds`);
    
    // Fetch article content
    const articleContents = await fetchArticleContents(articleUrls);
    console.log(`Successfully extracted content from ${articleContents.length} articles`);
    
    // Get current Pacific Time for accurate newsletter dating
    const now = new Date();
    const pacificTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(now);
    
    const enhancedPrompt = `Generate a blog post in JSON format with a headline, TL;DR (3 bullet points up to 1 sentence each), and the blog post content. The blog post should be an update on Tesla, TSLA stock, and Elon Musk.

**CRITICAL: Return ONLY the JSON object. Do NOT wrap it in markdown code blocks or any other formatting.**

**REQUIREMENTS:**
- Very intellectual, facts-based news update as long as needed to convey information in a detailed, fair, unbiased way
- Inject absolutely zero speculation or opinion
- Use news from articles published today only (${pacificTime})
- When mentioning TSLA stock price, use the most current/latest price mentioned in today's articles
- Don't refer to this prompt and don't include the date in the headline
- If you change subjects, make it a new paragraph
- Headlines shouldn't be generic and should be catchy and click-inducing but not clickbait, following AP style

**JSON FORMAT (return exactly this structure with NO markdown formatting):**
{
  "headline": "Your headline here",
  "tldr": [
    "First bullet point",
    "Second bullet point",
    "Third bullet point"
  ],
  "content": "Your blog post content here..."
}

**WRITING STYLE:**
- Focus on net-new facts from today's news only
- Voice = smart, intellectual, fact-based
- Use specific numbers, dates and facts when available
- For TSLA stock price, use the latest/most recent price from today's articles
- Present tense for recent events
- No speculation, opinion, or fluff

Here are today's Tesla articles to analyze:

${articleContents.map(article => `
**${article.source}**
Title: ${article.title}
Content: ${article.content}
URL: ${article.url}
---`).join('\n')}`;

    // Generate blog using Gemini API with RSS article context
    const blogResponse = await generateWithGeminiAPI(enhancedPrompt, env.GEMINI_API_KEY);
    
    if (!blogResponse || !blogResponse.text) {
      console.error("Failed to generate blog post with Gemini");
      return null;
    }

    // Parse JSON response from Gemini
    let parsedBlog;
    try {
      let jsonText = blogResponse.text.trim();

      // Remove any markdown code block wrapper if present
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      } else if (jsonText.startsWith('```') && jsonText.endsWith('```')) {
        // Handle plain code blocks
        jsonText = jsonText.slice(3, -3).trim();
        if (jsonText.toLowerCase().startsWith('json')) {
          jsonText = jsonText.slice(4).trim();
        }
      }

      // Try to find JSON object if response has extra text
      const jsonMatch = jsonText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      parsedBlog = JSON.parse(jsonText);

      // Validate required fields
      if (!parsedBlog.headline || !parsedBlog.tldr || !parsedBlog.content) {
        throw new Error("Missing required fields in JSON response");
      }

    } catch (error) {
      console.error("Failed to parse JSON blog response:", error);
      console.log("Raw response:", blogResponse.text);

      // If JSON parsing fails, return null to skip this blog generation
      return null;
    }

    // Format the content with TL;DR
    let formattedContent = "";
    if (parsedBlog.tldr && Array.isArray(parsedBlog.tldr)) {
      formattedContent += "**TL;DR**\n";
      parsedBlog.tldr.forEach(point => {
        formattedContent += `• ${point}\n`;
      });
      formattedContent += "\n";
    }
    formattedContent += parsedBlog.content || "";

    return {
      title: parsedBlog.headline || "TSLAblog News Update",
      content: formattedContent,
      created_at: new Date().toISOString(),
      grounding: {
        method: "RSS + AI Processing",
        articlesProcessed: articleContents.length,
        feedsUsed: rssUrls.length,
        sources: articleContents.map(a => ({ url: a.url, source: a.source, title: a.title }))
      }
    };

  } catch (error) {
    console.error("Error in generateGeminiBlog:", error);
    await sendErrorNotification(env, error, 'Blog Generation');
    return null;
  }
}

async function generateWithGeminiAPI(prompt, apiKey) {
  try {
    console.log("Making Gemini API request...");

    // Import GoogleGenAI from @google/genai
    const { GoogleGenAI } = await import('@google/genai');

    const ai = new GoogleGenAI({
      apiKey: apiKey,
    });

    const tools = [
      { urlContext: {} },
      { googleSearch: {} },
    ];

    const config = {
      thinkingConfig: {
        thinkingBudget: -1,
      },
      tools,
    };

    const model = 'gemini-flash-lite-latest';
    const contents = [
      {
        role: 'user',
        parts: [
          { text: prompt },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model,
      config,
      contents,
    });

    if (response && response.candidates && response.candidates.length > 0 &&
        response.candidates[0].content && response.candidates[0].content.parts) {
      return {
        text: response.candidates[0].content.parts[0].text
      };
    } else {
      console.error("No text generated by Gemini");
      return null;
    }

  } catch (error) {
    console.error("Gemini API request failed:", error);
    return null;
  }
}

async function fetchArticleUrlsFromRss(rssUrls) {
  const allUrls = [];
  const feedStatus = {};
  
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
        feedStatus[rssUrl] = `Failed: ${response.status}`;
        continue;
      }
      
      const xmlText = await response.text();
      const urls = parseRssXml(xmlText, rssUrl);
      allUrls.push(...urls);
      feedStatus[rssUrl] = `Success: ${urls.length} articles`;
      
    } catch (error) {
      console.error(`Error fetching RSS ${rssUrl}:`, error);
      feedStatus[rssUrl] = `Error: ${error.message}`;
    }
  }
  
  // Remove duplicates and limit to most recent
  const uniqueUrls = [...new Set(allUrls)].slice(0, 15);
  
  return {
    urls: uniqueUrls,
    feedStatus
  };
}

function parseRssXml(xmlText, sourceUrl) {
  const urls = [];
  
  const itemMatches = xmlText.match(/<item>(.*?)<\/item>/gs) || [];
  
  for (const itemMatch of itemMatches) {
    try {
      const linkMatch = itemMatch.match(/<link>(.*?)<\/link>/s);
      if (linkMatch) {
        let url = linkMatch[1].trim();
        
        // Clean Google News URLs
        if (url.includes('news.google.com') || url.includes('/url?')) {
          const urlMatch = url.match(/url=([^&]+)/);
          if (urlMatch && urlMatch[1]) {
            url = decodeURIComponent(urlMatch[1]);
          }
        }
        
        if (url && url.startsWith('http')) {
          urls.push(url);
        }
      }
    } catch (error) {
      console.error('Error parsing RSS item:', error);
    }
  }
  
  return urls;
}

async function fetchArticleContents(urls) {
  const articles = [];
  
  for (const url of urls.slice(0, 10)) {
    try {
      console.log(`Fetching article content from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TeslaBlogBot/1.0)'
        }
      });
      
      if (!response.ok) {
        console.error(`Article fetch failed for ${url}: ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      const content = extractArticleContent(html);
      const title = extractArticleTitle(html);
      
      if (content && content.length > 200) {
        articles.push({
          url,
          title: title || 'Article',
          content: content.substring(0, 2000),
          source: extractDomain(url)
        });
      }
      
    } catch (error) {
      console.error(`Error fetching article ${url}:`, error);
    }
  }
  
  return articles;
}

function extractArticleContent(html) {
  // Simple content extraction - looks for article text
  const contentSelectors = [
    'article p',
    '.article-body p',
    '.story-body p', 
    '.content p',
    'main p',
    '.post-content p'
  ];
  
  // Basic regex-based content extraction as fallback
  const textMatch = html.match(/<p[^>]*>(.*?)<\/p>/gs);
  if (textMatch) {
    return textMatch
      .map(p => p.replace(/<[^>]*>/g, ''))
      .filter(text => text.length > 50)
      .join(' ')
      .substring(0, 1500);
  }
  
  return '';
}

function extractArticleTitle(html) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  }
  return '';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'Unknown Source';
  }
}
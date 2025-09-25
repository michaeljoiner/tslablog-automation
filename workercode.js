/* =========================================================================
   tslablog news‑feed Worker  •  v1.2.0-cache  •  2025‑05‑07
   ========================================================================= */

// IMPORTANT: This worker expects a KV Namespace to be bound to the variable `NEWS_CACHE`.
// You can create one in the Cloudflare dashboard and then bind it in your wrangler.toml:
// [[kv_namespaces]]
// binding = "NEWS_CACHE"
// id = "your_kv_namespace_id_here"
//
// It also expects a cron trigger in wrangler.toml for periodic updates:
// [triggers]
// crons = ["*/5 * * * *"] # Fetches new data every 5 minutes

//
// 1)  CONFIG
//
const RSS_FEED_URLS = [
  /* ─── Official Tesla ─────────────────────────────────────────────────── */
  "https://ir.tesla.com/press?format=rss",                 // Press releases
  "https://www.tesla.com/blog.rss",                        // Tesla Engineering | Blog

  /* ─── Major news wires & markets ─────────────────────────────────────── */
  "https://www.reuters.com/rssFeed/teslaNews",             // Reuters company desk
  "https://www.nasdaq.com/feed/rssoutbound?symbol=TSLA",   // Nasdaq: TSLA headlines

  /* ─── Finance / investor analysis ───────────────────────────────────── */
  "https://seekingalpha.com/api/sa/combined/tsla.xml",     // Seeking Alpha: mixed news + transcripts

  /* ─── EV‑centric outlets ─────────────────────────────────────────────── */
  "https://insideevs.com/rss/category/tesla/",             // InsideEVs — Tesla tag
  "https://cleantechnica.com/tag/tesla/feed/",             // CleanTechnica — Tesla tag

  /* ─── Community & social pulse ───────────────────────────────────────── */
  "https://www.reddit.com/r/TeslaMotors/.rss",             // Reddit: r/TeslaMotors
  "https://twitrss.me/twitter_user_to_rss/?user=SawyerMerritt", // Tesla‑savvy breaking images/tweets

  /* ─── Global multilingual fallback ───────────────────────────────────── */
  "https://api.gdeltproject.org/api/v2/doc/docsearch?query=tesla&format=RSS", // GDELT worldwide crawl

  /* ─── Google News Tesla Search ───────────────────────────────────────── */
  "https://news.google.com/rss/search?q=tesla&hl=en-US&gl=US&ceid=US:en" // Google News: Tesla
];

//
// 2)  UTILITIES
//
function decodeHtmlEntities(text) {
  if (typeof text !== "string") return text;
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": "'", '’': '’', '‘': '‘', '“': '“', '”': '”', ' ': ' ', '–': '–', '—': '—', '…': '…' };
  let out = text;
  for (const e in map) out = out.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), map[e]);
  out = out.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d));
  out = out.replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return out;
}

function stripHtmlTags(html) {
  if (typeof html !== "string") return html;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p\s*[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li\s*[^>]*>/gi, "\n* ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim()
    .replace(/\n\s*\n+/g, "\n\n");
}

// Extract ?url=… or ?q=… parameter from Google redirect links
function getOriginalGoogleLink(link) {
  try {
    const u = new URL(link);
    return decodeURIComponent(u.searchParams.get("url") || u.searchParams.get("q") || link);
  } catch { return link; }
}

// Add this utility at the top, after other utilities
function cleanLink(link) {
  if (!link) return link;
  // Remove CDATA wrappers
  link = link.replace(/^<!\[CDATA\[|\]\]>$/g, '');
  link = link.replace(/%3C!\[CDATA\[|\]\]%3E/gi, '');
  // Remove encoded CDATA wrappers
  link = link.replace(/^%3C!\[CDATA\[|\]\]%3E$/gi, '');
  // Remove any stray brackets
  link = link.replace(/^<|>$/g, '');
  // Decode URI
  try { link = decodeURIComponent(link); } catch {}
  return link.trim();
}

//
// 3) CORE NEWS FETCHING & PROCESSING LOGIC
//
async function fetchAndProcessNews(callerDebugVersion) {
  console.log("[fetchAndProcessNews] Function entered.");
  const BATCH = 4;
  let all = [];

  for (let i = 0; i < RSS_FEED_URLS.length; i += BATCH) {
    const urls = RSS_FEED_URLS.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      urls.map(feed =>
        fetch(feed, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
          }
        })
          .then(r => (r.ok ? r.text() : null))
          .then(txt => {
            const items = txt ? parseRSS(txt, feed) : [];
            if (feed.includes('news.google.com')) {
              console.log(`[Google News] Fetched: ${!!txt}, Parsed items: ${items.length}`);
            }
            return items;
          })
          .catch((err) => {
            console.error(`Failed to fetch or parse ${feed}: ${err.message}`);
            return [];
          })
      )
    );
    results.forEach(r => r.status === "fulfilled" && (all = all.concat(r.value)));
    if (i + BATCH < RSS_FEED_URLS.length) await new Promise(res => setTimeout(res, 200));
  }

  // dedupe
  const uniq = [];
  const seen = new Set();
  for (const it of all) {
    let normLink = it.link ? it.link.replace(/\/$/, '').toLowerCase() : '';
    const key = normLink || `:${it.title.trim().toLowerCase()}:${(it.source||'').trim().toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); uniq.push(it); }
  }
  console.log(`[fetchAndProcessNews] Item count after deduplication (uniq.length): ${uniq.length}`);

  // filter out Electrek
  let items = uniq.filter(it => !(it.source && /electrek\.co/i.test(it.source)));
  console.log(`[fetchAndProcessNews] Item count after Electrek filter: ${items.length}`);

  // keyword filter (Tesla/SpaceX/etc.)
  const KW = [
    /\btesla\b/i, /\btsla\b/i, /\bcybertruck\b/i, /\bmodel\s+s\b/i, /\bmodel\s+3\b/i, /\bmodel\s+x\b/i, /\bmodel\s+y\b/i,
    /\bgigafactory\b/i, /\bpowerwall\b/i, /\bmegapack\b/i, /\bfsd\b/i, /full\s+self-driving/i, /\bdojo\b/i,
    /\boptimus\b/i, /\btesla\s+bot\b/i, /\bspacex\b/i, /\bstarlink\b/i, /\bstarship\b/i, /\bdragon\s+capsule\b/i,
    /\braptor\s+engine\b/i, /\bstarbase\b/i, /\bx\.com\b/i, /\bneuralink\b/i, /\bxai\b/i, /\bx\.ai\b/i
  ];
  const musk = /(elon\s+)?musk/i;
  
  // Log count before keyword filter
  console.log(`[Keyword Filter] Item count before KW filter: ${items.length}`);

  const preKwFilterItems = [...items]; // Keep a copy before filtering for accurate fallback count if needed

  items = items.filter(it => {
    const txt = `${it.title} ${it.description}`.toLowerCase();
    const titleLower = it.title.toLowerCase();
    const hits = KW.filter(k => k.test(txt));

    // Check if the item is from the specific Google News Tesla feed
    // it.feedUrlOrigin is the full URL of the feed the item came from.
    const isGoogleTeslaFeed = it.feedUrlOrigin &&
                              it.feedUrlOrigin.startsWith("https://news.google.com/rss/search") &&
                              it.feedUrlOrigin.includes("q=tesla");

    if (isGoogleTeslaFeed) {
      // For items from the Google News Tesla feed, accept if any keyword from KW is present
      return hits.length > 0;
    } else {
      // For all other feeds (e.g., Reddit), use the refined original stricter logic
      // An item is kept if:
      // 1. More than 1 keyword match in title+description.
      // 2. OR 1 keyword match, and that match is in the title.
      // 3. OR (musk mentioned) AND (source is x.com OR link contains x.com) AND (text does NOT mention "model x").
      return hits.length > 1 ||
             (hits.length === 1 && KW.some(k => k.test(titleLower))) ||
             (musk.test(txt) && ( (it.source && it.source.toLowerCase() === 'x.com') || /\bx\.com\b/i.test(it.link)) && !/\bmodel\s+x\b/i.test(txt));
    }
  });

  // Log count after keyword filter
  console.log(`[Keyword Filter] Item count AFTER KW filter: ${items.length}`);

  // fallback to all if <60 (after primary keyword filter)
  if (items.length < 60) {
    console.warn(`[Low Tesla News] Only ${items.length} Tesla-related items after filtering.`);
    // No fallback: keep only filtered Tesla/SpaceX/Elon Musk news
  }

  // last 7 days
  const now = Date.now();
  const WEEK = 7 * 864e5;
  items = items.filter(it => {
    const d = it.parsedValidDate ? it.parsedValidDate.getTime() : 0;
    if (d === 0 && it.pubDate) { // Log if we had a pubDate string but it wasn't valid for filtering
        // console.warn(`[fetchAndProcessNews] Item filtered out due to invalid/missing parsedValidDate: "${it.title}", pubDate: "${it.pubDate}"`);
    }
    return d && (now - d < WEEK);
  });

  // sort newest first
  items.sort((a, b) => {
    const timeA = a.parsedValidDate ? a.parsedValidDate.getTime() : 0;
    const timeB = b.parsedValidDate ? b.parsedValidDate.getTime() : 0;
    return timeB - timeA;
  });

  // slice
  items = items.slice(0, 250);

  // --- YouTube detection helper ---
  function isYouTubeItem(item) {
    if (!item || !item.link) return false;
    try {
      const url = new URL(item.link);
      return (
        url.hostname.includes('youtube.com') ||
        url.hostname.includes('youtu.be') ||
        url.hostname.includes('youtube-nocookie.com') ||
        (item.feedUrlOrigin && /youtube/i.test(item.feedUrlOrigin))
      );
    } catch { return false; }
  }

  // Separate YouTube and non-YouTube items
  let youtubeItems = items.filter(isYouTubeItem);
  let nonYoutubeItems = items.filter(it => !isYouTubeItem(it));

  // Filter YouTube items for Tesla relevance (reuse KW logic)
  youtubeItems = youtubeItems.filter(it => {
    const txt = `${it.title} ${it.description}`.toLowerCase();
    const hits = KW.filter(k => k.test(txt));
    return hits.length > 1 || (hits.length === 1 && KW.some(k => k.test(it.title.toLowerCase())));
  });

  // Limit YouTube items for diversity
  const maxYouTubeVideos = 7;
  youtubeItems = youtubeItems.slice(0, maxYouTubeVideos);

  // Mark YouTube items for frontend rendering
  youtubeItems = youtubeItems.map(it => ({ ...it, isYouTube: true }));

  // Merge and sort
  let merged = [...nonYoutubeItems, ...youtubeItems];
  merged.sort((a, b) => {
    const timeA = a.parsedValidDate ? a.parsedValidDate.getTime() : 0;
    const timeB = b.parsedValidDate ? b.parsedValidDate.getTime() : 0;
    return timeB - timeA;
  });

  // last 7 days
  merged = merged.filter(it => {
    const d = it.parsedValidDate ? it.parsedValidDate.getTime() : 0;
    return d && (now - d < WEEK);
  });

  // slice
  merged = merged.slice(0, 250);

  // --- Ensure debug/version object is always first ---
  const debugObj = { debug: callerDebugVersion || "workercode.js v1.2.0-cache" };
  return [debugObj, ...merged.map(it => ({
    title: it.title,
    link: it.link,
    pubDate: it.pubDate,
    description: it.description,
    source: it.source,
    imageUrl: it.imageUrl,
    metaTitle: it.title,
    metaDescription: it.description,
    metaImage: it.imageUrl,
    isYouTube: it.isYouTube || false,
    metadata: {
      title: it.title,
      description: it.description,
      image: it.imageUrl,
      ogTitle: it.title,
      ogDescription: it.description,
      ogImage: it.imageUrl,
      ogSiteName: it.source,
      articlePublishedTime: it.parsedValidDate ? it.parsedValidDate.toISOString() : it.pubDate,
      twitterTitle: it.title,
      twitterDescription: it.description,
      twitterImage: it.imageUrl,
      author: it.author || null,
      keywords: null,
      htmlTitle: it.title
    }
  }))];
}

//
// 4)  FETCH HANDLER (for client requests)
//
addEventListener("fetch", (event) => event.respondWith(handleRequest(event.request)));

async function handleRequest(request) {
  const DEBUG_VERSION = "workercode.js v1.2.0-cache"; // Updated version
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

  if (request.method === "OPTIONS") return new Response(null, { headers: cors, status: 204 });

  try {
    // Check cache first
    const cachedNews = await NEWS_CACHE.get("latest_news", { type: "json" });
    if (cachedNews) {
      console.log("Cache HIT");
      return new Response(JSON.stringify(cachedNews), {
        headers: { ...cors, "Content-Type": "application/json", "X-Cache-Status": "HIT", "Cache-Control": "public, max-age=240", "X-Worker-Version": DEBUG_VERSION } // Cache on client/CDN for 4 mins
      });
    }
    console.log("Cache MISS");

    // If cache miss, fetch, process, store in cache, and return
    const newsData = await fetchAndProcessNews(DEBUG_VERSION);

    // Store in KV, but don't wait for it to complete before responding to the user for faster response.
    // TTL of 6 minutes (360s), slightly longer than cron schedule to avoid race conditions.
    event.waitUntil(NEWS_CACHE.put("latest_news", JSON.stringify(newsData), { expirationTtl: 360 }));

    return new Response(JSON.stringify(newsData), {
      headers: { ...cors, "Content-Type": "application/json", "X-Cache-Status": "MISS", "Cache-Control": "public, max-age=60", "X-Worker-Version": DEBUG_VERSION } // Cache on client/CDN for 1 min on miss
    });

  } catch (err) {
    console.error("Error in handleRequest:", err.message, err.stack);
    return new Response(JSON.stringify({ error: "Failed to fetch news", message: err.message, stack: err.stack, debug: DEBUG_VERSION }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

//
// 5) SCHEDULED HANDLER (for cron job background updates)
//
addEventListener("scheduled", event => {
  event.waitUntil(handleScheduled(event));
});

async function handleScheduled(event) {
  const SCHEDULED_DEBUG_VERSION = "workercode.js v1.2.0-scheduled";
  console.log(`[cron: ${event.cron}] Scheduled task triggered. Fetching and caching news...`);
  try {
    const newsData = await fetchAndProcessNews(SCHEDULED_DEBUG_VERSION);
    // Store in KV without TTL, as this is the authoritative scheduled update.
    // The handleRequest might put with a short TTL, this will overwrite it.
    await NEWS_CACHE.put("latest_news", JSON.stringify(newsData));
    console.log(`[cron: ${event.cron}] Successfully fetched and cached ${newsData.length > 0 ? newsData.length -1 : 0} news items.`); // newsData[0] is debug
  } catch (err) {
    console.error(`[cron: ${event.cron}] Error in scheduled task:`, err.message, err.stack);
  }
}

//
// 6)  RSS / ATOM PARSER (improved Google News handling)
//
function parseRSS(xml, feedUrl = "unknown") {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = itemRe.exec(xml))) {
    const x = m[1] || m[2];

    const title = decodeHtmlEntities((/<title>([\s\S]*?)<\/title>/i.exec(x) || [,""])[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gs, "$1").trim());

    // --- link (refined extraction logic) ---
    let link = "";
    let guidLink = null;

    // 1. Try to get GUID and see if it's a usable HTTP/S URL
    const guidMatch = /<guid[^>]*>([\s\S]*?)<\/guid>/i.exec(x);
    if (guidMatch && guidMatch[1]) {
        const potentialGuidLink = guidMatch[1].trim();
        if (/^https?:\/\//i.test(potentialGuidLink)) {
            guidLink = potentialGuidLink;
        }
    }

    // 2. Try Atom <link rel="alternate" type="text/html" href="...">
    const atomAlternateLinkMatch = 
        /<link[^>]*rel=['"]alternate['"][^>]*type=['"]text\/html['"][^>]*href=['"]([^'"]+)['"][^>]*\/?/i.exec(x) ||
        /<link[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]alternate['"][^>]*type=['"]text\/html['"][^>]*\/?/i.exec(x);
    if (atomAlternateLinkMatch && atomAlternateLinkMatch[1]) {
        link = atomAlternateLinkMatch[1].trim();
    }

    // 3. If Atom alternate link not found or not valid, and guidLink is available, consider guidLink.
    if ((!link || !/^https?:\/\//i.test(link)) && guidLink) {
        link = guidLink;
    }

    // 4. If still no valid link, try common RSS <link> or less specific Atom <link rel="alternate">
    if (!link || !/^https?:\/\//i.test(link)) {
        const generalLinkMatch = 
            /<link>([\s\S]*?)<\/link>/i.exec(x) || 
            /<link[^>]*rel=['"]alternate['"][^>]*href=['"]([^'"]+)['"][^>]*\/?/i.exec(x) || 
            /<link[^>]*href=['"]([^'"]+)['"][^>]*\/?/i.exec(x); 
        if (generalLinkMatch && generalLinkMatch[1]) {
            const potentialGeneralLink = generalLinkMatch[1].trim();
            // Be more critical: if guidLink looks like a full article path and potentialGeneralLink is a bare domain, prefer guidLink later
            if (guidLink && /^https?:\/\/[^/]+\//.test(guidLink) && /^https?:\/\/[^/]+(?:\/)?$/.test(potentialGeneralLink)) {
                // Don't assign potentialGeneralLink yet, let guidLink take precedence if it hasn't already
            } else {
                link = potentialGeneralLink;
            }
        }
    }

    // 5. Final check: if current link is still not a valid http/s URL, or looks like a bare domain, and guidLink is better, use guidLink.
    const isLinkBareDomain = /^https?:\/\/[^/]+(?:\/)?$/.test(link);
    const isGuidLinkMoreSpecific = guidLink && /^https?:\/\/[^/]+\//.test(guidLink); // Has a path after domain

    if ((!link || !/^https?:\/\//i.test(link) || isLinkBareDomain) && isGuidLinkMoreSpecific) {
        link = guidLink;
    }
    
    // --- pubDate ---
    const pub = (/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(x) || /<published>([\s\S]*?)<\/published>/i.exec(x) ||
                /<updated>([\s\S]*?)<\/updated>/i.exec(x) || /<dc:date>([\s\S]*?)<\/dc:date>/i.exec(x) || [,""])[1].trim();
    
    let parsedValidDate = null;
    if (pub) {
      try {
        const d = new Date(pub);
        // Inline date validation: check if it's a Date instance and not NaN
        if (d instanceof Date && !isNaN(d.getTime())) { 
          parsedValidDate = d;
        } else {
          // Only log an error if there was a pub string to begin with
          console.warn(`[parseRSS] Invalid date produced by new Date() for string: "${pub}" from feed: ${feedUrl}. Resulting Date object: ${d}`);
        }
      } catch (e) {
        // This catch block might not be strictly necessary if new Date() doesn't throw for malformed strings but returns Invalid Date.
        // However, keeping it for safety.
        console.error(`[parseRSS] Exception during "new Date()" for date string: "${pub}" from feed: ${feedUrl}. Error: ${e.message}`);
      }
    }

    // --- description ---
    const desc = (/<content:encoded>([\s\S]*?)<\/content:encoded>/i.exec(x) ||
                 /<content[^>]*>([\s\S]*?)<\/content>/i.exec(x) ||
                 /<description>([\s\S]*?)<\/description>/i.exec(x) ||
                 /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(x) || [,""])[1];
    const description = decodeHtmlEntities(stripHtmlTags(desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gs, "$1")));

    // --- author & source ---
    const author  = (/dc:creator>([\s\S]*?)<\/dc:creator>/i.exec(x) || /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/i.exec(x) ||
                    /<author>([^<]+)<\/author>/i.exec(x) || [,""])[1].trim() || null;
    let source    = (/<source[^>]*>([\s\S]*?)<\/source>/i.exec(x) || [,""])[1].trim();
    if (!source) try { source = new URL(feedUrl).hostname.replace(/^www\./, ""); } catch { source = feedUrl; }

    // --- image ---
    let imageUrl = (/<media:content[^>]+url=['"]([^'"]+)['"][^>]*(?:type=['"]image\/[^"']+['"])?[^>]*>/i.exec(x) ||
                   /<media:thumbnail[^>]+url=['"]([^'"]+)['"]/i.exec(x) ||
                   /<enclosure[^>]+url=['"]([^'"]+)['"][^>]+type=['"]image\/[^"']+['"]/i.exec(x) ||
                   /<link[^>]*rel=['"]enclosure['"][^>]*type=['"]image\/[^"']+['"][^>]*href=['"]([^'"]+)['"]/i.exec(x) || [,""])[1];
    if (!imageUrl && desc) imageUrl = (/<img[^>]+src=['"]([^'"]+)['"]/i.exec(desc) || [,""])[1];

    // MJ: Nullify Teslarati images
    if (feedUrl && /teslarati\.com/i.test(feedUrl)) {
      imageUrl = null;
    }

    // --- CLEAN AND FINALIZE LINK ---
    link = cleanLink(link);
    guidLink = cleanLink(guidLink);

    // --- GOOGLE NEWS SPECIAL HANDLING ---
    if (/news\.google\./i.test(feedUrl) && desc) {
      // Try to extract the first <a href> from the description
      const aHrefMatch = /<a [^>]*href=["']([^"']+)["']/i.exec(desc);
      if (aHrefMatch && aHrefMatch[1]) {
        link = cleanLink(aHrefMatch[1]);
      } else if (link && (link.includes('news.google.com/rss/articles/') || link.includes('google.com/url?'))) {
        // Fallback: use getOriginalGoogleLink if still a Google News redirect
        const original = cleanLink(getOriginalGoogleLink(link));
        if (original && /^https?:\/\//.test(original)) {
          link = original;
        }
      }
      // If after all this, link is still not a valid URL, log and skip
      if (!link || !/^https?:\/\//.test(link)) {
        console.warn(`[parseRSS] Skipping Google News item with no usable link. Title: "${title}"`);
        continue;
      }
    }

    // push
    if (title && link) items.push({ title, link, pubDate: pub, parsedValidDate, description, source, imageUrl, author, feedUrlOrigin: feedUrl });
  }
  return items;
}

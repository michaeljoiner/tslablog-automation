/**
 * TSLA Blog - Frontend JavaScript
 * Modern, performant Tesla news aggregator
 */


// Basic rate limiting
let requestCount = 0;
let lastReset = Date.now();

function checkRateLimit() {
  const now = Date.now();
  if (now - lastReset > 60000) {
    requestCount = 0;
    lastReset = now;
  }
  requestCount++;
  return requestCount <= 30;
}

// Topic keywords for classification - Tesla/TSLA focused only
const TOPICS = {
  tesla: [
    // Core Tesla terms (including stock-related)
    'tesla', 'tsla', 'elon musk tesla', 'tesla stock', 'tesla share', 'tesla investor',
    'tesla earnings', 'tesla revenue', 'tesla financial', 'tesla quarterly', 'tesla deliveries',
    'tesla production', 'tesla delivery', 'tesla factory', 'tesla motors', 'tesla vehicle', 'tesla car',
    
    // Tesla products and technology
    'gigafactory', 'model 3', 'model y', 'model s', 'model x', 'cybertruck', 'roadster', 
    'autopilot', 'full self driving', 'fsd', 'supercharger', 'giga texas', 'giga berlin', 
    'giga shanghai', 'optimus', 'robotaxi', 'tesla energy', 'powerwall', 'megapack', 
    'solar roof', 'tesla solar', 'semi truck', 'dojo', 'tesla charging', 'tesla battery',
    'tesla recall', 'tesla update', 'tesla software', 'tesla network', 'tesla insurance',
    
    // Financial terms when combined with Tesla
    'tsla stock', 'tsla share', 'tsla earnings', 'tsla price', 'tsla analyst', 'tsla target',
    'tsla upgrade', 'tsla downgrade', 'tsla valuation', 'tsla market cap', 'tsla dividend',
    'tsla split', 'tsla futures', 'tsla options', 'tsla short', 'tsla bull', 'tsla bear',
    
    // Tesla people and leadership
    'elon musk', 'drew baglino', 'zachary kirkhorn', 'robyn denholm', 'tesla ceo',
    'tesla cfo', 'tesla board', 'tesla executive', 'tesla engineer', 'tesla designer'
  ]
};

// Keyword weights for Tesla/TSLA classification
const KEYWORD_WEIGHTS = {
  tesla: {
    // Core Tesla/TSLA terms (highest priority)
    'tesla': 5, 'tsla': 5, 'elon musk': 5, 'elon musk tesla': 5,
    'tesla stock': 5, 'tesla share': 5, 'tesla investor': 5, 'tesla earnings': 5,
    'tesla revenue': 5, 'tesla financial': 5, 'tesla quarterly': 5, 'tesla deliveries': 5,
    'tesla production': 5, 'tesla delivery': 5, 'tesla factory': 5, 'tesla motors': 5,
    'tesla vehicle': 5, 'tesla car': 5, 'tesla energy': 5, 'tesla charging': 5, 
    'tesla battery': 5, 'tesla recall': 5, 'tesla update': 5, 'tesla software': 5,
    'tesla network': 5, 'tesla insurance': 5,
    
    // Tesla products (highest priority)
    'model 3': 5, 'model y': 5, 'model s': 5, 'model x': 5, 'cybertruck': 5,
    'roadster': 5, 'autopilot': 5, 'full self driving': 5, 'fsd': 5, 'supercharger': 5,
    'gigafactory': 5, 'giga texas': 5, 'giga berlin': 5, 'giga shanghai': 5,
    'optimus': 5, 'robotaxi': 5, 'powerwall': 5, 'megapack': 5, 'solar roof': 5,
    'tesla solar': 5, 'semi truck': 5, 'dojo': 5,
    
    // TSLA stock specific (highest priority)
    'tsla stock': 5, 'tsla share': 5, 'tsla earnings': 5, 'tsla price': 5,
    'tsla analyst': 5, 'tsla target': 5, 'tsla upgrade': 5, 'tsla downgrade': 5,
    'tsla valuation': 5, 'tsla market cap': 5, 'tsla dividend': 5, 'tsla split': 5,
    'tsla futures': 5, 'tsla options': 5, 'tsla short': 5, 'tsla bull': 5, 'tsla bear': 5,
    
    // Tesla leadership (high priority)
    'drew baglino': 5, 'zachary kirkhorn': 5, 'robyn denholm': 5, 'tesla ceo': 5,
    'tesla cfo': 5, 'tesla board': 5, 'tesla executive': 5, 'tesla engineer': 4, 'tesla designer': 4
  }
};

// Exclusion terms to prevent false positives for Tesla content
const EXCLUSION_TERMS = {
  tesla: [
    // Exclude crypto/finance that's not Tesla-related
    'dogecoin', 'cryptocurrency', 'crypto', 'bitcoin', 'coinbase', 'ethereum',
    // Exclude other Elon companies when not Tesla-related
    'spacex', 'starship', 'falcon', 'starlink', 'neuralink', 'x corp', 'xai', 'grok',
    // Exclude generic terms
    'nikola tesla', 'tesla coil', 'tesla unit'
  ]
};

// Minimum score threshold for topic classification (higher for precision)
const TOPIC_THRESHOLD = 5;


// API endpoints configuration  
const API_CONFIG = {
  // Primary endpoint - use newsfeed for RSS news items
  primary: (() => {
    return 'https://tslablog.com/newsfeed';
  })(),
  // Fallback endpoint - same newsfeed endpoint 
  getFallback: () => {
    return 'https://tslablog.com/newsfeed';
  }
};

// DOM Elements
const newsContainer = document.getElementById('news-container');
const statusElement = document.getElementById('status');
const lastUpdatedElement = document.getElementById('last-updated');
const themeToggle = document.getElementById('theme-toggle');
const installPrompt = document.getElementById('install-prompt');
const installButton = document.getElementById('install-button');
const closeInstallPromptButton = document.getElementById('close-install-prompt');


// Constants
const CACHE_KEY = 'tsla_blog_cache';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
const SETTINGS_KEY = 'tesla-news-settings';
const LAST_FETCH_KEY = 'last_fetch_timestamp';
const FILTER_COLLAPSE_KEY = 'tsla_filter_collapsed';

// Track active filters - Tesla only
let activeFilters = {
  tesla: true
};

// Global variables
let allNewsItems = [];
let settings = {
  theme: 'dark',
  activeFilters: { ...activeFilters }
};
let masonryInstance = null; // ADDED: Variable to hold Masonry instance

// Initialize the app
document.addEventListener('DOMContentLoaded', initApp);

/**
 * Initialize the application
 */
function initApp() {
    
  // Check URL parameters for focus
  const urlParams = new URLSearchParams(window.location.search);
  const focusParam = urlParams.get('focus');
  
  // Load settings from localStorage
  try {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      settings = JSON.parse(savedSettings);
      
      // Apply saved filters
      if (settings.activeFilters) {
        activeFilters = { ...settings.activeFilters };
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  
  // Tesla is always active - no filter UI needed
  activeFilters.tesla = true;
  
  // Set up event listeners
  setupEventListeners();
  
  // Initialize theme
  initTheme();
  
  // Set up lazy loading
  setupLazyLoading();
  
  // Load news
  loadNewsWithSmartRefresh();
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // No filter UI needed - Tesla content only
  
  // Handle theme toggle if it exists
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
    
    // Set initial theme based on user preference
    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light-theme');
      themeToggle.textContent = '🌙';
    } else {
      themeToggle.textContent = '☀️';
    }
  }
  
  // Auto-refresh news when tab becomes visible after being hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const lastFetch = parseInt(localStorage.getItem(LAST_FETCH_KEY) || '0');
      const now = Date.now();
      
      // Only refresh if it's been more than CACHE_EXPIRY since last fetch
      if (now - lastFetch > CACHE_EXPIRY) {
        loadNewsWithSmartRefresh();
      }
    }
  });

  // Add resize listener to re-layout Masonry
  window.addEventListener('resize', debouncedLayout);
}

/**
 * Set up Intersection Observer for lazy loading
 */
function setupLazyLoading() {
  // Only set up if IntersectionObserver is supported
  if ('IntersectionObserver' in window) {
    const lazyLoadObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const lazyImage = entry.target.querySelector('img[data-src]');
          if (lazyImage) {
            lazyImage.src = lazyImage.dataset.src;
            lazyImage.removeAttribute('data-src');
            lazyLoadObserver.unobserve(entry.target);
          }
        }
      });
    });
    
    // Observe all news items
    document.querySelectorAll('.news-item').forEach(item => {
      lazyLoadObserver.observe(item);
    });
  }
}

/**
 * Smart news loading that minimizes API calls
 */
function loadNewsWithSmartRefresh() {
  const cachedData = localStorage.getItem(CACHE_KEY);
  const now = Date.now();
  
  if (cachedData) {
    try {
      const { news, timestamp } = JSON.parse(cachedData);
      
      // Check if cache is still valid
      if (news && news.length > 0 && now - timestamp < CACHE_EXPIRY) {
        // Use cached data
        allNewsItems = news;
        applyFiltersAndDisplay();
        updateLastUpdated(new Date(timestamp));
        console.log('Using cached news data');
        
        // No need to fetch new data
        return;
      }
    } catch (error) {
      console.error('Error parsing cached data:', error);
    }
  }
  
  // Cache is invalid or doesn't exist, fetch new data
  fetchNews();
}

/**
 * Fetch news from the API
 */
async function fetchNews() {
  if (!checkRateLimit()) {
    console.warn('Rate limit exceeded');
    return;
  }
  
  showLoadingState();
  
  try {
    // Don't add cache-busting to avoid routing issues
    let apiUrl = API_CONFIG.primary;
    
    // Try the primary API endpoint
    let response = await fetch(apiUrl);
    
    // If the primary endpoint fails, try the fallback
    if (!response.ok) {
      console.log('Primary endpoint failed, trying fallback');
      apiUrl = API_CONFIG.getFallback();
      response = await fetch(apiUrl);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // API should return array of RSS news items from /api/archive
    if (!Array.isArray(data)) {
      throw new Error('Invalid data format received - expected array of news items');
    }
    
    if (data.length === 0) {
      throw new Error('No news items found');
    }
    
    const newsData = data;
    
    // Process and enhance the news items
    const processedNews = newsData
      .filter(item => item && typeof item === 'object' && item.link && item.title)
      .map(item => {
        let cleanedUrl = '';
        try {
          cleanedUrl = cleanUrl(item.link);
        } catch (e) {
          cleanedUrl = item.link || '';
        }
        let domain = '';
        try {
          domain = extractDomain(cleanedUrl);
        } catch (e) {
          domain = '';
        }
        const topics = identifyTopics(item);
        let source = item.source;
        if (!source || source === 'Google News' || (typeof source === 'string' && source.includes('news.google.com'))) {
          const titleParts = item.title.split(' - ');
          if (titleParts.length > 1) {
            source = titleParts[titleParts.length - 1].trim();
          } else {
            source = domain;
          }
        }
        const cleanedTitle = cleanHeadline(item.title, source);
        // Remove trailing source from description
        const cleanedDescription = cleanDescription(item.description, source);
        return {
          ...item,
          title: cleanedTitle,
          link: cleanedUrl,
          domain,
          source,
          topics,
          date: new Date(item.pubDate),
          priority: 100,
          description: cleanedDescription
        };
      });
    
    // Update the global news items
    allNewsItems = processedNews;
    
    // Save to cache with current timestamp
    saveToCache(processedNews);
    
    // Store last fetch timestamp
    localStorage.setItem(LAST_FETCH_KEY, Date.now().toString());
    
    // Apply filters and display
    applyFiltersAndDisplay();
    
    // Update last updated timestamp
    updateLastUpdated();
    
    // Clear any error status
    statusElement.textContent = '';
    statusElement.classList.remove('error');
    
  } catch (error) {
    console.error('Error fetching news:', error);
    showErrorState(error.message);
    
    // Try to load from cache as fallback, even if expired
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const { news, timestamp } = JSON.parse(cachedData);
        if (news && news.length > 0) {
          allNewsItems = news;
          applyFiltersAndDisplay();
          updateLastUpdated(new Date(timestamp));
          statusElement.textContent = '';
        }
      }
    } catch (cacheError) {
      console.error('Error loading from cache as fallback:', cacheError);
    }
  }
}

/**
 * Clean and normalize a URL
 */
function cleanUrl(url) {
  try {
    // Remove Google News redirect if present
    if (url.includes('news.google.com') || url.includes('/url?')) {
      const urlMatch = url.match(/url=([^&]+)/);
      if (urlMatch && urlMatch[1]) {
        return decodeURIComponent(urlMatch[1]);
      }
    }
    return url;
  } catch (error) {
    console.error('Error cleaning URL:', error);
    return url;
  }
}

/**
 * Extract domain from URL for display
 */
function extractDomain(url) {
  try {
    // Create a URL object
    const urlObj = new URL(url);
    
    // Get hostname (e.g., www.example.com)
    let domain = urlObj.hostname;
    
    // Remove www. if present
    domain = domain.replace(/^www\./, '');
    
    // Special case for Google News
    if (domain === 'news.google.com') {
      // Try to extract the original source from the path
      const pathParts = urlObj.pathname.split('/');
      if (pathParts.length > 2 && pathParts[1] === 'articles') {
        // The next part might contain the source
        const sourcePart = pathParts[2];
        if (sourcePart && sourcePart !== 'CBMiTWh0dHBz') {
          return sourcePart.split('-')[0];
        }
      }
      return ''; // Return empty for Google News to use the source from the API
    }
    
    // Handle common domains with subdomains
    const parts = domain.split('.');
    if (parts.length > 2) {
      // Check for common TLDs that should be preserved with their subdomain
      const commonTlds = ['co.uk', 'com.au', 'co.jp', 'co.nz', 'org.uk'];
      const lastTwoParts = parts.slice(-2).join('.');
      
      if (commonTlds.includes(lastTwoParts)) {
        // For domains like example.co.uk, return example.co.uk
        return parts.slice(-3).join('.');
      }
    }
    
    // Return the domain (e.g., example.com)
    return domain;
  } catch (error) {
    console.error('Error extracting domain:', error);
    return '';
  }
}

/**
 * Save news to local cache
 */
function saveToCache(news) {
  try {
    const cacheData = {
      news,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error saving to cache:', error);
  }
}

/**
 * Identify topics for a news item with improved accuracy
 */
function identifyTopics(item) {
  const textToCheck = `${item.title} ${item.description}`.toLowerCase();
  
  // Calculate scores for each topic
  const scores = {};
  
  // Initialize scores for all topics
  Object.keys(TOPICS).forEach(topic => {
    scores[topic] = 0;
  });
  
  // Check each topic's keywords and calculate scores
  Object.entries(TOPICS).forEach(([topic, keywords]) => {
    // Check for exclusion terms first
    if (EXCLUSION_TERMS[topic]) {
      const hasExclusion = EXCLUSION_TERMS[topic].some(term => 
        textToCheck.includes(term.toLowerCase())
      );
      
      // If exclusion term found, skip this topic unless it's a strong match
      if (hasExclusion && !textToCheck.includes(topic.toLowerCase())) {
        return;
      }
    }
    
    // Calculate score based on keyword matches
    keywords.forEach(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      if (textToCheck.includes(lowerKeyword)) {
        // Add weight if available, otherwise add 1
        const weight = KEYWORD_WEIGHTS[topic]?.[lowerKeyword] || 1;
        scores[topic] += weight;
        
        // Bonus points for keywords in title (more relevant)
        if (item.title.toLowerCase().includes(lowerKeyword)) {
          scores[topic] += weight;
        }
      }
    });
  });
  
  // Determine topics based on scores
  const topics = [];
  
  // Add topics that meet the threshold
  Object.entries(scores).forEach(([topic, score]) => {
    if (score >= TOPIC_THRESHOLD) {
      topics.push(topic);
    }
  });
  
  // For Tesla-only focus: if no Tesla topics identified, check for basic Tesla/Elon context
  if (topics.length === 0) {
    if (textToCheck.includes('elon musk') || textToCheck.includes('tesla') || textToCheck.includes('tsla')) {
      topics.push('tesla');
    } else {
      // Skip non-Tesla content entirely
      topics.push('general');
    }
  }
  
  return topics;
}

/**
 * Apply filters and display filtered news
 */
function applyFiltersAndDisplay() {
  if (!allNewsItems || allNewsItems.length === 0) {
    console.log('No news items to filter');
    return;
  }
  
  // Update active filters from DOM
  updateActiveFiltersFromDOM();
  
  // Get active topics
  const activeTopics = Object.keys(activeFilters).filter(topic => activeFilters[topic]);
  
  if (activeTopics.length === 0) {
    displayNews([]);
    return;
  }
  
  // Filter news items
  const filteredNews = allNewsItems.filter(item => {
    const itemTopics = item.topics || [];
    return itemTopics.some(topic => activeTopics.includes(topic));
  });
  
  // Sort by relevance and date
  const sortedNews = sortNewsByRelevanceAndDate(filteredNews, activeTopics);
  
  displayNews(sortedNews);
}

// Expose globally for navigation functionality
window.applyFiltersAndDisplay = applyFiltersAndDisplay;

/**
 * Update active filters from DOM state
 */
function updateActiveFiltersFromDOM() {
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    const topic = chip.getAttribute('data-topic');
    if (topic && activeFilters.hasOwnProperty(topic)) {
      activeFilters[topic] = chip.classList.contains('active');
    }
  });
}

/**
 * Sort news by relevance to active filters, then by date
 */
function sortNewsByRelevanceAndDate(news, activeTopics) {
  if (!news || news.length === 0) {
    return [];
  }
  
  // Calculate relevance score for each news item
  const scoredNews = news.map(item => {
    // Start with a base score - higher base score to ensure news articles appear at top
    let relevanceScore = 100; // Increased from 0 to ensure news always appears at top
    
    // Calculate how many active topics this item matches
    const matchingTopics = item.topics.filter(topic => activeTopics.includes(topic));
    
    // More matching topics = higher relevance
    relevanceScore += matchingTopics.length * 10;
    
    // Prioritize items that ONLY match the active filters (more specific)
    if (matchingTopics.length === item.topics.length) {
      relevanceScore += 5;
    }
    
    // Penalize items with many topics (likely less specific to any one topic)
    if (item.topics.length > 2) {
      relevanceScore -= (item.topics.length - 2) * 2;
    }
    
    return {
      ...item,
      relevanceScore
    };
  });
  
  // Sort by date first (newest first), then by relevance score if dates are the same
  return scoredNews.sort((a, b) => {
    // First sort by date (newest first)
    const dateA = new Date(a.pubDate);
    const dateB = new Date(b.pubDate);
    
    // Handle invalid dates
    if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) {
      // If both dates are invalid, fall back to relevance score
      return b.relevanceScore - a.relevanceScore;
    }
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;
    
    // If dates are different, sort by date
    if (dateA.getTime() !== dateB.getTime()) {
      return dateB - dateA;
    }
    
    // If dates are the same, sort by relevance score
    return b.relevanceScore - a.relevanceScore;
  });
}

/**
 * Sort news items
 */
function sortNews(news, sortMethod) {
  if (!news || news.length === 0) {
    return [];
  }
  
  const sortedNews = [...news];
  
  // Always prioritize news articles and sort by date (newest first) - ensure proper date parsing
  sortedNews.sort((a, b) => {
    // Parse dates safely
    let dateA = new Date(a.pubDate);
    let dateB = new Date(b.pubDate);
    
    // Handle invalid dates
    if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;
    
    return dateB - dateA;
  });
  
  return sortedNews;
}

/**
 * Display news items in the container
 */
function displayNews(news) {
  if (!newsContainer) {
    console.error('News container not found');
    return;
  }
  
  // Deduplicate articles by normalized link (and fallback to title+source)
  const seen = new Set();
  const dedupedNews = [];
  for (const item of news) {
    let normLink = item.link ? item.link.replace(/\/$/, '').toLowerCase() : '';
    const key = normLink || (item.title ? (item.title.trim().toLowerCase() + ':' + (item.source||'').trim().toLowerCase()) : '');
    if (!seen.has(key)) {
      seen.add(key);
      dedupedNews.push(item);
    }
  }
  news = dedupedNews;

  // Destroy existing Masonry instance before clearing content
  if (masonryInstance) {
    try {
      masonryInstance.destroy();
    } catch (e) {
      console.warn('Error destroying previous Masonry instance:', e);
    }
    masonryInstance = null;
  }

  // Clear the container
  newsContainer.innerHTML = '';
  
  if (!news || news.length === 0) {
    newsContainer.innerHTML = '<div class="no-results">No news items found matching your filters.</div>';
    return;
  }
  
  // Responsive: detect current column count
  const columnCount = getCurrentColumnCount();
  // Create and append news items
  news.forEach(item => {
    const newsItem = document.createElement('article');
    newsItem.className = 'news-item';
    
    // Add primary topic class for styling
    if (item.topics && item.topics.length > 0) {
      newsItem.classList.add(`topic-${item.topics[0]}`);
    }
    
    // --- YOUTUBE EMBED HANDLING ---
    let youtubeEmbedHtml = '';
    if (item.isYouTube) {
      newsItem.classList.add('youtube-video');
      const videoId = getYouTubeId(item.link);
      if (videoId) {
        youtubeEmbedHtml = `
          <div class="youtube-embed-container" style="aspect-ratio:16/9;width:100%;max-width:560px;margin:0 auto 1em auto;">
            <iframe width="100%" height="315" src="https://www.youtube-nocookie.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>
          </div>
        `;
      } else {
        youtubeEmbedHtml = `<div class="youtube-embed-fallback"><a href="${item.link}" target="_blank" rel="noopener">Watch on YouTube</a></div>`;
      }
    }
    // --- END YOUTUBE EMBED HANDLING ---

    // Format the date
    const formattedDate = getRelativeTime(new Date(item.pubDate));
    
    // Topic badges removed - no longer needed
    
    // Prefer meta fields if available
    const displayTitle = item.metaTitle || item.title;
    let displayDescription = item.metaDescription || item.description;
    const displayImage = item.metaImage || item.imageUrl;
    
    // Sanitize and decode description
    let cleanDescription = sanitizeAndDecode(displayDescription);

    // --- REDDIT ENHANCED PARSING ---
    let redditMetaHtml = '';
    let isReddit = false;
    let sourceClass = 'news-source';
    let sourceLabel = formatSource(item.source, extractDomain(item.link));
    if ((item.source && item.source.toLowerCase().includes('reddit')) || (item.domain && item.domain.toLowerCase().includes('reddit'))) {
      isReddit = true;
      sourceClass += ' reddit';
      // Try to extract subreddit, username, and comments from description/link
      let subreddit = '';
      let username = '';
      let commentsUrl = '';
      let commentsCount = '';
      // Subreddit from link
      const subredditMatch = item.link.match(/reddit.com\/(r\/[^/]+)/i);
      if (subredditMatch) {
        subreddit = subredditMatch[1];
      }
      // Username from description
      const userMatch = cleanDescription.match(/submitted by \/?u\/?([\w-]+)/i);
      if (userMatch) {
        username = userMatch[1];
      }
      // Comments link and count
      const commentsMatch = cleanDescription.match(/\[(\d+)? ?comments?\]/i);
      if (commentsMatch) {
        commentsCount = commentsMatch[1] ? `${commentsMatch[1]} comments` : 'comments';
      }
      // Try to find comments URL (Reddit descriptions often have [comments](url))
      const commentsUrlMatch = displayDescription.match(/\[comments?\]\((https?:\/\/www\.reddit\.com\S+)\)/i);
      if (commentsUrlMatch) {
        commentsUrl = commentsUrlMatch[1];
      } else {
        // Fallback: use item.link if it looks like a comments page
        if (/comments\//.test(item.link)) commentsUrl = item.link;
      }
      // Build meta HTML
      redditMetaHtml = `<div class="reddit-meta" style="margin-bottom:0.5rem;">
        ${subreddit ? `<a href="https://reddit.com/${subreddit}" class="reddit-subreddit" target="_blank" rel="noopener" style="color:#FF4500;font-weight:600;text-decoration:none;margin-right:0.5em;">r/${subreddit.replace('r/','')}</a>` : ''}
        ${username ? `<span class="reddit-user">• posted by <a href="https://reddit.com/u/${username}" target="_blank" rel="noopener" style="color:#FF4500;text-decoration:none;">u/${username}</a></span>` : ''}
        ${commentsUrl ? `<span class="reddit-comments">• <a href="${commentsUrl}" target="_blank" rel="noopener" style="color:#FF4500;text-decoration:none;">${commentsCount || 'comments'}</a></span>` : ''}
      </div>`;
      sourceLabel = 'REDDIT.COM';
      // Remove '[link]', '[comments]', and 'submitted by ...' from description
      cleanDescription = cleanDescription
        .replace(/\[link\]/gi, '')
        .replace(/\[comments\]/gi, '')
        .replace(/submitted by \/?u\/?[\w-]+/gi, '')
        .replace(/\[\d+ ?comments?\]/gi, '')
        .replace(/\[comments?\]/gi, '')
        .replace(/\[link\]\([^)]*\)/gi, '')
        .replace(/\[comments?\]\([^)]*\)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    // --- END REDDIT ENHANCED PARSING ---

    // Create the HTML for the news item (with image if present)
    newsItem.innerHTML = `
      <div class="news-content">
        ${youtubeEmbedHtml}
        ${!item.isYouTube && displayImage ? `<div class="news-image-container"><img class="news-image" src="${displayImage}" alt="${displayTitle}" loading="lazy"></div>` : ''}
        <h2 class="news-title">
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">${displayTitle}</a>
        </h2>
        <div class="news-timestamp">
          <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="news-date">${formattedDate}</a>
        </div>
        ${isReddit ? redditMetaHtml : ''}
        <p class="news-description">${truncateDescription(cleanDescription, 150)}</p>
        <div class="news-footer">
          <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="${sourceClass}">${sourceLabel}</a>
        </div>
      </div>
    `;
    
    // Add to container
    newsContainer.appendChild(newsItem);
  });
  
  // Initialize Masonry AFTER items are added AND images are loaded
  if (typeof Masonry !== 'undefined' && typeof imagesLoaded !== 'undefined') { 
    const container = newsContainer; // Reference for closure
    imagesLoaded( container, function() {
      // Check if instance exists from a previous run, destroy if needed
      if (masonryInstance) {
        try {
          masonryInstance.destroy();
        } catch (e) { /* Ignore */ }
      }
      // Initialize Masonry now that images are loaded
      masonryInstance = new Masonry( container, {
        itemSelector: '.news-item',
        percentPosition: true,
        gutter: 16 
      });
      console.log('Masonry initialized after imagesLoaded.');
    });
  } else {
    console.error('Masonry or imagesLoaded library not loaded. Layout may be incorrect.');
    // Fallback: Initialize Masonry immediately if libraries missing (might overlap)
    if (typeof Masonry !== 'undefined' && !masonryInstance) {
       masonryInstance = new Masonry( newsContainer, {
         itemSelector: '.news-item',
         percentPosition: true,
         gutter: 16
       });
       console.warn('Initialized Masonry without imagesLoaded check.');
    }
  }

  // Set up event listeners for the new topic badges (if interactive)
  // setupTopicBadges(); 
}

/**
 * Format a date as a string
 */
function formatDate(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get relative time string (e.g., "5 minutes ago")
 */
function getRelativeTime(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  // Invalid date
  if (isNaN(diffSec) || diffSec < 0) {
    return 'Invalid date';
  }
  
  // Just now
  if (diffSec < 60) {
    return 'just now';
  }
  
  // Minutes
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  }
  
  // Hours
  if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  }
  
  // Days
  if (diffDay < 7) {
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  }
  
  // Fallback to formatted date
  return formatDate(date);
}

/**
 * Get a human-readable label for a topic
 */
function topicLabel(topic) {
  const labels = {
    tesla: 'Tesla & TSLA',
    general: 'General'
  };
  
  return labels[topic] || topic.charAt(0).toUpperCase() + topic.slice(1); // Default to capitalized topic
}

/**
 * Truncate description to a specified length
 */
function truncateDescription(description, maxLength) {
  if (!description) {
    return '';
  }
  
  // Remove HTML tags
  let text = description.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  text = textarea.value;
  
  // Truncate if longer than maxLength
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  
  return text;
}

/**
 * Toggle a filter on/off
 */
// toggleFilter function removed - no filter UI needed for Tesla-only content

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
  const isLightTheme = document.body.classList.toggle('light-theme');
  
  // Update button text
  if (themeToggle) {
    themeToggle.textContent = isLightTheme ? '🌙' : '☀️';
  }
  
  // Update settings and save preference
  settings.theme = isLightTheme ? 'light' : 'dark';
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Show loading state
 */
function showLoadingState() {
  if (statusElement) {
    statusElement.textContent = 'Loading news...';
    statusElement.classList.remove('error');
  }
  
  if (newsContainer) {
    // Keep existing content but add loading class
    newsContainer.classList.add('loading');
  }
}

/**
 * Show error state
 */
function showErrorState(message) {
  if (statusElement) {
    statusElement.textContent = `Error: ${message}`;
    statusElement.classList.add('error');
  }
  
  if (newsContainer) {
    newsContainer.classList.remove('loading');
  }
}

/**
 * Update the last updated timestamp
 */
function updateLastUpdated(date = new Date()) {
  if (lastUpdatedElement) {
    lastUpdatedElement.textContent = `Last updated: ${formatDate(date)}`;
  }
}

/**
 * Debounce function to limit how often a function can be called
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Format source name for display
 */
function formatSource(source, domain) {
  if (!source) {
    return domain ? domain.toUpperCase() : 'NEWS SOURCE';
  }
  
  // Clean up common source formatting issues
  source = source.trim();
  
  // Remove trailing periods, commas, etc.
  source = source.replace(/[.,;:]+$/, '');
  
  // Convert to uppercase for consistent display
  source = source.toUpperCase();
  
  // Limit length
  if (source.length > 25) {
    source = source.substring(0, 22) + '...';
  }
  
  return source;
}

/**
 * Clean up headline by removing source at the end
 * Example: "Anti-DOGE protests at Tesla stores target Elon Musk's bottom line - The Associated Press"
 * becomes "Anti-DOGE protests at Tesla stores target Elon Musk's bottom line"
 */
function cleanHeadline(title, source) {
  if (!title) return title;
  
  // If we have a source, check if the title ends with it
  if (source) {
    // Try different separators that might be used
    const separators = [' - ', ' | ', ' — ', ' – ', ': '];
    
    for (const separator of separators) {
      if (title.endsWith(separator + source)) {
        return title.substring(0, title.length - (separator.length + source.length)).trim();
      }
      
      // Also check for case insensitive match
      const lowerTitle = title.toLowerCase();
      const lowerSource = source.toLowerCase();
      if (lowerTitle.endsWith(separator + lowerSource)) {
        return title.substring(0, title.length - (separator.length + source.length)).trim();
      }
    }
  }
  
  // If no specific source or no match, try to remove anything after the last dash, pipe, etc.
  const separators = [' - ', ' | ', ' — ', ' – '];
  for (const separator of separators) {
    const parts = title.split(separator);
    // Only remove the last part if it looks like a source (short, no punctuation)
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1].trim();
      // If the last part is short (likely a source name) and doesn't end with punctuation
      if (lastPart.length < 30 && !lastPart.match(/[.!?]$/)) {
        return parts.slice(0, -1).join(separator).trim();
      }
    }
  }
  
  return title;
}

/**
 * Handle 3D tilt effect for topic badges
 */
function setupTopicBadges3DTilt() {
  const badges = document.querySelectorAll('.topic-badge');
  
  badges.forEach(badge => {
    badge.addEventListener('mousemove', (e) => {
      const rect = badge.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Calculate rotation values based on mouse position
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateY = ((x - centerX) / centerX) * 15; // Max 15 degrees
      const rotateX = ((centerY - y) / centerY) * 15; // Max 15 degrees
      
      // Calculate gradient angle based on mouse position
      const angle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
      
      // Apply the transformations
      badge.style.setProperty('--rotateX', `${rotateX}deg`);
      badge.style.setProperty('--rotateY', `${rotateY}deg`);
      badge.style.setProperty('--gradient-angle', `${angle + 90}deg`);
    });
    
    badge.addEventListener('mouseleave', () => {
      // Reset transformations
      badge.style.setProperty('--rotateX', '0deg');
      badge.style.setProperty('--rotateY', '0deg');
      badge.style.setProperty('--gradient-angle', '135deg');
    });
  });
}

/**
 * Set up event listeners for topic badges
 */
function setupTopicBadges() {
  // Topic badges are now non-interactive
  // This function is kept for potential future use
}

// Call the setup function when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Remove the news tagline/header if it exists
  const tagline = document.querySelector('h2, .news-tagline, .site-tagline');
  if (tagline && tagline.textContent && tagline.textContent.includes('Latest news about Tesla')) {
    tagline.remove();
  }
  setupTopicBadges3DTilt();
  // ... existing code ...
});

// Re-run setup when new content is loaded
function setupNewContent() {
  setupTopicBadges3DTilt();
  // ... existing code ...
}

// Add a utility to sanitize and decode HTML entities from descriptions
function sanitizeAndDecode(html) {
  if (!html) return '';
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Utility: Detect the current number of columns in the news grid
 */
function getCurrentColumnCount() {
  const container = newsContainer;
  if (!container) return 1; // Should not happen if displayNews is called

  // Prioritize window.innerWidth for robustness, as it directly matches CSS media queries.
  // This is less prone to timing issues with dynamically injected styles than getComputedStyle on initial load.
  if (window.innerWidth <= 600) {
    return 1;
  }
  if (window.innerWidth <= 900) {
    return 2;
  }
  // Default for wider screens, matching the base CSS rule for #news-container
  // (column-count: 3 !important;)
  return 3;

  // Fallback to getComputedStyle if the above logic were to be removed or insufficient, 
  // but for column-count driven by media queries on width, the above is more direct.
  /*
  const style = window.getComputedStyle(container);
  const columnCountValue = style.getPropertyValue('column-count');

  if (columnCountValue && !isNaN(parseInt(columnCountValue, 10))) {
    const count = parseInt(columnCountValue, 10);
    return Math.max(1, count);
  }
  // If getComputedStyle fails, use the initial width-based logic as a final fallback.
  if (window.innerWidth <= 600) return 1;
  if (window.innerWidth <= 900) return 2;
  return 3; 
  */
}

// Debounced layout function for resize/filter changes
const debouncedLayout = debounce(() => {
  if (masonryInstance) {
    masonryInstance.layout();
  }
}, 250);

// Add this utility near other helpers
function cleanDescription(desc, source) {
  if (!desc || !source) return desc;
  // Remove trailing source if present (case-insensitive, with or without dash/space)
  const regex = new RegExp(`[\s\-–—|:]*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  return desc.replace(regex, '').trim();
}

// Add this utility near other helpers
function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v') || u.pathname.split('/').pop();
    }
    if (u.hostname.includes('youtube-nocookie.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
    }
  } catch { return null; }
  return null;
}

/**
 * Update navigation active state based on current context
 */
function updateNavigationState() {
  const navLinks = document.querySelectorAll('.nav-link');
  const currentPath = window.location.pathname;
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    
    // Check if this is the current page
    if (currentPath === '/' && link.getAttribute('href') === '/') {
      link.classList.add('active');
    } else if (currentPath.includes('archive') && link.getAttribute('href').includes('archive')) {
      link.classList.add('active');
    } else if (currentPath.includes('blog') && link.getAttribute('href').includes('archive')) {
      link.classList.add('active');
    }
  });
}

/**
 * Initialize theme based on saved settings
 */
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  
  // Get saved theme from settings
  let theme = 'dark';
  try {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      theme = settings.theme || 'dark';
    }
  } catch (error) {
    console.error('Error loading theme settings:', error);
  }
  
  // Apply theme
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.textContent = '🌙';
  } else {
    document.body.classList.remove('light-theme');
    themeToggle.textContent = '☀️';
  }
}
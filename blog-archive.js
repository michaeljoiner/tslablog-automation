// Fetch and display blog archive for TSLAblog.com

// Security check - allow tslablog.com domains
const allowedDomains = ['tslablog.com', 'www.tslablog.com', 'localhost'];
const isDomainAllowed = allowedDomains.some(domain => 
  window.location.hostname === domain || 
  window.location.hostname.includes('tslablogdotcom.pages.dev')
);

if (!isDomainAllowed) {
  console.error('Unauthorized domain:', window.location.hostname);
  throw new Error('Unauthorized domain');
}

// API configuration - use working endpoint
const API_URL = 'https://tslablog.com/api/archive';
const archiveList = document.getElementById('blog-archive-list');
const status = document.getElementById('status');

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  });
}

async function fetchBlogArchive() {
  try {
    console.log('Starting blog archive fetch...');
    status.textContent = 'Loading blog archive...';
    console.log('Fetching from:', API_URL);
    const res = await fetch(API_URL);
    console.log('Response status:', res.status, res.statusText);
    if (!res.ok) throw new Error('Failed to fetch blog archive');
    let blogs = await res.json();
    console.log('Received blogs:', blogs.length, 'posts');
    
    // Filter out entries that don't look like articles (e.g., the debug entry or posts without titles)
    blogs = blogs.filter(post => post && post.title);

    if (!Array.isArray(blogs) || blogs.length === 0) {
      status.textContent = 'No blog posts found.';
      archiveList.innerHTML = '';
      return;
    }
    
    status.textContent = '';
    archiveList.innerHTML = '';
    
    blogs.forEach(post => {
      const rawContent = typeof post.content === 'string' ? post.content : '';
      let snippetText = rawContent.slice(0, 280);
      // Add ellipsis if content was truncated
      if (rawContent.length > 280) {
        snippetText += '...';
      }
      // Replace markdown-style bold with <strong> tags
      let snippetHTML = snippetText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Replace markdown-style H3 (### Header) with <strong>Header</strong>
      snippetHTML = snippetHTML.replace(/###\s+([^\n]+)/g, '<strong>$1</strong>');
      // Clean up any remaining markdown
      snippetHTML = snippetHTML.replace(/##\s+([^\n]+)/g, '<strong>$1</strong>');

      const card = document.createElement('a');
      card.href = `/blog.html?id=${post.id}`;
      card.className = 'blog-archive-card';
      
      card.innerHTML = `
        <div class="blog-archive-title">${post.title}</div>
        <div class="blog-archive-date">${formatDate(post.created_at)}</div>
        <div class="blog-archive-snippet">${snippetHTML}</div>
        <div class="read-more-btn">
          Read full article →
        </div>
      `;
      
      archiveList.appendChild(card);
    });
  } catch (e) {
    status.textContent = 'Failed to load blog archive.';
    archiveList.innerHTML = '';
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', fetchBlogArchive); 

// Theme functionality is handled in archive.html inline script to avoid conflicts 
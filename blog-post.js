document.addEventListener('DOMContentLoaded', () => {
  // Security check
  if (window.location.hostname !== 'tslablog.com' && 
      window.location.hostname !== 'www.tslablog.com' && 
      !window.location.hostname.includes('tslablogdotcom.pages.dev') &&
      !window.location.hostname.includes('localhost')) {
    throw new Error('Unauthorized domain');
  }
  
  // API configuration - use API endpoint for individual blog posts
  const API_URL = '/api/archive';
  const blogContainer = document.getElementById('blog-container');

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  async function fetchBlogPost() {
    if (!blogContainer) {
      console.error('Required element #blog-container not found in the DOM.');
      // Attempt to create a fallback message if possible, or ensure this is visible to user.
      document.body.innerHTML = '<p style="color:red; text-align:center; margin-top: 20px;">Error: Blog display area not found. Please contact support.</p>' + document.body.innerHTML;
      return;
    }
    // Initial loading state with skeleton (already in HTML, but clear/re-add for safety)
    blogContainer.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

    const params = new URLSearchParams(window.location.search);
    const postId = params.get('id');

    if (!postId) {
      blogContainer.innerHTML = '<p style="padding: 2rem; text-align: center;">Error: Blog post ID not specified in the URL.</p>';
      return;
    }

    try {
      console.log('Fetching from:', API_URL);
      const response = await fetch(API_URL);
      console.log('Response status:', response.status);
      if (!response.ok) {
        throw new Error(`Failed to fetch blog archive (HTTP ${response.status})`);
      }
      const posts = await response.json();
      console.log('Posts loaded:', posts.length, 'Looking for ID:', postId);
      const post = posts.find(p => p.id.toString() === postId);
      console.log('Post found:', !!post);

      if (!post) {
        blogContainer.innerHTML = '<p style="padding: 2rem; text-align: center;">Error: Blog post not found.</p>';
        return;
      }

      blogContainer.innerHTML = ''; // Clear skeleton/loading message

      const card = document.createElement('div');
      card.className = 'blog-card';

      const titleEl = document.createElement('h2'); // Use h2 for semantics
      titleEl.className = 'blog-title';
      titleEl.textContent = post.title || 'Untitled Post';

      const dateEl = document.createElement('div');
      dateEl.className = 'blog-date';
      dateEl.textContent = post.created_at ? formatDate(post.created_at) : 'Date not available';
      
      const bylineEl = document.createElement('div');
      bylineEl.className = 'byline';
      bylineEl.innerHTML = '<span class="ai-icon">✨</span> Written by Aimee Joiner, AI Intern at TSLAblog.com';

      const contentEl = document.createElement('div');
      contentEl.className = 'blog-content';
      
      
      // Helper: Insert inline citations at the end of paragraphs
      function addInlineCitations(html, groundingChunks) {
        if (!groundingChunks || !Array.isArray(groundingChunks) || groundingChunks.length === 0) return html;
        // Map URLs to titles for quick lookup
        const urlToTitle = {};
        groundingChunks.forEach(chunk => {
          if (chunk.web && chunk.web.uri && chunk.web.title) {
            urlToTitle[chunk.web.uri] = chunk.web.title;
          }
        });
        // Find all paragraphs
        return html.replace(/(<p>)([\s\S]*?)(<\/p>)/g, (match, open, text, close) => {
          // Try to find a source URL in the text
          let found = false;
          let citationLink = '';
          for (const url in urlToTitle) {
            // If the URL or its domain is mentioned in the paragraph, or if not, just add the first unused one
            if (text.includes(url) || text.includes(urlToTitle[url])) {
              citationLink = `<a href="${url}" class="inline-citation" target="_blank" rel="noopener noreferrer">[source]</a>`;
              found = true;
              break;
            }
          }
          // If not found, just append the first available source (to ensure every paragraph has a citation)
          if (!found && Object.keys(urlToTitle).length > 0) {
            const url = Object.keys(urlToTitle)[0];
            citationLink = `<a href="${url}" class="inline-citation" target="_blank" rel="noopener noreferrer">[source]</a>`;
          }
          return open + text + ' ' + citationLink + close;
        });
      }

      let formattedContent = post.content || 'Content not available.';
      
      // Remove headline from the start of the content if present (as a backup)
      if (post.title) {
        // Remove first line if it matches '# Headline: ...' or '#Headline: ...'
        formattedContent = formattedContent.replace(/^# ?Headline:.*\n?/i, '');
        // Remove first line if it matches a Markdown H1 with the title
        const h1Pattern = new RegExp(`^#\\s*${post.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$\\n?`, 'i');
        formattedContent = formattedContent.replace(h1Pattern, '');
        // Also remove if the title is just the first line (no markdown)
        const plainTitlePattern = new RegExp(`^${post.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`, 'i');
        formattedContent = formattedContent.replace(plainTitlePattern, '');
      }
      
      // Log the raw content to the console for debugging headers
      console.log("Raw post content before formatting:", formattedContent);

      // Store TL;DR content separately and process it at the end
      let tldrHTML = '';
      let hasTLDR = false;
      
      if (formattedContent.includes('TL;DR\n•')) {
        console.log("Found TL;DR with bullets - extracting for separate processing");
        
        const tldrStartIndex = formattedContent.indexOf('TL;DR');
        const nextSectionIndex = formattedContent.indexOf('\n\n', tldrStartIndex);
        
        if (tldrStartIndex !== -1 && nextSectionIndex !== -1) {
          const tldrSection = formattedContent.substring(tldrStartIndex, nextSectionIndex);
          const lines = tldrSection.split('\n');
          const bullets = lines.slice(1).filter(line => line.trim().startsWith('•')).map(line => line.trim().substring(1).trim());
          
          if (bullets.length > 0) {
            const bulletList = bullets.map(bullet => `<li>${bullet}</li>`).join('\n              ');
            
            tldrHTML = `<div class="tldr-section">
                <div class="tldr-title">TL;DR</div>
                <ul>
                  ${bulletList}
                </ul>
              </div>`;
            
            // Remove TL;DR from main content
            formattedContent = formattedContent.replace(tldrSection, '{{TLDR_PLACEHOLDER}}');
            hasTLDR = true;
          }
        }
      }

      // Normal HTML escaping for main content
      const tempEscaperDiv = document.createElement('div');
      tempEscaperDiv.textContent = formattedContent;
      formattedContent = tempEscaperDiv.innerHTML;

      // Remove leading/trailing whitespace and normalize newlines  
      formattedContent = formattedContent.trim();
      // Remove any leading newlines that might cause spacing issues
      formattedContent = formattedContent.replace(/^\n+/, '');
      formattedContent = formattedContent.replace(/\n\s*\n/g, '\n\n');
      formattedContent = formattedContent.replace(/\n{3,}/g, '\n\n');

      formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Convert Markdown-style headers to HTML header tags
      // Process H3 first to avoid conflicts with H2 pattern if H3 is a subset
      formattedContent = formattedContent.replace(/^###\s+(.*$)/gim, '<h3 class="content-h3">$1</h3>');
      formattedContent = formattedContent.replace(/^##\s+(.*$)/gim, '<h2 class="content-h2">$1</h2>');
      // formattedContent = formattedContent.replace(/^#\s+(.*$)/gim, '<h1>$1</h1>'); // Usually only one H1 (the main title)

      // New: Wrap "What it Means" sections in a div.what-it-means-block
      // The regex captures the label and the text until the next double newline, next label, or end of string.
      formattedContent = formattedContent.replace(
        /(💡\s*What it Means:)([\s\S]*?)(?=\n\n|💡\s*What it Means:|$)/g,
        (match, label, text) => {
          // Trim whitespace from the captured text, especially leading/trailing newlines for the text part.
          const trimmedText = text.trim();
          return `<div class="what-it-means-block"><strong>${label.trim()}</strong><div class="what-it-means-text-content">${trimmedText}</div></div>`;
        }
      );
      
      // Clean up any whitespace immediately preceding a "What it Means" block
      formattedContent = formattedContent.replace(/\s*(<div class="what-it-means-block">)/g, '$1');
      
      // Convert Markdown links [text](url) to HTML <a> tags
      formattedContent = formattedContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

      // --- Add inline citations using grounding metadata ---
      formattedContent = addInlineCitations(formattedContent, post.grounding && post.grounding.groundingChunks);
      
      // Add TL;DR HTML back at the very end
      if (hasTLDR) {
        formattedContent = formattedContent.replace('{{TLDR_PLACEHOLDER}}', tldrHTML);
      }

      // Convert double newlines to paragraph breaks since we removed white-space: pre-line
      formattedContent = formattedContent.replace(/\n\n/g, '</p><p>');
      // Wrap the entire content in paragraph tags
      formattedContent = '<p>' + formattedContent + '</p>';
      // Clean up any empty paragraphs
      formattedContent = formattedContent.replace(/<p><\/p>/g, '');
      formattedContent = formattedContent.replace(/<p>\s*<\/p>/g, '');

      contentEl.innerHTML = formattedContent;

      card.appendChild(titleEl);
      card.appendChild(dateEl);
      card.appendChild(bylineEl);

      // Move chips below content (and before citations)
      card.appendChild(contentEl);
      let searchEntryPointContainer;
      if (post.grounding && post.grounding.searchEntryPoint && post.grounding.searchEntryPoint.renderedContent) {
        searchEntryPointContainer = document.createElement('div');
        searchEntryPointContainer.className = 'search-entry-point-container';
        let chipsHTML = post.grounding.searchEntryPoint.renderedContent;
        // Remove style tags from chipsHTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = chipsHTML;
        const styleTags = tempDiv.querySelectorAll('style');
        styleTags.forEach(tag => tag.remove());
        chipsHTML = tempDiv.innerHTML;
        // Prevent style collision by renaming the inner "container" class
        chipsHTML = chipsHTML.replace(/class="container"/g, 'class="search-chips-internal-wrapper"');
        chipsHTML = chipsHTML.replace(/class='container'/g, 'class="search-chips-internal-wrapper"');
        searchEntryPointContainer.innerHTML = chipsHTML;
        searchEntryPointContainer.style.marginBottom = '1.5em';
        searchEntryPointContainer.style.marginTop = '1.5em';
        card.appendChild(searchEntryPointContainer);
      }

      // Display Citations from grounding metadata
      const citationsContainer = document.createElement('div');
      citationsContainer.className = 'citations';
      const citationsTitle = document.createElement('h3');
      citationsTitle.textContent = 'Sources & Further Reading';
      citationsContainer.appendChild(citationsTitle);
      
      if (post.grounding && post.grounding.groundingChunks && post.grounding.groundingChunks.length > 0) {
        const citationsList = document.createElement('ul');
        let validSources = 0;
        
        post.grounding.groundingChunks.forEach((chunk) => {
          if (chunk.web && chunk.web.uri && chunk.web.title) {
            const title = chunk.web.title.trim();
            
            if (title) {
              const listItem = document.createElement('li');
              const link = document.createElement('a');
              link.href = chunk.web.uri;
              link.textContent = title;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              listItem.appendChild(link);
              citationsList.appendChild(listItem);
              validSources++;
            }
          }
        });
        
        if (validSources > 0) {
          citationsContainer.appendChild(citationsList);
        }
      }
      card.appendChild(citationsContainer);

      blogContainer.appendChild(card);

      // --- SEO & Social Meta Tags ---
      function setBlogPostMeta(post) {
        // Helper to set or update a meta tag
        function setMeta(name, content, property = false) {
          let selector = property ? `meta[property=\"${name}\"]` : `meta[name=\"${name}\"]`;
          let tag = document.head.querySelector(selector);
          if (!tag) {
            tag = document.createElement('meta');
            if (property) tag.setAttribute('property', name);
            else tag.setAttribute('name', name);
            document.head.appendChild(tag);
          }
          tag.setAttribute('content', content);
        }

        // Title
        document.title = post.title + " | TSLAblog.com";

        // Description (first 200 chars, strip markdown)
        const desc = (post.content || '').replace(/[#*_`\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

        setMeta('description', desc);
        setMeta('og:title', post.title, true);
        setMeta('og:description', desc, true);
        setMeta('og:type', 'article', true);
        setMeta('og:url', window.location.href, true);
        setMeta('og:image', 'https://tslablog.com/icon-512x512.png', true);

        setMeta('twitter:card', 'summary_large_image');
        setMeta('twitter:title', post.title);
        setMeta('twitter:description', desc);
        setMeta('twitter:image', 'https://tslablog.com/icon-512x512.png');

        // Canonical link
        let canonical = document.head.querySelector('link[rel="canonical"]');
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.setAttribute('rel', 'canonical');
          document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', window.location.href);

        // Structured Data
        const ldJson = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "headline": post.title,
          "description": desc,
          "datePublished": post.created_at,
          "author": { "@type": "Person", "name": "Aimee Joiner, AI Intern at TSLAblog.com" },
          "publisher": {
            "@type": "Organization",
            "name": "TSLAblog.com",
            "logo": { "@type": "ImageObject", "url": "https://tslablog.com/icon-512x512.png" }
          },
          "mainEntityOfPage": window.location.href
        };
        let ldScript = document.head.querySelector('script[type="application/ld+json"]#blogpost');
        if (!ldScript) {
          ldScript = document.createElement('script');
          ldScript.type = 'application/ld+json';
          ldScript.id = 'blogpost';
          document.head.appendChild(ldScript);
        }
        ldScript.textContent = JSON.stringify(ldJson);
      }
      setBlogPostMeta(post);

    } catch (error) {
      console.error('Failed to fetch or display blog post:', error);
      blogContainer.innerHTML = `<p style="padding: 2rem; text-align: center; color: var(--error-color, red);">Error loading blog post: ${error.message}. Please try again later.</p>`;
    }
  }

  fetchBlogPost();
}); 
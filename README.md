# TSLAblog.com - Tesla News Blog

Automated Tesla news blog using Gemini AI and Cloudflare Workers.

## Features

- **Automated Blog Generation**: Daily Tesla/TSLA/Elon Musk news posts using Gemini Flash Lite Latest
- **RSS Feed Aggregation**: Pulls from multiple Tesla-focused news sources
- **Smart Content Processing**: AI-powered content analysis and summarization
- **JSON-structured Output**: Headlines, TL;DR bullet points, and detailed content
- **GitHub Actions Scheduling**: Automated daily publishing at 7 AM PT
- **Manual Trigger Support**: Easy one-command blog generation

## Architecture

- **Cloudflare Workers**: Serverless blog generation and API endpoints
- **D1 Database**: Blog post storage and archive
- **KV Storage**: Latest blog caching
- **GitHub Actions**: Automated scheduling and deployment
- **Gemini AI**: Content generation with web search capabilities

## Usage

### Manual Blog Generation
```bash
GENERATE_SECRET=your_secret ./generate-blog.sh
```

### GitHub Actions
- **Automatic**: Runs daily at 7 AM PT
- **Manual**: Go to Actions tab → "Generate Tesla Blog" → "Run workflow"

## API Endpoints

- `GET /api/archive` - Blog archive (JSON)
- `GET /latest` - Latest blog post
- `POST /generate` - Generate new blog (authenticated)
- `GET /sitemap.xml` - Site sitemap

## Development

```bash
# Install dependencies
npm install

# Deploy to Cloudflare
wrangler deploy --config wrangler-blog.toml

# Local development
wrangler dev --config wrangler-blog.toml
```

## Configuration

Required Cloudflare secrets:
- `GEMINI_API_KEY`: Google Gemini API key
- `GENERATE_SECRET`: Authentication for blog generation

Required GitHub secrets:
- `GENERATE_SECRET`: Same as Cloudflare secret for automated generation
# Tesla Blog Generation - Usage Guide

## Automatic Daily Generation
The Gemini blog worker automatically runs **daily at 7:00 AM PT** (2:00 PM UTC) to generate fresh Tesla news content.

## Manual Blog Generation (for testing/one-off)

### Option 1: Using the Shell Script
```bash
# Set your authentication secret
export GENERATE_SECRET=your_secret_here

# Run the script
./trigger-blog.sh
```

### Option 2: Using npm
```bash
# Set your authentication secret
export GENERATE_SECRET=your_secret_here

# Generate a new blog
npm run generate-blog
```

### Option 3: Direct curl command
```bash
curl -X POST "https://tslablog-gemini-blog.michaeljoiner.workers.dev/generate" \
  -H "x-gen-auth: $GENERATE_SECRET" \
  -H "Content-Type: application/json"
```

## Other Useful Commands

### Deploy changes
```bash
npm run deploy
# or
wrangler deploy
```

### Monitor logs
```bash
npm run tail
# or
wrangler tail --format=pretty
```

### Development server
```bash
npm run dev
# or
wrangler dev
```

## Viewing Generated Blogs

- **Latest blog**: https://tslablog.com/latest
- **All blogs**: https://tslablog.com/archive
- **Main site**: https://tslablog.com

## How it Works

1. **Scheduled**: Runs daily at 7am PT via Cloudflare Workers cron
2. **Manual**: Use `/generate` endpoint with authentication
3. **Process**: Fetches Tesla RSS feeds → Processes with Gemini AI → Stores in KV + D1
4. **Output**: Generates comprehensive Tesla news blog post

## Authentication

The manual trigger requires the `GENERATE_SECRET` environment variable to be set. This protects the endpoint from unauthorized access.

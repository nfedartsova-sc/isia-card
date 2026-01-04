# ISIA Instructor Card

## Prerequisites

- Git - download and install Git
- Node.js - download and install Node.js
- Download and install Docker

## Downloading

```
git clone ...
```

## Getting started

1. Switch to the necessary branch:

```
git checkout <branch_name>
```

## Running application

1. Without Docker

1.1. In development mode (with support of HTTPS):

```
npm run dev
```

After starting the application you can access it in your browser (https://localhost:3000).

If you make changes in app code, you need first change service worker version in sw.ts file,
then run

```
npm run build:sw
```

If app is running in development mode, cache will auto refresh after this command.
If not - refresh the page manually.

1.2. In production mode (without support of HTTPS):

```
npm run build
```

then

```
npm run start
```

After starting the application you can access it in your browser (http://localhost:3000).

2. Using Docker (Make sure Docker is running!):

2.1. In development mode (with support of HTTPS):

Assembly and launch (first time or after Dockerfile changes):

```
npm run docker:up:build:dev
```

This command builds/rebuilds the Docker image and starts the application.

Just launch (is image already exists):

```
npm run docker:up:dev
```

This command starts the application, without building it.

After starting the application you can access it in your browser (https://localhost:3000).

2.2. In production mode (without support of HTTPS):

Assembly and launch:

```
npm run docker:up:build:prod
```

Just launch:

```
npm run docker:up:prod
```

After starting the application you can access it in your browser (http://localhost:3000).

## How to stop running containers

1. To stop containers without their deletion:

1.1. For containers started in development mode:

```
npm run docker:stop:dev
```

1.2. For containers started in production mode:

```
npm run docker:stop:prod
```

2. To stop containers, remove them and all volumes and networks (if they are):

1.1. For containers started in development mode:

```
npm run docker:down:dev
```

1.2. For containers started in production mode:

```
npm run docker:down:prod
```

## Caching strategies

### Server Available

When the server is available, execution flow and caching behavior:

<table>
<tr>
<th>Destination</th>
<th>Strategy</th>
<th>Execution Flow</th>
<th>Cache Behavior</th>
<th>Response Source</th>
</tr>

<tr>
<td><strong>Precached resources</strong><br/>(/, /offline, precached images)</td>
<td>Precache</td>
<td>1. Check precache<br/>2. Return cached response</td>
<td>✅ Pre-cached during service worker installation (no runtime caching)</td>
<td>Precache cache (served immediately, no network request)</td>
</tr>

<tr>
<td><strong>HTML pages</strong><br/>(navigation)</td>
<td>NetworkFirst<br/>(3s timeout)</td>
<td>1. Try network<br/>2. If successful (200), cache response<br/>3. Return network response</td>
<td>✅ Cached on successful network response (200 status only)</td>
<td>Network (fresh data, cached for future use)</td>
</tr>

<tr>
<td><strong>Scripts/Styles</strong><br/>(Next.js static assets)</td>
<td>CacheFirst</td>
<td>1. Check runtime cache<br/>2. If found, return cached<br/>3. If not found, fetch from network, cache, and return</td>
<td>✅ Cached on first request, served from cache on subsequent requests</td>
<td>Cache (if exists) → Network (if cache miss)</td>
</tr>

<tr>
<td><strong>Regular images</strong></td>
<td>CacheFirst</td>
<td>1. Check runtime cache<br/>2. If found, return cached<br/>3. If not found, fetch from network, cache, and return</td>
<td>✅ Cached on first request, served from cache on subsequent requests</td>
<td>Cache (if exists) → Network (if cache miss)</td>
</tr>

<tr>
<td><strong>Image API</strong><br/>(/api/isiaCardImage, etc.)</td>
<td>CacheFirst</td>
<td>1. Check runtime cache<br/>2. If found, return cached<br/>3. If not found, fetch from network, cache, and return</td>
<td>✅ Cached on first request, served from cache on subsequent requests</td>
<td>Cache (if exists) → Network (if cache miss)</td>
</tr>

<tr>
<td><strong>API endpoints</strong><br/>(/api/*)</td>
<td>NetworkFirst<br/>(3s timeout)</td>
<td>1. Try network<br/>2. If successful (200/304), cache response<br/>3. Return network response</td>
<td>✅ Cached on successful network response (200/304 status)</td>
<td>Network (fresh data, cached for future use)</td>
</tr>

<tr>
<td><strong>Fonts</strong></td>
<td>CacheFirst</td>
<td>1. Check runtime cache<br/>2. If found, return cached<br/>3. If not found, fetch from network, cache, and return</td>
<td>✅ Cached on first request, served from cache on subsequent requests</td>
<td>Cache (if exists) → Network (if cache miss)</td>
</tr>

<tr>
<td><strong>Other/Unknown</strong></td>
<td>NetworkOnly</td>
<td>1. Fetch from network<br/>2. Return response</td>
<td>❌ No caching</td>
<td>Network only</td>
</tr>
</table>

### Key Points:

- **Precache**: Resources cached during service worker installation, served instantly without network requests
- **NetworkFirst**: Always fetches fresh data from network, caches successful responses for offline use
- **CacheFirst**: Fast response from cache when available, only uses network on cache miss
- **NetworkOnly**: No caching, always fetches from network (fallback for unmatched routes)

### Server Unavailable

When the server is unavailable, execution depends on the strategy and destination:

<table>
<tr>
<th>Destination</th>
<th>Strategy</th>
<th>Cache Check</th>
<th>Network</th>
<th>Catch Handler Fallback*</th>
</tr>

<tr>
<td>Precached resources (/, /offline, precached images)</td>
<td>Precache</td>
<td>✅ Precache cache</td>
<td>❌ Skip</td>
<td>N/A (should be cached)</td>
</tr>

<tr>
<td>HTML pages (navigation)</td>
<td>NetworkFirst (3s timeout)</td>
<td>✅ Runtime cache (after 3s timeout)</td>
<td>❌ Fails after 3s</td>
<td>Homepage (multiple cache strategies) → Simple loading page</td>
</tr>

<tr>
<td>Scripts/Styles</td>
<td>CacheFirst</td>
<td>✅ Runtime cache (served immediately)</td>
<td>❌ Skip (CacheFirst)</td>
<td>Runtime cache retry → Error (scripts) / Empty CSS (styles)</td>
</tr>

<tr>
<td>Regular images</td>
<td>CacheFirst</td>
<td>✅ Runtime cache</td>
<td>❌ Skip (CacheFirst)</td>
<td>Fallback image → SVG placeholder</td>
</tr>

<tr>
<td>Image API (/api/isiaCardImage, etc.)</td>
<td>CacheFirst</td>
<td>✅ Runtime cache</td>
<td>❌ Skip (CacheFirst)</td>
<td>Response.error()</td>
</tr>

<tr>
<td>API endpoints (/api/*)</td>
<td>NetworkFirst (3s timeout)</td>
<td>✅ Runtime cache (after 3s timeout)</td>
<td>❌ Fails after 3s</td>
<td>Response.error()</td>
</tr>

<tr>
<td>Fonts</td>
<td>CacheFirst</td>
<td>✅ Runtime cache</td>
<td>❌ Skip (CacheFirst)</td>
<td>Response.error()</td>
</tr>

<tr>
<td>Other/Unknown</td>
<td>NetworkOnly</td>
<td>❌ None</td>
<td>❌ Fails immediately</td>
<td>Response.error()</td>
</tr>
</table>

* Are given in the order of application if the previous variants failed
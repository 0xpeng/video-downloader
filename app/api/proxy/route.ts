import { NextRequest } from 'next/server';

const LOG_PREFIX = '[PROXY]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args);
}

// 允許的域名白名單（只允許已知的影片 CDN）
const ALLOWED_DOMAINS = [
  // TikTok CDN
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'musical.ly',
  // YouTube CDN
  'googlevideo.com',
  'ytimg.com',
  // Twitter/X CDN
  'twimg.com',
  'video.twimg.com',
  // Instagram CDN
  'cdninstagram.com',
  'fbcdn.net',
  // Bilibili CDN
  'bilivideo.com',
  'hdslb.com',
];

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // 檢查是否為允許的域名
    return ALLOWED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

function isPrivateIP(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // 阻擋私有 IP 和本地地址
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,  // AWS metadata
      /^0\./,
      /^\[::1\]$/,    // IPv6 localhost
      /^\[fc/i,       // IPv6 private
      /^\[fd/i,       // IPv6 private
    ];

    return privatePatterns.some(pattern => pattern.test(hostname));
  } catch {
    return true; // 如果解析失敗，視為不安全
  }
}

// Map file extensions to MIME types
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'download.mp4';

  log('Request received', { filename: filename.substring(0, 50), urlLength: url?.length });

  if (!url) {
    log('ERROR: Missing URL');
    return new Response(JSON.stringify({ error: 'Missing URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 安全檢查：阻擋私有 IP
  if (isPrivateIP(url)) {
    log('ERROR: Private IP blocked', url.substring(0, 50));
    return new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 安全檢查：只允許白名單域名
  if (!isAllowedUrl(url)) {
    log('ERROR: Domain not in whitelist', url.substring(0, 50));
    return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    log('Fetching from tunnel...');
    const response = await fetch(url);
    const fetchTime = Date.now() - startTime;

    log('Tunnel response', {
      status: response.status,
      hasBody: !!response.body,
      fetchTime: `${fetchTime}ms`,
      headers: {
        contentLength: response.headers.get('content-length'),
        estimatedLength: response.headers.get('estimated-content-length'),
        contentType: response.headers.get('content-type'),
        contentDisposition: response.headers.get('content-disposition')?.substring(0, 50),
      }
    });

    if (!response.ok || !response.body) {
      log('ERROR: Tunnel response failed', { status: response.status });
      return new Response(JSON.stringify({ error: 'Download failed' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine content type from filename
    const contentType = getMimeType(filename);

    // RFC 5987 encoding for non-ASCII filenames
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename);

    // Create headers
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    // 只有當上游提供有效的 Content-Length 時才設定（忽略 0 和負數）
    const contentLength = response.headers.get('content-length');
    const contentLengthNum = contentLength ? parseInt(contentLength, 10) : 0;
    if (contentLengthNum > 0) {
      headers.set('Content-Length', contentLength!);
      log('Setting Content-Length from upstream:', contentLength);
    } else {
      log('Not setting Content-Length (upstream value invalid):', contentLength);
    }

    const totalTime = Date.now() - startTime;
    log('Starting stream response', {
      contentType,
      filename: asciiFilename.substring(0, 50),
      setupTime: `${totalTime}ms`,
    });

    // Stream the response body directly
    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    log('ERROR: Proxy exception', error);
    return new Response(JSON.stringify({ error: 'Proxy failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Disable body parsing and enable streaming
export const dynamic = 'force-dynamic';

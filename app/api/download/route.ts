import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

// Add homebrew and deno to PATH
const HOMEBREW_PATH = '/opt/homebrew/bin';
const DENO_PATH = path.join(os.homedir(), '.deno', 'bin');
const ENV_PATH = `${HOMEBREW_PATH}:${DENO_PATH}:${process.env.PATH}`;

// 允許的影片平台白名單
const ALLOWED_PLATFORMS = [
  // YouTube
  'youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com',
  // TikTok
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
  // Twitter/X
  'twitter.com', 'x.com', 'www.twitter.com', 'www.x.com',
  // Instagram
  'instagram.com', 'www.instagram.com',
  // Facebook
  'facebook.com', 'www.facebook.com', 'fb.watch',
  // Bilibili
  'bilibili.com', 'www.bilibili.com', 'b23.tv',
  // Vimeo
  'vimeo.com', 'www.vimeo.com',
  // Twitch
  'twitch.tv', 'www.twitch.tv', 'clips.twitch.tv',
  // 小紅書
  'xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com',
];

function isAllowedPlatform(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    return ALLOWED_PLATFORMS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // 小紅書 (Xiaohongshu) domains
    const xiaohongshuDomains = ['xiaohongshu.com', 'xhslink.com', 'www.xiaohongshu.com'];
    // Twitter/X domains
    const twitterDomains = ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com'];

    const shouldClean = [...xiaohongshuDomains, ...twitterDomains].some(
      domain => hostname === domain || hostname.endsWith('.' + domain)
    );

    if (shouldClean) {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }

    return url;
  } catch {
    return url;
  }
}

// Get video info using yt-dlp
async function getVideoInfo(url: string): Promise<{ title: string; ext: string; duration: number } | null> {
  return new Promise((resolve) => {
    const args = [
      '--no-warnings',
      '--skip-download',
      '--print', '%(title)s',
      '--print', '%(ext)s',
      '--print', '%(duration)s',
      url
    ];

    const proc = spawn('yt-dlp', args, {
      env: { ...process.env, PATH: ENV_PATH }
    });

    let output = '';
    let error = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      error += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const lines = output.trim().split('\n');
        if (lines.length >= 3) {
          resolve({
            title: lines[0] || 'video',
            ext: lines[1] || 'mp4',
            duration: parseFloat(lines[2]) || 0
          });
        } else {
          resolve(null);
        }
      } else {
        console.error('[YT-DLP] Info error:', error);
        resolve(null);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve(null);
    }, 30000);
  });
}

export async function POST(request: NextRequest) {
  // 速率限制檢查
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: '請求過於頻繁，請稍後再試' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    const body = await request.json();
    const { url, audioOnly } = body;

    if (!url) {
      return NextResponse.json(
        { error: '請提供影片網址' },
        { status: 400 }
      );
    }

    // 安全檢查：只允許白名單平台
    if (!isAllowedPlatform(url)) {
      return NextResponse.json(
        { error: '不支援此平台，請使用 YouTube、TikTok、Twitter 等支援的平台' },
        { status: 400 }
      );
    }

    const cleanedUrl = cleanUrl(url);
    console.log('[DOWNLOAD] Getting video info for:', cleanedUrl);

    // Get video info
    const info = await getVideoInfo(cleanedUrl);

    if (!info) {
      return NextResponse.json(
        { error: '無法取得影片資訊，請確認網址是否正確' },
        { status: 400 }
      );
    }

    // Sanitize filename
    const safeTitle = info.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
    const ext = audioOnly ? 'mp3' : 'mp4';
    const filename = `${safeTitle}.${ext}`;

    console.log('[DOWNLOAD] Video info:', { title: info.title, ext: info.ext, duration: info.duration });

    return NextResponse.json({
      status: 'ready',
      filename,
      title: info.title,
      duration: info.duration,
      cleanedUrl,
      originalUrl: url,
      audioOnly: !!audioOnly,
    });
  } catch (error) {
    console.error('Download API error:', error);
    return NextResponse.json(
      { error: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}

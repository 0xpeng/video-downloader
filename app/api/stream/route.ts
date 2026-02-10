import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { createReadStream, unlinkSync, statSync } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const LOG_PREFIX = '[STREAM]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args);
}

// Add deno to PATH
const DENO_PATH = path.join(os.homedir(), '.deno', 'bin');
const ENV_PATH = `${DENO_PATH}:${process.env.PATH}`;

// Download video using yt-dlp to a temp file
async function downloadToTemp(url: string, audioOnly: boolean): Promise<{ filepath: string; error?: string }> {
  return new Promise((resolve) => {
    const ext = audioOnly ? 'mp3' : 'mp4';
    const tempFile = path.join(os.tmpdir(), `ytdlp_${randomUUID()}.${ext}`);

    const args: string[] = [
      '--no-warnings',
      '--no-playlist',
      '--progress',
    ];

    if (audioOnly) {
      args.push('-f', 'bestaudio');
      args.push('-x', '--audio-format', 'mp3');
    } else {
      // 優先選擇 H.264 (avc1) 編碼，QuickTime Player 才能播放
      // 如果沒有 H.264，才用 VP9
      args.push('-f', 'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
      args.push('--merge-output-format', 'mp4');
    }

    args.push('-o', tempFile);
    args.push(url);

    log('Starting yt-dlp download to:', tempFile);

    const proc = spawn('yt-dlp', args, {
      env: { ...process.env, PATH: ENV_PATH }
    });

    let stderrOutput = '';
    let lastProgress = 0;

    // yt-dlp outputs progress to stderr
    proc.stderr.on('data', (data) => {
      stderrOutput += data.toString();
      const msg = data.toString().trim();
      // Log progress updates (only every 10%)
      if (msg.includes('[download]') && msg.includes('%')) {
        const match = msg.match(/(\d+\.?\d*)%/);
        if (match) {
          const progress = Math.floor(parseFloat(match[1]));
          if (progress >= lastProgress + 10) {
            log('Progress:', progress + '%');
            lastProgress = progress;
          }
        }
      } else if (msg && !msg.includes('[download]') && !msg.includes('ETA')) {
        log('yt-dlp:', msg.substring(0, 200));
      }
    });

    // Also capture stdout for any output
    proc.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('[download]')) {
        log('yt-dlp stdout:', msg.substring(0, 200));
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('Download completed:', tempFile);
        resolve({ filepath: tempFile });
      } else {
        log('yt-dlp failed with code:', code, 'stderr:', stderrOutput.substring(0, 500));
        resolve({ filepath: '', error: `Download failed: ${stderrOutput.substring(0, 200)}` });
      }
    });

    proc.on('error', (err) => {
      log('Process error:', err.message);
      resolve({ filepath: '', error: err.message });
    });

    // Timeout after 10 minutes
    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ filepath: '', error: 'Download timeout' });
    }, 600000);
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'video.mp4';
  const audioOnly = searchParams.get('audioOnly') === 'true';

  log('Request received', { filename, audioOnly, urlLength: url?.length });

  if (!url) {
    log('ERROR: Missing URL');
    return new Response(JSON.stringify({ error: 'Missing URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Download to temp file
    const { filepath, error } = await downloadToTemp(url, audioOnly);

    if (error || !filepath) {
      log('Download failed:', error);
      return new Response(JSON.stringify({ error: error || 'Download failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get file size
    const stats = statSync(filepath);
    const fileSize = stats.size;

    log('File ready:', { filepath, size: fileSize });

    // Create readable stream from file
    const fileStream = createReadStream(filepath);

    // Convert Node stream to Web stream
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });

        fileStream.on('end', () => {
          log('Stream completed, cleaning up temp file');
          controller.close();
          // Clean up temp file
          try {
            unlinkSync(filepath);
          } catch (e) {
            log('Failed to delete temp file:', e);
          }
        });

        fileStream.on('error', (err) => {
          log('File stream error:', err.message);
          controller.error(err);
          try {
            unlinkSync(filepath);
          } catch (e) {
            log('Failed to delete temp file:', e);
          }
        });
      },
      cancel() {
        log('Stream cancelled, cleaning up');
        fileStream.destroy();
        try {
          unlinkSync(filepath);
        } catch (e) {
          log('Failed to delete temp file:', e);
        }
      }
    });

    // RFC 5987 encoding for non-ASCII filenames
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename);

    const contentType = audioOnly ? 'audio/mpeg' : 'video/mp4';

    log('Starting stream response', { contentType, filename: asciiFilename.substring(0, 50), fileSize });

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileSize.toString(),
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    log('ERROR:', error);
    return new Response(JSON.stringify({ error: 'Stream failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes timeout

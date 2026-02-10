// 簡單的內存速率限制
// 注意：這只適用於單一伺服器實例，如果有多個實例需要用 Redis

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// 設定：每個 IP 每分鐘最多 30 次請求
const WINDOW_MS = 60 * 1000; // 1 分鐘
const MAX_REQUESTS = 30;

// 定期清理過期的記錄（每 5 分鐘）
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    // 新的時間窗口
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: WINDOW_MS };
  }

  if (entry.count >= MAX_REQUESTS) {
    // 超過限制
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
  }

  // 增加計數
  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetIn: entry.resetTime - now };
}

export function getClientIP(request: Request): string {
  // 嘗試從各種 header 獲取真實 IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // 如果都沒有，返回默認值
  return 'unknown';
}

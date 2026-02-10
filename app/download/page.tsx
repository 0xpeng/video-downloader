'use client';

import { useState } from 'react';

export default function DownloadPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleClick = async () => {
    console.log('[DOWNLOAD] 開始下載...');
    setStatus('loading');
    setMessage('正在取得下載連結...');

    // 從 input 取得 URL
    const urlInput = document.getElementById('urlInput') as HTMLInputElement;
    const videoUrl = urlInput?.value?.trim();

    if (!videoUrl) {
      setStatus('error');
      setMessage('請輸入影片網址');
      return;
    }

    // 1. 取得 tunnel URL
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: videoUrl,
        audioOnly: false,
      }),
    });

    const data = await response.json();
    console.log('[DOWNLOAD] API 回應:', data.status, data.filename);

    if (data.error || data.status !== 'ready') {
      setStatus('error');
      setMessage(data.error || '無法取得影片資訊');
      return;
    }

    setMessage(`正在下載: ${data.title || '影片'}...（大型影片可能需要較長時間）`);

    // 2. 構建 stream URL (使用 yt-dlp)
    const streamUrl = `/api/stream?url=${encodeURIComponent(data.cleanedUrl)}&filename=${encodeURIComponent(data.filename || 'video.mp4')}&audioOnly=${data.audioOnly || false}`;
    console.log('[DOWNLOAD] Stream URL 已構建');

    // 3. 用 iframe 觸發下載
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = streamUrl;
    document.body.appendChild(iframe);
    console.log('[DOWNLOAD] iframe 已建立');

    // 關鍵：延遲更新 UI，避免干擾 iframe 下載
    setTimeout(() => {
      setStatus('success');
      setMessage(`下載已開始: ${data.filename || 'video.mp4'}`);
    }, 1000);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Video Downloader
          </h1>
          <p className="text-slate-400">
            支援 YouTube、Twitter、小紅書、TikTok 等平台
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 md:p-8 shadow-2xl border border-white/10">
          <div className="space-y-6">
            <input
              id="urlInput"
              type="text"
              placeholder="貼上影片網址..."
              disabled={status === 'loading'}
              className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={handleClick}
              disabled={status === 'loading'}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-slate-600 disabled:to-slate-600 text-white font-semibold rounded-xl transition-all disabled:cursor-not-allowed"
            >
              {status === 'loading' ? '處理中...' : '下載'}
            </button>

            {/* 狀態訊息 */}
            {message && (
              <div className={`p-4 rounded-xl text-center ${
                status === 'error'
                  ? 'bg-red-500/20 text-red-300'
                  : status === 'success'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-white/5 text-slate-300'
              }`}>
                {status === 'success' && (
                  <span className="mr-2">✓</span>
                )}
                {message}
                {status === 'success' && (
                  <p className="text-xs mt-2 opacity-70">請查看瀏覽器的下載管理器</p>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Powered by yt-dlp
        </p>
      </div>
    </main>
  );
}

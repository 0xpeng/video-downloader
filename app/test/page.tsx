'use client';

// 最小化測試頁面 - 無 state、無 form、只有純 DOM 操作

export default function TestPage() {
  const handleClick = async () => {
    console.log('[TEST] 開始測試...');

    // 1. 取得 tunnel URL
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        audioOnly: false,
      }),
    });

    const data = await response.json();
    console.log('[TEST] API 回應:', data.status, data.filename);

    if (!data.url) {
      alert('無法取得下載連結');
      return;
    }

    // 2. 構建 proxy URL (使用相對路徑，和 test-download.html 一樣)
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(data.url)}&filename=${encodeURIComponent(data.filename || 'video.mp4')}`;
    console.log('[TEST] Proxy URL 已構建');

    // 3. 用 iframe 觸發下載 (和 test-download.html 完全相同的方式)
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = proxyUrl;
    document.body.appendChild(iframe);
    console.log('[TEST] iframe 已建立');

    alert('下載已觸發，請檢查 Downloads 資料夾');
  };

  return (
    <div style={{ padding: '50px', background: '#1a1a2e', minHeight: '100vh', color: 'white' }}>
      <h1>最小化測試頁面</h1>
      <p>這個頁面沒有 React state、沒有 form，只有純粹的 DOM 操作</p>
      <p>和 test-download.html 使用完全相同的下載邏輯</p>
      <br />
      <button
        onClick={handleClick}
        style={{
          padding: '20px 40px',
          fontSize: '18px',
          cursor: 'pointer',
          background: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
        }}
      >
        測試下載 (Rick Astley)
      </button>
    </div>
  );
}

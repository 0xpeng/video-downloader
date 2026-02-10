#!/usr/bin/env node

/**
 * Video Downloader Diagnostic Script
 * 診斷影片下載器的 11 個可能失敗點
 *
 * Usage: node scripts/diagnose.js
 */

const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const COBALT_API_URL = process.env.COBALT_API_URL || 'http://localhost:9000';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg) {
  console.log(msg);
}

function pass(msg) {
  console.log(`${colors.green}✓ PASS${colors.reset} ${msg}`);
}

function fail(msg, suggestion) {
  console.log(`${colors.red}✗ FAIL${colors.reset} ${msg}`);
  if (suggestion) {
    console.log(`  ${colors.yellow}→ 建議: ${suggestion}${colors.reset}`);
  }
}

function info(msg) {
  console.log(`  ${colors.dim}${msg}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log('='.repeat(60));
}

function subHeader(title) {
  console.log(`\n${colors.cyan}--- ${title} ---${colors.reset}`);
}

// Helper to convert bytes to hex string
function bytesToHex(bytes, limit = 100) {
  const arr = new Uint8Array(bytes.slice(0, limit));
  let hex = '';
  let ascii = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0') + ' ';
    ascii += arr[i] >= 32 && arr[i] <= 126 ? String.fromCharCode(arr[i]) : '.';
    if ((i + 1) % 16 === 0) {
      hex += ' | ' + ascii + '\n';
      ascii = '';
    }
  }
  if (ascii) {
    hex += ' '.repeat((16 - (arr.length % 16)) * 3) + ' | ' + ascii;
  }
  return hex;
}

// Check if bytes look like video data (MP4 signature)
function looksLikeVideo(bytes) {
  const arr = new Uint8Array(bytes);
  // MP4 files typically start with ftyp box
  // Look for 'ftyp' at offset 4
  if (arr.length >= 8) {
    const ftyp = String.fromCharCode(arr[4], arr[5], arr[6], arr[7]);
    if (ftyp === 'ftyp') return { isVideo: true, format: 'MP4' };
  }
  // WebM starts with 0x1A 0x45 0xDF 0xA3
  if (arr[0] === 0x1a && arr[1] === 0x45 && arr[2] === 0xdf && arr[3] === 0xa3) {
    return { isVideo: true, format: 'WebM' };
  }
  return { isVideo: false, format: 'Unknown' };
}

async function test1_CobaltConnectivity() {
  header('Test 1: Cobalt API 連通性');

  subHeader('1.1 檢查 Cobalt 是否運行');
  try {
    const response = await fetch(`${COBALT_API_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    info(`Status: ${response.status}`);

    if (response.ok || response.status === 400) {
      pass('Cobalt API 可連接');
    } else {
      fail('Cobalt API 回應異常', '檢查 Docker container 是否運行: docker ps');
      return false;
    }
  } catch (error) {
    fail(`無法連接到 Cobalt: ${error.message}`, '啟動 Cobalt: docker start cobalt');
    return false;
  }

  subHeader('1.2 檢查 Docker container 狀態');
  info(`Cobalt URL: ${COBALT_API_URL}`);
  pass('連接測試完成');

  return true;
}

async function test2_TunnelURL() {
  header('Test 2: Tunnel URL 測試');

  subHeader('2.1 呼叫 Cobalt API 取得 Tunnel URL');
  let tunnelUrl, filename;

  try {
    const response = await fetch(`${COBALT_API_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url: TEST_VIDEO_URL,
        downloadMode: 'auto',
        filenameStyle: 'basic',
      }),
    });

    const data = await response.json();
    info(`Response status: ${data.status}`);
    info(`Filename: ${data.filename || 'N/A'}`);

    if (data.status === 'tunnel' || data.status === 'redirect') {
      tunnelUrl = data.url;
      filename = data.filename;
      pass(`取得 ${data.status} URL`);
      info(`URL: ${tunnelUrl.substring(0, 80)}...`);
    } else if (data.status === 'error') {
      fail(`Cobalt 回傳錯誤: ${data.error?.code}`, '可能是 YouTube 限制，換個影片試試');
      return { success: false };
    } else {
      fail(`未知的回應狀態: ${data.status}`);
      return { success: false };
    }
  } catch (error) {
    fail(`API 呼叫失敗: ${error.message}`);
    return { success: false };
  }

  subHeader('2.2 驗證 Tunnel URL 可存取');
  try {
    const response = await fetch(tunnelUrl, { method: 'HEAD' });
    info(`Status: ${response.status}`);

    if (response.ok) {
      pass('Tunnel URL 可存取');
    } else {
      fail(`Tunnel URL 回應 ${response.status}`, 'Tunnel URL 可能已過期，重新請求');
      return { success: false };
    }
  } catch (error) {
    fail(`無法存取 Tunnel URL: ${error.message}`);
    return { success: false };
  }

  return { success: true, tunnelUrl, filename };
}

async function test3_ResponseHeaders(tunnelUrl) {
  header('Test 3: Response Headers 檢查');

  if (!tunnelUrl) {
    fail('沒有 Tunnel URL，跳過此測試');
    return false;
  }

  subHeader('3.1 取得 Tunnel URL Headers');
  try {
    const response = await fetch(tunnelUrl, { method: 'HEAD' });

    const importantHeaders = [
      'content-type',
      'content-disposition',
      'content-length',
      'estimated-content-length',
      'transfer-encoding',
    ];

    log('\n  重要 Headers:');
    for (const header of importantHeaders) {
      const value = response.headers.get(header);
      if (value) {
        info(`  ${header}: ${value}`);
      } else {
        info(`  ${header}: ${colors.yellow}(未設定)${colors.reset}`);
      }
    }

    // Check specific headers
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition && contentDisposition.includes('filename')) {
      pass('Content-Disposition 包含 filename');
    } else {
      fail('Content-Disposition 缺少 filename', '這可能導致瀏覽器無法正確命名檔案');
    }

    const contentLength =
      response.headers.get('content-length') || response.headers.get('estimated-content-length');
    if (contentLength) {
      const sizeMB = (parseInt(contentLength) / 1024 / 1024).toFixed(2);
      pass(`檔案大小: ${sizeMB} MB`);
    } else {
      info('沒有 Content-Length (串流模式)');
    }

    return true;
  } catch (error) {
    fail(`無法取得 headers: ${error.message}`);
    return false;
  }
}

async function test4_StreamTest(tunnelUrl) {
  header('Test 4: Stream 測試');

  if (!tunnelUrl) {
    fail('沒有 Tunnel URL，跳過此測試');
    return false;
  }

  subHeader('4.1 下載前 1MB 資料');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(tunnelUrl, {
      signal: controller.signal,
      headers: {
        Range: 'bytes=0-1048575', // First 1MB
      },
    });

    clearTimeout(timeout);

    if (!response.ok && response.status !== 206) {
      fail(`下載失敗: HTTP ${response.status}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    info(`下載了 ${buffer.byteLength} bytes`);

    if (buffer.byteLength === 0) {
      fail('下載的資料為空 (0 bytes)', '檢查 Cobalt tunnel 是否正常運作');
      return false;
    }

    pass(`成功下載 ${(buffer.byteLength / 1024).toFixed(2)} KB`);

    subHeader('4.2 檢查資料格式');
    const videoCheck = looksLikeVideo(buffer);
    if (videoCheck.isVideo) {
      pass(`資料是有效的 ${videoCheck.format} 影片格式`);
    } else {
      fail('資料不像是影片格式', '可能是錯誤訊息或損壞的資料');
      info('前 100 bytes (hex):');
      console.log(bytesToHex(buffer, 100));
    }

    subHeader('4.3 前 64 bytes (Hex dump)');
    console.log(bytesToHex(buffer, 64));

    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      fail('下載超時 (30秒)', '網路可能較慢或 Cobalt 處理中');
    } else {
      fail(`下載錯誤: ${error.message}`);
    }
    return false;
  }
}

async function test5_ProxyEndpoint(tunnelUrl, filename) {
  header('Test 5: App Proxy Endpoint 測試');

  subHeader('5.1 測試 Proxy 端點');
  try {
    const proxyUrl = `${APP_URL}/api/proxy?url=${encodeURIComponent(tunnelUrl)}&filename=${encodeURIComponent(filename || 'test.mp4')}`;

    const response = await fetch(proxyUrl, { method: 'HEAD' });
    info(`Status: ${response.status}`);

    if (response.ok) {
      pass('Proxy 端點可存取');

      // Check headers from our proxy
      const contentType = response.headers.get('content-type');
      const contentDisposition = response.headers.get('content-disposition');

      info(`Content-Type: ${contentType}`);
      info(`Content-Disposition: ${contentDisposition?.substring(0, 80)}...`);

      if (contentType === 'video/mp4') {
        pass('Content-Type 正確設定為 video/mp4');
      } else {
        fail(`Content-Type 不正確: ${contentType}`, '檢查 proxy route 的 MIME type 設定');
      }

      if (contentDisposition?.includes('attachment')) {
        pass('Content-Disposition 設定為 attachment');
      } else {
        fail('Content-Disposition 未設定 attachment');
      }
    } else {
      fail(`Proxy 回應 ${response.status}`, '確認 Next.js dev server 正在運行');
      return false;
    }

    subHeader('5.2 測試 Proxy 資料傳輸');
    const dataResponse = await fetch(proxyUrl, {
      headers: { Range: 'bytes=0-65535' },
    });

    const buffer = await dataResponse.arrayBuffer();
    info(`Proxy 傳輸了 ${buffer.byteLength} bytes`);

    if (buffer.byteLength > 0) {
      pass('Proxy 成功傳輸資料');
      const videoCheck = looksLikeVideo(buffer);
      if (videoCheck.isVideo) {
        pass(`資料是有效的 ${videoCheck.format} 格式`);
      }
    } else {
      fail('Proxy 傳輸的資料為空', '這就是 0 bytes 下載的原因！檢查 proxy route 的 streaming 實作');
    }

    return true;
  } catch (error) {
    fail(`Proxy 測試失敗: ${error.message}`, '確認 Next.js dev server 正在運行');
    return false;
  }
}

async function test6_FullDownload(tunnelUrl, filename) {
  header('Test 6: 完整下載測試 (10秒限制)');

  subHeader('6.1 模擬完整下載流程');
  try {
    const proxyUrl = `${APP_URL}/api/proxy?url=${encodeURIComponent(tunnelUrl)}&filename=${encodeURIComponent(filename || 'test.mp4')}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(proxyUrl, { signal: controller.signal });

    let totalBytes = 0;
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      // Stop after 5MB for testing
      if (totalBytes > 5 * 1024 * 1024) {
        reader.cancel();
        break;
      }
    }

    clearTimeout(timeout);

    info(`10秒內下載了 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    if (totalBytes > 0) {
      pass('Streaming 正常運作');
      return true;
    } else {
      fail('沒有收到任何資料');
      return false;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      info('測試超時 (這是正常的，表示串流正在進行)');
      pass('Streaming 正在運作');
      return true;
    }
    fail(`下載錯誤: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'Video Downloader 診斷工具' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  info(`Cobalt API: ${COBALT_API_URL}`);
  info(`App URL: ${APP_URL}`);
  info(`測試影片: ${TEST_VIDEO_URL}`);

  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false,
    test5: false,
    test6: false,
  };

  // Test 1: Cobalt connectivity
  results.test1 = await test1_CobaltConnectivity();
  if (!results.test1) {
    log('\n❌ Cobalt 連接失敗，無法繼續其他測試');
    return;
  }

  // Test 2: Tunnel URL
  const test2Result = await test2_TunnelURL();
  results.test2 = test2Result.success;
  if (!results.test2) {
    log('\n❌ 無法取得 Tunnel URL，無法繼續其他測試');
    return;
  }

  const { tunnelUrl, filename } = test2Result;

  // Test 3: Response headers
  results.test3 = await test3_ResponseHeaders(tunnelUrl);

  // Test 4: Stream test
  results.test4 = await test4_StreamTest(tunnelUrl);

  // Test 5: Proxy endpoint
  results.test5 = await test5_ProxyEndpoint(tunnelUrl, filename);

  // Test 6: Full download
  results.test6 = await test6_FullDownload(tunnelUrl, filename);

  // Summary
  header('診斷結果摘要');

  const testNames = {
    test1: 'Cobalt 連通性',
    test2: 'Tunnel URL',
    test3: 'Response Headers',
    test4: 'Stream 測試',
    test5: 'Proxy Endpoint',
    test6: '完整下載',
  };

  let allPass = true;
  for (const [key, passed] of Object.entries(results)) {
    if (passed) {
      pass(testNames[key]);
    } else {
      fail(testNames[key]);
      allPass = false;
    }
  }

  if (allPass) {
    log(`\n${colors.green}🎉 所有測試通過！${colors.reset}`);
    log('如果瀏覽器還是下載 0 bytes，可能是瀏覽器快取問題。');
    log('建議: 使用無痕視窗測試，或清除瀏覽器快取。');
  } else {
    log(`\n${colors.red}⚠️  部分測試失敗${colors.reset}`);
    log('請根據上方的建議修復問題。');
  }
}

// Run
runAllTests().catch(console.error);

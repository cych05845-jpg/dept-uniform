/* =============================================================
 *  api.js  —  後端契約層（Backend Contract Layer）
 * =============================================================
 *  這支檔案是「呈現層」與 GAS 後端之間的唯一橋樑。
 *
 *  ⚠️ 在 Claude Design 迭代視覺時，請勿更動這支檔案，
 *     也不要更動 index.html 裡對 window.GASApi.* 的呼叫名稱。
 *     Design 只負責 index.html 的外觀，串接邏輯永遠住在這裡。
 *
 *  對外公開介面（index.html 只會用到這三個）：
 *    window.GASApi.config          — 設定（填你的 /exec 網址）
 *    window.GASApi.filesToBase64() — File 物件 → base64 陣列
 *    window.GASApi.call()          — 呼叫 GAS（自動選 GET / POST）
 * ============================================================= */

(function () {
  'use strict';

  const config = {
    // GAS 部署網址（…/exec）
    endpoint: 'https://script.google.com/macros/s/AKfycbzFa45XnDTWg-v0_p0Z3ARtrHzowi_z2CGr9KdWbb0sQu5U2J0smQrygACoOzxRvTTxyQ/exec',

    // 上傳限制（沿用 ed-board 規格：圖片 + PDF，不收 PPT）
    accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'],
    maxFileBytes: 5 * 1024 * 1024,   // 單檔 5MB
    maxFiles: 10,

    // 沿用你的 api() 規則：payload 字串 ≤ 1500 走 GET，> 1500 走 POST
    getThreshold: 1500,
  };

  /* -----------------------------------------------------------
   *  filesToBase64(fileList)
   *  把 <input type="file"> 的 FileList 轉成可送進 GAS 的陣列。
   *  回傳：[{ name, type, size, dataBase64 }, ...]
   *  dataBase64 已去掉「data:...;base64,」前綴，GAS 端可直接
   *  Utilities.base64Decode() 還原成 Blob 存進 Drive。
   * --------------------------------------------------------- */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const comma = result.indexOf(',');
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataBase64: comma >= 0 ? result.slice(comma + 1) : result,
        });
      };
      reader.onerror = () => reject(new Error('讀取檔案失敗：' + file.name));
      reader.readAsDataURL(file);
    });
  }

  function filesToBase64(fileList) {
    return Promise.all(Array.from(fileList).map(fileToBase64));
  }

  /* -----------------------------------------------------------
   *  call(action, data)
   *  呼叫 GAS web app。送出格式：{ action, data }
   *
   *  小 payload（≤ 1500 字元）→ GET，參數放 query string
   *  大 payload（含附件）     → POST，text/plain（避開 CORS preflight）
   *
   *  ⚠️ 含附件或敏感（PHI）內容一律走 POST：因為帶 base64 必定
   *     超過門檻，所以不會出現在網址裡。GET 只用於小型唯讀查詢。
   *
   *  回傳：解析後的 JSON（GAS 端請固定回 JSON 字串）
   * --------------------------------------------------------- */
  async function call(action, data) {
    const payload = JSON.stringify({ action: action, data: data || {} });

    let response;
    if (payload.length <= config.getThreshold) {
      const url = config.endpoint + '?payload=' + encodeURIComponent(payload);
      response = await fetch(url, { method: 'GET' });
    } else {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
      });
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // GAS 出錯時常回傳一段 HTML 錯誤頁，這裡把它當成可讀的錯誤丟出
      throw new Error('後端回應不是 JSON，請檢查 GAS 部署：\n' + text.slice(0, 300));
    }
  }

  window.GASApi = { config, filesToBase64, call };
})();

/**
 * 應用程式配置文件
 * 統一管理前端的 API 地址和環境設定
 */

// 環境檢測
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isLocalFile = window.location.protocol === 'file:';

/**
 * 自動檢測後端 API 地址
 */
function getApiBaseUrl() {
    // 如果是本地檔案系統，使用預設的 localhost
    if (isLocalFile) {
        return 'http://localhost:8000';
    }
    
    // 如果是開發環境 (localhost)
    if (isDevelopment) {
        return 'http://localhost:8000';
    }
    
    // 生產環境：使用相同的主機名但不同的埠口
    // 例如：如果前端在 https://yourdomain.com，後端就在 https://yourdomain.com:8000
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    // 可以根據需要調整生產環境的埠口
    return `${protocol}//${hostname}:8000`;
}

/**
 * 配置物件
 */
export const config = {
    // API 設定
    api: {
        baseUrl: getApiBaseUrl(),
        timeout: 10000, // 10 秒超時
        retryAttempts: 3
    },
    
    // 環境資訊
    environment: {
        isDevelopment,
        isProduction: !isDevelopment,
        isLocalFile,
        hostname: window.location.hostname,
        protocol: window.location.protocol
    },
    
    // 遊戲設定
    game: {
        // 可以在這裡添加遊戲相關的配置
        maxRetries: 3,
        defaultTimeout: 5000
    },
    
    // Google OAuth 設定
    auth: {
        // 這些值應該與後端的設定一致
        googleClientId: '225638092115-2rjm7fr2me7k9k420v92m329sk6s3ho0.apps.googleusercontent.com'
    }
};

/**
 * 建構完整的 API URL
 * @param {string} endpoint - API 端點路徑
 * @returns {string} 完整的 API URL
 */
export function buildApiUrl(endpoint) {
    // 確保端點以 / 開頭
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    
    return config.api.baseUrl + endpoint;
}

/**
 * 檢查後端連線狀態
 * @returns {Promise<boolean>} 連線是否成功
 */
export async function checkBackendConnection() {
    try {
        const response = await fetch(buildApiUrl('/health'), {
            method: 'GET',
            timeout: config.api.timeout
        });
        
        return response.ok;
    } catch (error) {
        console.warn('後端連線檢查失敗:', error);
        return false;
    }
}

/**
 * 帶有重試機制的 fetch
 * @param {string} url - 請求 URL
 * @param {object} options - fetch 選項
 * @param {number} retries - 重試次數
 * @returns {Promise<Response>} fetch 回應
 */
export async function fetchWithRetry(url, options = {}, retries = config.api.retryAttempts) {
    try {
        const response = await fetch(url, {
            timeout: config.api.timeout,
            ...options
        });
        
        if (!response.ok && retries > 0) {
            console.warn(`請求失敗，剩餘重試次數: ${retries}`, response.status);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒後重試
            return fetchWithRetry(url, options, retries - 1);
        }
        
        return response;
    } catch (error) {
        if (retries > 0) {
            console.warn(`網路錯誤，剩餘重試次數: ${retries}`, error.message);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒後重試
            return fetchWithRetry(url, options, retries - 1);
        }
        
        throw error;
    }
}

/**
 * 顯示配置資訊（用於除錯）
 */
export function logConfigInfo() {
    console.group('🔧 應用程式配置資訊');
    console.log('API Base URL:', config.api.baseUrl);
    console.log('環境:', config.environment.isDevelopment ? '開發' : '生產');
    console.log('主機名:', config.environment.hostname);
    console.log('協定:', config.environment.protocol);
    console.log('是否為本地檔案:', config.environment.isLocalFile);
    console.groupEnd();
}

// 在開發環境下自動顯示配置資訊
if (config.environment.isDevelopment) {
    logConfigInfo();
}

// 暴露到全域範圍以便除錯
if (config.environment.isDevelopment) {
    window.pacMapConfig = {
        config,
        buildApiUrl,
        checkBackendConnection,
        fetchWithRetry,
        logConfigInfo
    };
}

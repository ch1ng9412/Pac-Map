/**
 * 主頁面調試腳本
 * 在瀏覽器控制台中執行，檢查各種狀態
 */

console.log('🔍 開始主頁面調試...');

// 1. 檢查 Google Sign-In SDK
function checkGoogleSDK() {
    console.log('\n1. 檢查 Google Sign-In SDK:');
    if (typeof google !== 'undefined' && google.accounts) {
        console.log('✅ Google Sign-In SDK 已載入');
        return true;
    } else {
        console.log('❌ Google Sign-In SDK 未載入');
        return false;
    }
}

// 2. 檢查 handleGoogleLogin 函數
function checkHandleGoogleLogin() {
    console.log('\n2. 檢查 handleGoogleLogin 函數:');
    if (typeof window.handleGoogleLogin === 'function') {
        console.log('✅ handleGoogleLogin 函數已定義');
        return true;
    } else {
        console.log('❌ handleGoogleLogin 函數未定義');
        console.log('window.handleGoogleLogin =', window.handleGoogleLogin);
        return false;
    }
}

// 3. 檢查認證相關的 DOM 元素
function checkAuthElements() {
    console.log('\n3. 檢查認證相關的 DOM 元素:');
    
    const elements = {
        'loginPrompt': document.getElementById('loginPrompt'),
        'userInfo': document.getElementById('userInfo'),
        'userAvatar': document.getElementById('userAvatar'),
        'userName': document.getElementById('userName'),
        'g_id_onload': document.getElementById('g_id_onload')
    };
    
    let allFound = true;
    for (const [name, element] of Object.entries(elements)) {
        if (element) {
            console.log(`✅ ${name} 元素存在`);
        } else {
            console.log(`❌ ${name} 元素不存在`);
            allFound = false;
        }
    }
    
    return allFound;
}

// 4. 檢查模組載入
function checkModules() {
    console.log('\n4. 檢查模組載入:');
    
    // 檢查是否有 auth.js 相關的函數
    const authFunctions = ['initAuth', 'getCurrentUser', 'isLoggedIn'];
    
    authFunctions.forEach(funcName => {
        if (typeof window[funcName] === 'function') {
            console.log(`✅ ${funcName} 函數可用`);
        } else {
            console.log(`❌ ${funcName} 函數不可用`);
        }
    });
}

// 5. 檢查後端連線
async function checkBackend() {
    console.log('\n5. 檢查後端連線:');

    // 動態檢測 API 地址
    const getApiUrl = () => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:8000';
        }
        return `${window.location.protocol}//${window.location.hostname}:8000`;
    };

    const apiUrl = getApiUrl();
    console.log('使用 API 地址:', apiUrl);

    try {
        const response = await fetch(`${apiUrl}/health`);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ 後端連線正常:', data);
            return true;
        } else {
            console.log('❌ 後端回應錯誤:', response.status);
            return false;
        }
    } catch (error) {
        console.log('❌ 後端連線失敗:', error.message);
        return false;
    }
}

// 6. 手動觸發 Google 登入（如果可能）
function testManualLogin() {
    console.log('\n6. 測試手動觸發登入:');
    
    if (typeof google !== 'undefined' && google.accounts) {
        try {
            // 嘗試手動初始化
            google.accounts.id.initialize({
                client_id: '225638092115-2rjm7fr2me7k9k420v92m329sk6s3ho0.apps.googleusercontent.com',
                callback: (response) => {
                    console.log('🎉 手動登入成功:', response);
                    if (typeof window.handleGoogleLogin === 'function') {
                        window.handleGoogleLogin(response);
                    } else {
                        console.log('⚠️ handleGoogleLogin 函數不存在，無法處理回應');
                    }
                }
            });
            
            console.log('✅ Google ID 服務已初始化，可以嘗試手動登入');
            console.log('💡 執行 google.accounts.id.prompt() 來觸發登入');
            
        } catch (error) {
            console.log('❌ 手動初始化失敗:', error.message);
        }
    } else {
        console.log('❌ Google SDK 不可用，無法手動測試');
    }
}

// 7. 檢查 localStorage 中的認證資訊
function checkStoredAuth() {
    console.log('\n7. 檢查儲存的認證資訊:');
    
    const storedUser = localStorage.getItem('pac_map_user');
    const storedToken = localStorage.getItem('pac_map_token');
    
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            console.log('✅ 找到儲存的用戶資訊:', user);
        } catch (error) {
            console.log('❌ 儲存的用戶資訊格式錯誤');
        }
    } else {
        console.log('ℹ️ 沒有儲存的用戶資訊');
    }
    
    if (storedToken) {
        console.log('✅ 找到儲存的 Token');
    } else {
        console.log('ℹ️ 沒有儲存的 Token');
    }
}

// 主要診斷函數
async function runMainPageDiagnostics() {
    console.log('🚀 開始主頁面完整診斷...');
    console.log('='.repeat(50));
    
    const results = {
        googleSDK: checkGoogleSDK(),
        handleGoogleLogin: checkHandleGoogleLogin(),
        authElements: checkAuthElements(),
        backend: await checkBackend()
    };
    
    checkModules();
    checkStoredAuth();
    testManualLogin();
    
    console.log('\n📊 診斷結果總結:');
    console.log('='.repeat(30));
    Object.entries(results).forEach(([test, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? '通過' : '失敗'}`);
    });
    
    if (results.googleSDK && !results.handleGoogleLogin) {
        console.log('\n💡 建議: Google SDK 已載入但 handleGoogleLogin 函數未定義');
        console.log('   可能是 auth.js 模組載入問題');
    }
    
    if (!results.googleSDK) {
        console.log('\n💡 建議: Google SDK 未載入，檢查網路連線或腳本載入');
    }
    
    console.log('\n🔧 如果要手動測試登入，執行: google.accounts.id.prompt()');
}

// 自動執行診斷
runMainPageDiagnostics();

// 暴露函數到全域，方便手動調用
window.debugMainPage = {
    runDiagnostics: runMainPageDiagnostics,
    checkGoogleSDK,
    checkHandleGoogleLogin,
    checkAuthElements,
    checkBackend,
    testManualLogin,
    checkStoredAuth
};

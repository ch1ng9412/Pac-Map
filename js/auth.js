/**
 * 認證系統 - 處理 Google 登入和用戶狀態管理
 */

// 後端 API 基礎 URL
const API_BASE = 'http://localhost:8000';

// 用戶狀態
let currentUser = null;
let accessToken = null;

/**
 * Google 登入回調函數
 * 這個函數會被 Google Sign-In 自動調用
 * 必須在檔案最前面定義，確保立即可用
 */
async function handleGoogleLogin(response) {
    console.log('🔑 收到 Google 登入回應', response);

    // 強制防止頁面重新載入
    const preventReload = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        return false;
    };

    // 防止頁面重新載入或重導向
    try {
        if (window.event) {
            preventReload(window.event);
        }
    } catch (e) {
        // 忽略錯誤
    }

    // 額外防止頁面重新載入
    if (typeof event !== 'undefined' && event) {
        try {
            preventReload(event);
        } catch (e) {
            // 忽略錯誤
        }
    }

    // 添加全域事件監聽器來防止重新載入
    const preventUnload = (e) => {
        e.preventDefault();
        return false;
    };

    window.addEventListener('beforeunload', preventUnload, { once: true });

    // 在處理完成後移除監聽器
    setTimeout(() => {
        window.removeEventListener('beforeunload', preventUnload);
    }, 5000);

    try {
        showAuthMessage('正在登入...', 'info');

        // 發送 ID token 到後端進行驗證
        const loginResponse = await fetch(`${API_BASE}/auth/google/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id_token: response.credential
            })
        });

        if (!loginResponse.ok) {
            throw new Error(`登入失敗: ${loginResponse.status}`);
        }

        const data = await loginResponse.json();
        console.log('✅ 登入成功:', data);

        // 儲存用戶資訊和 token
        currentUser = data.user;
        accessToken = data.access_token;

        // 儲存到 localStorage
        saveAuthToStorage();

        // 更新 UI
        updateAuthUI();

        showAuthMessage('登入成功！', 'success');

        // 確保狀態持久化
        setTimeout(() => {
            updateAuthUI();
        }, 100);

        // 防止任何可能的頁面重新載入
        return false;

    } catch (error) {
        console.error('❌ 登入錯誤:', error);
        showAuthMessage(`登入失敗: ${error.message}`, 'error');
    }
}

// 立即將函數暴露到全域範圍
window.handleGoogleLogin = handleGoogleLogin;
console.log('🔧 handleGoogleLogin 函數已暴露到全域範圍');

// 暴露其他有用的函數到全域範圍，方便調試
window.pacMapAuth = {
    handleGoogleLogin,
    getCurrentUser: () => currentUser,
    getAccessToken: () => accessToken,
    isLoggedIn: () => currentUser !== null && accessToken !== null,
    validateToken: validateStoredToken, // 手動驗證 Token
    forceLogout: logout, // 強制登出
    updateUI: updateAuthUI // 手動更新 UI
};

/**
 * 初始化認證系統
 */
export function initAuth() {
    console.log('🔐 初始化認證系統...');

    // 檢查是否有儲存的登入狀態
    loadStoredAuth();

    // 設定登出按鈕事件
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // 更新 UI
    updateAuthUI();

    // 等待 Google Sign-In 載入完成並程式化初始化
    waitForGoogleSignIn();
}

/**
 * 等待 Google Sign-In 載入完成並程式化初始化
 */
function waitForGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts) {
        console.log('✅ Google Sign-In 已載入，開始程式化初始化...');
        initializeGoogleSignIn();
        return;
    }

    // 如果還沒載入，等待一下再檢查
    setTimeout(waitForGoogleSignIn, 100);
}

/**
 * 程式化初始化 Google Sign-In
 */
function initializeGoogleSignIn() {
    try {
        console.log('🔧 程式化初始化 Google Sign-In...');

        // 使用程式化方式初始化，避免 COOP 問題
        google.accounts.id.initialize({
            client_id: '225638092115-2rjm7fr2me7k9k420v92m329sk6s3ho0.apps.googleusercontent.com',
            callback: handleGoogleLogin,
            auto_select: false,
            cancel_on_tap_outside: false,
            itp_support: true
        });

        console.log('✅ Google Sign-In 程式化初始化完成');

        // 渲染登入按鈕
        renderGoogleSignInButton();

    } catch (error) {
        console.error('❌ Google Sign-In 初始化失敗:', error);
    }
}

/**
 * 渲染 Google 登入按鈕
 */
function renderGoogleSignInButton() {
    try {
        const signInContainer = document.querySelector('.g_id_signin');
        if (signInContainer) {
            console.log('🎨 渲染 Google 登入按鈕...');

            google.accounts.id.renderButton(signInContainer, {
                type: 'standard',
                size: 'large',
                theme: 'outline',
                text: 'sign_in_with',
                shape: 'rectangular',
                logo_alignment: 'left'
            });

            console.log('✅ Google 登入按鈕渲染完成');
        } else {
            console.warn('⚠️ 找不到 .g_id_signin 容器');
        }
    } catch (error) {
        console.error('❌ 渲染登入按鈕失敗:', error);
    }
}

// 重複的函數定義已移除，使用檔案開頭的版本

/**
 * 登出功能
 */
export function logout() {
    console.log('🚪 用戶登出');
    console.trace('🔍 登出調用堆疊:'); // 追蹤是誰調用了登出

    // 清除用戶狀態
    currentUser = null;
    accessToken = null;
    
    // 清除 localStorage
    localStorage.removeItem('pac_map_user');
    localStorage.removeItem('pac_map_token');
    
    // 更新 UI
    updateAuthUI();
    
    showAuthMessage('已登出', 'info');
}

/**
 * 更新認證相關的 UI
 */
function updateAuthUI() {
    console.log('🔄 更新認證 UI，當前用戶:', currentUser);

    const loginPrompt = document.getElementById('loginPrompt');
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    if (!loginPrompt || !userInfo) {
        console.warn('⚠️ 找不到認證 UI 元素');
        return;
    }

    if (currentUser) {
        // 已登入狀態
        loginPrompt.style.display = 'none';
        userInfo.style.display = 'flex';
        
        if (userAvatar && currentUser.picture) {
            userAvatar.src = currentUser.picture;
        }
        
        if (userName) {
            userName.textContent = currentUser.name;
        }
        
        console.log('👤 用戶已登入，顯示用戶資訊:', currentUser.name);
    } else {
        // 未登入狀態
        loginPrompt.style.display = 'block';
        userInfo.style.display = 'none';

        console.log('👤 用戶未登入，顯示登入提示');
    }

    // 添加調試資訊
    console.log('🔍 UI 狀態:', {
        loginPromptVisible: loginPrompt.style.display !== 'none',
        userInfoVisible: userInfo.style.display === 'flex',
        hasCurrentUser: !!currentUser,
        hasAccessToken: !!accessToken
    });
}

/**
 * 儲存認證資訊到 localStorage
 */
function saveAuthToStorage() {
    if (currentUser && accessToken) {
        localStorage.setItem('pac_map_user', JSON.stringify(currentUser));
        localStorage.setItem('pac_map_token', accessToken);
    }
}

/**
 * 從 localStorage 載入認證資訊
 */
function loadStoredAuth() {
    try {
        const storedUser = localStorage.getItem('pac_map_user');
        const storedToken = localStorage.getItem('pac_map_token');
        
        if (storedUser && storedToken) {
            currentUser = JSON.parse(storedUser);
            accessToken = storedToken;
            
            console.log('📱 從儲存中載入用戶:', currentUser.name);

            // 暫時禁用自動 Token 驗證，避免意外登出
            // TODO: 之後可以改為更長的延遲或手動觸發
            console.log('ℹ️ 跳過自動 Token 驗證，保持登入狀態');

            // setTimeout(() => {
            //     validateStoredToken();
            // }, 30000); // 30秒後再驗證（暫時禁用）
        }
    } catch (error) {
        console.error('❌ 載入儲存的認證資訊失敗:', error);
        // 清除無效的儲存資料
        localStorage.removeItem('pac_map_user');
        localStorage.removeItem('pac_map_token');
    }
}

/**
 * 驗證儲存的 token 是否仍然有效
 */
async function validateStoredToken() {
    if (!accessToken) {
        console.log('🔍 Token 驗證：沒有 access token');
        return;
    }

    console.log('🔍 開始驗證 Token...');

    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.log(`⚠️ Token 驗證失敗：HTTP ${response.status}`);
            throw new Error(`Token 驗證失敗: ${response.status}`);
        }

        const userData = await response.json();
        console.log('✅ Token 驗證成功，用戶:', userData.name);

        // 更新用戶資訊（可能有變更）
        currentUser = userData;
        saveAuthToStorage();
        updateAuthUI();

    } catch (error) {
        console.log('⚠️ Token 驗證錯誤，清除登入狀態:', error.message);
        logout();
    }
}

/**
 * 顯示認證相關訊息
 */
function showAuthMessage(message, type = 'info') {
    // 創建訊息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `auth-message ${type}`;
    messageDiv.textContent = message;
    
    // 添加樣式
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: bold;
        z-index: 9999;
        transition: opacity 0.3s ease;
        ${type === 'success' ? 'background-color: #28a745;' : ''}
        ${type === 'error' ? 'background-color: #dc3545;' : ''}
        ${type === 'info' ? 'background-color: #17a2b8;' : ''}
    `;
    
    document.body.appendChild(messageDiv);
    
    // 3秒後自動移除
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, 3000);
}

/**
 * 取得當前用戶資訊
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * 取得存取 token
 */
export function getAccessToken() {
    return accessToken;
}

/**
 * 檢查用戶是否已登入
 */
export function isLoggedIn() {
    return currentUser !== null && accessToken !== null;
}

/**
 * 使用認證的 API 請求
 */
export async function authenticatedFetch(url, options = {}) {
    if (!accessToken) {
        throw new Error('用戶未登入');
    }
    
    const authOptions = {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${accessToken}`
        }
    };
    
    const response = await fetch(url, authOptions);
    
    // 如果 token 過期，自動登出
    if (response.status === 401) {
        logout();
        throw new Error('登入已過期，請重新登入');
    }
    
    return response;
}

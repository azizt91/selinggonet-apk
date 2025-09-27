// capacitor-push-handler.js
// Handler untuk Capacitor Push Notifications dengan Firebase

import { supabase } from './supabase-client.js';

// Import Capacitor Push Notifications
let PushNotifications;

// Cek apakah aplikasi berjalan di environment Capacitor (mobile)
const isCapacitorApp = () => {
    return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
};

// Inisialisasi push notifications
export async function initializePushNotifications(userId) {
    console.log('🔔 Initializing push notifications...');

    // Hanya jalankan jika di environment Capacitor (mobile app)
    if (!isCapacitorApp()) {
        console.log('🌐 Not running in Capacitor app, skipping push notifications setup');
        return { success: false, message: 'Not a mobile app environment' };
    }

    try {
        // Import PushNotifications dari Capacitor
        const { PushNotifications: CapacitorPushNotifications } = await import('@capacitor/push-notifications');
        PushNotifications = CapacitorPushNotifications;

        // Request permission untuk notifikasi
        const permissionResult = await requestNotificationPermission();
        if (!permissionResult.success) {
            return permissionResult;
        }

        // Register untuk push notifications
        await registerForPushNotifications(userId);

        // Setup event listeners
        setupPushNotificationListeners(userId);

        console.log('✅ Push notifications initialized successfully');
        return { success: true, message: 'Push notifications initialized' };

    } catch (error) {
        console.error('❌ Error initializing push notifications:', error);
        return { success: false, message: `Failed to initialize: ${error.message}` };
    }
}

// Request permission untuk notifikasi
async function requestNotificationPermission() {
    try {
        console.log('📱 Requesting notification permission...');

        const permission = await PushNotifications.requestPermissions();

        if (permission.receive === 'granted') {
            console.log('✅ Notification permission granted');
            return { success: true, message: 'Permission granted' };
        } else {
            console.warn('⚠️ Notification permission denied');
            return { success: false, message: 'Permission denied by user' };
        }
    } catch (error) {
        console.error('❌ Error requesting permission:', error);
        return { success: false, message: `Permission request failed: ${error.message}` };
    }
}

// Register untuk push notifications dan dapatkan token
async function registerForPushNotifications(userId) {
    try {
        console.log('🔐 Registering for push notifications...');

        // Register untuk push notifications
        await PushNotifications.register();

        console.log('✅ Successfully registered for push notifications');
    } catch (error) {
        console.error('❌ Error registering for push notifications:', error);
        throw error;
    }
}

// Setup event listeners untuk push notifications
function setupPushNotificationListeners(userId) {
    console.log('👂 Setting up push notification listeners...');

    // Listener ketika mendapat registration token
    PushNotifications.addListener('registration', async (token) => {
        console.log('🎯 Push registration success, token:', token.value);

        // Simpan token ke database Supabase
        await saveDeviceToken(userId, token.value);
    });

    // Listener untuk error registration
    PushNotifications.addListener('registrationError', (error) => {
        console.error('❌ Push registration error:', error);
    });

    // Listener ketika menerima push notification
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('📨 Push notification received:', notification);

        // Handle notification yang diterima saat app sedang terbuka
        handleNotificationReceived(notification);
    });

    // Listener ketika user tap push notification
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('👆 Push notification action performed:', notification);

        // Handle notification yang di-tap user
        handleNotificationTapped(notification);
    });

    console.log('✅ Push notification listeners setup complete');
}

// Simpan device token ke database Supabase
async function saveDeviceToken(userId, token) {
    try {
        console.log(`💾 Saving device token for user ${userId}...`);

        // Cek apakah token sudah ada untuk user ini
        const { data: existingToken, error: checkError } = await supabase
            .from('device_tokens')
            .select('id, token')
            .eq('user_id', userId)
            .eq('token', token)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }

        // Jika token sudah ada, tidak perlu simpan lagi
        if (existingToken) {
            console.log('ℹ️ Device token already exists in database');
            return { success: true, message: 'Token already exists' };
        }

        // Simpan token baru ke database
        const { data, error } = await supabase
            .from('device_tokens')
            .insert({
                user_id: userId,
                token: token,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log('✅ Device token saved successfully:', data);
        return { success: true, message: 'Token saved successfully', data };

    } catch (error) {
        console.error('❌ Error saving device token:', error);
        return { success: false, message: `Failed to save token: ${error.message}` };
    }
}

// Handle notification yang diterima saat app terbuka
function handleNotificationReceived(notification) {
    console.log('📱 Handling received notification:', notification);

    // Tampilkan notification bubble atau update UI
    showInAppNotification(notification);
}

// Handle notification yang di-tap user
function handleNotificationTapped(notification) {
    console.log('🎯 Handling tapped notification:', notification);

    // Arahkan ke halaman yang sesuai berdasarkan notification data
    const actionData = notification.notification?.data;

    if (actionData?.page) {
        // Redirect ke halaman yang ditentukan
        window.location.href = actionData.page;
    } else {
        // Default redirect ke halaman notifikasi
        window.location.href = 'notifikasi.html';
    }
}

// Tampilkan in-app notification
function showInAppNotification(notification) {
    // Buat notification bubble
    const notificationElement = document.createElement('div');
    notificationElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #4f46e5;
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(79, 70, 229, 0.3);
        z-index: 9999;
        max-width: 350px;
        animation: slideIn 0.3s ease-out;
    `;

    const title = notification.title || 'New Notification';
    const body = notification.body || '';

    notificationElement.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 20px;">🔔</div>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
                <div style="font-size: 14px; opacity: 0.9;">${body}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()"
                    style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; opacity: 0.7;">
                ×
            </button>
        </div>
    `;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notificationElement);

    // Auto remove setelah 5 detik
    setTimeout(() => {
        if (notificationElement.parentNode) {
            notificationElement.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                notificationElement.remove();
            }, 300);
        }
    }, 5000);
}

// Fungsi untuk mendapatkan device token secara manual (jika diperlukan)
export async function getDeviceToken() {
    if (!isCapacitorApp() || !PushNotifications) {
        console.log('Push notifications not available');
        return null;
    }

    try {
        // Force refresh token
        await PushNotifications.register();
        return new Promise((resolve) => {
            const listener = PushNotifications.addListener('registration', (token) => {
                resolve(token.value);
                listener.remove();
            });
        });
    } catch (error) {
        console.error('Error getting device token:', error);
        return null;
    }
}

// Fungsi untuk cleanup listeners (jika diperlukan)
export function cleanupPushNotifications() {
    if (PushNotifications) {
        PushNotifications.removeAllListeners();
        console.log('🧹 Push notification listeners cleaned up');
    }
}
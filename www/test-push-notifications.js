// test-push-notifications.js
// Script untuk testing push notifications implementation

import { initializePushNotifications, getDeviceToken } from './capacitor-push-handler.js';

// Fungsi untuk test implementasi push notifications
export async function testPushNotifications() {
    console.log('🧪 Starting push notifications test...');

    // Test 1: Cek environment
    console.log('📱 Test 1: Checking environment...');
    const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    console.log('Capacitor environment:', isCapacitor);

    if (!isCapacitor) {
        console.log('⚠️ Not running in Capacitor environment - push notifications will not work');
        return { success: false, message: 'Not in mobile app environment' };
    }

    // Test 2: Inisialisasi push notifications
    console.log('🔔 Test 2: Initializing push notifications...');
    const mockUserId = 'test-user-id';

    try {
        const result = await initializePushNotifications(mockUserId);
        console.log('Initialization result:', result);

        if (result.success) {
            console.log('✅ Push notifications initialized successfully');

            // Test 3: Coba dapatkan device token
            console.log('🔐 Test 3: Getting device token...');
            const token = await getDeviceToken();

            if (token) {
                console.log('✅ Device token obtained:', token);
                return {
                    success: true,
                    message: 'All tests passed',
                    token: token
                };
            } else {
                console.log('⚠️ Could not obtain device token');
                return {
                    success: false,
                    message: 'Token not available'
                };
            }
        } else {
            console.log('❌ Push notifications initialization failed');
            return result;
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return {
            success: false,
            message: `Test failed: ${error.message}`
        };
    }
}

// Fungsi untuk test manual dari console browser
window.testPushNotifications = testPushNotifications;

console.log('🧪 Push notifications test script loaded. Run testPushNotifications() in console to test.');
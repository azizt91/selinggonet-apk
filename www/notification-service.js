// notification-service.js
// Enhanced notification service dengan real-time dan activity logging

import { supabase } from './supabase-client.js';

// Real-time notification channel
let notificationChannel = null;

// Notification types
export const NOTIFICATION_TYPES = {
    PAYMENT_PROCESSED: 'payment_processed',
    INVOICE_CREATED: 'invoice_created',
    CUSTOMER_ADDED: 'customer_added',
    ADMIN_LOGIN: 'admin_login',
    ADMIN_ACTION: 'admin_action',
    SYSTEM_ALERT: 'system_alert'
};

/**
 * Initialize real-time notifications
 */
export function initializeRealTimeNotifications(userId, onNotificationReceived) {
    console.log('🔄 Initializing real-time notifications for user:', userId);

    // Cleanup existing channel
    if (notificationChannel) {
        supabase.removeChannel(notificationChannel);
    }

    // Create new channel for notifications
    notificationChannel = supabase
        .channel('admin_notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
        }, (payload) => {
            console.log('📨 New notification received:', payload.new);

            // Call callback function if provided
            if (onNotificationReceived) {
                onNotificationReceived(payload.new);
            }

            // Show instant notification
            showInstantNotification(payload.new);
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_activity_log'
        }, (payload) => {
            console.log('📝 New admin activity:', payload.new);

            // Show activity notification if it's from another admin
            if (payload.new.admin_id !== userId) {
                showActivityNotification(payload.new);
            }
        })
        .subscribe((status) => {
            console.log('📡 Real-time subscription status:', status);
        });

    return notificationChannel;
}

/**
 * Enhanced payment notification dengan broadcast ke semua admin
 */
export async function sendPaymentNotification(customerData, invoiceData, adminName) {
    try {
        // Log admin activity
        await logAdminActivity(
            NOTIFICATION_TYPES.PAYMENT_PROCESSED,
            `Memproses pembayaran ${customerData.full_name} - ${invoiceData.invoice_period}`,
            {
                customer_id: customerData.id,
                invoice_id: invoiceData.id,
                amount: invoiceData.amount || invoiceData.total_due
            }
        );

        // Gunakan RPC function yang sudah ada dan kompatibel
        const { data, error } = await supabase.rpc('send_payment_notification', {
            customer_name: customerData.full_name,
            customer_idpl: customerData.idpl,
            invoice_period: invoiceData.invoice_period,
            amount: invoiceData.amount || invoiceData.total_due,
            admin_name: adminName,
            customer_id: customerData.id,
            invoice_id: invoiceData.id
        });

        if (error) {
            console.error('Error sending payment notification:', error);
            return { success: false, message: `Gagal mengirim notifikasi: ${error.message}` };
        }

        if (!data.success) {
            console.error('Payment notification failed:', data.message);
            return { success: false, message: data.message };
        }

        console.log('Payment notification sent successfully:', data);

        // Show browser notification
        await showBrowserNotification(customerData, invoiceData, adminName);

        return { success: true, message: 'Notifikasi pembayaran berhasil dikirim ke semua admin.' };
    } catch (error) {
        console.error('Error in sendPaymentNotification:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

/**
 * Send invoice creation notification
 */
export async function sendInvoiceCreationNotification(adminName, invoiceCount, period) {
    try {
        await logAdminActivity(
            NOTIFICATION_TYPES.INVOICE_CREATED,
            `Membuat ${invoiceCount} tagihan untuk periode ${period}`,
            { invoice_count: invoiceCount, period: period }
        );

        const { data, error } = await supabase.rpc('send_invoice_creation_notification', {
            admin_name: adminName,
            invoice_count: invoiceCount,
            period: period
        });

        if (error) throw error;

        return { success: true, message: 'Notifikasi pembuatan tagihan berhasil dikirim.' };
    } catch (error) {
        console.error('Error sending invoice creation notification:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

/**
 * Send customer addition notification
 */
export async function sendCustomerAddedNotification(adminName, customerName) {
    try {
        await logAdminActivity(
            NOTIFICATION_TYPES.CUSTOMER_ADDED,
            `Menambahkan pelanggan baru: ${customerName}`,
            { customer_name: customerName }
        );

        const { data, error } = await supabase.rpc('send_customer_added_notification', {
            admin_name: adminName,
            customer_name: customerName
        });

        if (error) throw error;

        return { success: true, message: 'Notifikasi pelanggan baru berhasil dikirim.' };
    } catch (error) {
        console.error('Error sending customer added notification:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

/**
 * Send admin login notification
 */
export async function sendAdminLoginNotification(adminName) {
    try {
        await logAdminActivity(
            NOTIFICATION_TYPES.ADMIN_LOGIN,
            `Login ke sistem`,
            { login_time: new Date().toISOString() }
        );

        const { data, error } = await supabase.rpc('send_admin_login_notification', {
            admin_name: adminName
        });

        if (error) throw error;

        return { success: true, message: 'Notifikasi login berhasil dikirim.' };
    } catch (error) {
        console.error('Error sending login notification:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

/**
 * Log admin activity untuk audit trail
 */
export async function logAdminActivity(action, description, additionalData = {}) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.rpc('log_admin_activity', {
            admin_id: user.id,
            action: action,
            description: description,
            additional_data: additionalData,
            activity_timestamp: new Date().toISOString()
        });

        if (error) {
            console.error('Error logging admin activity:', error);
        } else {
            console.log('📝 Admin activity logged:', action, description);
        }
    } catch (error) {
        console.error('Error in logAdminActivity:', error);
    }
}

/**
 * Show instant notification popup
 */
function showInstantNotification(notification) {
    // Create notification popup
    const popup = document.createElement('div');
    popup.className = 'fixed top-4 right-4 z-[9999] max-w-sm bg-white rounded-lg shadow-xl border border-gray-200 transform translate-x-full transition-transform duration-300 ease-out';

    // Get notification icon based on type
    const getNotificationIcon = (type) => {
        switch(type) {
            case NOTIFICATION_TYPES.PAYMENT_PROCESSED: return '💰';
            case NOTIFICATION_TYPES.INVOICE_CREATED: return '📄';
            case NOTIFICATION_TYPES.CUSTOMER_ADDED: return '👥';
            case NOTIFICATION_TYPES.ADMIN_LOGIN: return '🔐';
            case NOTIFICATION_TYPES.ADMIN_ACTION: return '⚡';
            default: return '🔔';
        }
    };

    popup.innerHTML = `
        <div class="p-4">
            <div class="flex items-start gap-3">
                <div class="text-2xl">${getNotificationIcon(notification.type)}</div>
                <div class="flex-1">
                    <h4 class="font-semibold text-gray-900 text-sm">${notification.title}</h4>
                    <p class="text-gray-600 text-xs mt-1">${notification.body}</p>
                    <p class="text-gray-400 text-xs mt-2">Baru saja</p>
                </div>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.3 5.71a1 1 0 0 0-1.42 0L12 10.59 7.12 5.71A1 1 0 1 0 5.7 7.12L10.59 12 5.7 16.88a1 1 0 1 0 1.42 1.42L12 13.41l4.88 4.88a1 1 0 0 0 1.42-1.42L13.41 12l4.88-4.88a1 1 0 0 0 0-1.41z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Animate in
    setTimeout(() => {
        popup.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove after 5 seconds
    setTimeout(() => {
        popup.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (popup.parentNode) popup.remove();
        }, 300);
    }, 5000);

    // Update badge count
    updateBadgeInstantly();
}

/**
 * Show activity notification for admin actions
 */
function showActivityNotification(activity) {
    console.log('👀 Other admin activity:', activity);

    // Show subtle notification for admin activities
    const activityPopup = document.createElement('div');
    activityPopup.className = 'fixed bottom-4 right-4 z-[9999] max-w-sm bg-blue-50 rounded-lg shadow-lg border border-blue-200 transform translate-y-full transition-transform duration-300 ease-out';

    activityPopup.innerHTML = `
        <div class="p-3">
            <div class="flex items-center gap-2">
                <div class="text-blue-600">⚡</div>
                <div class="flex-1">
                    <p class="text-blue-800 text-xs font-medium">${activity.description}</p>
                    <p class="text-blue-600 text-xs">Admin sedang aktif</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(activityPopup);

    // Animate in
    setTimeout(() => {
        activityPopup.style.transform = 'translateY(0)';
    }, 100);

    // Auto remove after 3 seconds
    setTimeout(() => {
        activityPopup.style.transform = 'translateY(100%)';
        setTimeout(() => {
            if (activityPopup.parentNode) activityPopup.remove();
        }, 300);
    }, 3000);
}

/**
 * Update badge count instantly
 */
async function updateBadgeInstantly() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const unreadCount = await getUnreadNotificationCount(user.id);
        const badge = document.getElementById('notification-badge');

        if (badge) {
            if (unreadCount > 0) {
                badge.classList.remove('hidden');
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();

                // Add animation
                badge.style.animation = 'pulse 0.5s ease-in-out';
                setTimeout(() => {
                    badge.style.animation = '';
                }, 500);
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error updating badge instantly:', error);
    }
}

/**
 * Menampilkan notifikasi browser (PWA notification)
 */
async function showBrowserNotification(customerData, invoiceData, adminName) {
    // Cek apakah browser mendukung notifikasi
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('Browser tidak mendukung notifikasi PWA');
        return;
    }

    // Cek permission
    if (Notification.permission === 'denied') {
        console.log('Notifikasi ditolak oleh user');
        return;
    }

    if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Permission notifikasi tidak diberikan');
            return;
        }
    }

    try {
        const amount = new Intl.NumberFormat('id-ID', { 
            style: 'currency', 
            currency: 'IDR' 
        }).format(invoiceData.amount || invoiceData.total_due || 0);

        const title = '🔔 Pembayaran Lunas Diterima';
        const options = {
            body: `Dari ${customerData.full_name} (${amount}) untuk periode ${invoiceData.invoice_period}. Diproses oleh ${adminName}.`,
            icon: 'assets/logo_192x192.png',
            badge: 'assets/logo_192x192.png',
            vibrate: [200, 100, 200],
            tag: `payment-${invoiceData.id}`,
            requireInteraction: true, // Notifikasi tidak hilang otomatis
            actions: [
                {
                    action: 'view',
                    title: 'Lihat Detail',
                    icon: 'assets/logo_192x192.png'
                }
            ]
        };

        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        
        console.log('Browser notification displayed successfully');
    } catch (error) {
        console.error('Error showing browser notification:', error);
    }
}

/**
 * Mendapatkan jumlah notifikasi yang belum dibaca untuk user
 */
export async function getUnreadNotificationCount(userId) {
    try {
        const { data, error } = await supabase.rpc('get_unread_notification_count', {
            user_id_param: userId
        });

        if (error) {
            console.error('Error getting notification count:', error);
            return 0;
        }

        return data || 0;
    } catch (error) {
        console.error('Error in getUnreadNotificationCount:', error);
        return 0;
    }
}

/**
 * Menandai notifikasi sebagai sudah dibaca
 */
export async function markNotificationAsRead(notificationId, userId) {
    try {
        const { data, error } = await supabase.rpc('mark_notification_read', {
            notification_id_param: notificationId,
            user_id_param: userId
        });

        if (error) {
            console.error('Error marking notification as read:', error);
            return false;
        }

        return data || true;
    } catch (error) {
        console.error('Error in markNotificationAsRead:', error);
        return false;
    }
}

# Enhanced Notification System Documentation

## Overview
Sistem notifikasi enhanced ini dirancang untuk meningkatkan koordinasi antar admin dengan real-time notifications, activity logging, dan broadcast system.

## Fitur Utama

### 1. Real-time Notifications
- Menggunakan Supabase Realtime untuk notifikasi instant
- Notifikasi muncul otomatis tanpa perlu refresh halaman
- Popup notifikasi dengan animasi slide-in
- Badge counter yang update secara real-time

### 2. Activity Logging
- Track semua aktivitas admin untuk audit trail
- Log tersimpan dengan timestamp dan detail tambahan
- Dapat digunakan untuk analisis aktivitas admin

### 3. Broadcast System
- Notifikasi otomatis ke semua admin saat ada aktivitas penting
- Support berbagai jenis notifikasi (pembayaran, invoice, customer baru, dll)

### 4. Multiple Notification Types
- `PAYMENT_PROCESSED`: Pembayaran berhasil diproses
- `INVOICE_CREATED`: Invoice bulanan berhasil dibuat
- `CUSTOMER_ADDED`: Customer baru ditambahkan
- `ADMIN_LOGIN`: Admin login ke sistem
- `ADMIN_ACTION`: Aktivitas admin lainnya
- `SYSTEM_ALERT`: Alert sistem

## File-file yang Diupdate

### 1. notification-service.js
**Fungsi Utama:**
- `initializeRealTimeNotifications()`: Setup real-time subscriptions
- `sendPaymentNotification()`: Kirim notifikasi pembayaran
- `sendInvoiceCreationNotification()`: Notifikasi pembuatan invoice
- `sendCustomerAddedNotification()`: Notifikasi customer baru
- `sendAdminLoginNotification()`: Notifikasi login admin
- `logAdminActivity()`: Log aktivitas admin
- `showInstantNotification()`: Tampilkan popup notifikasi
- `updateBadgeInstantly()`: Update badge counter

### 2. dashboard.js
**Update:**
- Import notification service functions
- Initialize real-time notifications saat dashboard load
- Setup callback untuk handle notifikasi baru
- Auto-send login notification ke admin lain

### 3. tagihan.js
**Update:**
- Import notification service
- Send payment notification saat pembayaran berhasil
- Send invoice creation notification saat buat tagihan bulanan
- Integration dengan WhatsApp notification yang sudah ada

### 4. pelanggan.js
**Update:**
- Import notification service
- Send customer added notification saat tambah customer baru

## Database Schema

### Tabel notifications
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabel notification_reads
```sql
CREATE TABLE notification_reads (
    id UUID PRIMARY KEY,
    notification_id UUID REFERENCES notifications(id),
    user_id UUID REFERENCES profiles(id),
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(notification_id, user_id)
);
```

### Tabel admin_activity_log
```sql
CREATE TABLE admin_activity_log (
    id UUID PRIMARY KEY,
    admin_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    additional_data JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

## RPC Functions

### broadcast_to_all_admins()
Kirim notifikasi ke semua admin yang terdaftar.

**Parameters:**
- `notification_type`: Jenis notifikasi
- `title`: Judul notifikasi
- `message`: Isi pesan
- `data`: Data tambahan (JSONB)

### log_admin_activity()
Log aktivitas admin untuk audit trail.

**Parameters:**
- `admin_id`: ID admin
- `action`: Jenis aksi
- `description`: Deskripsi aktivitas
- `additional_data`: Data tambahan
- `timestamp`: Waktu aktivitas

### get_user_notifications()
Ambil notifikasi user dengan status read/unread.

**Parameters:**
- `user_id_param`: ID user
- `limit_param`: Batas jumlah data (default: 50)
- `offset_param`: Offset untuk pagination (default: 0)

### mark_notification_read()
Mark notifikasi sebagai sudah dibaca.

**Parameters:**
- `notification_id_param`: ID notifikasi
- `user_id_param`: ID user

### get_unread_notification_count()
Hitung jumlah notifikasi yang belum dibaca.

**Parameters:**
- `user_id_param`: ID user

## Setup Instructions

### 1. Install Database Schema
```sql
-- Jalankan file-file SQL berikut di Supabase SQL Editor:
-- 1. notification_tables.sql (buat tabel)
-- 2. notification_functions.sql (buat RPC functions)
```

### 2. Enable Realtime
Di Supabase Dashboard:
1. Pergi ke Database > Replication
2. Enable realtime untuk tabel `notifications` dan `admin_activity_log`

### 3. Configure Row Level Security (RLS)
RLS policies sudah included dalam script SQL untuk keamanan data.

## Usage Examples

### Kirim Notifikasi Pembayaran
```javascript
import { sendPaymentNotification } from './notification-service.js';

const result = await sendPaymentNotification(customerData, invoiceData, adminName);
if (result.success) {
    console.log('Notification sent successfully');
}
```

### Initialize Real-time Notifications
```javascript
import { initializeRealTimeNotifications } from './notification-service.js';

const channel = initializeRealTimeNotifications(userId, (notification) => {
    console.log('New notification received:', notification);
    // Handle notification display
});
```

### Log Admin Activity
```javascript
import { logAdminActivity } from './notification-service.js';

await logAdminActivity(
    'PAYMENT_PROCESSED',
    'Memproses pembayaran customer ABC',
    { customer_id: 'uuid', amount: 100000 }
);
```

## Best Practices

### 1. Error Handling
Selalu wrap notification calls dalam try-catch untuk mencegah error notification mengganggu flow utama:

```javascript
try {
    await sendPaymentNotification(customerData, invoiceData, adminName);
} catch (error) {
    console.error('Notification error:', error);
    // Continue with main flow
}
```

### 2. Performance
- Notifikasi dikirim asynchronous agar tidak menghambat UI
- Database menggunakan indexes untuk query performa
- Pagination untuk notifikasi history

### 3. User Experience
- Popup notifikasi auto-hide setelah 5 detik
- Badge counter real-time tanpa refresh
- Visual feedback untuk notification state

## Monitoring & Maintenance

### Cleanup Old Notifications
Function `cleanup_old_notifications()` tersedia untuk maintenance:

```sql
SELECT cleanup_old_notifications(30); -- Hapus notifikasi > 30 hari
```

### Monitor Activity
Query untuk monitoring admin activity:

```sql
SELECT * FROM admin_activity_log
WHERE timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

### Check Notification Performance
```sql
SELECT
    type,
    COUNT(*) as total,
    AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds
FROM notifications
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY type;
```

## Troubleshooting

### Real-time Tidak Berfungsi
1. Pastikan Supabase Realtime enabled untuk tabel notifications
2. Check browser console untuk error connection
3. Verify RLS policies tidak memblokir akses

### Notifikasi Tidak Muncul
1. Check network tab untuk failed API calls
2. Verify user permissions dan RLS policies
3. Check browser notification permissions

### Performance Issues
1. Monitor database query performance
2. Consider pagination untuk notification history
3. Implement notification cleanup schedule

## Future Enhancements

### Planned Features
1. Email notification integration
2. Push notification untuk mobile app
3. Notification preferences per user
4. Notification templates system
5. Analytics dashboard untuk notification metrics
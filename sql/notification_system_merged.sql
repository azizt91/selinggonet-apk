-- ========================================
-- ENHANCED NOTIFICATION SYSTEM - MERGED VERSION
-- ========================================
--
-- Script ini menggabungkan sistem notifikasi lama dengan fitur baru:
-- 1. Mempertahankan tabel notifications yang sudah ada
-- 2. Menambah kolom baru untuk fitur enhanced
-- 3. Menambah tabel admin_activity_log
-- 4. Menambah functions untuk broadcast dan activity logging
--
-- CARA PENGGUNAAN:
-- 1. Backup database terlebih dahulu
-- 2. Jalankan script ini di Supabase SQL Editor
-- 3. Tidak akan menghapus data yang sudah ada
-- ========================================

-- ========================================
-- UPGRADE EXISTING NOTIFICATIONS TABLE
-- ========================================

-- Tambah kolom baru ke tabel notifications yang sudah ada
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update index untuk kolom type yang baru
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- ========================================
-- CREATE ADMIN ACTIVITY LOG TABLE
-- ========================================

-- Tabel untuk activity log admin (baru)
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    additional_data JSONB DEFAULT '{}'::JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes untuk admin_activity_log
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_id ON public.admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_timestamp ON public.admin_activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_action ON public.admin_activity_log(action);

-- ========================================
-- ENHANCED FUNCTIONS - COMPATIBLE WITH EXISTING SYSTEM
-- ========================================

-- Function untuk broadcast ke semua admin (menggunakan struktur tabel lama)
CREATE OR REPLACE FUNCTION broadcast_to_all_admins(
    notification_type TEXT,
    title TEXT,
    message TEXT,
    data JSONB DEFAULT '{}'::JSONB,
    url TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
    notification_id TEXT;
BEGIN
    -- Generate unique notification ID
    notification_id := gen_random_uuid()::TEXT;

    -- Insert notification untuk semua admin menggunakan struktur lama
    INSERT INTO public.notifications (
        id,
        title,
        body,
        recipient_role,
        recipient_user_id,
        url,
        type,
        data,
        created_at
    ) VALUES (
        notification_id::UUID,
        title,
        message,
        'ADMIN',  -- Kirim ke semua admin
        NULL,     -- Tidak spesifik user
        url,
        notification_type,
        data,
        NOW()
    );

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk log admin activity
CREATE OR REPLACE FUNCTION log_admin_activity(
    admin_id UUID,
    action TEXT,
    description TEXT,
    additional_data JSONB DEFAULT '{}'::JSONB,
    activity_timestamp TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
BEGIN
    -- Validasi bahwa user yang memanggil adalah authenticated admin
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Access denied: User not authenticated';
    END IF;

    -- Validasi bahwa admin_id sesuai dengan user yang login atau user adalah admin
    IF admin_id != auth.uid() THEN
        DECLARE
            current_user_role TEXT;
        BEGIN
            SELECT p.role INTO current_user_role
            FROM public.profiles p
            WHERE p.id = auth.uid();

            IF current_user_role != 'ADMIN' THEN
                RAISE EXCEPTION 'Access denied: Cannot log activity for other users';
            END IF;
        END;
    END IF;

    INSERT INTO public.admin_activity_log (
        admin_id,
        action,
        description,
        additional_data,
        timestamp
    ) VALUES (
        admin_id,
        action,
        description,
        additional_data,
        activity_timestamp
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function untuk mendapatkan unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(
    user_id_param UUID
) RETURNS INTEGER AS $$
DECLARE
    unread_count INTEGER;
    current_user_role TEXT;
BEGIN
    -- Validasi authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Access denied: User not authenticated';
    END IF;

    -- Ambil role user dari tabel profiles
    SELECT p.role INTO current_user_role
    FROM public.profiles p
    WHERE p.id = user_id_param;

    -- Jika user tidak ditemukan, return 0
    IF current_user_role IS NULL THEN
        RETURN 0;
    END IF;

    -- Hitung notifikasi yang belum dibaca
    SELECT COUNT(*)
    INTO unread_count
    FROM public.notifications n
    LEFT JOIN public.notification_reads nr ON n.id = nr.notification_id AND nr.user_id = user_id_param
    WHERE
        -- Filter notifikasi yang relevan untuk user
        (
            (n.recipient_role IS NULL AND n.recipient_user_id IS NULL)
            OR
            (n.recipient_role = current_user_role AND n.recipient_user_id IS NULL)
            OR
            (n.recipient_user_id = user_id_param)
        )
        AND nr.notification_id IS NULL; -- Belum dibaca

    RETURN COALESCE(unread_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk mark notification as read (enhanced)
CREATE OR REPLACE FUNCTION mark_notification_read(
    notification_id_param UUID,
    user_id_param UUID
) RETURNS BOOLEAN AS $$
BEGIN
    -- Validasi authentication
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    -- Validasi bahwa user hanya bisa mark notifikasi mereka sendiri
    IF user_id_param != auth.uid() THEN
        DECLARE
            current_user_role TEXT;
        BEGIN
            SELECT p.role INTO current_user_role
            FROM public.profiles p
            WHERE p.id = auth.uid();

            IF current_user_role != 'ADMIN' THEN
                RETURN false;
            END IF;
        END;
    END IF;

    INSERT INTO public.notification_reads (notification_id, user_id, read_at)
    VALUES (notification_id_param, user_id_param, NOW())
    ON CONFLICT (notification_id, user_id) DO NOTHING;

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- ENHANCED NOTIFICATION FUNCTIONS
-- ========================================

-- Function untuk kirim notifikasi pembayaran (enhanced version)
CREATE OR REPLACE FUNCTION send_payment_notification(
    customer_name TEXT,
    customer_idpl TEXT,
    invoice_period TEXT,
    amount NUMERIC,
    admin_name TEXT,
    customer_id UUID DEFAULT NULL,
    invoice_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    notification_id TEXT;
    formatted_amount TEXT;
    notification_data JSONB;
BEGIN
    -- Validasi input
    IF customer_name IS NULL OR customer_name = '' THEN
        RETURN '{"success": false, "message": "Customer name cannot be empty"}'::JSONB;
    END IF;

    IF amount IS NULL OR amount <= 0 THEN
        RETURN '{"success": false, "message": "Amount must be greater than 0"}'::JSONB;
    END IF;

    -- Format amount ke Rupiah
    formatted_amount := 'Rp ' || to_char(amount, 'FM999,999,999');

    -- Prepare notification data
    notification_data := jsonb_build_object(
        'customer_name', customer_name,
        'customer_idpl', customer_idpl,
        'invoice_period', invoice_period,
        'amount', amount,
        'admin_name', admin_name,
        'customer_id', customer_id,
        'invoice_id', invoice_id
    );

    -- Broadcast ke semua admin
    notification_id := broadcast_to_all_admins(
        'payment_processed',
        '💰 Pembayaran Lunas Diterima',
        'Dari ' || customer_name || ' (' || customer_idpl || ') sebesar ' || formatted_amount || ' untuk periode ' || invoice_period || '. Diproses oleh ' || admin_name || '.',
        notification_data,
        '/tagihan.html?status=paid'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Payment notification sent successfully',
        'notification_id', notification_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Error: ' || SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk kirim notifikasi pembuatan invoice
CREATE OR REPLACE FUNCTION send_invoice_creation_notification(
    admin_name TEXT,
    invoice_count INTEGER,
    period TEXT
) RETURNS JSONB AS $$
DECLARE
    notification_id TEXT;
    notification_data JSONB;
BEGIN
    -- Prepare notification data
    notification_data := jsonb_build_object(
        'admin_name', admin_name,
        'invoice_count', invoice_count,
        'period', period
    );

    -- Broadcast ke semua admin
    notification_id := broadcast_to_all_admins(
        'invoice_created',
        '📄 Tagihan Bulanan Dibuat',
        admin_name || ' telah membuat ' || invoice_count || ' tagihan untuk periode ' || period || '.',
        notification_data,
        '/tagihan.html'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Invoice creation notification sent successfully',
        'notification_id', notification_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Error: ' || SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk kirim notifikasi customer baru
CREATE OR REPLACE FUNCTION send_customer_added_notification(
    admin_name TEXT,
    customer_name TEXT
) RETURNS JSONB AS $$
DECLARE
    notification_id TEXT;
    notification_data JSONB;
BEGIN
    -- Prepare notification data
    notification_data := jsonb_build_object(
        'admin_name', admin_name,
        'customer_name', customer_name
    );

    -- Broadcast ke semua admin
    notification_id := broadcast_to_all_admins(
        'customer_added',
        '👥 Pelanggan Baru Ditambahkan',
        admin_name || ' telah menambahkan pelanggan baru: ' || customer_name || '.',
        notification_data,
        '/pelanggan.html'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Customer added notification sent successfully',
        'notification_id', notification_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Error: ' || SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk kirim notifikasi login admin
CREATE OR REPLACE FUNCTION send_admin_login_notification(
    admin_name TEXT
) RETURNS JSONB AS $$
DECLARE
    notification_id TEXT;
    notification_data JSONB;
BEGIN
    -- Prepare notification data
    notification_data := jsonb_build_object(
        'admin_name', admin_name,
        'login_time', NOW()
    );

    -- Broadcast ke semua admin
    notification_id := broadcast_to_all_admins(
        'admin_login',
        '🔐 Admin Login',
        admin_name || ' telah login ke sistem.',
        notification_data,
        '/dashboard.html'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Admin login notification sent successfully',
        'notification_id', notification_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Error: ' || SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- RLS POLICIES FOR NEW TABLE
-- ========================================

-- Enable RLS untuk admin_activity_log
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Policies untuk admin_activity_log
CREATE POLICY "Admins can view all activity logs" ON public.admin_activity_log
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    )
);

CREATE POLICY "Admins can insert their own activity" ON public.admin_activity_log
FOR INSERT WITH CHECK (
    auth.uid() = admin_id AND
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    )
);

-- ========================================
-- GRANT PERMISSIONS FOR NEW FUNCTIONS
-- ========================================

-- Grant permissions untuk functions baru
GRANT EXECUTE ON FUNCTION broadcast_to_all_admins TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_activity TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION send_payment_notification TO authenticated;
GRANT EXECUTE ON FUNCTION send_invoice_creation_notification TO authenticated;
GRANT EXECUTE ON FUNCTION send_customer_added_notification TO authenticated;
GRANT EXECUTE ON FUNCTION send_admin_login_notification TO authenticated;

-- Grant permissions untuk tabel admin_activity_log
GRANT SELECT ON public.admin_activity_log TO authenticated;
GRANT INSERT ON public.admin_activity_log TO authenticated;

-- Revoke dari anon untuk security
REVOKE ALL ON public.admin_activity_log FROM anon;
REVOKE EXECUTE ON FUNCTION broadcast_to_all_admins FROM anon;
REVOKE EXECUTE ON FUNCTION log_admin_activity FROM anon;
REVOKE EXECUTE ON FUNCTION send_payment_notification FROM anon;
REVOKE EXECUTE ON FUNCTION send_invoice_creation_notification FROM anon;
REVOKE EXECUTE ON FUNCTION send_customer_added_notification FROM anon;
REVOKE EXECUTE ON FUNCTION send_admin_login_notification FROM anon;

-- ========================================
-- UPDATE FUNCTION FOR AUTO-UPDATED_AT
-- ========================================

-- Function untuk auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update updated_at pada notifications
DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- CLEANUP OLD FUNCTIONS (OPTIONAL)
-- ========================================

-- Function untuk cleanup notifikasi lama (maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_notifications(
    days_to_keep INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Hanya admin yang bisa menjalankan cleanup
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only admins can cleanup notifications';
    END IF;

    WITH deleted AS (
        DELETE FROM public.notifications
        WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_old_notifications TO authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_old_notifications FROM anon;
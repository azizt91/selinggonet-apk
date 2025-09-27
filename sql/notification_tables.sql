-- notification_tables.sql
-- Tabel-tabel untuk sistem notifikasi enhanced

-- Tabel untuk menyimpan notifikasi
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel untuk tracking notifikasi yang sudah dibaca
CREATE TABLE IF NOT EXISTS notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(notification_id, user_id)
);

-- Tabel untuk activity log admin
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    additional_data JSONB DEFAULT '{}'::JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes untuk performa
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification_id ON notification_reads(notification_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_id ON admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_timestamp ON admin_activity_log(timestamp DESC);

-- Enable RLS (Row Level Security) - opsional jika diperlukan
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Policies untuk notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert notifications for any user"
ON notifications FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    )
);

-- Policies untuk notification_reads
CREATE POLICY "Users can manage their own notification reads"
ON notification_reads FOR ALL
USING (auth.uid() = user_id);

-- Policies untuk admin_activity_log
CREATE POLICY "Admins can view all activity logs"
ON admin_activity_log FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    )
);

CREATE POLICY "Admins can insert their own activity"
ON admin_activity_log FOR INSERT
WITH CHECK (
    auth.uid() = admin_id AND
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    )
);

-- Function untuk auto-update updated_at pada notifications
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update updated_at
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
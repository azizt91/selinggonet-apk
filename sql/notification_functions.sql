-- notification_functions.sql
-- Enhanced notification functions untuk admin coordination

-- Function untuk broadcast notifikasi ke semua admin
CREATE OR REPLACE FUNCTION broadcast_to_all_admins(
    notification_type TEXT,
    title TEXT,
    message TEXT,
    data JSONB DEFAULT '{}'::JSONB
) RETURNS TEXT AS $$
DECLARE
    admin_record RECORD;
    notification_id TEXT;
BEGIN
    -- Generate unique notification ID
    notification_id := gen_random_uuid()::TEXT;

    -- Insert notification untuk setiap admin
    FOR admin_record IN
        SELECT id FROM profiles WHERE role = 'ADMIN'
    LOOP
        INSERT INTO notifications (
            id,
            user_id,
            type,
            title,
            body,
            data,
            created_at,
            is_read
        ) VALUES (
            gen_random_uuid(),
            admin_record.id,
            notification_type,
            title,
            message,
            data,
            NOW(),
            false
        );
    END LOOP;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk log admin activity
CREATE OR REPLACE FUNCTION log_admin_activity(
    admin_id UUID,
    action TEXT,
    description TEXT,
    additional_data JSONB DEFAULT '{}'::JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
BEGIN
    INSERT INTO admin_activity_log (
        id,
        admin_id,
        action,
        description,
        additional_data,
        timestamp
    ) VALUES (
        gen_random_uuid(),
        admin_id,
        action,
        description,
        additional_data,
        timestamp
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk get user notifications dengan pagination
CREATE OR REPLACE FUNCTION get_user_notifications(
    user_id_param UUID,
    limit_param INTEGER DEFAULT 50,
    offset_param INTEGER DEFAULT 0
) RETURNS TABLE (
    id UUID,
    type TEXT,
    title TEXT,
    body TEXT,
    data JSONB,
    created_at TIMESTAMPTZ,
    is_read BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.type,
        n.title,
        n.body,
        n.data,
        n.created_at,
        CASE
            WHEN nr.notification_id IS NOT NULL THEN true
            ELSE false
        END as is_read
    FROM notifications n
    LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = user_id_param
    WHERE n.user_id = user_id_param
    ORDER BY n.created_at DESC
    LIMIT limit_param
    OFFSET offset_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
    notification_id_param UUID,
    user_id_param UUID
) RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    VALUES (notification_id_param, user_id_param, NOW())
    ON CONFLICT (notification_id, user_id) DO NOTHING;

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(
    user_id_param UUID
) RETURNS INTEGER AS $$
DECLARE
    unread_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO unread_count
    FROM notifications n
    LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = user_id_param
    WHERE n.user_id = user_id_param
    AND nr.notification_id IS NULL;

    RETURN COALESCE(unread_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk cleanup old notifications (opsional untuk maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_notifications(
    days_to_keep INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM notifications
        WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
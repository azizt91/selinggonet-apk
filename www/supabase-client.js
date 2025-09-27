import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://ioirrikteqrpptolbjme.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvaXJyaWt0ZXFycHB0b2xiam1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5ODY1NjksImV4cCI6MjA3MzU2MjU2OX0.UTayRKVg420zM2v2BHfVmmHMm8V1rx2cbZb1Ud_WDsw';

// Configure Supabase with persistent session
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        // Enable persistent sessions across browser sessions
        persistSession: true,
        // Store session in localStorage (survives browser restart)
        storage: window.localStorage,
        // Automatically detect and refresh sessions
        autoRefreshToken: true,
        // Session will be refreshed 60 seconds before expiry
        detect: true
    }
});

// Debug: Log session state on initialization
supabase.auth.onAuthStateChange((event, session) => {
    console.log('🔐 Auth state changed:', event, session?.user?.email);

    if (event === 'SIGNED_IN') {
        console.log('✅ User signed in successfully');
    } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
    } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed automatically');
    }
});

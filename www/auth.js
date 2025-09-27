// auth.js (Supabase version with Persistent Login)
import { supabase } from './supabase-client.js';

// --- Silent Session Check ---
// Checks for an active session WITHOUT redirecting or showing alerts
// Returns the user object if a session exists, null if not
export async function checkAuthSilent() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Error getting session:', error.message);
            return null;
        }

        if (!session) {
            return null;
        }

        return session.user;
    } catch (error) {
        console.error('Silent auth check error:', error);
        return null;
    }
}

// --- Session Check with Redirect ---
// Checks for an active session. If none, redirects to login.
// Returns the user object if a session exists.
export async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error('Error getting session:', error.message);
        window.location.href = 'index.html';
        return null;
    }

    if (!session) {
        // Remove annoying alert, just redirect silently
        window.location.href = 'index.html';
        return null;
    }

    return session.user;
}

// --- Auto Login Check ---
// Check if user is already logged in and redirect appropriately
export async function checkAutoLogin() {
    const user = await checkAuthSilent();

    if (user) {
        // User is logged in, redirect based on their role
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (error || !profile) {
                console.error('Error fetching profile for auto-login:', error);
                return false;
            }

            // Redirect based on role
            if (profile.role === 'ADMIN') {
                window.location.href = 'dashboard.html';
            } else if (profile.role === 'USER') {
                window.location.href = 'pelanggan_dashboard.html';
            }
            return true;
        } catch (error) {
            console.error('Auto-login error:', error);
            return false;
        }
    }

    return false;
}

// --- Role-specific Access Control ---
// Checks if the logged-in user has the required role.
export async function requireRole(requiredRole) {
    const user = await checkAuth();
    if (!user) return null; // Stop if not authenticated

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (error || !profile) {
            throw new Error('Gagal memverifikasi peran pengguna.');
        }

        if (profile.role !== requiredRole) {
            // Remove annoying alert, just redirect silently
            window.location.href = profile.role === 'ADMIN' ? 'dashboard.html' : 'pelanggan_dashboard.html';
            return null;
        }

        return user; // Return user object if authorized
    } catch (error) {
        console.error('Authorization Error:', error.message);
        await supabase.auth.signOut();
        window.location.href = 'index.html';
        return null;
    }
}


// --- Logout Function ---
// Initializes logout functionality for a given button ID.
export function initLogout(buttonId) {
    const logoutBtn = document.getElementById(buttonId);
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Yakin ingin logout?')) {
                console.log('🚪 Logging out user...');

                try {
                    // Clear Supabase session
                    const { error } = await supabase.auth.signOut();

                    if (error) {
                        console.error('Error logging out:', error.message);
                        alert('Gagal untuk logout. Silakan coba lagi.');
                        return;
                    }

                    // Clear all browser storage
                    sessionStorage.clear();
                    localStorage.removeItem('supabase.auth.token');

                    // Clear any other auth-related localStorage items
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('sb-') || key.includes('supabase')) {
                            localStorage.removeItem(key);
                        }
                    });

                    console.log('✅ Logout successful');

                    // Redirect to login page
                    window.location.href = 'index.html';

                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Gagal untuk logout. Silakan coba lagi.');
                }
            }
        });
    }
}
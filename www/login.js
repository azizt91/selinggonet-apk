import { supabase } from './supabase-client.js';
// 1. Tambahkan import untuk plugin biometrik
import { NativeBiometric } from 'capacitor-native-biometric';

document.addEventListener('DOMContentLoaded', async () => { // Jadikan async
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    // --- KODE BIOMETRIK DILETAKKAN DI SINI ---
    try {
        // Cek apakah fitur biometrik tersedia di perangkat ini
        const available = await NativeBiometric.isAvailable();

        if (available) {
            // Cek apakah ada kredensial yang tersimpan
            const credentials = await NativeBiometric.getCredentials({
                server: "com.selinggonet.ispmgmt",
            });

            // Jika ada kredensial (refresh token), minta verifikasi sidik jari
            if (credentials.password) {
                await NativeBiometric.verifyIdentity({
                    reason: "Login ke Selinggonet",
                    title: "Login Cepat",
                    subtitle: "Gunakan sidik jari Anda",
                });
                
                // Jika sidik jari cocok (tidak ada error), gunakan refresh token untuk login
                const { data, error } = await supabase.auth.setSession({
                    access_token: '', // Dikosongkan karena akan di-refresh
                    refresh_token: credentials.password 
                });

                if (data.session) {
                    // Jika berhasil login dengan token, langsung redirect
                    await handleRedirect(data.session.user);
                    return; // Hentikan eksekusi agar tidak lanjut ke pengecekan sesi manual
                } else {
                    console.error("Gagal login dengan token biometrik:", error);
                }
            }
        }
    } catch (error) {
        // Jika pengguna membatalkan atau terjadi error lain, biarkan saja.
        // Pengguna bisa lanjut login manual.
        console.info("Login sidik jari dibatalkan atau tidak tersedia.", error);
    }
    // --- AKHIR DARI KODE BIOMETRIK ---


    // Check if a user is already logged in and redirect them (logika yang sudah ada)
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await handleRedirect(session.user);
    } 

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const submitButton = event.target.querySelector('button[type="submit"]');
        errorMessage.textContent = '';
        errorMessage.classList.add('hidden');

        const email = emailInput.value;
        const password = passwordInput.value;

        setButtonLoading(submitButton, true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                throw new Error(error.message);
            }

            if (data.user) {
                // --- KODE UNTUK AKTIVASI BIOMETRIK ---
                const isBiometricAvailable = await NativeBiometric.isAvailable();
                if (isBiometricAvailable) {
                    const confirmEnableBiometric = confirm("Aktifkan login dengan sidik jari untuk masuk lebih cepat?");
                    if (confirmEnableBiometric) {
                        try {
                            await NativeBiometric.setCredentials({
                                username: email,
                                password: data.session.refresh_token,
                                server: "com.selinggonet.ispmgmt",
                            });
                            // Tidak perlu alert, biarkan proses redirect berjalan mulus
                        } catch (e) {
                            console.error("Gagal menyimpan kredensial biometrik:", e);
                        }
                    }
                }
                // --- AKHIR KODE AKTIVASI ---
                
                await handleRedirect(data.user);
            }

        } catch (error) {
            errorMessage.textContent = 'Email atau password salah. Silakan coba lagi.';
            errorMessage.classList.remove('hidden');
        } finally {
            setButtonLoading(submitButton, false);
        }
    });

    // Fungsi handleRedirect tetap sama
    async function handleRedirect(user) {
        try {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id);

            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            if (!profiles || profiles.length === 0) throw new Error('Profil tidak ditemukan untuk pengguna ini.');
            
            const profile = profiles[0];

            if (profile.role === 'ADMIN') {
                window.location.href = 'dashboard.html';
            } else if (profile.role === 'USER') {
                window.location.href = 'pelanggan_dashboard.html';
            } else {
                errorMessage.textContent = 'Peran pengguna tidak dikenali.';
                errorMessage.classList.remove('hidden');
            }
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
            console.error("Error saat redirect:", error);
            await supabase.auth.signOut();
        }
    }

    // Fungsi setButtonLoading tetap sama
    function setButtonLoading(button, loading) {
        const span = button.querySelector('span');
        if (!span) return;
        if (loading) {
            button.disabled = true;
            span.innerHTML = 'Memproses...';
            button.classList.add('opacity-75', 'cursor-not-allowed');
        } else {
            button.disabled = false;
            span.innerHTML = `
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                </svg>
                Masuk
            `;
            button.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
});
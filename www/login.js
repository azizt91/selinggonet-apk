// login.js (Versi Perbaikan)
import { supabase } from './supabase-client.js';
import { NativeBiometric } from 'capacitor-native-biometric';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    // Buat fungsi async terpisah untuk inisialisasi halaman (cek biometrik & sesi)
    // Ini memastikan listener di bawahnya tidak terblokir
    async function initializePage() {
        // --- KODE BIOMETRIK SAAT HALAMAN DIMUAT ---
        try {
            const available = await NativeBiometric.isAvailable();

            if (available) {
                const credentials = await NativeBiometric.getCredentials({
                    server: "com.selinggonet.ispmgmt",
                });

                if (credentials.password) { // password di sini adalah refresh_token
                    await NativeBiometric.verifyIdentity({
                        reason: "Login ke Selinggonet",
                        title: "Login Cepat",
                        subtitle: "Gunakan sidik jari Anda",
                    });
                    
                    const { data, error } = await supabase.auth.setSession({
                        access_token: '', // Dikosongkan karena akan di-refresh
                        refresh_token: credentials.password 
                    });

                    if (data.session) {
                        await handleRedirect(data.session.user);
                        return; // Hentikan eksekusi jika sudah berhasil login
                    } else {
                        console.error("Gagal login dengan token biometrik:", error);
                    }
                }
            }
        } catch (error) {
            console.info("Login sidik jari dibatalkan atau tidak tersedia.", error);
        }
        // --- AKHIR DARI KODE BIOMETRIK ---

        // Cek sesi yang sudah ada jika login biometrik gagal atau tidak tersedia
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await handleRedirect(session.user);
        }
    }

    // Pindahkan listener ke luar fungsi async agar langsung terpasang
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
                // --- KODE UNTUK AKTIVASI BIOMETRIK SETELAH LOGIN MANUAL ---
                const isBiometricAvailable = await NativeBiometric.isAvailable();
                if (isBiometricAvailable) {
                    const confirmEnableBiometric = confirm("Aktifkan login dengan sidik jari untuk masuk lebih cepat?");
                    if (confirmEnableBiometric) {
                        try {
                            await NativeBiometric.setCredentials({
                                username: email,
                                password: data.session.refresh_token, // Simpan refresh token
                                server: "com.selinggonet.ispmgmt",
                            });
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

    // Panggil fungsi async untuk memulai pengecekan di latar belakang
    initializePage();

    // Fungsi handleRedirect dan setButtonLoading tetap sama persis (tidak perlu diubah)
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
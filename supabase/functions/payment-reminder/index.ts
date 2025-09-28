import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import admin from "https://esm.sh/v135/firebase-admin@11.10.1/deno/firebase-admin.js";

// Inisialisasi Firebase Admin SDK
// SDK ini digunakan untuk mengirim notifikasi dari server
try {
  // Mengambil kunci rahasia yang sudah kita simpan di Supabase Secrets
  const serviceAccountString = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY');
  if (!serviceAccountString) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set.');
  }
  const serviceAccount = JSON.parse(serviceAccountString);

  // Memperbaiki format private_key. Karakter newline seringkali menjadi '\n' dalam environment variable.
  // Baris ini mengubahnya kembali menjadi '\n' agar format kunci valid.
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  // Hanya inisialisasi jika belum ada
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    console.log('Firebase Admin SDK berhasil diinisialisasi dengan project ID:', serviceAccount.project_id);
  }
} catch (e) {
  console.error('Gagal menginisialisasi Firebase Admin SDK:', e.message);
}

console.log('Fungsi payment-reminder dipanggil.');

serve(async (req) => {
  try {
    // Membuat koneksi ke Supabase menggunakan akses level admin (service role)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    console.log('Klien Supabase berhasil dibuat.');

    // 1. Dapatkan tanggal hari ini (hanya angka tanggalnya)
    const currentDay = new Date().getDate();
    console.log(`Mengecek jatuh tempo untuk tanggal: ${currentDay}`);

    // 2. Cari semua pelanggan aktif yang tanggal pemasangannya cocok dengan tanggal hari ini
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, installation_date')
      .eq('status', 'AKTIF'); // Hanya kirim ke pelanggan aktif

    if (profilesError) throw profilesError;

    const usersToNotify = profiles.filter(p => {
        if (!p.installation_date) return false;
        // Ambil hanya angka tanggal dari installation_date
        const installationDay = new Date(p.installation_date).getDate();
        return installationDay === currentDay;
    });

    if (usersToNotify.length === 0) {
      const msg = 'Tidak ada pengguna untuk dinotifikasi hari ini.';
      console.log(msg);
      return new Response(JSON.stringify({ message: msg }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Ditemukan ${usersToNotify.length} pengguna untuk dinotifikasi:`, usersToNotify.map(u => u.full_name));

    // 3. Untuk setiap pengguna, dapatkan token perangkat mereka
    const userTokensMap = new Map<string, string[]>();
    for (const user of usersToNotify) {
      const { data: tokens, error: tokensError } = await supabase
        .from('device_tokens')
        .select('token')
        .eq('user_id', user.id);

      if (tokensError) {
        console.error(`Gagal mengambil token untuk user ${user.id}:`, tokensError);
        continue; // Lanjut ke pengguna berikutnya jika gagal
      }

      if (tokens && tokens.length > 0) {
        userTokensMap.set(user.full_name, tokens.map(t => t.token));
      }
    }

    if (userTokensMap.size === 0) {
        const msg = 'Tidak ada perangkat terdaftar untuk pengguna yang akan dinotifikasi.';
        console.log(msg);
        return new Response(JSON.stringify({ message: msg }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // 4. Kirim notifikasi ke setiap pengguna
    let successCount = 0;
    let failureCount = 0;

    for (const [userName, tokens] of userTokensMap.entries()) {
      const message = {
        notification: {
          title: 'Pengingat Pembayaran Selinggonet',
          body: `Halo ${userName}, sudah waktunya melakukan pembayaran tagihan internet Anda bulan ini. Terima kasih!`,
        },
        tokens: tokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        successCount += response.successCount;
        failureCount += response.failureCount;
        console.log(`Berhasil mengirim ${response.successCount} notifikasi untuk ${userName}.`);
        if (response.failureCount > 0) {
            console.warn(`Gagal mengirim ${response.failureCount} notifikasi untuk ${userName}.`);
            // Di sini Anda bisa menambahkan logika untuk menghapus token yang tidak valid dari database
        }
      } catch (error) {
        console.error(`Error mengirim notifikasi ke ${userName}:`, error);
        failureCount += tokens.length;
      }
    }

    const responseMessage = `Proses notifikasi selesai. Terkirim: ${successCount}, Gagal: ${failureCount}.`;
    console.log(responseMessage);

    return new Response(JSON.stringify({ message: responseMessage }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Terjadi kesalahan tidak terduga:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
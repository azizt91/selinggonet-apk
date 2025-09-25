import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log('Fungsi whatsapp-reminder dipanggil.');

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    console.log('Klien Supabase berhasil dibuat.');

    // 1. Dapatkan informasi tanggal hari ini
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthYear = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    console.log(`Mengecek jatuh tempo untuk tanggal: ${currentDay}`);

    // 2. Cari semua pelanggan aktif yang tanggal pemasangannya cocok dengan tanggal hari ini
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, idpl, full_name, whatsapp_number, package_id, installation_date')
      .eq('status', 'AKTIF');

    if (profilesError) throw profilesError;

    const usersToNotify = profiles.filter(p => {
        if (!p.installation_date) return false;
        const installationDay = new Date(p.installation_date).getDate();
        return installationDay === currentDay;
    });

    if (usersToNotify.length === 0) {
      const msg = 'Tidak ada pengguna untuk dinotifikasi via WhatsApp hari ini.';
      console.log(msg);
      return new Response(JSON.stringify({ message: msg }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    console.log(`Ditemukan ${usersToNotify.length} pengguna untuk notifikasi WhatsApp.`);

    // 3. Ambil semua data paket untuk efisiensi
    const { data: packages, error: packagesError } = await supabase.from('packages').select('id, price');
    if (packagesError) throw packagesError;
    const packagesMap = new Map(packages.map(p => [p.id, p.price]));

    // 4. Kirim notifikasi ke setiap pengguna
    let successCount = 0;
    let failureCount = 0;

    for (const user of usersToNotify) {
      const price = packagesMap.get(user.package_id);

      if (!price || !user.whatsapp_number) {
        console.warn(`Melewatkan user ${user.full_name} karena harga paket atau nomor WhatsApp tidak ditemukan.`);
        continue;
      }

      // Membuat isi pesan sesuai template
      const message = `*Informasi Tagihan WiFi Anda*

Hai Bapak/Ibu ${user.full_name},
ID Pelanggan: ${user.idpl || '-'}

Tagihan Anda untuk periode *${currentMonthYear}* sebesar *Rp${new Intl.NumberFormat('id-ID').format(price)}* telah jatuh tempo.

*PEMBAYARAN LEBIH MUDAH DENGAN QRIS!*
Scan kode QR di gambar pesan ini menggunakan aplikasi m-banking atau e-wallet Anda (DANA, GoPay, OVO, dll). Pastikan nominal transfer sesuai tagihan.

Untuk pembayaran via QRIS, silakan lihat gambar pada link berikut:
https://bayardong.online/sneat/assets/img/qris.jpeg

Atau transfer manual ke rekening berikut:
• Seabank: 901307925714
• BCA: 3621053653
• BSI: 7211806138
(an. TAUFIQ AZIZ)

Terima kasih atas kepercayaan Anda.
_____________________________
*_Pesan ini dibuat otomatis. Abaikan jika sudah membayar._`;

      // 5. Panggil fungsi 'send-whatsapp-notification' yang sudah ada
      try {
        const response = await fetch(Deno.env.get('SUPABASE_URL')! + '/functions/v1/send-whatsapp-notification', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ target: user.whatsapp_number, message: message })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }
        console.log(`Berhasil mengirim antrian pesan ke ${user.full_name}`);
        successCount++;
      } catch (e) {
        console.error(`Gagal mengirim pesan ke ${user.full_name}:`, e.message);
        failureCount++;
      }
    }

    const responseMessage = `Proses notifikasi WhatsApp selesai. Berhasil: ${successCount}, Gagal: ${failureCount}.`;
    console.log(responseMessage);

    return new Response(JSON.stringify({ message: responseMessage }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Terjadi kesalahan tidak terduga di whatsapp-reminder:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

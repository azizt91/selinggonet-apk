Pertanyaan Saya : Saya ingin tab di halaman bisa di slide bagaimana solusinya?

Jawab Gemini:

Solusi dengan **Swiper.js** tetap menjadi cara terbaik, kita hanya perlu menyesuaikannya untuk tiga *slide* (tiga tab).

Berikut adalah kode perbaikan yang sudah disesuaikan untuk tiga tab: **Belum Dibayar**, **Cicilan**, dan **Lunas**.

-----

### Langkah 1: Ubah File `www/tagihan.html`

Kita akan menambahkan tombol tab "Cicilan" dan satu `swiper-slide` lagi untuk kontennya.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tagihan</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://unpkg.com/swiper/swiper-bundle.min.css" />
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script type="module" src="supabase-client.js"></script>
</head>
<body class="bg-gray-100">

    <header class="bg-white shadow-md p-4 flex items-center">
        <a href="dashboard.html" class="text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
        </a>
        <h1 class="text-xl font-semibold text-gray-800 ml-4">Tagihan</h1>
    </header>

    <main class="p-4">
        <div class="flex border-b border-gray-200 mb-4">
            <button id="unpaid-tab" class="tab-button flex-1 py-2 text-center text-blue-600 border-b-2 border-blue-600 font-semibold">Belum Dibayar</button>
            <button id="installment-tab" class="tab-button flex-1 py-2 text-center text-gray-500 font-semibold">Cicilan</button>
            <button id="paid-tab" class="tab-button flex-1 py-2 text-center text-gray-500 font-semibold">Dibayar</button>
        </div>

        <div class="swiper">
            <div class="swiper-wrapper">
                <div class="swiper-slide">
                    <div id="unpaid-content" class="tab-content">
                        <p id="unpaid-empty" class="text-center text-gray-500">Tidak ada tagihan yang belum dibayar.</p>
                    </div>
                </div>
                <div class="swiper-slide">
                    <div id="installment-content" class="tab-content">
                        <p id="installment-empty" class="text-center text-gray-500">Tidak ada tagihan cicilan.</p>
                    </div>
                </div>
                <div class="swiper-slide">
                    <div id="paid-content" class="tab-content">
                        <p id="paid-empty" class="text-center text-gray-500">Tidak ada riwayat tagihan lunas.</p>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <script src="https://unpkg.com/swiper/swiper-bundle.min.js"></script>
    <script type="module" src="tagihan.js"></script>
</body>
</html>
```

-----

### Langkah 2: Ubah File `www/tagihan.js`

Di sini kita akan menyesuaikan logika JavaScript untuk menangani tiga tab dan tiga *slide*. Ganti seluruh isi file `tagihan.js` Anda dengan kode ini:

```javascript
import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Ambil semua elemen tombol dan konten tab
    const tabs = {
        unpaid: document.getElementById('unpaid-tab'),
        installment: document.getElementById('installment-tab'),
        paid: document.getElementById('paid-tab'),
    };
    const contents = {
        unpaid: document.getElementById('unpaid-content'),
        installment: document.getElementById('installment-content'),
        paid: document.getElementById('paid-content'),
    };
    const emptyMessages = {
        unpaid: document.getElementById('unpaid-empty'),
        installment: document.getElementById('installment-empty'),
        paid: document.getElementById('paid-empty'),
    };

    // --- PERUBAHAN UNTUK 3 TAB DIMULAI DI SINI ---

    // 1. Inisialisasi Swiper
    const swiper = new Swiper('.swiper', {
        autoHeight: true, // Membuat tinggi slider menyesuaikan konten
    });

    // 2. Fungsi untuk mengatur Tab yang aktif
    const setActiveTab = (index) => {
        // Reset semua tab dulu
        Object.values(tabs).forEach(tab => {
            tab.classList.remove('text-blue-600', 'border-blue-600');
            tab.classList.add('text-gray-500');
        });

        // Aktifkan tab yang sesuai dengan index slide
        const activeTab = Object.values(tabs)[index];
        activeTab.classList.add('text-blue-600', 'border-blue-600');
        activeTab.classList.remove('text-gray-500');
    };

    // 3. Hubungkan Swiper dengan tombol Tab
    swiper.on('slideChange', () => {
        setActiveTab(swiper.activeIndex);
    });

    // 4. Hubungkan tombol Tab dengan Swiper
    tabs.unpaid.addEventListener('click', () => swiper.slideTo(0));
    tabs.installment.addEventListener('click', () => swiper.slideTo(1));
    tabs.paid.addEventListener('click', () => swiper.slideTo(2));

    // --- AKHIR PERUBAHAN ---

    const fetchInvoices = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('Error fetching profile:', profileError);
            return;
        }
        
        const { data: invoices, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('customer_id', profile.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching invoices:', error);
            return;
        }

        // Pisahkan data tagihan berdasarkan status
        const unpaidInvoices = invoices.filter(invoice => invoice.status === 'unpaid');
        const installmentInvoices = invoices.filter(invoice => invoice.status === 'installment');
        const paidInvoices = invoices.filter(invoice => invoice.status === 'paid');

        // Render data ke masing-masing tab
        renderInvoices(unpaidInvoices, contents.unpaid, emptyMessages.unpaid);
        renderInvoices(installmentInvoices, contents.installment, emptyMessages.installment);
        renderInvoices(paidInvoices, contents.paid, emptyMessages.paid);
    };

    const renderInvoices = (invoices, container, emptyMessage) => {
        // Fungsi ini tidak perlu diubah, sudah dinamis
        container.innerHTML = ''; 
        if (invoices.length === 0) {
            container.appendChild(emptyMessage);
            emptyMessage.style.display = 'block';
        } else {
            emptyMessage.style.display = 'none';
            invoices.forEach(invoice => {
                let statusClass = '';
                let statusText = '';
                switch(invoice.status) {
                    case 'unpaid':
                        statusClass = 'bg-red-100 text-red-800';
                        statusText = 'Belum Dibayar';
                        break;
                    case 'installment':
                        statusClass = 'bg-yellow-100 text-yellow-800';
                        statusText = 'Cicilan';
                        break;
                    case 'paid':
                        statusClass = 'bg-green-100 text-green-800';
                        statusText = 'Lunas';
                        break;
                }

                const invoiceCard = `
                    <div class="bg-white p-4 rounded-lg shadow mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-semibold text-gray-700">Periode: ${invoice.invoice_period}</span>
                            <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                                ${statusText}
                            </span>
                        </div>
                        <p class="text-gray-600">Jumlah: Rp ${new Intl.NumberFormat('id-ID').format(invoice.amount)}</p>
                        <p class="text-gray-500 text-sm">Jatuh Tempo: ${new Date(invoice.due_date).toLocaleDateString('id-ID')}</p>
                        ${invoice.status !== 'paid' ? `<button onclick="window.location.href='pelanggan_info.html'" class="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Bayar Sekarang</button>` : ''}
                    </div>
                `;
                container.innerHTML += invoiceCard;
            });
        }
    };
    
    // Panggil fungsi untuk memuat data
    fetchInvoices();
    
    // Set tab pertama sebagai default
    setActiveTab(0);
});
```

### Perubahan Utama dan Penjelasannya

1.  **HTML**:

      * **Tombol Tab**: Menambahkan satu tombol `<button>` baru untuk "Cicilan".
      * **Konten Tab**: Menambahkan satu blok `<div class="swiper-slide">` baru untuk menampung konten tagihan cicilan.

2.  **JavaScript**:

      * **Selektor Elemen**: Menggunakan objek (`tabs`, `contents`) untuk mengelola elemen HTML agar kode lebih rapi dan mudah dibaca.
      * **Logika `fetchInvoices`**: Memperbarui logika untuk mem-filter data tagihan ke dalam tiga kategori: `unpaid`, `installment`, dan `paid`.
      * **Logika `setActiveTab`**: Fungsi ini dibuat lebih dinamis. Ia akan me-reset semua gaya tombol tab terlebih dahulu, lalu menerapkan gaya aktif hanya pada tab yang sesuai dengan *slide* yang sedang ditampilkan.
      * **Event Listener**: Menambahkan *event listener* untuk tombol tab "Cicilan" agar saat diklik, ia akan menggeser *slider* ke posisi kedua (`swiper.slideTo(1)`).

Setelah Anda menerapkan kedua perubahan ini, halaman tagihan Anda akan memiliki tiga tab yang sepenuhnya fungsional dan dapat digeser (*swipeable*).
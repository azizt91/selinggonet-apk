// dashboard.js (Supabase version)
import { supabase } from './supabase-client.js';
import { requireRole, initLogout } from './auth.js';

/**
 * Initializes Push Notifications safely, only on native platforms.
 */
const initializePushNotifications = async () => {
  try {
    // Dynamically import Capacitor to check the platform safely
    const { Capacitor } = await import('@capacitor/core');

    // Only run on native platforms
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Listener for successful registration
      await PushNotifications.addListener('registration', async (token) => {
        console.info('Device registration token: ', token.value);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('device_tokens').upsert({ user_id: user.id, token: token.value }, { onConflict: 'user_id, token' });
          console.log('Device token saved successfully.');
        }
      });

      // Listener for registration error
      await PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error: ', err.error);
      });

      // Listener for received notification when app is in foreground
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received: ', notification);
        alert(`Notifikasi Baru: ${notification.title}\n${notification.body}`);
      });

      // Listener for action performed on a notification
      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push notification action performed', notification.actionId, notification.inputValue);
      });

      // Check permissions and register
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive === 'granted') {
        await PushNotifications.register();
      } else {
        console.warn('User denied push permissions!');
      }

      console.log("Push notifications initialized for native platform.");
    }
  } catch (e) {
    // This block will be hit in a normal web browser where @capacitor/core doesn't exist.
    console.log('Push notifications not initialized (not a native app or error occurred).');
  }
};

document.addEventListener('DOMContentLoaded', async function() {
    // Safely initialize Push Notifications
    initializePushNotifications();

    // Ensure the user is an ADMIN, otherwise redirect.
    const user = await requireRole('ADMIN');
    if (!user) return; // Stop execution if not authenticated

    initLogout('dashboard-logout-btn');
    populateUserInfo(user);

    function checkUnreadNotifications() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        try {
            const notificationsJSON = localStorage.getItem('selinggonet_notifications');
            const notifications = notificationsJSON ? JSON.parse(notificationsJSON) : [];
            const hasUnread = notifications.some(n => !n.read);
            if (hasUnread) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (e) {
            console.error("Gagal memeriksa notifikasi:", e);
            badge.classList.add('hidden');
        }
    }

    checkUnreadNotifications();
    setInterval(checkUnreadNotifications, 5000);

    async function populateUserInfo(user) {
        const userGreeting = document.getElementById('user-greeting');
        const userEmail = document.getElementById('user-email');
        const userAvatar = document.getElementById('user-avatar');

        if (!userGreeting || !userEmail) return;

        userEmail.textContent = user.email;

        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('full_name, photo_url')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (profile) {
                userGreeting.textContent = `Hallo, ${profile.full_name || 'Admin'}`;
                if (profile.photo_url && userAvatar) {
                    userAvatar.style.backgroundImage = `url('${profile.photo_url}')`;
                } else if (userAvatar) {
                    const initials = (profile.full_name || 'A').charAt(0).toUpperCase();
                    userAvatar.innerHTML = `<span class="text-white text-xl font-bold flex items-center justify-center h-full">${initials}</span>`;
                    userAvatar.style.backgroundColor = 'rgba(255,255,255,0.3)';
                }
            } else {
                userGreeting.textContent = `Hallo, Admin`;
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            userGreeting.textContent = 'Hallo!';
        }
    }

    const filterBulan = document.getElementById('filter-bulan');
    const filterTahun = document.getElementById('filter-tahun');
    const cardsContainer = document.getElementById('cards-container');
    const chartsWrapper = document.getElementById('charts-wrapper');
    const chartsSkeletonContainer = document.getElementById('charts-skeleton-container');

    populateFilters();
    initializeEventListeners();
    showLoading();
    showChartsLoading();
    fetchDashboardStats();

    function populateFilters() {
        const namaBulan = ["Semua Bulan", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const sekarang = new Date();
        const bulanIni = sekarang.getMonth() + 1;
        const tahunIni = sekarang.getFullYear();

        namaBulan.forEach((bulan, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = bulan;
            if (index === bulanIni) {
                option.selected = true;
            }
            filterBulan.appendChild(option);
        });

        for (let i = 0; i < 4; i++) {
            const tahun = tahunIni - i;
            const option = document.createElement('option');
            option.value = tahun;
            option.textContent = tahun;
            filterTahun.appendChild(option);
        }
    }

    function initializeEventListeners() {
        filterBulan.addEventListener('change', fetchDashboardStats);
        filterTahun.addEventListener('change', fetchDashboardStats);
    }

    async function fetchDashboardStats() {
        const month_filter = parseInt(filterBulan.value, 10);
        const year_filter = parseInt(filterTahun.value, 10);
        
        if (!document.querySelector('.skeleton-card')) {
            showLoading();
        }
        
        try {
            const { data: stats, error } = await supabase.rpc('get_dashboard_stats', {
                p_month: month_filter,
                p_year: year_filter
            });

            if (error) throw error;

            const { data: chartsData, error: chartsError } = await supabase.rpc('get_dashboard_charts_data', {
                p_months: 6
            });

            if (chartsError) {
                console.warn('Charts data error:', chartsError.message);
            }

            hideLoading();
            displayStats(stats[0]);
            
            if (chartsData) {
                renderCharts(chartsData);
                hideChartsLoading();
            } else {
                console.warn('No charts data received');
                hideChartsLoading();
            }

        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            hideLoading();
            hideChartsLoading();
            cardsContainer.innerHTML = `<p class="text-center text-red-500 col-span-full">Gagal memuat data: ${error.message}</p>`;
        }
    }

    function displayStats(stats) {
        cardsContainer.innerHTML = '';

        const formatter = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        });

        const selectedMonth = filterBulan.value;
        const selectedYear = filterTahun.value;
        
        const unpaidLink = `tagihan.html?status=unpaid&bulan=${selectedMonth}&tahun=${selectedYear}`;
        const paidLink = `tagihan.html?status=paid&bulan=${selectedMonth}&tahun=${selectedYear}`;
        const activeCustomersLink = `pelanggan.html?status=AKTIF`;
        const inactiveCustomersLink = `pelanggan.html?status=NONAKTIF`;

        const statsCards = [
            { label: 'Profit', value: formatter.format(stats.profit || 0), gradient: 'gradient-card-1', icon: '💰' },
            { label: 'Pendapatan', value: formatter.format(stats.total_revenue || 0), gradient: 'gradient-card-2', icon: '📈' },
            { label: 'Pengeluaran', value: formatter.format(stats.total_expenses || 0), gradient: 'gradient-card-3', icon: '💸' },
            { label: 'Pelanggan Aktif', value: stats.active_customers || 0, gradient: 'gradient-card-4', icon: '👥', link: activeCustomersLink },
            { label: 'Pelanggan Tdk Aktif', value: stats.inactive_customers || 0, gradient: 'gradient-card-5', icon: '😴', link: inactiveCustomersLink },
            { label: 'Belum Dibayar', value: stats.unpaid_invoices_count || 0, gradient: 'gradient-card-6', icon: '⏳', link: unpaidLink },
            { label: 'Lunas Bulan Ini', value: stats.paid_invoices_count || 0, gradient: 'gradient-card-7', icon: '✅', link: paidLink }
        ];

        statsCards.forEach((card, index) => {
            const cardElement = document.createElement('div');
            let cardClasses = 'card-hover rounded-3xl p-6 text-white shadow-lg animate-fadeInUp';
            
            if (index === 0) {
                cardClasses += ' col-span-2';
            }
            cardElement.className = `${card.gradient} ${cardClasses}`;
            cardElement.style.animationDelay = `${index * 0.1}s`;
            
            cardElement.innerHTML = `
                <div class="flex items-start justify-between mb-4">
                    <div class="text-3xl">${card.icon}</div>
                </div>
                <p class="text-white/90 text-sm font-medium mb-2">${card.label}</p>
                <p class="text-white text-xl font-bold leading-tight">${card.value}</p>
                ${card.link ? '<div class="mt-4 text-white/80 text-xs">👆 Ketuk untuk detail</div>' : ''}
            `;

            if (card.link) {
                cardElement.classList.add('cursor-pointer');
                cardElement.addEventListener('click', () => {
                    window.location.href = card.link;
                });
            }

            cardsContainer.appendChild(cardElement);
        });
    }

    function showLoading() {
        cardsContainer.innerHTML = '';
        for (let i = 0; i < 7; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'skeleton-card glass-card rounded-2xl p-4 min-h-[120px]';
            if (i === 0) {
                skeletonCard.classList.add('col-span-2');
                skeletonCard.className += ' min-h-[100px]';
            }
            skeletonCard.innerHTML = `
                <div class="flex items-start justify-between mb-2">
                    <div class="skeleton-line w-6 h-6 rounded-full"></div>
                </div>
                <div class="flex-1">
                    <div class="skeleton-line h-3 bg-gray-200 rounded w-2/3 mb-1"></div>
                    <div class="skeleton-line h-5 bg-gray-300 rounded w-3/4"></div>
                </div>
            `;
            cardsContainer.appendChild(skeletonCard);
        }
    }

    function hideLoading() {
        const skeletonCards = document.querySelectorAll('.skeleton-card');
        skeletonCards.forEach(card => card.remove());
    }

    function showChartsLoading() {
        chartsSkeletonContainer.innerHTML = '';
        chartsWrapper.style.display = 'none';
        chartsSkeletonContainer.style.display = 'grid';

        for (let i = 0; i < 4; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'bg-white rounded-2xl shadow-lg p-6 chart-loading';
            skeleton.innerHTML = `<div class="w-full h-full skeleton-line"></div>`;
            chartsSkeletonContainer.appendChild(skeleton);
        }
    }

    function hideChartsLoading() {
        chartsSkeletonContainer.style.display = 'none';
        chartsWrapper.style.display = 'grid';
    }

    let revenueChart = null;
    let paymentStatusChart = null;
    let customerGrowthChart = null;
    let customerTotalChart = null;

    function renderCharts(chartsData) {
        try {
            if (revenueChart) revenueChart.destroy();
            if (paymentStatusChart) paymentStatusChart.destroy();
            if (customerGrowthChart) customerGrowthChart.destroy();
            if (customerTotalChart) customerTotalChart.destroy();

            const revenueCtx = document.getElementById('revenueChart');
            if (revenueCtx && chartsData.revenue_chart) {
                revenueChart = new Chart(revenueCtx, {
                    type: 'line',
                    data: chartsData.revenue_chart,
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 20, font: { size: 12 }}}, tooltip: { mode: 'index', intersect: false, callbacks: { label: function(context) { return context.dataset.label + ': Rp ' + new Intl.NumberFormat('id-ID').format(context.parsed.y);}}}}, scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return 'Rp ' + new Intl.NumberFormat('id-ID', { notation: 'compact', compactDisplay: 'short' }).format(value);}}}}, interaction: { mode: 'nearest', axis: 'x', intersect: false }}
                });
            }

            const paymentStatusCtx = document.getElementById('paymentStatusChart');
            if (paymentStatusCtx && chartsData.payment_status_chart) {
                paymentStatusChart = new Chart(paymentStatusCtx, {
                    type: 'doughnut',
                    data: chartsData.payment_status_chart,
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, font: { size: 12 }}}, tooltip: { callbacks: { label: function(context) { const total = context.dataset.data.reduce((a, b) => a + b, 0); const percentage = ((context.parsed / total) * 100).toFixed(1); return context.label + ': ' + context.parsed + ' (' + percentage + '%)';}}}}, cutout: '60%' }
                });
            }

            const customerGrowthCtx = document.getElementById('customerGrowthChart');
            if (customerGrowthCtx && chartsData.customer_growth_chart) {
                customerGrowthChart = new Chart(customerGrowthCtx, {
                    type: 'bar',
                    data: chartsData.customer_growth_chart,
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 20, font: { size: 12 }}}, tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + context.parsed.y + ' pelanggan';}}}}, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }}}}
                });
            }

            const customerTotalCtx = document.getElementById('customerTotalChart');
            if (customerTotalCtx && chartsData.customer_total_chart) {
                customerTotalChart = new Chart(customerTotalCtx, {
                    type: 'line',
                    data: chartsData.customer_total_chart,
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return 'Total Aktif: ' + context.parsed.y + ' pelanggan';}}}}, scales: { y: { beginAtZero: true, ticks: { stepSize: 5 }}}, interaction: { mode: 'nearest', axis: 'x', intersect: false }}
                });
            }

        } catch (error) {
            console.error('Error rendering charts:', error);
        }
    }
});

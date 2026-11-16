window.ULmoviGoogleDrive = {
    selectedFile: null,

    clearSelection() {
        this.selectedFile = null;

        const selection = document.getElementById('movieDriveSelection');
        const clearButton = document.getElementById('movieDriveClearBtn');
        const videoInput = document.getElementById('movieVideo');

        if (selection) selection.textContent = '';
        if (clearButton) clearButton.hidden = true;

        if (videoInput) {
            videoInput.required = true;
            videoInput.closest('.form-group').hidden = false;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('googleDriveStatus');
    const message = document.getElementById('googleDriveMessage');
    const connectButton = document.getElementById('googleDriveConnectBtn');

    async function refreshStatus() {
        if (!status || !message || !connectButton) return;

        try {
            const result = await fetchAPI('google_drive_status');
            if (!result.success) {
                throw new Error(result.error || 'Holatni olish imkonsiz.');
            }

            status.textContent = result.connected
                ? 'Google Drive ulangan.'
                : 'Google Drive ulanmagan.';

            connectButton.textContent = result.connected
                ? 'Google Drive qayta ulash'
                : 'Google Drive’ni ulash';
        } catch (error) {
            status.textContent = 'Ulanish holatini tekshirib bo‘lmadi.';
            message.textContent = error.message;
        }
    }

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            connectButton.disabled = true;
            message.textContent = 'Google hisobiga ulanish tayyorlanmoqda...';

            try {
                const result = await fetchAPI('google_drive_connect', 'POST', {});
                if (!result.success || !result.url) {
                    throw new Error(result.error || 'Ulanish havolasi olinmadi.');
                }
                window.location.assign(result.url);
            } catch (error) {
                message.textContent = error.message;
                connectButton.disabled = false;
            }
        });

        const result = new URLSearchParams(location.search).get('google_drive');
        if (result === 'connected') message.textContent = 'Google Drive muvaffaqiyatli ulandi.';
        if (result === 'denied') message.textContent = 'Google hisobiga ulanish bekor qilindi.';
        if (result === 'error') message.textContent = 'Ulanishda xatolik yuz berdi.';

        refreshStatus();
    }

    const pickButton = document.getElementById('movieDrivePickBtn');
    const clearButton = document.getElementById('movieDriveClearBtn');
    const selection = document.getElementById('movieDriveSelection');
    const videoInput = document.getElementById('movieVideo');

    if (!pickButton || !selection || !videoInput) return;

    let pickerLoading = null;

    async function loadGooglePicker() {
        if (window.google?.picker) return;

        if (!pickerLoading) {
            pickerLoading = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.async = true;

                script.onload = () => {
                    if (!window.gapi) {
                        reject(new Error('Google API kutubxonasi yuklanmadi.'));
                        return;
                    }

                    window.gapi.load('picker', {
                        callback: resolve,
                        onerror: () => reject(new Error('Google Picker yuklanmadi.')),
                        timeout: 15000,
                        ontimeout: () => reject(new Error('Google Picker yuklanish vaqti tugadi.'))
                    });
                };

                script.onerror = () => reject(new Error('Google API skriptini yuklab bo‘lmadi.'));
                document.head.appendChild(script);
            });
        }

        await pickerLoading;
    }

    pickButton.addEventListener('click', async () => {
        pickButton.disabled = true;
        selection.textContent = 'Google Drive ochilmoqda...';

        try {
            const auth = await fetchAPI('google_drive_picker_token');
            if (!auth.success || !auth.access_token || !auth.api_key) {
                throw new Error(auth.error || 'Google Drive ruxsat tokeni olinmadi.');
            }

            await loadGooglePicker();

            const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
                .setMimeTypes('video/mp4,video/webm')
                .setIncludeFolders(false);

            const picker = new google.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(auth.access_token)
                .setDeveloperKey(auth.api_key)
                .setAppId(auth.project_number)
                .setOrigin(window.location.protocol + '//' + window.location.host)
                .setCallback((data) => {
                    if (data.action === google.picker.Action.PICKED) {
                        const file = data.docs?.[0];

                        if (!file?.id || !file.mimeType?.startsWith('video/')) {
                            selection.textContent = 'Noto‘g‘ri video fayl tanlandi.';
                            return;
                        }

                        window.ULmoviGoogleDrive.selectedFile = {
                            id: file.id,
                            name: file.name || 'Google Drive videosi',
                            mimeType: file.mimeType
                        };

                        selection.textContent = 'Tanlandi: ' + window.ULmoviGoogleDrive.selectedFile.name;
                        videoInput.required = false;
                        videoInput.closest('.form-group').hidden = true;

                        if (clearButton) clearButton.hidden = false;
                    } else if (data.action === google.picker.Action.CANCEL) {
                        selection.textContent = 'Video tanlash bekor qilindi.';
                    }
                })
                .build();

            picker.setVisible(true);
        } catch (error) {
            selection.textContent = error.message || 'Google Drive oynasini ochib bo‘lmadi.';
        } finally {
            pickButton.disabled = false;
        }
    });

    clearButton?.addEventListener('click', () => {
        window.ULmoviGoogleDrive.clearSelection();
    });
});

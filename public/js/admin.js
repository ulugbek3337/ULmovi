document.addEventListener('DOMContentLoaded', async () => {
    const links = document.querySelectorAll('.tab-link[data-target]');
    const tabs = document.querySelectorAll('.tab-content');
    const modal = document.getElementById('movieModal');
    const movieForm = document.getElementById('movieForm');
    const videoInput = document.getElementById('movieVideo');
    const posterInput = document.getElementById('moviePoster');
    const progress = document.getElementById('uploadProgress');
    const uploadStatus = document.getElementById('uploadStatus');
    const pauseUploadButton = document.getElementById('pauseMovieUpload');
    const resumeUploadButton = document.getElementById('resumeMovieUpload');
    const cancelUploadButton = document.getElementById('cancelMovieUpload');
    const movieTable = document.getElementById('adminMoviesTableBody');
    const usersTable = document.getElementById('adminUsersTableBody');
    const rolesTable = document.getElementById('adminRolesTableBody');
    const adminsTable = document.getElementById('adminAdminsTableBody');
    const commentsTable = document.getElementById('adminCommentsTableBody');
    const status = document.getElementById('adminStatus');
    let currentUser = null;
    let editingMovieId = null;
    let editingAdId = null;
    let activeUpload = null;
    let activeTransfer = null;
    let uploadAbortController = null;
    let uploadPaused = false;
    let uploadBusy = false;
    let uploadFinalizing = false;
    const uploadStorageKey = 'ulmovi.pendingMovieUploads.v1';
    const maxVideoUploadBytes = 6 * 1024 * 1024 * 1024;

    function showMessage(message, isError = true) {
        status.textContent = message;
        status.classList.toggle('error', isError);
    }

    function cell(value) {
        const element = document.createElement('td');
        element.textContent = value ?? '';
        return element;
    }

    function genreName(value) {
        return ({
            action: 'Jangari',
            comedy: 'Komediya',
            drama: 'Drama',
            thriller: 'Triller',
            animation: 'Animatsiya',
            documentary: 'Hujjatli',
            romance: 'Romantik',
            adventure: 'Sarguzasht',
            other: 'Boshqa',
        })[value] || value || 'Ko‘rsatilmagan';
    }

    function activityName(value) {
        return ({
            user_registered: 'Hisob yaratildi',
            user_login: 'Tizimga kirdi',
            movie_download: 'Kino yuklab olindi',
            comment_added: 'Izoh qo‘shildi',
            movie_added: 'Kino qo‘shildi',
            movie_updated: 'Kino tahrirlandi',
            movie_deleted: 'Kino o‘chirildi',
            user_updated: 'Foydalanuvchi yangilandi',
            administrator_created: 'Administrator yaratildi',
            administrator_updated: 'Administrator ma’lumotlari yangilandi',
            user_role_or_status_changed: 'Foydalanuvchi roli yoki holati o‘zgartirildi',
            user_status_changed: 'Foydalanuvchi holati o‘zgartirildi',
            system_settings_updated: 'Tizim sozlamalari yangilandi',
            comment_moderated: 'Izoh moderatsiya qilindi',
            advertisement_saved: 'Reklama saqlandi',
            advertisement_deleted: 'Reklama o‘chirildi',
            profile_updated: 'Profil yangilandi',
            initial_super_admin_created: 'Super admin yaratildi',
        })[value] || 'Boshqa amal';
    }

    function roleName(value) {
        return ({
            user: 'Foydalanuvchi',
            admin: 'Admin',
            super_admin: 'Super Admin',
        })[value] || value;
    }

    function placementName(value) {
        return ({
            home: 'Bosh sahifa',
            between_sections: 'Bo‘limlar orasida',
            movie_detail: 'Kino tafsilotlari',
        })[value] || value;
    }

    function showEmpty(table, columns, message) {
        const row = document.createElement('tr');
        const column = cell(message);
        column.colSpan = columns;
        column.className = 'table-message';
        row.append(column);
        table.replaceChildren(row);
    }

    async function loadStats() {
        const result = await fetchAPI('admin_stats');
        if (!result.success) throw new Error(result.error || 'Statistikani yuklab bo‘lmadi.');
        const mapping = {
            total_movies: 'statMoviesCount',
            total_users: 'statUsersCount',
            total_comments: 'statCommentsCount',
            total_likes: 'statLikesCount',
        };
        if (currentUser.role === 'super_admin') {
            mapping.total_admins = 'statAdminsCount';
            mapping.total_super_admins = 'statSuperAdminsCount';
            mapping.suspended_users = 'statSuspendedUsersCount';
            mapping.total_downloads = 'statDownloadsCount';
            mapping.total_views = 'statViewsCount';
            mapping.total_ratings = 'statRatingsCount';
            mapping.average_rating = 'statAverageRating';
        }
        Object.entries(mapping).forEach(([key, id]) => {
            document.getElementById(id).textContent = result.data[key] ?? 0;
        });
    }

    async function loadMovies() {
        const result = await fetchAPI('get_movies');
        if (!result.success) throw new Error(result.error || 'Kinolarni yuklab bo‘lmadi.');
        if (!result.data.length) {
            showEmpty(movieTable, 6, 'Hozircha kino yo‘q.');
            return;
        }
        const rows = result.data.map((movie) => {
            const row = document.createElement('tr');
            row.append(cell(movie.id), cell(movie.title), cell(genreName(movie.genre)), cell(movie.year), cell((movie.qualities || []).map((quality) => quality === 'original' ? 'Asl' : quality).join(', ') || 'Tashqi havola'));
            const actions = document.createElement('td');
            const edit = document.createElement('button');
            edit.className = 'table-action';
            edit.type = 'button';
            edit.textContent = 'Tahrirlash';
            edit.addEventListener('click', () => openMovieForm(movie));
            const remove = document.createElement('button');
            remove.className = 'table-action danger-action';
            remove.type = 'button';
            remove.textContent = 'O‘chirish';
            remove.addEventListener('click', async () => {
                if (!window.confirm(`“${movie.title}” kinoni va uning yuklangan fayllarini o‘chirasizmi?`)) return;
                try {
                    const deleted = await fetchAPI('admin_delete_movie', 'POST', { id: movie.id });
                    if (!deleted.success) throw new Error(deleted.error);
                    await refreshDashboard();
                } catch (error) {
                    showMessage(error.message || 'Kino o‘chirilmadi.');
                }
            });
            actions.append(edit, remove);
            row.append(actions);
            return row;
        });
        movieTable.replaceChildren(...rows);
    }

    async function loadUsers() {
        const result = await fetchAPI('admin_get_users');
        if (!result.success) throw new Error(result.error || 'Foydalanuvchilarni yuklab bo‘lmadi.');
        const users = result.data.filter((user) => user.role === 'user');
        if (!users.length) {
            showEmpty(usersTable, 9, 'Foydalanuvchilar topilmadi.');
            return;
        }
        const rows = users.map((user) => {
            const row = document.createElement('tr');
            row.append(
                cell(user.id),
                cell(user.username),
                cell(user.full_name),
                cell(user.email),
                cell(roleName(user.role)),
                cell(user.status === 'active' ? 'Faol' : 'To‘xtatilgan'),
                cell(user.created_at),
                cell(user.last_login_at || 'Kirmagan'),
            );
            const statusCell = document.createElement('td');
            const accountStatus = document.createElement('select');
            accountStatus.setAttribute('aria-label', `${user.name} holati`);
            [['active', 'Faol'], ['suspended', 'To‘xtatilgan']].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = user.status === value;
                accountStatus.append(option);
            });
            statusCell.append(accountStatus);
            const actions = document.createElement('td');
            const save = document.createElement('button');
            save.className = 'table-action';
            save.type = 'button';
            save.textContent = 'Saqlash';
            save.addEventListener('click', async () => {
                if (accountStatus.value === user.status) return;
                const actionName = accountStatus.value === 'suspended' ? 'to‘xtatish' : 'qayta faollashtirish';
                if (!window.confirm(`${user.name} hisobini ${actionName}ni tasdiqlaysizmi?`)) return;
                save.disabled = true;
                try {
                    const update = await fetchAPI('admin_update_user', 'POST', {
                        id: user.id,
                        role: 'user',
                        status: accountStatus.value,
                    });
                    if (!update.success) throw new Error(update.error);
                    await Promise.all([loadUsers(), loadStats()]);
                    showMessage('Foydalanuvchi holati yangilandi.', false);
                } catch (error) {
                    showMessage(error.message || 'Foydalanuvchi yangilanmadi.');
                    save.disabled = false;
                }
            });
            actions.append(save);
            row.append(statusCell, actions);
            return row;
        });
        usersTable.replaceChildren(...rows);
    }

    async function loadRoleUsers() {
        const result = await fetchAPI('admin_get_users');
        if (!result.success) throw new Error(result.error || 'Rollar ro‘yxatini yuklab bo‘lmadi.');
        if (!result.data.length) {
            showEmpty(rolesTable, 9, 'Hisoblar topilmadi.');
            return;
        }
        const rows = result.data.map((user) => {
            const row = document.createElement('tr');
            row.append(cell(user.id), cell(user.username), cell(user.full_name), cell(user.email));
            const roleCell = document.createElement('td');
            const role = document.createElement('select');
            role.setAttribute('aria-label', `${user.name} roli`);
            [['user', 'Foydalanuvchi'], ['admin', 'Admin'], ['super_admin', 'Super Admin']].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = user.role === value;
                role.append(option);
            });
            const isSelf = Number(user.id) === Number(currentUser.id);
            role.disabled = isSelf;
            roleCell.append(role);

            const statusCell = document.createElement('td');
            const accountStatus = document.createElement('select');
            accountStatus.setAttribute('aria-label', `${user.name} holati`);
            [['active', 'Faol'], ['suspended', 'To‘xtatilgan']].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = user.status === value;
                accountStatus.append(option);
            });
            accountStatus.disabled = isSelf;
            statusCell.append(accountStatus);
            row.append(roleCell, statusCell, cell(user.created_at), cell(user.last_login_at || 'Kirmagan'));

            const actions = document.createElement('td');
            const save = document.createElement('button');
            save.className = 'table-action';
            save.type = 'button';
            save.textContent = 'Saqlash';
            save.disabled = isSelf;
            save.addEventListener('click', async () => {
                if (role.value === user.role && accountStatus.value === user.status) return;
                if (!window.confirm(`${user.name} uchun rol yoki hisob holatini o‘zgartirishni tasdiqlaysizmi?`)) return;
                save.disabled = true;
                try {
                    const update = await fetchAPI('admin_update_user', 'POST', {
                        id: user.id,
                        role: role.value,
                        status: accountStatus.value,
                    });
                    if (!update.success) throw new Error(update.error || 'Hisob yangilanmadi.');
                    await Promise.all([loadUsers(), loadRoleUsers(), loadAdmins(), loadStats()]);
                    showMessage('Foydalanuvchi roli va holati yangilandi.', false);
                } catch (error) {
                    showMessage(error.message || 'Foydalanuvchi yangilanmadi.');
                    save.disabled = false;
                }
            });
            actions.append(save);
            row.append(actions);
            return row;
        });
        rolesTable.replaceChildren(...rows);
    }

    async function loadAdmins() {
        const result = await fetchAPI('admin_get_admins');
        if (!result.success) throw new Error(result.error || 'Administratorlarni yuklab bo‘lmadi.');
        if (!result.data.length) {
            showEmpty(adminsTable, 10, 'Administrator hisoblari topilmadi.');
            return;
        }
        const rows = result.data.map((admin) => {
            const row = document.createElement('tr');
            row.append(cell(admin.id), cell(admin.username));
            const nameInput = document.createElement('input');
            nameInput.value = admin.full_name;
            nameInput.maxLength = 100;
            nameInput.setAttribute('aria-label', `${admin.full_name} to‘liq ismi`);
            const nameCell = document.createElement('td');
            nameCell.append(nameInput);
            const emailInput = document.createElement('input');
            emailInput.type = 'email';
            emailInput.value = admin.email;
            emailInput.maxLength = 254;
            emailInput.setAttribute('aria-label', `${admin.full_name} emaili`);
            const emailCell = document.createElement('td');
            emailCell.append(emailInput);
            row.append(nameCell, emailCell);

            const roleCell = document.createElement('td');
            const role = document.createElement('select');
            [['user', 'Foydalanuvchi'], ['admin', 'Admin'], ['super_admin', 'Super Admin']].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = admin.role === value;
                role.append(option);
            });
            const isSelf = Number(admin.id) === Number(currentUser.id);
            role.disabled = isSelf;
            roleCell.append(role);

            const statusCell = document.createElement('td');
            const accountStatus = document.createElement('select');
            [['active', 'Faol'], ['suspended', 'To‘xtatilgan']].forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = admin.status === value;
                accountStatus.append(option);
            });
            accountStatus.disabled = isSelf;
            statusCell.append(accountStatus);
            row.append(roleCell, statusCell, cell(admin.created_at), cell(admin.last_login_at || 'Kirmagan'));

            const passwordCell = document.createElement('td');
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.minLength = 12;
            passwordInput.maxLength = 200;
            passwordInput.autocomplete = 'new-password';
            passwordInput.placeholder = 'Bo‘sh qoldirilsa o‘zgarmaydi';
            passwordInput.setAttribute('aria-label', `${admin.full_name} uchun yangi parol`);
            passwordCell.append(passwordInput);
            row.append(passwordCell);

            const actions = document.createElement('td');
            const save = document.createElement('button');
            save.className = 'table-action';
            save.type = 'button';
            save.textContent = 'Saqlash';
            save.addEventListener('click', async () => {
                const changed = nameInput.value !== admin.full_name
                    || emailInput.value !== admin.email
                    || role.value !== admin.role
                    || accountStatus.value !== admin.status
                    || passwordInput.value !== '';
                if (!changed) return;
                if (!window.confirm(`${admin.full_name} administrator hisobidagi o‘zgarishlarni tasdiqlaysizmi?`)) return;
                save.disabled = true;
                try {
                    const update = await fetchAPI('admin_update_admin', 'POST', {
                        id: admin.id,
                        name: nameInput.value,
                        email: emailInput.value,
                        role: role.value,
                        status: accountStatus.value,
                        new_password: passwordInput.value,
                    });
                    if (!update.success) throw new Error(update.error || 'Administrator yangilanmadi.');
                    await Promise.all([loadAdmins(), loadRoleUsers(), loadStats()]);
                    showMessage('Administrator hisobidagi o‘zgarishlar saqlandi.', false);
                } catch (error) {
                    showMessage(error.message || 'Administrator yangilanmadi.');
                    save.disabled = false;
                }
            });
            actions.append(save);
            row.append(actions);
            return row;
        });
        adminsTable.replaceChildren(...rows);
    }

    async function loadComments() {
        const result = await fetchAPI('admin_comments');
        if (!result.success) throw new Error(result.error || 'Izohlarni olib bo‘lmadi.');
        if (!result.data.length) {
            showEmpty(commentsTable, 5, 'Izohlar topilmadi.');
            return;
        }
        const rows = result.data.map((comment) => {
            const row = document.createElement('tr');
            row.append(cell(comment.movie_title), cell(comment.username), cell(comment.body), cell(Number(comment.is_hidden) ? 'Yashirilgan' : 'Ko‘rinadi'));
            const actions = document.createElement('td');
            const button = document.createElement('button');
            button.className = 'table-action';
            button.type = 'button';
            button.textContent = Number(comment.is_hidden) ? 'Ko‘rsatish' : 'Yashirish';
            button.addEventListener('click', async () => {
                try {
                    const result = await fetchAPI('admin_moderate_comment', 'POST', {
                        id: comment.id,
                        hidden: Number(comment.is_hidden) ? 0 : 1,
                    });
                    if (!result.success) throw new Error(result.error);
                    await Promise.all([loadComments(), loadStats()]);
                } catch (error) {
                    showMessage(error.message || 'Izoh holatini o‘zgartirib bo‘lmadi.');
                }
            });
            actions.append(button);
            row.append(actions);
            return row;
        });
        commentsTable.replaceChildren(...rows);
    }

    async function loadAds() {
        const result = await fetchAPI('admin_ads');
        if (!result.success) throw new Error(result.error || 'Reklamalarni olib bo‘lmadi.');
        const list = document.getElementById('adsList');
        list.replaceChildren();
        if (!result.data.length) {
            list.textContent = 'Hozircha reklama yo‘q.';
            return;
        }
        result.data.forEach((ad) => {
            const item = document.createElement('article');
            item.className = 'ad-item';
            const title = document.createElement('strong');
            title.textContent = ad.title;
            const placement = document.createElement('span');
            placement.textContent = ` · ${placementName(ad.placement)} · ${Number(ad.is_active) ? 'Faol' : 'Faol emas'}`;
            const actions = document.createElement('div');
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'table-action';
            edit.textContent = 'Tahrirlash';
            edit.addEventListener('click', () => {
                editingAdId = Number(ad.id);
                document.getElementById('adTitle').value = ad.title;
                document.getElementById('adImage').value = ad.image_url || '';
                document.getElementById('adDestination').value = ad.destination_url;
                document.getElementById('adPlacement').value = ad.placement;
                document.getElementById('adFormMessage').textContent = 'Reklama tahrirlash uchun tanlandi.';
                document.querySelector('#adForm button[type="submit"]').textContent = 'O‘zgarishlarni saqlash';
                document.getElementById('adTitle').focus();
            });
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'table-action';
            toggle.textContent = Number(ad.is_active) ? 'O‘chirish' : 'Faollashtirish';
            toggle.addEventListener('click', async () => {
                try {
                    const saved = await fetchAPI('admin_save_ad', 'POST', {
                        id: ad.id,
                        title: ad.title,
                        image_url: ad.image_url,
                        destination_url: ad.destination_url,
                        placement: ad.placement,
                        is_active: Number(ad.is_active) ? 0 : 1,
                    });
                    if (!saved.success) throw new Error(saved.error);
                    await loadAds();
                } catch (error) {
                    showMessage(error.message || 'Reklama holatini o‘zgartirib bo‘lmadi.');
                }
            });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'table-action danger-action';
            remove.textContent = 'Butunlay o‘chirish';
            remove.addEventListener('click', async () => {
                if (!window.confirm('Reklamani butunlay o‘chirasizmi?')) return;
                try {
                    const deleted = await fetchAPI('admin_delete_ad', 'POST', { id: ad.id });
                    if (!deleted.success) throw new Error(deleted.error);
                    await loadAds();
                } catch (error) {
                    showMessage(error.message || 'Reklama o‘chirilmadi.');
                }
            });
            actions.append(edit, toggle, remove);
            item.append(title, placement, actions);
            list.append(item);
        });
    }

    async function loadSettings() {
        const result = await fetchAPI('admin_get_settings');
        if (!result.success) throw new Error(result.error || 'Tizim sozlamalarini yuklab bo‘lmadi.');
        const settings = result.data;
        document.getElementById('allowRegistration').value = settings.allow_registration || '1';
        document.getElementById('maintenanceMode').value = settings.maintenance_mode || '0';
        document.getElementById('ffmpegEnabled').value = settings.ffmpeg_enabled || '0';
        document.getElementById('ffmpegPath').value = settings.ffmpeg_path || '';
        document.getElementById('ffprobePath').value = settings.ffprobe_path || '';
        document.getElementById('loginAttemptLimit').value = settings.login_attempt_limit || '8';
        document.getElementById('loginWindowMinutes').value = settings.login_window_minutes || '15';
    }

    async function loadActivityLogs() {
        const result = await fetchAPI('admin_activity_logs', 'GET', { limit: 100 });
        if (!result.success) throw new Error(result.error || 'Faollik jurnalini yuklab bo‘lmadi.');
        const table = document.getElementById('adminLogsTableBody');
        if (!result.data.length) {
            showEmpty(table, 5, 'Faollik qayd etilmagan.');
            return;
        }
        const rows = result.data.map((entry) => {
            const row = document.createElement('tr');
            row.append(
                cell(entry.created_at),
                cell(entry.actor_name || entry.actor_email || 'Tizim'),
                cell(entry.actor_role ? roleName(entry.actor_role) : 'Tizim'),
                cell(activityName(entry.event)),
                cell(entry.details),
            );
            return row;
        });
        table.replaceChildren(...rows);
    }

    async function refreshDashboard() {
        await Promise.all([loadStats(), loadMovies()]);
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        const units = ['KB', 'MB', 'GB'];
        let value = bytes;
        let unit = -1;
        do {
            value /= 1024;
            unit += 1;
        } while (value >= 1024 && unit < units.length - 1);
        return `${value.toFixed(1)} ${units[unit]}`;
    }

    function pendingUploads() {
        try {
            const value = JSON.parse(localStorage.getItem(uploadStorageKey) || '[]');
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    }

    function savePendingUpload(upload) {
        const uploads = pendingUploads().filter((item) => item.uploadId !== upload.uploadId);
        uploads.push({
            uploadId: upload.uploadId,
            fileName: upload.file.name,
            fileSize: upload.file.size,
            lastModified: upload.file.lastModified,
            metadata: upload.metadata,
        });
        localStorage.setItem(uploadStorageKey, JSON.stringify(uploads.slice(-20)));
    }

    function removePendingUpload(uploadId) {
        const uploads = pendingUploads().filter((item) => item.uploadId !== uploadId);
        localStorage.setItem(uploadStorageKey, JSON.stringify(uploads));
    }

    function pendingUploadFor(file, metadata) {
        return pendingUploads().find((item) => item.fileName === file.name
            && item.fileSize === file.size
            && item.lastModified === file.lastModified
            && JSON.stringify(item.metadata) === JSON.stringify(metadata));
    }

    function setUploadControls() {
        pauseUploadButton.hidden = !uploadBusy || uploadFinalizing;
        pauseUploadButton.disabled = uploadPaused || uploadFinalizing;
        resumeUploadButton.hidden = !activeUpload || uploadBusy || !uploadPaused;
        cancelUploadButton.hidden = !activeUpload;
        cancelUploadButton.disabled = uploadFinalizing;
    }

    async function createOrResumeUpload(file, metadata, poster) {
        const pending = pendingUploadFor(file, metadata);
        if (pending && /^[a-f0-9]{32}$/.test(pending.uploadId)) {
            const result = await fetchAPI('admin_upload_status', 'GET', { upload_id: pending.uploadId });
            if (result.success && result.data.status === 'completed') {
                removePendingUpload(pending.uploadId);
                return { completed: true };
            }
            if (result.success && result.data.status === 'uploading') {
                return {
                    uploadId: pending.uploadId,
                    file,
                    metadata,
                    poster,
                    chunkCount: result.data.chunk_count,
                    chunkSize: result.data.chunk_size,
                };
            }
            if (result.success && result.data.status === 'assembling') {
                throw new Error('Video serverda yakuniy yig‘ilmoqda. Bir necha daqiqadan so‘ng davom ettiring.');
            }
            if (result.http_status !== 404 && result.http_status !== 410) {
                throw new Error(result.error || 'Oldingi yuklash sessiyasini tekshirib bo‘lmadi.');
            }
            removePendingUpload(pending.uploadId);
        }

        const initData = new FormData();
        initData.append('title', metadata.title);
        initData.append('genre', metadata.genre);
        initData.append('year', metadata.year);
        initData.append('description', metadata.description);
        initData.append('total_size', String(file.size));
        const result = await fetchAPI('admin_upload_init', 'POST', initData);
        if (!result.success) throw new Error(result.error || 'Yuklash sessiyasini yaratib bo‘lmadi.');
        const upload = {
            uploadId: result.data.upload_id,
            file,
            metadata,
            poster,
            chunkCount: result.data.chunk_count,
            chunkSize: result.data.chunk_size,
        };
        savePendingUpload(upload);
        return upload;
    }

    function updateUploadProgress(completedBytes, currentBytes, totalBytes, baselineBytes, startedAt) {
        const sentBytes = Math.min(totalBytes, completedBytes + currentBytes);
        const percent = totalBytes ? Math.floor((sentBytes / totalBytes) * 100) : 0;
        progress.value = percent;
        const elapsed = (Date.now() - startedAt) / 1000;
        const speed = elapsed > 0 ? Math.max(0, sentBytes - baselineBytes) / elapsed : 0;
        const remainingSeconds = speed > 0 ? Math.ceil((totalBytes - sentBytes) / speed) : 0;
        const speedText = speed > 0 ? ` | ${formatBytes(speed)}/s | taxminan ${Math.ceil(remainingSeconds / 60)} daqiqa qoldi` : '';
        uploadStatus.textContent = `${percent}% | ${formatBytes(sentBytes)} / ${formatBytes(totalBytes)}${speedText}`;
    }

    async function transferUpload(upload) {
        if (uploadBusy) return { paused: true };
        uploadBusy = true;
        uploadPaused = false;
        uploadFinalizing = false;
        setUploadControls();
        try {
            const statusResult = await fetchAPI('admin_upload_status', 'GET', { upload_id: upload.uploadId });
            if (!statusResult.success) throw new Error(statusResult.error || 'Yuklash holatini tekshirib bo‘lmadi.');
            if (statusResult.data.status === 'completed') return { success: true, message: 'Kino muvaffaqiyatli yuklandi.' };
            if (statusResult.data.status !== 'uploading') throw new Error('Yuklash sessiyasi serverda boshqa amal bilan band.');

            const uploaded = new Set(statusResult.data.uploaded_chunks);
            let completedBytes = statusResult.data.uploaded_bytes;
            const baselineBytes = completedBytes;
            const startedAt = Date.now();
            progress.hidden = false;
            uploadStatus.textContent = `Davom etmoqda: ${formatBytes(completedBytes)} / ${formatBytes(upload.file.size)}`;
            for (let index = 0; index < upload.chunkCount; index += 1) {
                if (uploaded.has(index)) continue;
                if (uploadPaused) return { paused: true };

                const start = index * upload.chunkSize;
                const chunk = upload.file.slice(start, Math.min(start + upload.chunkSize, upload.file.size));
                const digest = await crypto.subtle.digest('SHA-256', await chunk.arrayBuffer());
                if (uploadPaused) return { paused: true };
                const chunkHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
                const chunkData = new FormData();
                chunkData.append('upload_id', upload.uploadId);
                chunkData.append('chunk_index', String(index));
                chunkData.append('chunk_sha256', chunkHash);
                chunkData.append('chunk', chunk, 'chunk.bin');
                uploadAbortController = new AbortController();
                const result = await fetchAPI('admin_upload_chunk', 'POST', chunkData, (percent) => {
                    updateUploadProgress(completedBytes, chunk.size * percent / 100, upload.file.size, baselineBytes, startedAt);
                }, uploadAbortController.signal);
                uploadAbortController = null;
                if (!result.success) throw new Error(result.error || `Video qismini (${index + 1}) yuklab bo‘lmadi.`);
                uploaded.add(index);
                completedBytes += chunk.size;
                updateUploadProgress(completedBytes, 0, upload.file.size, baselineBytes, startedAt);
            }

            uploadFinalizing = true;
            setUploadControls();
            uploadStatus.textContent = 'Barcha qismlar keldi. Video tekshirilmoqda va yig‘ilmoqda...';
            const finalizeData = new FormData();
            finalizeData.append('upload_id', upload.uploadId);
            if (upload.poster) finalizeData.append('poster', upload.poster);
            const result = await fetchAPI('admin_upload_finalize', 'POST', finalizeData);
            if (!result.success) throw new Error(result.error || 'Video yakunlanmadi. Qismlar saqlangan, qayta urinib ko‘rishingiz mumkin.');
            return { success: true, message: result.data.message };
        } catch (error) {
            if (uploadPaused && error.name === 'AbortError') {
                uploadStatus.textContent = 'Yuklash vaqtincha to‘xtatildi. Shu faylni qayta tanlab davom ettirishingiz mumkin.';
                return { paused: true };
            }
            throw error;
        } finally {
            uploadAbortController = null;
            uploadBusy = false;
            uploadFinalizing = false;
            setUploadControls();
        }
    }

    function finishUpload(result) {
        if (activeUpload) removePendingUpload(activeUpload.uploadId);
        activeUpload = null;
        uploadPaused = false;
        progress.value = 100;
        uploadStatus.textContent = 'Yuklash yakunlandi.';
        setUploadControls();
        return result;
    }

    function openMovieForm(movie = null) {
        editingMovieId = movie ? Number(movie.id) : null;
        movieForm.reset();
        document.getElementById('movieYear').value = String(movie?.year || new Date().getFullYear());
        document.getElementById('movieTitle').value = movie?.title || '';
        document.getElementById('movieGenre').value = movie?.genre || 'action';
        document.getElementById('movieDescription').value = movie?.description || '';
        document.getElementById('movieModalTitle').textContent = movie ? 'Kino ma’lumotlarini tahrirlash' : 'Kino qo‘shish';
        document.getElementById('saveMovieBtn').textContent = movie ? 'Saqlash' : 'Yuklash';
        document.getElementById('movieFormMessage').textContent = '';
        uploadStatus.textContent = '';
        progress.value = 0;
        progress.hidden = true;
        activeUpload = null;
        uploadPaused = false;
        setUploadControls();
        videoInput.required = !movie;
        videoInput.closest('.form-group').hidden = Boolean(movie);
        posterInput.closest('.form-group').hidden = Boolean(movie);
        modal.classList.add('active');
    }

    function activateTab(targetId) {
        const target = document.getElementById(targetId);
        if (!target || target.hidden) return;
        links.forEach((item) => item.classList.toggle('active', item.dataset.target === targetId));
        tabs.forEach((tab) => tab.classList.toggle('active', tab.id === targetId));
    }

    links.forEach((link) => {
        link.addEventListener('click', (event) => {
            if (link.dataset.target) {
                event.preventDefault();
                activateTab(link.dataset.target);
            }
        });
    });
    document.getElementById('openMovieModalBtn').addEventListener('click', () => openMovieForm());
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('active'); });
    pauseUploadButton.addEventListener('click', () => {
        uploadPaused = true;
        uploadAbortController?.abort();
    });
    resumeUploadButton.addEventListener('click', () => {
        if (!activeUpload || uploadBusy) return;
        uploadPaused = false;
        movieForm.requestSubmit();
    });
    cancelUploadButton.addEventListener('click', async () => {
        if (!activeUpload || uploadFinalizing) return;
        uploadPaused = true;
        uploadAbortController?.abort();
        if (activeTransfer) await activeTransfer.catch(() => {});
        try {
            const result = await fetchAPI('admin_upload_cancel', 'POST', { upload_id: activeUpload.uploadId });
            if (!result.success) throw new Error(result.error || 'Yuklashni bekor qilib bo‘lmadi.');
            removePendingUpload(activeUpload.uploadId);
            activeUpload = null;
            uploadPaused = false;
            progress.value = 0;
            uploadStatus.textContent = 'Yuklash bekor qilindi.';
            setUploadControls();
        } catch (error) {
            document.getElementById('movieFormMessage').textContent = error.message || 'Yuklashni bekor qilib bo‘lmadi.';
        }
    });

    movieForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('movieFormMessage');
        const saveButton = document.getElementById('saveMovieBtn');
        const formData = new FormData(movieForm);
        formData.delete('poster');
        formData.delete('video');
        saveButton.disabled = true;
        message.textContent = '';
        if (!editingMovieId) {
            progress.hidden = false;
            progress.value = 0;
        }
        try {
            let result;
            if (editingMovieId) {
                formData.append('id', String(editingMovieId));
                result = await fetchAPI('admin_update_movie', 'POST', formData);
            } else {
                const video = videoInput.files[0];
                if (!video) throw new Error('MP4 yoki WebM video faylini tanlang.');
                if (video.size > maxVideoUploadBytes) throw new Error('Video 6 GB chegarasidan katta. Kichikroq fayl tanlang.');
                if (!crypto?.subtle) throw new Error('Brauzer xavfsiz ulanishni qo‘llamaydi. Lokalhost yoki HTTPS manzilidan foydalaning.');
                const metadata = {
                    title: document.getElementById('movieTitle').value.trim(),
                    genre: document.getElementById('movieGenre').value,
                    year: document.getElementById('movieYear').value,
                    description: document.getElementById('movieDescription').value.trim(),
                };
                const poster = posterInput.files[0] || null;
                const upload = await createOrResumeUpload(video, metadata, poster);
                if (upload.completed) {
                    result = { success: true, message: 'Bu video avval muvaffaqiyatli yuklangan.' };
                } else {
                    activeUpload = upload;
                    uploadPaused = false;
                    activeTransfer = transferUpload(upload);
                    result = await activeTransfer;
                    if (result.paused) return;
                    finishUpload(result);
                }
            }
            if (!result.success) throw new Error(result.error || 'Kino saqlanmadi.');
            modal.classList.remove('active');
            progress.value = 0;
            progress.hidden = true;
            await refreshDashboard();
            showMessage(result.message, false);
        } catch (error) {
            message.textContent = error.message || 'Kino saqlanmadi.';
        } finally {
            saveButton.disabled = false;
            if (!activeUpload) progress.hidden = true;
            setUploadControls();
        }
    });

    document.getElementById('adForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const resultMessage = document.getElementById('adFormMessage');
        const data = new FormData(form);
        data.set('is_active', '1');
        if (editingAdId) data.set('id', String(editingAdId));
        try {
            const result = await fetchAPI('admin_save_ad', 'POST', data);
            if (!result.success) throw new Error(result.error || 'Reklama saqlanmadi.');
            form.reset();
            editingAdId = null;
            form.querySelector('button[type="submit"]').textContent = 'Reklama qo‘shish';
            await loadAds();
            resultMessage.textContent = 'Reklama saqlandi.';
        } catch (error) {
            resultMessage.textContent = error.message || 'Reklama saqlanmadi.';
        }
    });

    const adminCreateForm = document.getElementById('adminCreateForm');
    adminCreateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('adminCreateMessage');
        if (!window.confirm('Yangi Admin hisobini yaratishni tasdiqlaysizmi?')) return;
        const values = Object.fromEntries(new FormData(adminCreateForm));
        try {
            const result = await fetchAPI('admin_create_admin', 'POST', values);
            if (!result.success) throw new Error(result.error || 'Administrator yaratilmadi.');
            adminCreateForm.reset();
            await Promise.all([loadAdmins(), loadRoleUsers(), loadStats()]);
            message.textContent = 'Admin hisobi yaratildi.';
        } catch (error) {
            message.textContent = error.message || 'Admin hisobi yaratilmadi.';
        }
    });

    document.getElementById('settingsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('settingsMessage');
        if (!window.confirm('Global sozlamalarni yangilashni tasdiqlaysizmi? Ayrim o‘zgarishlar foydalanuvchilarga darhol ta’sir qiladi.')) return;
        const values = Object.fromEntries(new FormData(event.currentTarget));
        try {
            const result = await fetchAPI('admin_save_settings', 'POST', values);
            if (!result.success) throw new Error(result.error || 'Sozlamalar saqlanmadi.');
            message.textContent = 'Tizim sozlamalari saqlandi.';
            showMessage('Tizim sozlamalari yangilandi.', false);
        } catch (error) {
            message.textContent = error.message || 'Sozlamalar saqlanmadi.';
            message.classList.add('error');
        }
    });

    try {
        currentUser = await requireAdmin();
        if (!currentUser) return;
        const isSuperAdmin = currentUser.role === 'super_admin';
        document.querySelectorAll('.super-admin-only').forEach((element) => {
            element.hidden = !isSuperAdmin;
        });
        document.getElementById('adminRoleDisplay').textContent = isSuperAdmin ? 'Super Admin' : 'Admin';
        document.querySelector('.admin-header h1').textContent = isSuperAdmin ? 'Super Admin paneli' : 'Admin paneli';
        const requestedTab = window.location.hash.slice(1);
        if (requestedTab) activateTab(requestedTab);
        await Promise.all([loadStats(), loadMovies(), loadUsers(), loadComments(), loadAds()]);
        if (isSuperAdmin) {
            await Promise.all([loadRoleUsers(), loadAdmins(), loadSettings(), loadActivityLogs()]);
        }
    } catch (error) {
        showMessage(error.message || 'Admin panel yuklanmadi.');
        showEmpty(movieTable, 6, error.message || 'Ma’lumot yuklanmadi.');
        showEmpty(usersTable, 9, error.message || 'Ma’lumot yuklanmadi.');
        showEmpty(commentsTable, 5, error.message);
    }
});

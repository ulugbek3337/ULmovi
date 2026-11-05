const API_URL = new URL('../backend/index.php', window.location.href);
let csrfToken = null;

function httpErrorMessage(status) {
    const messages = {
        400: 'So‘rov ma’lumoti noto‘g‘ri. Formani tekshiring.',
        401: 'Kirish sessiyasi tugagan. Qayta kiring va yuklashni davom ettiring.',
        403: 'Bu amal uchun ruxsat yo‘q yoki xavfsizlik tokeni yangilanishi kerak.',
        404: 'API yoki yuklash sessiyasi topilmadi.',
        413: 'So‘rov server yoki proksi hajmi chegarasidan oshdi. Kichikroq qism bilan qayta urinib ko‘ring.',
        422: 'Yuborilgan ma’lumot yoki video qismi tekshiruvdan o‘tmadi.',
        429: 'So‘rovlar ko‘payib ketdi. Biroz kutib qayta urinib ko‘ring.',
        500: 'Serverda xatolik yuz berdi. Administrator server jurnalini tekshirishi kerak.',
        502: 'Proksi yoki tunnel server javobini uzatolmadi. Ulanishni tekshirib qayta urinib ko‘ring.',
        503: 'Server vaqtincha xizmat ko‘rsata olmayapti. Birozdan so‘ng qayta urinib ko‘ring.',
        504: 'Server yoki tunnel kutish vaqti tugadi. Video qismlari saqlangan bo‘lishi mumkin; holatni tekshirib davom eting.',
    };
    return messages[status] || `Server xatosi (${status}).`;
}

async function fetchAPI(action, method = 'GET', data = null, onProgress = null, signal = null) {
    const requestMethod = method.toUpperCase();
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    const options = { method: requestMethod, credentials: 'same-origin' };

    if (requestMethod === 'GET' && data) {
        Object.entries(data).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                url.searchParams.set(key, String(value));
            }
        });
    }

    if (requestMethod === 'POST') {
        if (!csrfToken && action !== 'auth_csrf') {
            const tokenResponse = await fetchAPI('auth_csrf');
            if (!tokenResponse.success) {
                throw new Error(tokenResponse.error || 'Xavfsizlik tokenini olib bo‘lmadi.');
            }
        }

        const formData = data instanceof FormData ? data : new FormData();
        if (data && !(data instanceof FormData)) {
            Object.entries(data).forEach(([key, value]) => {
                if (value !== null && value !== undefined) formData.append(key, value);
            });
        }
        options.body = formData;
        if (csrfToken) options.headers = { 'X-CSRF-Token': csrfToken };
    }

    if (typeof onProgress === 'function') {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open(requestMethod, url.href);
            request.withCredentials = true;
            request.timeout = 180000;
            if (csrfToken && requestMethod === 'POST') request.setRequestHeader('X-CSRF-Token', csrfToken);
            request.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            });
            request.addEventListener('load', () => {
                let result;
                try {
                    result = JSON.parse(request.responseText);
                } catch {
                    reject(new Error(request.status ? httpErrorMessage(request.status) : 'Server javobini o‘qib bo‘lmadi.'));
                    return;
                }
                if (result.csrf_token) csrfToken = result.csrf_token;
                result.http_status = request.status;
                resolve(result);
            });
            request.addEventListener('error', () => reject(new Error('Internet, Apache yoki tunnel ulanishi uzildi. Tarmoqni tekshirib, muvaffaqiyatsiz video qismini qayta yuboring.')));
            request.addEventListener('timeout', () => reject(new Error('Video qismi 3 daqiqada yuborilmadi. Ulanishni tekshirib, shu qismni qayta urinib ko‘ring.')));
            request.addEventListener('abort', () => {
                const error = new Error('Joriy video qismi to‘xtatildi. Uni keyin davom ettirish mumkin.');
                error.name = 'AbortError';
                reject(error);
            });
            if (signal) {
                if (signal.aborted) {
                    request.abort();
                    return;
                }
                signal.addEventListener('abort', () => request.abort(), { once: true });
            }
            request.send(options.body || null);
        });
    }

    const response = await fetch(url, options);
    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(response.ok ? 'Server javobini o‘qib bo‘lmadi.' : httpErrorMessage(response.status));
    }
    if (result.csrf_token) csrfToken = result.csrf_token;
    result.http_status = response.status;
    return result;
}

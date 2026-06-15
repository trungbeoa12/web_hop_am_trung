/**
 * CẤU HÌNH API FALLBACK - runtime config ưu tiên đọc từ /api/config trên Vercel
 *
 * Khi deploy, cấu hình API_BASE_URL trong Vercel.
 * Chỉ điền giá trị tại đây khi chạy static site không có endpoint /api/config.
 */
window.CHORD_CONFIG = {
    // Ví dụ: "https://ten-backend-render.onrender.com"
    apiBaseUrl: ""
};

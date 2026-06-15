/**
 * CẤU HÌNH API FALLBACK - runtime config ưu tiên đọc từ /api/config trên Vercel
 *
 * Khi deploy, cấu hình API_BASE_URL và API_SECRET_KEY trong Vercel.
 * Chỉ điền giá trị tại đây khi chạy static site không có endpoint /api/config.
 */
window.CHORD_CONFIG = {
    // Ví dụ: "https://ten-backend-render.onrender.com"
    apiBaseUrl: "",

    // Nếu bạn bật SECRET_KEY ở backend, điền vào đây để frontend có thể ghi dữ liệu.
    // LƯU Ý: giá trị này hiển thị công khai trong source code trình duyệt.
    // Chỉ dùng để hạn chế truy cập từ người dùng thông thường, không phải bảo mật cao.
    secretKey: ""
};

/**
 * CẤU HÌNH API - Cập nhật sau khi deploy Railway backend
 *
 * Sau khi Railway cấp URL (ví dụ https://web-hop-am-trung.railway.app),
 * thay giá trị apiBaseUrl bên dưới và push lại lên GitHub.
 * Vercel sẽ tự deploy lại.
 */
window.CHORD_CONFIG = {
    // Ví dụ: "https://web-hop-am-trung-production.up.railway.app"
    apiBaseUrl: "",

    // Nếu bạn bật SECRET_KEY ở backend, điền vào đây để frontend có thể ghi dữ liệu.
    // LƯU Ý: giá trị này hiển thị công khai trong source code trình duyệt.
    // Chỉ dùng để hạn chế truy cập từ người dùng thông thường, không phải bảo mật cao.
    secretKey: ""
};

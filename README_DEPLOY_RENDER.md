# Deploy Backend FastAPI Lên Render Free

Frontend tiếp tục deploy trên Vercel. Backend FastAPI deploy trên Render bằng cấu
hình tại `render.yaml`.

## Database PostgreSQL

Backend đọc `DATABASE_URL` từ biến môi trường và kết nối bằng SQLAlchemy tới
PostgreSQL. Với Supabase, dùng connection string do Supabase cung cấp; backend sẽ
tự chuẩn hóa URL cho SQLAlchemy và thêm `sslmode=require` nếu còn thiếu.

Khi app khởi động, backend tự chạy `CREATE TABLE IF NOT EXISTS` thông qua
`Base.metadata.create_all(...)`, nên bảng `songs` sẽ được tạo nếu database còn
trống.

## Đăng Nhập Admin

Backend giờ tách quyền ghi dữ liệu ra khỏi quyền đọc. Người dùng thường chỉ có
thể xem/tìm bài hát; các thao tác thêm/xóa cần đăng nhập admin trên frontend.

Trên Render, đặt các biến môi trường:

- `ADMIN_PASSWORD=<mat_khau_admin>`
- `ADMIN_TOKEN_SECRET=<chuoi_bi_mat_ky_token>`

Nếu bạn chưa muốn đổi ngay cấu hình cũ, backend vẫn chấp nhận `SECRET_KEY` như
giá trị dự phòng cho mật khẩu và secret ký token, nhưng nên chuyển sang hai biến
riêng biệt ở trên để rõ trách nhiệm hơn.

## Deploy Render

1. Vào Render, chọn **New → Web Service** và kết nối GitHub repository.
2. Có thể dùng Blueprint từ `render.yaml`, hoặc nhập thủ công:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
3. Cấu hình Environment Variables:
   - `ALLOWED_ORIGINS=https://ten-domain-vercel-cua-toi.vercel.app`
   - `DATABASE_URL=postgresql://...` hoặc giá trị `postgres://...` từ Render/Supabase
   - `ADMIN_PASSWORD=<mat_khau_admin>`
   - `ADMIN_TOKEN_SECRET=<chuoi_bi_mat_ky_token>`
4. Sau khi deploy, kiểm tra `https://ten-backend-render.onrender.com/health`.

Nếu cần cho phép môi trường dev, đặt nhiều origin cách nhau bởi dấu phẩy:

```text
https://ten-domain-vercel-cua-toi.vercel.app,http://localhost:3000,http://localhost:5173,http://127.0.0.1:5500
```

## Cấu hình Vercel

Giữ nguyên `vercel.json`, sau đó đặt Environment Variables trên Vercel:

```text
API_BASE_URL=https://ten-backend-render.onrender.com
```

`api/config.js` chỉ cung cấp URL backend cho frontend tại runtime. Mật khẩu admin
không được gửi xuống trình duyệt.

## Chạy Backend Local

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require'
export ADMIN_PASSWORD='your-admin-password'
export ADMIN_TOKEN_SECRET='your-token-secret'
uvicorn main:app --reload
```

Kiểm tra tại `http://127.0.0.1:8000/health`.

## SQL Migration Thủ Công

Backend hiện tự tạo bảng `songs`. Nếu muốn tạo thủ công trước trên Supabase SQL
Editor, dùng câu lệnh:

```sql
CREATE TABLE IF NOT EXISTS songs (
   id SERIAL PRIMARY KEY,
   title VARCHAR NOT NULL,
   artist VARCHAR NOT NULL DEFAULT '',
   key VARCHAR NOT NULL DEFAULT 'C',
   genre VARCHAR NOT NULL DEFAULT '',
   content TEXT NOT NULL DEFAULT ''
);
```

## Commit Và Push

```bash
git add .
git commit -m "Configure FastAPI backend for Render deployment"
git push
```

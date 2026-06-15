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

## Deploy Render

1. Vào Render, chọn **New → Web Service** và kết nối GitHub repository.
2. Có thể dùng Blueprint từ `render.yaml`, hoặc nhập thủ công:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
3. Cấu hình Environment Variables:
   - `SECRET_KEY=<chuoi_bi_mat>`
   - `ALLOWED_ORIGINS=https://ten-domain-vercel-cua-toi.vercel.app`
   - `DATABASE_URL=postgresql://...` hoặc giá trị `postgres://...` từ Render/Supabase
4. Sau khi deploy, kiểm tra `https://ten-backend-render.onrender.com/health`.

Nếu cần cho phép môi trường dev, đặt nhiều origin cách nhau bởi dấu phẩy:

```text
https://ten-domain-vercel-cua-toi.vercel.app,http://localhost:3000,http://localhost:5173,http://127.0.0.1:5500
```

## Cấu hình Vercel

Giữ nguyên `vercel.json`, sau đó đặt Environment Variables trên Vercel:

```text
API_BASE_URL=https://ten-backend-render.onrender.com
API_SECRET_KEY=<SECRET_KEY giống backend>
```

`api/config.js` cung cấp các giá trị này cho frontend tại runtime. Vì secret được
gửi tới trình duyệt, cơ chế này chỉ hạn chế thao tác ghi thông thường, không phải
một lớp xác thực bí mật tuyệt đối.

## Chạy Backend Local

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require'
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

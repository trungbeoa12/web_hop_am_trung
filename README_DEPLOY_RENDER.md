# Deploy Backend FastAPI Lên Render Free

Frontend tiếp tục deploy trên Vercel. Backend FastAPI deploy trên Render bằng cấu
hình tại `render.yaml`.

## Lưu ý về SQLite

Render Free không cung cấp persistent disk. Nếu dùng SQLite, dữ liệu thêm/xóa có
thể mất sau khi service restart hoặc redeploy. Mặc định backend dùng
`backend/songs.db`; có thể đặt `DB_PATH` để đổi vị trí file, nhưng điều đó không
làm dữ liệu bền vững trên gói Free.

## Deploy Render

1. Vào Render, chọn **New → Web Service** và kết nối GitHub repository.
2. Có thể dùng Blueprint từ `render.yaml`, hoặc nhập thủ công:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
3. Cấu hình Environment Variables:
   - `SECRET_KEY=<chuoi_bi_mat>`
   - `ALLOWED_ORIGINS=https://ten-domain-vercel-cua-toi.vercel.app`
   - `DB_PATH=/opt/render/project/src/backend/songs.db` hoặc bỏ trống để dùng fallback
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
uvicorn main:app --reload
```

Kiểm tra tại `http://127.0.0.1:8000/health`.

## Commit Và Push

```bash
git add .
git commit -m "Configure FastAPI backend for Render deployment"
git push
```

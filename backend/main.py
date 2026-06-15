"""
FastAPI backend cho website Hợp Âm Trung Béo
- SQLite với WAL mode (tránh lỗi Database Lock)
- Persistent Volume trên Railway (DB_PATH=/data/songs.db)
- CORS cho phép Vercel frontend truy cập
- SECRET_KEY bảo vệ các API ghi dữ liệu
"""
import os
import sqlite3
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# ──────────────────────────────────────────────
# Cấu hình từ biến môi trường
# ──────────────────────────────────────────────
# Railway Volume sẽ mount tại /data → file DB sẽ tồn tại sau khi restart
DB_PATH = os.getenv("DB_PATH", "/data/songs.db")
SECRET_KEY = os.getenv("SECRET_KEY", "")

# Các origin được phép gọi API (thêm domain Vercel của bạn)
# Ví dụ: ALLOWED_ORIGINS=https://trung-beo-chords.vercel.app,https://custom-domain.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


# ──────────────────────────────────────────────
# Khởi tạo database khi app start
# ──────────────────────────────────────────────
def _init_db():
    """Tạo thư mục và bảng songs nếu chưa tồn tại."""
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    # BẬT WAL mode: cho phép đọc song song với ghi, tránh lỗi "database is locked"
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")  # hiệu suất tốt hơn so với FULL
    conn.execute("""
        CREATE TABLE IF NOT EXISTS songs (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            title   TEXT NOT NULL,
            artist  TEXT NOT NULL DEFAULT '',
            key     TEXT NOT NULL DEFAULT 'C',
            genre   TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT ''
        )
    """)
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    yield


# ──────────────────────────────────────────────
# Khởi tạo app
# ──────────────────────────────────────────────
app = FastAPI(title="Hợp Âm Trung Béo API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Dependency: kết nối DB với WAL được bật
# ──────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    try:
        yield conn
    finally:
        conn.close()


# ──────────────────────────────────────────────
# Bảo vệ các endpoint ghi bằng SECRET_KEY
# ──────────────────────────────────────────────
def require_secret(x_secret_key: Optional[str] = Header(default=None)):
    """
    Nếu SECRET_KEY được cấu hình, client phải gửi header:
        X-Secret-Key: <your_secret>
    """
    if SECRET_KEY and x_secret_key != SECRET_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: sai hoặc thiếu X-Secret-Key")


# ──────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────
class SongIn(BaseModel):
    title: str
    artist: str = ""
    key: str = "C"
    genre: str = ""
    content: str = ""

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tên bài hát không được để trống")
        return v


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────
@app.get("/health")
def health():
    """Kiểm tra server có sống không."""
    return {"status": "ok", "db": DB_PATH}


@app.get("/api/v1/songs")
def list_songs(db: sqlite3.Connection = Depends(get_db)):
    """Trả về toàn bộ danh sách bài hát, mới nhất trước."""
    rows = db.execute(
        "SELECT id, title, artist, key, genre, content FROM songs ORDER BY id DESC"
    ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/v1/songs", status_code=201)
def create_song(
    song: SongIn,
    db: sqlite3.Connection = Depends(get_db),
    _=Depends(require_secret),
):
    """Thêm bài hát mới (yêu cầu X-Secret-Key nếu SECRET_KEY được cấu hình)."""
    cur = db.execute(
        "INSERT INTO songs (title, artist, key, genre, content) VALUES (?, ?, ?, ?, ?)",
        (song.title.strip(), song.artist.strip(), song.key.strip(), song.genre.strip(), song.content),
    )
    db.commit()
    row = db.execute("SELECT * FROM songs WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/api/v1/songs/{song_id}")
def delete_song(
    song_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _=Depends(require_secret),
):
    """Xóa bài hát theo ID (yêu cầu X-Secret-Key nếu SECRET_KEY được cấu hình)."""
    row = db.execute("SELECT id FROM songs WHERE id=?", (song_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bài hát id={song_id}")
    db.execute("DELETE FROM songs WHERE id=?", (song_id,))
    db.commit()
    return {"ok": True, "deleted_id": song_id}

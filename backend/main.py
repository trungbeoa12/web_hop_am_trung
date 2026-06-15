"""
FastAPI backend cho website Hợp Âm Trung Béo.
- DATABASE_URL cấu hình qua biến môi trường cho PostgreSQL trên Render/Supabase
- SQLAlchemy quản lý kết nối và tạo bảng nếu chưa tồn tại
- CORS cho phép Vercel frontend truy cập
- SECRET_KEY bảo vệ các API ghi dữ liệu
"""
import os
from contextlib import asynccontextmanager
from typing import Generator, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from sqlalchemy import Column, Integer, String, Text, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ──────────────────────────────────────────────
# Cấu hình từ biến môi trường
# ──────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "")

# Các origin được phép gọi API (thêm domain Vercel của bạn)
# Ví dụ: ALLOWED_ORIGINS=https://trung-beo-chords.vercel.app,https://custom-domain.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


def _normalize_database_url(raw_url: str) -> str:
    """Chuẩn hóa DATABASE_URL để SQLAlchemy dùng được trên Render/Supabase."""
    database_url = raw_url.strip()
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    parts = urlsplit(database_url)
    if parts.scheme.startswith("postgresql"):
        query_params = dict(parse_qsl(parts.query, keep_blank_values=True))
        query_params.setdefault("sslmode", "require")
        database_url = urlunsplit(
            (parts.scheme, parts.netloc, parts.path, urlencode(query_params), parts.fragment)
        )

    return database_url


RAW_DATABASE_URL = os.getenv("DATABASE_URL", "")
if not RAW_DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL environment variable")

DATABASE_URL = _normalize_database_url(RAW_DATABASE_URL)


def _safe_database_label(database_url: str) -> str:
    parts = urlsplit(database_url)
    database_name = parts.path.lstrip("/") or "default"
    return f"{parts.scheme}://{parts.hostname or 'unknown'}/{database_name}"


Base = declarative_base()


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False, default="", server_default="")
    key = Column(String, nullable=False, default="C", server_default="C")
    genre = Column(String, nullable=False, default="", server_default="")
    content = Column(Text, nullable=False, default="", server_default="")


engine: Engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


# ──────────────────────────────────────────────
# Khởi tạo database khi app start
# ──────────────────────────────────────────────
def _init_db() -> None:
    """Tạo bảng songs nếu chưa tồn tại."""
    Base.metadata.create_all(bind=engine)


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
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
    return {"status": "ok", "db": _safe_database_label(DATABASE_URL)}


def _song_to_dict(song: Song) -> dict:
    return {
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "key": song.key,
        "genre": song.genre,
        "content": song.content,
    }


@app.get("/api/v1/songs")
def list_songs(db: Session = Depends(get_db)):
    """Trả về toàn bộ danh sách bài hát, mới nhất trước."""
    songs = db.execute(select(Song).order_by(Song.id.desc())).scalars().all()
    return [_song_to_dict(song) for song in songs]


@app.post("/api/v1/songs", status_code=201)
def create_song(
    song: SongIn,
    db: Session = Depends(get_db),
    _=Depends(require_secret),
):
    """Thêm bài hát mới (yêu cầu X-Secret-Key nếu SECRET_KEY được cấu hình)."""
    new_song = Song(
        title=song.title.strip(),
        artist=song.artist.strip(),
        key=song.key.strip(),
        genre=song.genre.strip(),
        content=song.content,
    )
    db.add(new_song)
    db.commit()
    db.refresh(new_song)
    return _song_to_dict(new_song)


@app.delete("/api/v1/songs/{song_id}")
def delete_song(
    song_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_secret),
):
    """Xóa bài hát theo ID (yêu cầu X-Secret-Key nếu SECRET_KEY được cấu hình)."""
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bài hát id={song_id}")
    db.delete(song)
    db.commit()
    return {"ok": True, "deleted_id": song_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))

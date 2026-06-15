"""
FastAPI backend cho website Hợp Âm Trung Béo.
- DATABASE_URL cấu hình qua biến môi trường cho PostgreSQL trên Render/Supabase
- SQLAlchemy quản lý kết nối và tạo bảng nếu chưa tồn tại
- CORS cho phép Vercel frontend truy cập
- Đăng nhập admin mới được phép ghi dữ liệu
"""
import os
import base64
import hashlib
import hmac
import json
import time
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
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or SECRET_KEY
ADMIN_TOKEN_SECRET = os.getenv("ADMIN_TOKEN_SECRET") or SECRET_KEY
ADMIN_TOKEN_TTL_MINUTES = int(os.getenv("ADMIN_TOKEN_TTL_MINUTES", "720"))

if not ADMIN_PASSWORD:
    raise RuntimeError("Missing ADMIN_PASSWORD or legacy SECRET_KEY environment variable")

if not ADMIN_TOKEN_SECRET:
    raise RuntimeError("Missing ADMIN_TOKEN_SECRET or legacy SECRET_KEY environment variable")

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


def _base64_url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _base64_url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _create_admin_token() -> str:
    issued_at = int(time.time())
    payload = {
        "sub": "admin",
        "iat": issued_at,
        "exp": issued_at + (ADMIN_TOKEN_TTL_MINUTES * 60),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(
        ADMIN_TOKEN_SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).digest()
    return f"{_base64_url_encode(payload_bytes)}.{_base64_url_encode(signature)}"


def _verify_admin_token(token: str) -> dict:
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("invalid token format") from exc

    payload_bytes = _base64_url_decode(payload_part)
    expected_signature = hmac.new(
        ADMIN_TOKEN_SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(_base64_url_encode(expected_signature), signature_part):
        raise ValueError("invalid token signature")

    payload = json.loads(payload_bytes.decode("utf-8"))
    if payload.get("sub") != "admin":
        raise ValueError("invalid token subject")

    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("token expired")

    return payload


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


class AdminLoginIn(BaseModel):
    password: str


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────
@app.get("/health")
def health():
    """Kiểm tra server có sống không."""
    return {"status": "ok", "db": _safe_database_label(DATABASE_URL), "auth": "admin-login"}


@app.post("/api/admin/login")
@app.post("/api/v1/admin/login")
def admin_login(payload: AdminLoginIn):
    """Đăng nhập admin để nhận token ghi dữ liệu."""
    if payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Sai mật khẩu admin")

    token = _create_admin_token()
    return {
        "token": token,
        "token_type": "bearer",
        "expires_in": ADMIN_TOKEN_TTL_MINUTES * 60,
    }


@app.get("/api/admin/me")
@app.get("/api/v1/admin/me")
def admin_me(authorization: Optional[str] = Header(default=None)):
    """Xác nhận token admin còn hợp lệ."""
    _require_admin(authorization)
    return {"role": "admin"}


def _require_admin(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: thiếu token đăng nhập admin")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized: token rỗng")

    try:
        return _verify_admin_token(token)
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Unauthorized: token admin không hợp lệ")


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
    authorization: Optional[str] = Header(default=None),
):
    """Thêm bài hát mới (yêu cầu token admin)."""
    _require_admin(authorization)
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


@app.put("/api/v1/songs/{song_id}")
def update_song(
    song_id: int,
    song: SongIn,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """Sửa bài hát theo ID (yêu cầu token admin)."""
    _require_admin(authorization)
    existing_song = db.get(Song, song_id)
    if not existing_song:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bài hát id={song_id}")

    existing_song.title = song.title.strip()
    existing_song.artist = song.artist.strip()
    existing_song.key = song.key.strip()
    existing_song.genre = song.genre.strip()
    existing_song.content = song.content
    db.commit()
    db.refresh(existing_song)
    return _song_to_dict(existing_song)


@app.delete("/api/v1/songs/{song_id}")
def delete_song(
    song_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """Xóa bài hát theo ID (yêu cầu token admin)."""
    _require_admin(authorization)
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bài hát id={song_id}")
    db.delete(song)
    db.commit()
    return {"ok": True, "deleted_id": song_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))

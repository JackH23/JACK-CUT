import json
import os
import tempfile
from contextlib import suppress
from typing import Any, Dict, Optional

from flask import (
    Flask,
    redirect,
    render_template_string,
    request,
    session,
    url_for,
    jsonify,
)
from uuid import uuid4

try:
    from moviepy.editor import ImageClip, VideoFileClip, concatenate_videoclips
    from moviepy.video.fx.loop import loop
    MOVIEPY_AVAILABLE = True
except ModuleNotFoundError:
    ImageClip = VideoFileClip = concatenate_videoclips = None  # type: ignore[assignment]
    loop = None  # type: ignore[assignment]
    MOVIEPY_AVAILABLE = False
from pymongo import MongoClient
from pymongo.errors import ConfigurationError

from templates import HOME_HTML, LOGIN_HTML, SIGNUP_HTML
from werkzeug.security import check_password_hash, generate_password_hash

def ensure_moviepy_imported() -> bool:
    """Attempt to import moviepy lazily when it becomes available."""

    global MOVIEPY_AVAILABLE, ImageClip, VideoFileClip, concatenate_videoclips, loop

    if MOVIEPY_AVAILABLE:
        return True

    try:
        from moviepy.editor import (
            ImageClip as _ImageClip,
            VideoFileClip as _VideoFileClip,
            concatenate_videoclips as _concatenate_videoclips,
        )
        from moviepy.video.fx.loop import loop as _loop
    except ModuleNotFoundError:
        return False

    ImageClip = _ImageClip  # type: ignore[assignment]
    VideoFileClip = _VideoFileClip  # type: ignore[assignment]
    concatenate_videoclips = _concatenate_videoclips  # type: ignore[assignment]
    loop = _loop  # type: ignore[assignment]
    MOVIEPY_AVAILABLE = True
    return True


app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Replace with a secure key in production


QUALITY_TO_HEIGHT = {
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
}

DEFAULT_EXPORT_HEIGHT = 720
DEFAULT_ASPECT_RATIO = '16:9'
MIN_IMAGE_CLIP_DURATION_SECONDS = 0.5


def parse_aspect_ratio(aspect_value: str) -> tuple[int, int]:
    try:
        raw_width, raw_height = (part.strip() for part in aspect_value.split(':', 1))
        width = int(raw_width)
        height = int(raw_height)
        if width > 0 and height > 0:
            return width, height
    except (ValueError, AttributeError):
        pass
    return 16, 9


def compute_export_dimensions(aspect_value: str, quality_value: str) -> tuple[int, int]:
    base_height = QUALITY_TO_HEIGHT.get((quality_value or '').lower(), DEFAULT_EXPORT_HEIGHT)
    aspect_width, aspect_height = parse_aspect_ratio(aspect_value or DEFAULT_ASPECT_RATIO)

    width = int(round(base_height * (aspect_width / aspect_height)))
    width = max(2, width - (width % 2))
    height = max(2, base_height - (base_height % 2))
    return width, height


def cleanup_paths(paths: list[str]) -> None:
    for path in paths:
        with suppress(FileNotFoundError):
            os.remove(path)


class InMemoryCollection:
    """Simple in-memory fallback for development and previews."""

    def __init__(self) -> None:
        self._documents: list[Dict[str, Any]] = []

    def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for document in self._documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document
        return None

    def insert_one(self, document: Dict[str, Any]) -> None:
        self._documents.append(document)


def get_users_collection():
    """Return a Mongo collection or an in-memory fallback."""
    use_in_memory = os.getenv('USE_IN_MEMORY_DB', '0') == '1'
    if use_in_memory:
        return InMemoryCollection()

    mongo_url = os.getenv('MONGO_URL')
    if not mongo_url:
        app.logger.warning(
            "Missing MongoDB configuration; falling back to the in-memory database. "
            "Set MONGO_URL to connect to a MongoDB instance or set USE_IN_MEMORY_DB=1 "
            "to silence this warning."
        )
        return InMemoryCollection()
    mongo_client = MongoClient(mongo_url)
    missing_db_message = (
        "MongoDB configuration requires either a database name in the MONGO_URL or "
        "a MONGO_DB_NAME environment variable."
    )
    database_name = os.getenv('MONGO_DB_NAME')
    if database_name:
        db = mongo_client[database_name]
    else:
        try:
            db = mongo_client.get_default_database()
        except ConfigurationError as exc:
            app.logger.error(missing_db_message)
            raise RuntimeError(missing_db_message) from exc
        if db is None:
            app.logger.error(missing_db_message)
            raise RuntimeError(missing_db_message)
    return db['users']


users_collection = get_users_collection()


@app.route('/')
def home():
    username = session.get('username')
    return render_template_string(HOME_HTML, username=username)


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form['username']
        password = request.form.get('password', '')
        user = users_collection.find_one({'username': username})
        if user:
            stored_password = user.get('password', '')
            passwords_match = False

            if stored_password:
                if stored_password.startswith('pbkdf2:'):
                    passwords_match = check_password_hash(stored_password, password)
                else:
                    # Support legacy plaintext passwords during migration.
                    passwords_match = stored_password == password

            if passwords_match:
                session['username'] = username
                return redirect(url_for('home'))
        error = "Invalid username or password. Please try again or sign up."
    return render_template_string(LOGIN_HTML, error=error)


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    error = None
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']
        if users_collection.find_one({'username': username}):
            error = "Username already exists. Please choose another."
        else:
            password_hash = generate_password_hash(password)
            users_collection.insert_one({
                'username': username,
                'email': email,
                'password': password_hash,
            })
            session['username'] = username
            return redirect(url_for('home'))
    return render_template_string(SIGNUP_HTML, error=error)


@app.route('/signout')
def signout():
    session.pop('username', None)
    return redirect(url_for('home'))


@app.route('/export', methods=['POST'])
def export_timeline():
    if not ensure_moviepy_imported():
        return (
            jsonify(
                {
                    'error': (
                        'Video export requires the optional dependency "moviepy". '
                        'Install it with "pip install moviepy" and try again.'
                    )
                }
            ),
            500,
        )
    
    timeline_payload = request.form.get('timeline')
    if not timeline_payload:
        return jsonify({'error': 'Missing timeline data.'}), 400

    try:
        timeline_data = json.loads(timeline_payload)
    except json.JSONDecodeError:
        return jsonify({'error': 'Timeline data is invalid.'}), 400

    if not isinstance(timeline_data, list) or not timeline_data:
        return jsonify({'error': 'Add at least one clip before exporting.'}), 400

    aspect_ratio_value = request.form.get('aspect_ratio', DEFAULT_ASPECT_RATIO)
    quality_value = request.form.get('quality', '720p')
    export_width, export_height = compute_export_dimensions(aspect_ratio_value, quality_value)

    input_paths: list[str] = []
    opened_clips: list[Any] = []
    clips_to_concatenate: list[Any] = []

    try:
        for index, clip_info in enumerate(timeline_data):
            if not isinstance(clip_info, dict):
                continue

            field_name = clip_info.get('field')
            if not field_name:
                continue

            file_storage = request.files.get(field_name)
            if not file_storage:
                continue

            suffix = os.path.splitext(file_storage.filename or '')[1] or '.bin'
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            try:
                file_storage.save(temp_file.name)
            finally:
                temp_file.close()
            input_paths.append(temp_file.name)

            duration_ms = clip_info.get('duration_ms')
            try:
                duration_seconds = max(0.0, float(duration_ms) / 1000.0)
            except (TypeError, ValueError):
                duration_seconds = 0.0

            clip_type = (clip_info.get('kind') or '').lower()

            if clip_type == 'image':
                duration = duration_seconds or MIN_IMAGE_CLIP_DURATION_SECONDS
                clip = ImageClip(temp_file.name, duration=duration)
                clip = clip.resize(newsize=(export_width, export_height))
                opened_clips.append(clip)
                clips_to_concatenate.append(clip)
                continue

            raw_clip = VideoFileClip(temp_file.name)
            opened_clips.append(raw_clip)
            working_clip = raw_clip
            intrinsic_duration = raw_clip.duration or 0.0

            if duration_seconds > 0 and intrinsic_duration > 0:
                if duration_seconds < intrinsic_duration:
                    working_clip = raw_clip.subclip(0, duration_seconds)
                elif duration_seconds > intrinsic_duration:
                    working_clip = loop(raw_clip, duration=duration_seconds)

            working_clip = working_clip.resize(newsize=(export_width, export_height))
            if working_clip is not raw_clip:
                opened_clips.append(working_clip)
            clips_to_concatenate.append(working_clip)
    except Exception:
        app.logger.exception('Failed to prepare clips for export')
        for clip in opened_clips:
            with suppress(Exception):
                clip.close()
        cleanup_paths(input_paths)
        return jsonify({'error': 'Failed to prepare clips for export.'}), 500

    valid_clips = [clip for clip in clips_to_concatenate if getattr(clip, 'duration', 0) > 0]
    if not valid_clips:
        for clip in opened_clips:
            with suppress(Exception):
                clip.close()
        cleanup_paths(input_paths)
        return jsonify({'error': 'No valid media files were provided for export.'}), 400

    output_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
    output_path = output_file.name
    output_file.close()

    final_clip: Optional[Any] = None
    final_duration_seconds: float = 0.0

    try:
        final_clip = concatenate_videoclips(valid_clips, method='compose')
        final_clip.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            fps=24,
            threads=2,
            preset='medium',
            verbose=False,
            logger=None,
        )
        try:
            final_duration_seconds = float(max(0.0, final_clip.duration or 0.0))
        except Exception:
            final_duration_seconds = 0.0
    except Exception:
        app.logger.exception('Failed to export video')
        if final_clip is not None:
            with suppress(Exception):
                final_clip.close()
        for clip in opened_clips:
            with suppress(Exception):
                clip.close()
        cleanup_paths(input_paths + [output_path])
        return jsonify({'error': 'Failed to export video. Please try again.'}), 500
    finally:
        if final_clip is not None:
            with suppress(Exception):
                final_clip.close()
        for clip in opened_clips:
            with suppress(Exception):
                clip.close()
        cleanup_paths(input_paths)

    static_root = app.static_folder or os.path.join(os.path.dirname(__file__), 'static')
    export_directory = os.path.join(static_root, 'exports')
    os.makedirs(export_directory, exist_ok=True)

    public_filename = f"video-export-{uuid4().hex}.mp4"
    final_path = os.path.join(export_directory, public_filename)

    try:
        os.replace(output_path, final_path)
    except Exception:
        cleanup_paths([output_path])
        return jsonify({'error': 'Failed to prepare exported video. Please try again.'}), 500

    public_url = url_for('static', filename=f"exports/{public_filename}")
    return jsonify(
        {
            'status': 'success',
            'video': public_url,
            'filename': public_filename,
            'duration_seconds': final_duration_seconds,
        }
    )


if __name__ == '__main__':
    app.run(debug=True)

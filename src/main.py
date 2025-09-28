import importlib.util
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from flask import (
    Flask,
    Response,
    redirect,
    render_template_string,
    request,
    session,
    url_for,
)
from pymongo import MongoClient

from templates import HOME_HTML, LOGIN_HTML, SIGNUP_HTML

_MOVIEPY_AVAILABLE = importlib.util.find_spec('moviepy.editor') is not None

if _MOVIEPY_AVAILABLE:
    from moviepy.editor import ImageClip, VideoFileClip, concatenate_videoclips, vfx
else:  # pragma: no cover - exercised only when dependency is missing
    ImageClip = VideoFileClip = concatenate_videoclips = vfx = None  # type: ignore

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Replace with a secure key in production


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

    mongo_url = os.getenv(
        'MONGO_URL',
        (
            "mongodb+srv://sihalardjacky_db_user:TP7iCDWj3hhq4KBP@cluster0.rssobej.mongodb.net/"
            "?retryWrites=true&w=majority&appName=Cluster0"
        ),
    )
    mongo_client = MongoClient(mongo_url)
    database_name = os.getenv('MONGO_DB_NAME', 'your_database_name')
    db = mongo_client[database_name]
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
        user = users_collection.find_one({'username': username, 'password': password})
        if user:
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
            users_collection.insert_one({
                'username': username,
                'email': email,
                'password': password,
            })
            session['username'] = username
            return redirect(url_for('home'))
    return render_template_string(SIGNUP_HTML, error=error)


def _cleanup_paths(paths: list[str]) -> None:
    for path in paths:
        try:
            os.unlink(path)
        except OSError:
            continue


@app.post('/export')
def export_timeline() -> Response:
    if not _MOVIEPY_AVAILABLE:
        return Response(
            'MoviePy is required to export timelines. '
            'Install the optional dependency with "pip install moviepy".',
            status=503,
        )

    metadata_raw = request.form.get('metadata')
    if not metadata_raw:
        return Response('Missing metadata payload.', status=400)

    try:
        metadata = json.loads(metadata_raw)
    except json.JSONDecodeError:
        return Response('Metadata payload is not valid JSON.', status=400)

    if not isinstance(metadata, list) or not metadata:
        return Response('At least one timeline item is required for export.', status=400)

    temp_paths: list[str] = []
    timeline_clips: list[Any] = []
    final_clip = None
    output_path: str | None = None
    export_duration = 0.0

    try:
        for index, entry in enumerate(metadata):
            if not isinstance(entry, dict):
                raise ValueError('Each metadata entry must be an object.')

            field_name = entry.get('fieldName')
            mime_type = str(entry.get('mimeType') or '')
            duration_ms = max(int(entry.get('durationMs', 0) or 0), 0)
            duration_seconds = max(duration_ms / 1000.0, 0.001)

            if not field_name:
                raise ValueError('Missing file field name in metadata entry.')

            file_storage = request.files.get(field_name)
            if file_storage is None:
                raise ValueError(f'Missing file data for timeline item {index + 1}.')

            suffix = Path(file_storage.filename or '').suffix or '.bin'
            temp_descriptor, temp_path = tempfile.mkstemp(suffix=suffix)
            os.close(temp_descriptor)
            file_storage.save(temp_path)
            temp_paths.append(temp_path)

            if mime_type.startswith('image/'):
                clip = ImageClip(temp_path).set_duration(duration_seconds).set_fps(30)
            else:
                clip = VideoFileClip(temp_path)
                intrinsic_duration = float(clip.duration or 0)
                if intrinsic_duration and duration_seconds < intrinsic_duration:
                    clip = clip.subclip(0, duration_seconds)
                elif intrinsic_duration and duration_seconds > intrinsic_duration:
                    clip = clip.fx(vfx.loop, duration=duration_seconds)
                else:
                    clip = clip.subclip(0, intrinsic_duration or duration_seconds)
                clip = clip.set_fps(30)

            timeline_clips.append(clip)

        if not timeline_clips:
            raise ValueError('No timeline clips were provided for export.')

        if len(timeline_clips) == 1:
            final_clip = timeline_clips[0]
        else:
            final_clip = concatenate_videoclips(timeline_clips, method='compose')

        export_duration = float(final_clip.duration or 0.0)
        if export_duration <= 0:
            export_duration = sum(float(clip.duration or 0.0) for clip in timeline_clips)

        output_descriptor, output_path = tempfile.mkstemp(suffix='.mp4')
        os.close(output_descriptor)

        final_clip.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            fps=30,
            remove_temp=True,
            logger=None,
        )

        with open(output_path, 'rb') as export_file:
            payload = export_file.read()

    except ValueError as error:
        return Response(str(error), status=400)
    except Exception as error:  # pragma: no cover - defensive logging path
        app.logger.exception('Failed to export timeline preview: %s', error)
        return Response('Failed to export timeline.', status=500)
    finally:
        if final_clip is not None and final_clip not in timeline_clips:
            final_clip.close()
        for clip in timeline_clips:
            try:
                clip.close()
            except Exception:  # pragma: no cover - clip cleanup errors are non-fatal
                continue
        _cleanup_paths(temp_paths)
        if output_path:
            _cleanup_paths([output_path])

    response = Response(payload, mimetype='video/mp4')
    response.headers['Content-Length'] = str(len(payload))
    response.headers['X-Export-Duration-Ms'] = str(int(round(export_duration * 1000)))
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.route('/signout')
def signout():
    session.pop('username', None)
    return redirect(url_for('home'))


if __name__ == '__main__':
    app.run(debug=True)

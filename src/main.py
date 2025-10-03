import logging
import os
import secrets
from typing import Any, Dict, Optional

from flask import Flask, render_template_string, request, redirect, url_for, session
from werkzeug.security import check_password_hash, generate_password_hash
from pymongo import MongoClient
from pymongo.errors import ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError

from templates import (
    HOME_TEMPLATE,
    HOME_STYLES,
    HOME_SCRIPTS,
    LOGIN_HTML,
    SIGNUP_HTML,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = Flask(__name__)


def configure_secret_key(flask_app: Flask, *, allow_generated: bool = False) -> None:
    """Configure the Flask secret key from the environment."""

    secret_key = os.getenv('FLASK_SECRET_KEY')
    if secret_key:
        flask_app.config['SECRET_KEY'] = secret_key
        logger.info('Loaded secret key from FLASK_SECRET_KEY environment variable.')
        return

    if allow_generated:
        generated_key = secrets.token_urlsafe(32)
        flask_app.config['SECRET_KEY'] = generated_key
        logger.warning(
            'Generated a temporary secret key because FLASK_SECRET_KEY is not set. '
            'This key is intended for local development only.'
        )
        return

    raise RuntimeError(
        'FLASK_SECRET_KEY environment variable is required. Generate one with '
        "python -c 'import secrets; print(secrets.token_urlsafe(32))' and set it in your environment."
    )


if __name__ != '__main__':
    configure_secret_key(app)


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
        logger.info('Using in-memory database because USE_IN_MEMORY_DB=1.')
        return InMemoryCollection()

    mongo_url = os.getenv('MONGO_URL')
    if not mongo_url:
        logger.warning(
            'MONGO_URL environment variable is not set. Falling back to in-memory database.'
        )
        return InMemoryCollection()

    try:
        mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        mongo_client.admin.command('ping')
    except (ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError) as exc:
        logger.error(
            'Failed to create MongoDB client. Falling back to in-memory database. %s',
            exc,
        )
        return InMemoryCollection()

    database_name = os.getenv('MONGO_DB_NAME', 'app')
    db = mongo_client[database_name]
    return db['users']


users_collection = get_users_collection()


@app.route('/')
def home():
    username = session.get('username')
    return render_template_string(
        HOME_TEMPLATE,
        username=username,
        styles=HOME_STYLES,
        scripts=HOME_SCRIPTS,
    )


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form['username']
        password = request.form.get('password', '')
        user = users_collection.find_one({'username': username})
        if user:
            stored_password = user.get('password', '')
            try:
                if check_password_hash(stored_password, password):
                    session['username'] = username
                    return redirect(url_for('home'))
            except ValueError:
                logger.error('Stored password for user %s is not a valid hash.', username)
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


if __name__ == '__main__':
    configure_secret_key(app, allow_generated=True)
    app.run(debug=True)

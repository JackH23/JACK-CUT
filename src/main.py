import os
from typing import Any, Dict, Optional

from flask import Flask, render_template_string, request, redirect, url_for, session
from pymongo import MongoClient
from pymongo.errors import ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError

from templates import (
    HOME_TEMPLATE,
    HOME_STYLES,
    HOME_SCRIPTS,
    LOGIN_HTML,
    SIGNUP_HTML,
)

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

    mongo_url = os.getenv('MONGO_URL')
    if not mongo_url:
        raise RuntimeError(
            'MONGO_URL environment variable is required when USE_IN_MEMORY_DB is not set.'
        )

    try:
        mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    except (ConfigurationError, ConnectionFailure, InvalidURI, PyMongoError) as exc:
        raise RuntimeError(
            'Failed to create MongoDB client. Check the MONGO_URL value or set '
            'USE_IN_MEMORY_DB=1 for a local fallback.'
        ) from exc

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


@app.route('/signout')
def signout():
    session.pop('username', None)
    return redirect(url_for('home'))


if __name__ == '__main__':
    app.run(debug=True)

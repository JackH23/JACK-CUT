import logging
import os
import secrets
from typing import Any, Mapping, Optional

from flask import (
    Blueprint,
    Flask,
    redirect,
    render_template_string,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

from templates import (
    HOME_SCRIPTS,
    HOME_STYLES,
    HOME_TEMPLATE,
    LOGIN_HTML,
    SIGNUP_HTML,
)
from user_repository import UserStore, create_user_store_from_env

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def configure_secret_key(flask_app: Flask, *, allow_generated: bool = False) -> None:
    """Configure the Flask secret key from the environment."""

    if flask_app.config.get('SECRET_KEY'):
        logger.debug('SECRET_KEY already configured on the Flask app. Skipping configuration.')
        return

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


def _create_routes_blueprint(user_store: UserStore) -> Blueprint:
    blueprint = Blueprint('main', __name__)

    @blueprint.route('/')
    def home():
        username = session.get('username')
        return render_template_string(
            HOME_TEMPLATE,
            username=username,
            styles=HOME_STYLES,
            scripts=HOME_SCRIPTS,
        )

    @blueprint.route('/login', methods=['GET', 'POST'])
    def login():
        error = None
        if request.method == 'POST':
            username = request.form['username']
            password = request.form.get('password', '')
            user = user_store.get_by_username(username)
            if user:
                stored_password = user.get('password', '')
                try:
                    if check_password_hash(stored_password, password):
                        session['username'] = username
                        return redirect(url_for('main.home'))
                except ValueError:
                    logger.error('Stored password for user %s is not a valid hash.', username)
            error = "Invalid username or password. Please try again or sign up."
        return render_template_string(LOGIN_HTML, error=error)

    @blueprint.route('/signup', methods=['GET', 'POST'])
    def signup():
        error = None
        if request.method == 'POST':
            username = request.form['username']
            email = request.form['email']
            password = request.form['password']
            if user_store.get_by_username(username):
                error = "Username already exists. Please choose another."
            else:
                password_hash = generate_password_hash(password)
                user_store.add_user(username, email, password_hash)
                session['username'] = username
                return redirect(url_for('main.home'))
        return render_template_string(SIGNUP_HTML, error=error)

    @blueprint.route('/signout')
    def signout():
        session.pop('username', None)
        return redirect(url_for('main.home'))

    return blueprint


def create_app(
    config: Optional[Mapping[str, Any]] = None,
    *,
    user_store: Optional[UserStore] = None,
    allow_generated_secret: bool = False,
) -> Flask:
    app = Flask(__name__)

    if config:
        app.config.from_mapping(config)

    configure_secret_key(app, allow_generated=allow_generated_secret)

    store = user_store or create_user_store_from_env()
    app.user_store = store  # type: ignore[attr-defined]
    app.register_blueprint(_create_routes_blueprint(store))

    return app


if __name__ == '__main__':
    application = create_app(allow_generated_secret=True)
    application.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)))

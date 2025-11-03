import pytest

pytest.importorskip('flask')
pytest.importorskip('werkzeug.security')

from werkzeug.security import generate_password_hash

from src.main import create_app


class MockUserStore:
    def __init__(self):
        self.users = {}

    def get_by_username(self, username):
        return self.users.get(username)

    def add_user(self, username, email, password_hash):
        self.users[username] = {
            'username': username,
            'email': email,
            'password': password_hash,
        }


@pytest.fixture
def app():
    user_store = MockUserStore()
    app = create_app(
        config={'TESTING': True, 'SECRET_KEY': 'testing-secret'},
        user_store=user_store,
    )
    yield app


@pytest.fixture
def client(app):
    return app.test_client()


def test_signup_creates_user_and_logs_in(client, app):
    response = client.post(
        '/signup',
        data={
            'username': 'alice',
            'email': 'alice@example.com',
            'password': 'wonderland',
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert 'alice' in app.user_store.users
    assert app.user_store.users['alice']['email'] == 'alice@example.com'
    with client.session_transaction() as flask_session:
        assert flask_session['username'] == 'alice'


def test_login_uses_user_store(client, app):
    # pre-populate using the exposed user store
    password_hash = generate_password_hash('builder')
    app.user_store.add_user('bob', 'bob@example.com', password_hash)

    response = client.post(
        '/login',
        data={'username': 'bob', 'password': 'builder'},
        follow_redirects=True,
    )
    assert response.status_code == 200
    with client.session_transaction() as flask_session:
        assert flask_session.get('username') == 'bob'

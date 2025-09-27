registered_users = {}  # username -> {'email': ..., 'password': ...}

def add_user(username, email, password):
    registered_users[username] = {'email': email, 'password': password}

def validate_user(username, password):
    user = registered_users.get(username)
    return user and user['password'] == password

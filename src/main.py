from flask import Flask, render_template_string, request, redirect, url_for, session
from templates import HOME_HTML, LOGIN_HTML, SIGNUP_HTML
from pymongo import MongoClient

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Replace with a secure key in production

# MongoDB connection
MONGO_URL = "mongodb+srv://sihalardjacky_db_user:TP7iCDWj3hhq4KBP@cluster0.rssobej.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
mongo_client = MongoClient(MONGO_URL)
db = mongo_client['your_database_name']  # Replace with your actual database name
users_collection = db['users']

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
        else:
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
                'password': password
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
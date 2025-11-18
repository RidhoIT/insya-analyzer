from flask import Flask

app = Flask(__name__)

@app.before_first_request
def init():
    print("Before first request executed.")

@app.route("/")
def hello():
    return "Hello"

if __name__ == '__main__':
    app.run(debug=True)

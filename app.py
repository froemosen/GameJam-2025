from flask import Flask, send_from_directory, render_template
import os

app = Flask(__name__, static_folder='assets', template_folder='.')

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/src/<path:path>')
def send_src(path):
    return send_from_directory('src', path)

@app.route('/assets/<path:path>')
def send_assets(path):
    return send_from_directory('assets', path)

@app.route('/health')
def health():
    return {'status': 'healthy'}, 200

@app.route("/favicon.ico")
def favicon():
    return send_from_directory('.', 'favicon.ico')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5500))
    app.run(host='0.0.0.0', port=port, debug=True)

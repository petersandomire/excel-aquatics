from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import json
import os
import tempfile
from parser import parse_jackrabbit_pdf
from schedule_route import register_schedule_routes

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

DB_PATH = os.path.join(os.path.dirname(__file__), 'aquatics.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS instructors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            gender TEXT,
            role TEXT NOT NULL DEFAULT 'Instructor',
            lifeguard_certified INTEGER DEFAULT 0,
            age_group_proficiency TEXT,
            swim_level_proficiency TEXT,
            adaptive_capable INTEGER DEFAULT 0,
            experience_tier TEXT,
            teaching_style_tags TEXT,
            max_daily_lessons INTEGER DEFAULT 6,
            notes TEXT,
            custom_fields TEXT DEFAULT '{}'
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/api/instructors', methods=['GET', 'OPTIONS'])
def get_instructors():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    conn = get_db()
    instructors = conn.execute('SELECT * FROM instructors ORDER BY name').fetchall()
    conn.close()
    result = []
    for row in instructors:
        d = dict(row)
        d['custom_fields'] = json.loads(d['custom_fields'] or '{}')
        d['age_group_proficiencies'] = json.loads(d.get('age_group_proficiencies') or '[]')
        d['swim_level_proficiencies'] = json.loads(d.get('swim_level_proficiencies') or '[]')
        result.append(d)
    return jsonify(result)

@app.route('/api/instructors', methods=['POST'])
def add_instructor():
    data = request.json
    conn = get_db()
    conn.execute('''
        INSERT INTO instructors 
        (name, gender, role, lifeguard_certified, age_group_proficiency, 
         swim_level_proficiency, adaptive_capable, experience_tier, 
         teaching_style_tags, max_daily_lessons, notes, custom_fields,
         age_group_proficiencies, swim_level_proficiencies, adult_capable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('name'),
        data.get('gender'),
        data.get('role', 'Instructor'),
        int(data.get('lifeguard_certified', False)),
        data.get('age_group_proficiency'),
        data.get('swim_level_proficiency'),
        int(data.get('adaptive_capable', False)),
        data.get('experience_tier'),
        data.get('teaching_style_tags'),
        data.get('max_daily_lessons', 6),
        data.get('notes'),
        json.dumps(data.get('custom_fields', {})),
        json.dumps(data.get('age_group_proficiencies', [])),
        json.dumps(data.get('swim_level_proficiencies', [])),
        int(data.get('adult_capable', False))
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/instructors/<int:instructor_id>', methods=['PUT', 'OPTIONS'])
def update_instructor(instructor_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    data = request.json
    conn = get_db()
    conn.execute('''
        UPDATE instructors SET
            name=?, gender=?, role=?, lifeguard_certified=?,
            age_group_proficiency=?, swim_level_proficiency=?,
            adaptive_capable=?, experience_tier=?, teaching_style_tags=?,
            max_daily_lessons=?, notes=?, custom_fields=?,
            age_group_proficiencies=?, swim_level_proficiencies=?, adult_capable=?
        WHERE id=?
    ''', (
        data.get('name'),
        data.get('gender'),
        data.get('role', 'Instructor'),
        int(data.get('lifeguard_certified', False)),
        data.get('age_group_proficiency'),
        data.get('swim_level_proficiency'),
        int(data.get('adaptive_capable', False)),
        data.get('experience_tier'),
        data.get('teaching_style_tags'),
        data.get('max_daily_lessons', 6),
        data.get('notes'),
        json.dumps(data.get('custom_fields', {})),
        json.dumps(data.get('age_group_proficiencies', [])),
        json.dumps(data.get('swim_level_proficiencies', [])),
        int(data.get('adult_capable', False)),
        instructor_id
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/instructors/<int:instructor_id>', methods=['DELETE', 'OPTIONS'])
def delete_instructor(instructor_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    conn = get_db()
    conn.execute('DELETE FROM instructors WHERE id=?', (instructor_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/upload-pdf', methods=['POST', 'OPTIONS'])
def upload_pdf():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if not file.filename.endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        file.save(tmp.name)
        try:
            lessons = parse_jackrabbit_pdf(tmp.name)
            return jsonify({'success': True, 'lessons': lessons, 'count': len(lessons)})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

register_schedule_routes(app, get_db)

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')

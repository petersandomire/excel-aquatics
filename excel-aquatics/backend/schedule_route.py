from flask import jsonify, request
from scheduler import generate_schedule

def register_schedule_routes(app, get_db):
    @app.route('/api/generate-schedule', methods=['POST', 'OPTIONS'])
    def generate_schedule_route():
        if request.method == 'OPTIONS':
            return jsonify({}), 200

        data = request.json
        lessons = data.get('lessons', [])
        availability = data.get('availability', [])

        conn = get_db()
        rows = conn.execute('SELECT * FROM instructors').fetchall()
        conn.close()

        import json as json_lib
        instructors = []
        for row in rows:
            d = dict(row)
            d['custom_fields'] = json_lib.loads(d['custom_fields'] or '{}')
            instructors.append(d)

        if not instructors:
            return jsonify({'error': 'No instructors found. Please add instructors first.'}), 400

        result = generate_schedule(lessons, instructors, availability)

        # Attach instructor name to each lesson for display
        for idx, lesson in enumerate(lessons):
            lesson['assigned_instructor'] = result['assignments'].get(idx)
            lesson['lesson_index'] = idx

        return jsonify({
            'success': True,
            'lessons': lessons,
            'time_slots': result['time_slots'],
            'lifeguard_assignments': result['lifeguard_assignments'],
            'flags': result['flags'],
            'workload': result['workload'],
            'guard_load': result['guard_load'],
        })

    @app.route('/api/instructors-simple', methods=['GET'])
    def instructors_simple():
        conn = get_db()
        rows = conn.execute('SELECT id, name, role FROM instructors ORDER BY name').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

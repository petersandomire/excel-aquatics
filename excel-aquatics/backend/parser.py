import pdfplumber
import re

def clean(val):
    if not val:
        return ''
    return re.sub(r'\s+', ' ', val.replace('\n', ' ')).strip()

def parse_age(age_str):
    if not age_str:
        return ''
    cleaned = clean(age_str)
    years = re.search(r'(\d+)\s*yrs?', cleaned, re.IGNORECASE)
    months = re.search(r'(\d+)\s*mths?', cleaned, re.IGNORECASE)
    parts = []
    if years:
        parts.append(f"{years.group(1)} yrs")
    if months:
        parts.append(f"{months.group(1)} mths")
    return ', '.join(parts) if parts else cleaned

def parse_lesson_type(class_name):
    c = class_name.lower().replace('\n', ' ').replace('-', '').replace(' ', '')
    if 'semiprivate' in c:
        return 'semiprivate'
    if 'adaptive' in c:
        return 'adaptive'
    if 'group' in c:
        return 'group'
    if 'semi' in c:
        return 'semiprivate'
    return 'private'

def parse_roll_notes(notes):
    notes = clean(notes)
    
    swim_level = ''
    level_match = re.search(r'(pree?comp\w*|level\s*\d+|lvl\s*\d+)', notes, re.IGNORECASE)
    if level_match:
        swim_level = level_match.group(0).strip()

    is_adaptive = bool(re.search(r'adaptive', notes, re.IGNORECASE))

    gender_preference = None
    if re.search(r'female instructor', notes, re.IGNORECASE):
        gender_preference = 'Female'
    elif re.search(r'male instructor', notes, re.IGNORECASE):
        gender_preference = 'Male'

    instructor_exclude = None
    cannot_match = re.search(r'cannot be (\w+)', notes, re.IGNORECASE)
    if cannot_match:
        instructor_exclude = cannot_match.group(1)

    styles = re.findall(r'firm|dynamic|lively|assertive|loud|energetic|consistent', notes, re.IGNORECASE)
    style_preference = ', '.join(set(s.lower() for s in styles)) if styles else None

    lane_preference = None
    if re.search(r'middle lane|center lane', notes, re.IGNORECASE):
        lane_preference = 'middle'

    return {
        'swim_level': swim_level,
        'is_adaptive': is_adaptive,
        'gender_preference': gender_preference,
        'instructor_exclude': instructor_exclude,
        'style_preference': style_preference,
        'lane_preference': lane_preference,
    }

def parse_jackrabbit_pdf(pdf_path):
    all_rows = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not any(row):
                        continue
                    all_rows.append(row)

    lessons_raw = []
    for row in all_rows:
        # Row format: [num, class_name, instructor, start_date, end_date, start_time, first, last, age, notes, email]
        if len(row) < 10:
            continue
        num_val = clean(row[0])
        if not num_val or not num_val.isdigit():
            continue

        num = int(num_val)
        class_name = clean(row[1])
        instructor_raw = clean(row[2])
        start_date = clean(row[3])
        end_date = clean(row[4])
        start_time = clean(row[5])
        first_name = clean(row[6])
        last_name = clean(row[7])
        age_raw = clean(row[8])
        notes_raw = clean(row[9])

        if not start_time or not first_name:
            continue

        lessons_raw.append({
            'number': num,
            'class_name': class_name,
            'instructor_raw': instructor_raw,
            'start_date': start_date,
            'end_date': end_date,
            'start_time': start_time,
            'first_name': first_name,
            'last_name': last_name,
            'age_raw': age_raw,
            'notes_raw': notes_raw,
        })

    lessons = []
    for raw in lessons_raw:
        lesson = build_lesson(raw)
        if lesson:
            lessons.append(lesson)

    return group_semi_privates(lessons)


def build_lesson(raw):
    lesson_type = parse_lesson_type(raw['class_name'])

    instructor_raw = raw['instructor_raw']
    instructor = ''
    instructor_lock = None
    reserved_match = re.search(r'reserved\s+for\s+(\w+)', instructor_raw, re.IGNORECASE)
    if reserved_match:
        instructor_lock = reserved_match.group(1)
    else:
        instructor = instructor_raw

    age = parse_age(raw['age_raw'])
    notes = parse_roll_notes(raw['notes_raw'])

    student_first = raw['first_name']
    student_last = raw['last_name']

    # Extract day from class_name e.g. "Sunday\nPrivate"
    day_match = re.search(r'(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)', raw['class_name'], re.IGNORECASE)
    day = day_match.group(1) if day_match else ''

    student = {
        'first': student_first,
        'last': student_last,
        'age': age,
        'swim_level': notes['swim_level'],
        'roll_notes': raw['notes_raw'],
        'is_adaptive': notes['is_adaptive'],
        'gender_preference': notes['gender_preference'],
        'style_preference': notes['style_preference'],
        'lane_preference': notes['lane_preference'],
    }

    return {
        'lesson_number': raw['number'],
        'day': day,
        'lesson_type': lesson_type,
        'instructor': instructor,
        'instructor_lock': instructor_lock,
        'instructor_exclude': notes['instructor_exclude'],
        'start_date': raw['start_date'],
        'end_date': raw['end_date'],
        'start_time': raw['start_time'],
        'student_first': student_first,
        'student_last': student_last,
        'age': age,
        'roll_notes': raw['notes_raw'],
        'swim_level': notes['swim_level'],
        'is_adaptive': notes['is_adaptive'],
        'gender_preference': notes['gender_preference'],
        'style_preference': notes['style_preference'],
        'lane_preference': notes['lane_preference'],
        'is_group': False,
        'students': [student],
    }


def group_semi_privates(lessons):
    seen = {}
    result = []
    for lesson in lessons:
        ltype = lesson['lesson_type']
        if ltype in ('semiprivate', 'group'):
            # Group purely by time + lesson type + instructor (if any).
            # This is intentionally loose since semi-private siblings can have
            # slightly different start_date values in the Jackrabbit export.
            instructor_key = (lesson['instructor'] or lesson.get('instructor_lock') or '').strip().lower()
            key = (lesson['start_time'], ltype, instructor_key)
            if key in seen:
                seen[key]['students'].append(lesson['students'][0])
                seen[key]['is_group'] = True
            else:
                lesson['is_group'] = True
                seen[key] = lesson
                result.append(lesson)
        else:
            result.append(lesson)
    return result

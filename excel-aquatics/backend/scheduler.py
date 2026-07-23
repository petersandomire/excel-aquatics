import re

AGE_GROUP_RANGES = {
    'Toddler (1-3)': (1, 3),
    'Young Child (3-5)': (3, 5),
    'Child (5-8)': (5, 8),
    'Older Child (8-12)': (8, 12),
    'Teen/Adult (12+)': (12, 99),
    'All Ages': (0, 99),
}

def parse_age_years(age_str):
    if not age_str:
        return None
    m = re.search(r'(\d+)\s*yrs?', age_str, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None

def parse_level_number(level_str):
    if not level_str:
        return None
    if re.search(r'precomp', level_str, re.IGNORECASE):
        return 7
    m = re.search(r'(\d+)', level_str)
    if m:
        return int(m.group(1))
    return None

def age_matches_group(age_years, group_label):
    if age_years is None or not group_label:
        return False
    rng = AGE_GROUP_RANGES.get(group_label)
    if not rng:
        return False
    return rng[0] <= age_years <= rng[1]


def age_matches_any_group(age_years, group_labels):
    if not group_labels:
        return False
    return any(age_matches_group(age_years, g) for g in group_labels)


def level_matches_any(student_level_num, instructor_level_labels):
    if not instructor_level_labels:
        return False
    return any(level_matches(student_level_num, lbl) for lbl in instructor_level_labels)

def level_matches(student_level_num, instructor_level_label):
    if student_level_num is None or not instructor_level_label:
        return False
    if instructor_level_label == 'All Levels':
        return True
    inst_num = parse_level_number(instructor_level_label)
    if inst_num is None:
        return False
    return abs(inst_num - student_level_num) <= 1


class SchedulerState:
    def __init__(self, instructors):
        self.instructors = {i['id']: i for i in instructors}
        self.daily_lesson_count = {i['id']: 0 for i in instructors}
        self.guard_slot_count = {i['id']: 0 for i in instructors}
        self.timeline = {i['id']: [] for i in instructors}
        self.assignments = {}

    def consecutive_lessons_before(self, instructor_id, slot_index):
        history = sorted(self.timeline[instructor_id])
        count = 0
        expected = slot_index - 1
        for (idx, kind) in reversed(history):
            if idx == expected and kind == 'lesson':
                count += 1
                expected -= 1
            elif idx == expected:
                break
            else:
                break
        return count

    def is_busy(self, instructor_id, slot_index):
        return any(idx == slot_index for idx, _ in self.timeline[instructor_id])

    def consecutive_breaks_before(self, instructor_id, slot_index):
        """Count how many consecutive slots immediately before slot_index this
        instructor was NOT assigned a lesson (used to discourage sitting out for
        more than one slot in a row)."""
        busy_slots = set(idx for idx, kind in self.timeline[instructor_id] if kind == 'lesson')
        count = 0
        check = slot_index - 1
        while check >= 0:
            if check in busy_slots:
                break
            count += 1
            check -= 1
        return count

    def record(self, instructor_id, slot_index, kind):
        self.timeline[instructor_id].append((slot_index, kind))
        if kind == 'lesson':
            self.daily_lesson_count[instructor_id] += 1
        elif kind == 'guard':
            self.guard_slot_count[instructor_id] += 1


def score_instructor(instructor, lesson, state, slot_index):
    score = 0
    student = lesson['students'][0] if lesson.get('students') else lesson

    age_years = parse_age_years(student.get('age', ''))
    level_num = parse_level_number(student.get('swim_level', ''))

    age_groups = instructor.get('age_group_proficiencies') or ([instructor['age_group_proficiency']] if instructor.get('age_group_proficiency') else [])
    if age_years is not None and age_groups:
        if age_matches_any_group(age_years, age_groups):
            score += 100
        else:
            score -= 10

    swim_levels = instructor.get('swim_level_proficiencies') or ([instructor['swim_level_proficiency']] if instructor.get('swim_level_proficiency') else [])
    if level_num is not None and swim_levels:
        if level_matches_any(level_num, swim_levels):
            score += 100
        else:
            score -= 10

    if student.get('is_adaptive'):
        if instructor.get('adaptive_capable'):
            score += 80
        else:
            score -= 1000

    style_pref = student.get('style_preference')
    if style_pref and instructor.get('teaching_style_tags'):
        inst_styles = [s.strip().lower() for s in instructor['teaching_style_tags'].split(',')]
        pref_styles = [s.strip().lower() for s in style_pref.split(',')]
        if any(p in inst_styles for p in pref_styles):
            score += 30

    tier_weight = {'Lead': 15, 'Senior': 10, 'Mid-Level': 5, 'Junior': 0}
    score += tier_weight.get(instructor.get('experience_tier', ''), 0)

    current_count = state.daily_lesson_count.get(instructor['id'], 0)
    score -= current_count * 8

    consec_so_far = state.consecutive_lessons_before(instructor['id'], slot_index)
    if consec_so_far == 1:
        score += 25
    elif consec_so_far == 2:
        score += 20
    elif consec_so_far >= 3:
        score -= 50

    if state.daily_lesson_count.get(instructor['id'], 0) > 0:
        break_streak = state.consecutive_breaks_before(instructor['id'], slot_index)
        if break_streak == 1:
            score += 20
        elif break_streak >= 2:
            score += 90

    return score


def is_eligible(instructor, lesson, state, slot_index, time_str, avail_map, max_consecutive_hard=4):
    student = lesson['students'][0] if lesson.get('students') else lesson

    if instructor.get('role') in ('Supervisor', 'Dedicated Lifeguard', 'Manager'):
        return False

    # Availability check: must be selected as working today AND within their time window
    if not is_available_at(instructor['id'], time_str, avail_map):
        return False

    if state.is_busy(instructor['id'], slot_index):
        return False

    consec = state.consecutive_lessons_before(instructor['id'], slot_index)
    if consec >= max_consecutive_hard:
        return False

    gender_pref = student.get('gender_preference')
    if gender_pref and instructor.get('gender') != gender_pref:
        return False

    exclude = student.get('instructor_exclude') or lesson.get('instructor_exclude')
    if exclude and exclude.lower() in instructor.get('name', '').lower():
        return False

    if student.get('is_adaptive') and not instructor.get('adaptive_capable'):
        return False

    # Adult lesson hard requirement
    age_years_check = parse_age_years(student.get('age', ''))
    is_adult_lesson = 'adult' in str(lesson.get('lesson_type', '')).lower() or (age_years_check is not None and age_years_check >= 18)
    if is_adult_lesson and not instructor.get('adult_capable'):
        return False

    return True


def find_instructor_by_name(instructors, name_fragment):
    name_fragment = name_fragment.strip().lower().rstrip('.')
    for inst in instructors:
        inst_name = inst['name'].lower()
        if name_fragment in inst_name or inst_name.startswith(name_fragment):
            return inst
    return None


def time_sort_key(time_str):
    m = re.match(r'(\d+):(\d+)(am|pm)', time_str.strip(), re.IGNORECASE)
    if not m:
        return (0, 0)
    hour, minute, period = int(m.group(1)), int(m.group(2)), m.group(3).lower()
    if period == 'pm' and hour != 12:
        hour += 12
    if period == 'am' and hour == 12:
        hour = 0
    return (hour, minute)


def build_availability_map(availability):
    """Returns dict: instructor_id -> (start_minutes, end_minutes), or empty dict if none provided."""
    avail_map = {}
    if not availability:
        return avail_map
    for a in availability:
        avail_map[a['instructor_id']] = (a['start_minutes'], a['end_minutes'])
    return avail_map


def time_str_to_minutes(time_str):
    m = re.match(r'(\d+):(\d+)(am|pm)', time_str.strip(), re.IGNORECASE)
    if not m:
        return 0
    hour, minute, period = int(m.group(1)), int(m.group(2)), m.group(3).lower()
    if period == 'pm' and hour != 12:
        hour += 12
    if period == 'am' and hour == 12:
        hour = 0
    return hour * 60 + minute


def is_available_at(instructor_id, time_str, avail_map):
    """If instructor not in avail_map at all, they were not selected as working today -> unavailable."""
    if instructor_id not in avail_map:
        return False
    start, end = avail_map[instructor_id]
    slot_minutes = time_str_to_minutes(time_str)
    return start <= slot_minutes <= end


def student_name_list(lesson):
    names = []
    for s in lesson.get('students', []):
        full = f"{s.get('first','')} {s.get('last','')}".strip()
        if full:
            names.append(full)
    return names


def generate_schedule(lessons, instructors, availability=None, max_lanes=4):
    state = SchedulerState(instructors)
    avail_map = build_availability_map(availability)
    # If availability was provided, restrict the instructor pool to only those selected as working
    if avail_map:
        instructors = [i for i in instructors if i['id'] in avail_map]
        state = SchedulerState(instructors)
    avail_map = build_availability_map(availability)
    # If availability was provided, restrict the instructor pool to only those selected as working
    if avail_map:
        instructors = [i for i in instructors if i['id'] in avail_map]
        state = SchedulerState(instructors)

    time_set = sorted(set(l['start_time'] for l in lessons), key=time_sort_key)
    time_order = time_set

    flags = []
    unassigned = []

    if avail_map and len(instructors) == 0:
        flags.append({
            'type': 'no_staff',
            'severity': 'red',
            'time': 'all day',
            'message': 'No instructors were selected as working today. Please go back to Availability and select staff.'
        })

    if avail_map and len(instructors) == 0:
        flags.append({
            'type': 'no_staff',
            'severity': 'red',
            'time': 'all day',
            'message': 'No instructors were selected as working today. Please go back to Availability and select staff.'
        })

    by_time = {}
    for idx, lesson in enumerate(lessons):
        by_time.setdefault(lesson['start_time'], []).append((idx, lesson))

    final_assignments = {}

    for time_str in time_order:
        slot_index = time_order.index(time_str)
        all_lessons_at_time = by_time[time_str]

        # OVERFLOW CHECK: now accounts for lessons already grouped (is_group=True
        # lessons only take ONE lane regardless of student count)
        lane_count = len(all_lessons_at_time)
        lessons_in_slot = all_lessons_at_time[:max_lanes]
        overflow_lessons = all_lessons_at_time[max_lanes:]

        if lane_count > max_lanes:
            overflow_names = []
            for idx, lesson in all_lessons_at_time:
                overflow_names.extend(student_name_list(lesson))
            flags.append({
                'type': 'lane_overflow',
                'severity': 'red',
                'time': time_str,
                'message': (
                    f"{lane_count} lessons requested at {time_str} but only {max_lanes} lanes available. "
                    f"Students involved: {', '.join(overflow_names)}. "
                    f"Please review — this may indicate a make-up lesson or cancellation that needs manual resolution."
                )
            })

        for lesson_idx, lesson in lessons_in_slot:
            # TRUE hard lock - only when explicitly marked locked=True (e.g. via manual UI toggle)
            if lesson.get('instructor') and lesson.get('locked'):
                inst_name = lesson['instructor']
                matched = find_instructor_by_name(instructors, inst_name)
                if matched:
                    if state.is_busy(matched['id'], slot_index):
                        flags.append({
                            'type': 'lock_conflict',
                            'severity': 'orange',
                            'time': time_str,
                            'message': f"{inst_name} is locked to multiple lessons at {time_str}"
                        })
                        unassigned.append(lesson_idx)
                        continue
                    state.record(matched['id'], slot_index, 'lesson')
                    final_assignments[lesson_idx] = matched['name']
                else:
                    flags.append({
                        'type': 'pre_assignment_warning',
                        'severity': 'orange',
                        'time': time_str,
                        'message': f"'{inst_name}' locked but not found in instructor roster"
                    })
                    final_assignments[lesson_idx] = inst_name + ' (not in roster)'
                continue

            if lesson.get('instructor_lock'):
                flags.append({
                    'type': 'reserved_warning',
                    'severity': 'orange',
                    'time': time_str,
                    'message': f"Lesson reserved for '{lesson['instructor_lock']}' - please verify manually"
                })
                final_assignments[lesson_idx] = f"Reserved: {lesson['instructor_lock']}"
                continue

            eligible = [i for i in instructors if is_eligible(i, lesson, state, slot_index, time_str, avail_map)]

            if not eligible:
                unassigned.append(lesson_idx)
                flags.append({
                    'type': 'no_match',
                    'severity': 'yellow',
                    'time': time_str,
                    'message': f"No eligible instructor found for lesson at {time_str}"
                })
                final_assignments[lesson_idx] = None
                continue

            scored = [(score_instructor(i, lesson, state, slot_index), i) for i in eligible]
            scored.sort(key=lambda x: x[0], reverse=True)
            best_score, best_instructor = scored[0]

            consec = state.consecutive_lessons_before(best_instructor['id'], slot_index)
            if consec >= 3 and len(scored) > 1:
                alt = next((s for s in scored[1:] if state.consecutive_lessons_before(s[1]['id'], slot_index) < 3), None)
                if alt:
                    best_score, best_instructor = alt
                else:
                    flags.append({
                        'type': 'soft_cap',
                        'severity': 'yellow',
                        'time': time_str,
                        'message': f"{best_instructor['name']} assigned a 4th consecutive lesson at {time_str}"
                    })

            if best_score < 0:
                flags.append({
                    'type': 'low_match',
                    'severity': 'yellow',
                    'time': time_str,
                    'message': f"{best_instructor['name']} is the best available match for {time_str} but proficiency is not ideal"
                })

            state.record(best_instructor['id'], slot_index, 'lesson')
            final_assignments[lesson_idx] = best_instructor['name']

        # Mark overflow lessons as needing manual placement (not auto-assigned)
        for lesson_idx, lesson in overflow_lessons:
            final_assignments[lesson_idx] = 'OVERFLOW - needs manual lane assignment'
            unassigned.append(lesson_idx)

    lifeguard_assignments = assign_lifeguards(instructors, time_order, state, flags, avail_map)

    return {
        'time_slots': time_order,
        'assignments': final_assignments,
        'lifeguard_assignments': lifeguard_assignments,
        'flags': flags,
        'unassigned': unassigned,
        'workload': state.daily_lesson_count,
        'guard_load': state.guard_slot_count,
    }


def assign_lifeguards(instructors, time_order, state, flags, avail_map=None):
    lifeguard_assignments = {}

    dedicated = [i for i in instructors if i.get('role') == 'Dedicated Lifeguard']
    certified_teachers = [i for i in instructors if i.get('lifeguard_certified') and i.get('role') == 'Instructor']

    for slot_index, time_str in enumerate(time_order):
        candidate = None
        if avail_map:
            dedicated_now = [d for d in dedicated if is_available_at(d['id'], time_str, avail_map)]
            certified_now = [c for c in certified_teachers if is_available_at(c['id'], time_str, avail_map)]
        else:
            dedicated_now = dedicated
            certified_now = certified_teachers
        available_dedicated = [d for d in dedicated_now if not state.is_busy(d['id'], slot_index)]
        if available_dedicated:
            available_dedicated.sort(key=lambda d: state.guard_slot_count.get(d['id'], 0))
            candidate = available_dedicated[0]
        else:
            available_certified = [c for c in certified_now if not state.is_busy(c['id'], slot_index)]
            if available_certified:
                available_certified.sort(key=lambda c: (
                    state.daily_lesson_count.get(c['id'], 0) + state.guard_slot_count.get(c['id'], 0) * 0.5
                ))
                candidate = available_certified[0]

        if candidate:
            state.record(candidate['id'], slot_index, 'guard')
            lifeguard_assignments[time_str] = candidate['name']
        else:
            lifeguard_assignments[time_str] = None
            flags.append({
                'type': 'lifeguard_gap',
                'severity': 'grey',
                'time': time_str,
                'message': f"No certified lifeguard available at {time_str} - advisory only"
            })

    return lifeguard_assignments

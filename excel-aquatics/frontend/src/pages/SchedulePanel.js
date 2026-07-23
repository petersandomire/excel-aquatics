import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PrintView from './PrintView';

const API = 'https://scaling-engine-4j5797p45qxwf76q-5000.app.github.dev';
const MAX_GROUP_SIZE = 3;

function getLevelColor(level) {
  if (!level) return 'tag-grey';
  if (level.toLowerCase().includes('precomp')) return 'tag-yellow';
  if (level.toLowerCase().includes('adaptive')) return 'tag-red';
  return 'tag-aqua';
}

function flagColor(severity) {
  const map = { red: 'tag-red', orange: 'tag-yellow', yellow: 'tag-yellow', grey: 'tag-grey' };
  return map[severity] || 'tag-grey';
}

export default function SchedulePanel({ lessons, availability }) {
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggedFrom, setDraggedFrom] = useState(null);
  const [studentDragOverIndex, setStudentDragOverIndex] = useState(null);
  const [studentBeingDragged, setStudentBeingDragged] = useState(null); // {lessonIndex, studentIdx}
  const [overflowWarning, setOverflowWarning] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/instructors-simple`).then(res => setInstructors(res.data)).catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!lessons || lessons.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/api/generate-schedule`, { lessons, availability });
      setScheduleData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to generate schedule.');
    } finally {
      setLoading(false);
    }
  }

  function setInstructorFor(lessonIndex, newInstructorName) {
    setScheduleData(prev => {
      const updated = { ...prev };
      updated.lessons = updated.lessons.map(l =>
        l.lesson_index === lessonIndex ? { ...l, assigned_instructor: newInstructorName } : l
      );
      return updated;
    });
  }

  function handleOverride(lessonIndex, newInstructorName) {
    setInstructorFor(lessonIndex, newInstructorName);
    setOverrideTarget(null);
  }

  // INSTRUCTOR DRAG HANDLERS
  function handleInstructorDragStart(e, lessonIndex, instructorName) {
    e.dataTransfer.setData('dragType', 'instructor');
    e.dataTransfer.setData('lessonIndex', lessonIndex);
    e.dataTransfer.setData('instructorName', instructorName);
    setDraggedFrom(lessonIndex);
  }

  // STUDENT DRAG HANDLERS
  function handleStudentDragStart(e, lessonIndex, studentIdx) {
    e.stopPropagation();
    e.dataTransfer.setData('dragType', 'student');
    e.dataTransfer.setData('sourceLessonIndex', lessonIndex);
    e.dataTransfer.setData('sourceStudentIdx', studentIdx);
    setStudentBeingDragged({ lessonIndex, studentIdx });
  }

  function handleCellDragOver(e, lessonIndex) {
    e.preventDefault();
    setDragOverIndex(lessonIndex);
    setStudentDragOverIndex(lessonIndex);
  }

  function handleCellDragLeave() {
    setDragOverIndex(null);
    setStudentDragOverIndex(null);
  }

  function handleCellDrop(e, targetLessonIndex) {
    e.preventDefault();
    setDragOverIndex(null);
    setStudentDragOverIndex(null);

    const dragType = e.dataTransfer.getData('dragType');

    if (dragType === 'student') {
      const sourceLessonIndex = parseInt(e.dataTransfer.getData('sourceLessonIndex'));
      const sourceStudentIdx = parseInt(e.dataTransfer.getData('sourceStudentIdx'));
      moveStudent(sourceLessonIndex, sourceStudentIdx, targetLessonIndex);
      setStudentBeingDragged(null);
      return;
    }

    // Instructor swap (existing behavior)
    const sourceLessonIndex = parseInt(e.dataTransfer.getData('lessonIndex'));
    const draggedInstructorName = e.dataTransfer.getData('instructorName');
    if (sourceLessonIndex === targetLessonIndex) return;

    const targetLesson = scheduleData.lessons.find(l => l.lesson_index === targetLessonIndex);
    const targetInstructorName = targetLesson ? targetLesson.assigned_instructor : null;

    setInstructorFor(targetLessonIndex, draggedInstructorName);
    setInstructorFor(sourceLessonIndex, targetInstructorName);
    setDraggedFrom(null);
  }

  function moveStudent(sourceLessonIndex, studentIdx, targetLessonIndex) {
    if (sourceLessonIndex === targetLessonIndex) return;

    setScheduleData(prev => {
      const updated = { ...prev };
      const lessonsCopy = updated.lessons.map(l => ({ ...l, students: [...(l.students || [])] }));

      const sourceLesson = lessonsCopy.find(l => l.lesson_index === sourceLessonIndex);
      const targetLesson = lessonsCopy.find(l => l.lesson_index === targetLessonIndex);

      if (!sourceLesson || !targetLesson) return prev;

      const [movedStudent] = sourceLesson.students.splice(studentIdx, 1);
      if (!movedStudent) return prev;

      targetLesson.students.push(movedStudent);
      targetLesson.is_group = targetLesson.students.length > 1;
      sourceLesson.is_group = sourceLesson.students.length > 1;

      // Warn if target now exceeds normal semi-private group size
      if (targetLesson.students.length > MAX_GROUP_SIZE) {
        setOverflowWarning(`${movedStudent.first} ${movedStudent.last} added to a lane with ${targetLesson.students.length} students (max is usually ${MAX_GROUP_SIZE}). Please review.`);
      } else {
        setOverflowWarning(null);
      }

      // Remove source lesson from display entirely if now empty
      updated.lessons = lessonsCopy.filter(l => l.students.length > 0);

      return updated;
    });
  }

  if (!lessons || lessons.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📅</div>
        <div className="empty-state-title">No lessons imported yet</div>
        <div className="empty-state-sub">Go to Import Data and upload a Jackrabbit PDF first.</div>
      </div>
    );
  }

  if (!scheduleData) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Schedule</div>
            <div className="page-sub">{lessons.length} lessons ready to schedule</div>
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Schedule'}
          </button>
        </div>
        {error && (
          <div className="card" style={{ borderColor: '#ff4d6d55', color: '#ff4d6d' }}>{error}</div>
        )}
      </div>
    );
  }

  const { time_slots, flags, workload } = scheduleData;

  const lessonsByTime = {};
  scheduleData.lessons.forEach(l => {
    lessonsByTime[l.start_time] = lessonsByTime[l.start_time] || [];
    lessonsByTime[l.start_time].push(l);
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Schedule</div>
          <div className="page-sub">{scheduleData.lessons.length} lessons scheduled across {time_slots.length} time slots · Drag instructor names to swap, drag student cards to move between lanes</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
          <button className="btn btn-ghost" onClick={() => setScheduleData(null)}>↻ Regenerate</button>
        </div>
      </div>

      <PrintView scheduleData={scheduleData} dayLabel={lessons[0]?.day || ''} />

      {overflowWarning && (
        <div className="card" style={{ borderColor: '#ffd16655', color: 'var(--yellow)', marginBottom: 16 }}>
          ⚠️ {overflowWarning}
        </div>
      )}

      {flags && flags.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
            Flags & Advisories ({flags.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flags.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                <span className={`tag ${flagColor(f.severity)}`} style={{ flexShrink: 0 }}>{f.time}</span>
                <span style={{ color: 'var(--grey)' }}>{f.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="schedule-grid">
        <div className="schedule-grid-header">
          <div className="schedule-time-col">Time</div>
          <div className="schedule-lane-col">Lane 1</div>
          <div className="schedule-lane-col">Lane 2</div>
          <div className="schedule-lane-col">Lane 3</div>
          <div className="schedule-lane-col">Lane 4</div>
        </div>

        {time_slots.map(time => {
          const lanes = lessonsByTime[time] || [];
          return (
            <div className="schedule-grid-row" key={time}>
              <div className="schedule-time-col">{time}</div>
              {[0, 1, 2, 3].map(laneIdx => {
                const lesson = lanes[laneIdx];
                return (
                  <div className="schedule-lane-col" key={laneIdx}>
                    {lesson ? (
                      <LessonCell
                        lesson={lesson}
                        instructors={instructors}
                        isOverriding={overrideTarget === lesson.lesson_index}
                        isDragOver={dragOverIndex === lesson.lesson_index || studentDragOverIndex === lesson.lesson_index}
                        isBeingDragged={draggedFrom === lesson.lesson_index}
                        onStartOverride={() => setOverrideTarget(lesson.lesson_index)}
                        onOverride={(name) => handleOverride(lesson.lesson_index, name)}
                        onCancelOverride={() => setOverrideTarget(null)}
                        onInstructorDragStart={(e) => handleInstructorDragStart(e, lesson.lesson_index, lesson.assigned_instructor)}
                        onCellDragOver={(e) => handleCellDragOver(e, lesson.lesson_index)}
                        onCellDragLeave={handleCellDragLeave}
                        onCellDrop={(e) => handleCellDrop(e, lesson.lesson_index)}
                        onStudentDragStart={(e, studentIdx) => handleStudentDragStart(e, lesson.lesson_index, studentIdx)}
                        studentBeingDragged={studentBeingDragged}
                      />
                    ) : (
                      <div
                        className={`empty-lane ${studentDragOverIndex === `empty-${laneIdx}-${time}` ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const dragType = e.dataTransfer.getData('dragType');
                          if (dragType === 'student') {
                            // Create a brand new lesson slot for this dropped student
                            const sourceLessonIndex = parseInt(e.dataTransfer.getData('sourceLessonIndex'));
                            const sourceStudentIdx = parseInt(e.dataTransfer.getData('sourceStudentIdx'));
                            setScheduleData(prev => {
                              const updated = { ...prev };
                              const lessonsCopy = updated.lessons.map(l => ({ ...l, students: [...(l.students || [])] }));
                              const sourceLesson = lessonsCopy.find(l => l.lesson_index === sourceLessonIndex);
                              if (!sourceLesson) return prev;
                              const [movedStudent] = sourceLesson.students.splice(sourceStudentIdx, 1);
                              if (!movedStudent) return prev;
                              const newIndex = Math.max(...lessonsCopy.map(l => l.lesson_index)) + 1;
                              lessonsCopy.push({
                                lesson_index: newIndex,
                                start_time: time,
                                students: [movedStudent],
                                assigned_instructor: null,
                                is_group: false,
                                is_adaptive: movedStudent.is_adaptive,
                                lesson_type: 'private'
                              });
                              updated.lessons = lessonsCopy.filter(l => l.students.length > 0);
                              return updated;
                            });
                          }
                        }}
                      >
                        Drop here
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Daily Workload Summary
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {Object.entries(workload).filter(([id, count]) => count > 0).map(([id, count]) => {
            const inst = instructors.find(i => i.id === parseInt(id));
            const guardCount = scheduleData.guard_load ? (scheduleData.guard_load[id] || 0) : 0;
            return (
              <div key={id} className="stat-chip">
                <strong style={{ color: 'var(--white)' }}>{inst ? inst.name : id}</strong>
                <span className="stat-num" style={{ fontSize: 14 }}>{count}</span> lessons
                {guardCount > 0 && <span style={{ color: 'var(--grey)' }}>· {guardCount} guard</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LessonCell({
  lesson, instructors, isOverriding, isDragOver, isBeingDragged,
  onStartOverride, onOverride, onCancelOverride,
  onInstructorDragStart, onCellDragOver, onCellDragLeave, onCellDrop,
  onStudentDragStart, studentBeingDragged
}) {
  const isLocked = !!lesson.locked;
  const students = lesson.students || [];
  const hasInstructor = !!lesson.assigned_instructor;
  const isOverGroupSize = students.length > 3;

  return (
    <div
      className={`lesson-cell ${lesson.is_adaptive ? 'adaptive' : ''} ${lesson.is_group ? 'group' : ''} ${isDragOver ? 'drag-over' : ''} ${isBeingDragged ? 'being-dragged' : ''} ${isOverGroupSize ? 'overflow-warn' : ''}`}
      onDragOver={onCellDragOver}
      onDragLeave={onCellDragLeave}
      onDrop={onCellDrop}
    >
      <div className="lesson-cell-instructor">
        {isOverriding ? (
          <select
            className="form-select"
            style={{ fontSize: 11, padding: '4px 6px' }}
            autoFocus
            defaultValue={lesson.assigned_instructor}
            onChange={e => onOverride(e.target.value)}
            onBlur={onCancelOverride}
          >
            {instructors.map(i => (
              <option key={i.id} value={i.name}>{i.name}</option>
            ))}
          </select>
        ) : (
          <span
            className="instructor-draggable"
            draggable={hasInstructor}
            onDragStart={onInstructorDragStart}
            onClick={onStartOverride}
            title={hasInstructor ? "Drag to swap with another lesson, or click to pick from list" : "Click to assign an instructor"}
          >
            <span className="drag-handle">{hasInstructor ? '⠿' : ''}</span>
            {lesson.assigned_instructor || <span style={{ color: 'var(--red)' }}>Unassigned</span>}
            {isLocked && ' 🔒'}
          </span>
        )}
      </div>
      {students.map((s, i) => {
        const isThisDragging = studentBeingDragged && studentBeingDragged.lessonIndex === lesson.lesson_index && studentBeingDragged.studentIdx === i;
        return (
          <div
            key={i}
            className={`lesson-cell-student student-draggable ${isThisDragging ? 'being-dragged' : ''}`}
            draggable
            onDragStart={(e) => onStudentDragStart(e, i)}
            title="Drag to move this student to another lane"
          >
            <span className="drag-handle" style={{ fontSize: 10 }}>⠿</span>
            <span className="student-name" style={{ fontSize: 12 }}>{s.first} {s.last}</span>
            {s.swim_level && <span className={`tag ${getLevelColor(s.swim_level)}`} style={{ fontSize: 9 }}>{s.swim_level}</span>}
            {s.is_adaptive && <span className="tag tag-red" style={{ fontSize: 9 }}>Adaptive</span>}
          </div>
        );
      })}
      {isOverGroupSize && (
        <div style={{ fontSize: 9, color: 'var(--yellow)', marginTop: 2 }}>⚠ Over normal group size</div>
      )}
    </div>
  );
}

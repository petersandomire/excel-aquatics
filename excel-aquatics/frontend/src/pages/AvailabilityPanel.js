import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API = 'https://scaling-engine-4j5797p45qxwf76q-5000.app.github.dev';

function timeToMinutes(timeStr) {
  const m = timeStr.match(/(\d+):(\d+)(am|pm)/i);
  if (!m) return 0;
  let hour = parseInt(m[1]);
  const minute = parseInt(m[2]);
  const period = m[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function minutesToTimeLabel(mins) {
  let hour = Math.floor(mins / 60);
  const minute = mins % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export default function AvailabilityPanel({ lessons, onContinue }) {
  const [instructors, setInstructors] = useState([]);
  const [selected, setSelected] = useState({});
  const [ranges, setRanges] = useState({});

  const { dayStart, dayEnd, lessonStart, lessonEnd } = useMemo(() => {
    if (!lessons || lessons.length === 0) return { dayStart: 480, dayEnd: 1080, lessonStart: 480, lessonEnd: 1080 };
    const times = lessons.map(l => timeToMinutes(l.start_time));
    const earliest = Math.min(...times);

    // Determine if this is a weekend (Saturday/Sunday) or weekday based on the parsed day field
    const dayField = (lessons[0].day || '').toLowerCase();
    const isWeekend = dayField.includes('saturday') || dayField.includes('sunday');

    // Fixed closing time: 7:30pm weekdays, 2:00pm weekends
    const closingTime = isWeekend ? (14 * 60) : (19 * 60 + 30);

    return {
      // Slider draggable bounds - includes 30 min buffer on each side
      dayStart: Math.max(0, earliest - 30),
      dayEnd: Math.min(1440, closingTime + 30),
      // Default selected range - exactly first lesson to closing time, no buffer
      lessonStart: earliest,
      lessonEnd: closingTime
    };
  }, [lessons]);

  useEffect(() => {
    axios.get(`${API}/api/instructors-simple`).then(res => {
      setInstructors(res.data);
      const initRanges = {};
      res.data.forEach(i => {
        initRanges[i.id] = [lessonStart, lessonEnd];
      });
      setRanges(initRanges);
    }).catch(() => {});
  }, [dayStart, dayEnd, lessonStart, lessonEnd]);

  function toggleSelected(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    // Default newly-checked instructors to the lesson window (no buffer), even though
    // the slider itself can still be dragged into the 30-min buffer zones on either side
    setRanges(prev => {
      if (selected[id]) return prev; // was already selected, about to be unchecked - leave range as is
      return { ...prev, [id]: [lessonStart, lessonEnd] };
    });
  }

  function updateRange(id, newRange) {
    setRanges(prev => ({ ...prev, [id]: newRange }));
  }

  function handleContinue() {
    const availability = instructors
      .filter(i => selected[i.id])
      .map(i => ({
        instructor_id: i.id,
        name: i.name,
        start_minutes: ranges[i.id][0],
        end_minutes: ranges[i.id][1],
      }));
    onContinue(availability);
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Who's Working Today?</div>
          <div className="page-sub">Select instructors and set their working hours for this schedule</div>
        </div>
        <button className="btn btn-primary" onClick={handleContinue} disabled={selectedCount === 0}>
          Continue to Schedule ({selectedCount} selected) →
        </button>
      </div>

      <div className="availability-list">
        {instructors.map(inst => (
          <div key={inst.id} className={`availability-row ${selected[inst.id] ? 'active' : ''}`}>
            <label className="availability-checkbox">
              <input
                type="checkbox"
                checked={!!selected[inst.id]}
                onChange={() => toggleSelected(inst.id)}
              />
              <span className="availability-name">{inst.name}</span>
              <span className="tag tag-grey" style={{ fontSize: 10 }}>{inst.role}</span>
            </label>

            {selected[inst.id] && (
              <TimeRangeSlider
                min={dayStart}
                max={dayEnd}
                value={ranges[inst.id] || [dayStart, dayEnd]}
                onChange={(newRange) => updateRange(inst.id, newRange)}
              />
            )}
          </div>
        ))}
      </div>

      {instructors.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">👤</div>
          <div className="empty-state-title">No instructors found</div>
          <div className="empty-state-sub">Add instructors first in the Instructors tab.</div>
        </div>
      )}
    </div>
  );
}

function TimeRangeSlider({ min, max, value, onChange }) {
  const [dragging, setDragging] = useState(null); // 'start' | 'end' | null
  const trackRef = React.useRef(null);

  const range = max - min;
  const startPct = ((value[0] - min) / range) * 100;
  const endPct = ((value[1] - min) / range) * 100;

  function posToMinutes(clientX) {
    if (!trackRef.current) return min;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + pct * range;
    return Math.round(raw / 15) * 15; // snap to 15 min increments
  }

  function handleMouseDown(handle) {
    setDragging(handle);
  }

  useEffect(() => {
    function handleMouseMove(e) {
      if (!dragging) return;
      const mins = posToMinutes(e.clientX);
      if (dragging === 'start') {
        onChange([Math.min(mins, value[1] - 15), value[1]]);
      } else {
        onChange([value[0], Math.max(mins, value[0] + 15)]);
      }
    }
    function handleMouseUp() {
      setDragging(null);
    }
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, value, min, max, range]);

  return (
    <div className="time-slider-wrap">
      <div className="time-slider-labels">
        <span>{minutesToTimeLabel(value[0])}</span>
        <span>{minutesToTimeLabel(value[1])}</span>
      </div>
      <div className="time-slider-track" ref={trackRef}>
        <div className="time-slider-bg" />
        <div
          className="time-slider-active"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <div
          className="time-slider-handle"
          style={{ left: `${startPct}%` }}
          onMouseDown={() => handleMouseDown('start')}
        />
        <div
          className="time-slider-handle"
          style={{ left: `${endPct}%` }}
          onMouseDown={() => handleMouseDown('end')}
        />
      </div>
      <div className="time-slider-bounds">
        <span>{minutesToTimeLabel(min)}</span>
        <span>{minutesToTimeLabel(max)}</span>
      </div>
    </div>
  );
}

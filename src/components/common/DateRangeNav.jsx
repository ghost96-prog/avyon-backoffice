// src/components/common/DateRangeNav.jsx
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { DATE_OPTIONS, formatDateRangeLabel } from '../../hooks/useDateRange';
import Button from './Button';
import './DateRangeNav.css';

export default function DateRangeNav({ startDate, endDate, onNavigate, onOptionSelect, selectedOption }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const popoverRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverOpen(false);
        setShowCustomPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleOptionClick = (option) => {
    if (option.id === 'custom') {
      setCustomStart(startDate.toISOString().split('T')[0]);
      setCustomEnd(endDate.toISOString().split('T')[0]);
      setShowCustomPicker(true);
      return;
    }
    onOptionSelect(option.id);
    setPopoverOpen(false);
  };

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) return;
    let start = new Date(customStart);
    let end = new Date(customEnd);
    if (start > end) [start, end] = [end, start];
    onOptionSelect('custom', start, end);
    setPopoverOpen(false);
    setShowCustomPicker(false);
  };

  const label = formatDateRangeLabel(startDate, endDate);

  return (
    <div className="date-range-nav" ref={popoverRef}>
      <button className="date-nav-btn" onClick={() => onNavigate('prev')} aria-label="Previous period">
        <ChevronLeft size={16} />
      </button>

      <button className="date-range-label-btn" onClick={() => setPopoverOpen(!popoverOpen)}>
        <Calendar size={14} className="date-range-icon" />
        <span className="date-range-label">{label}</span>
        <span className="date-range-caret">▾</span>
      </button>

      <button className="date-nav-btn" onClick={() => onNavigate('next')} aria-label="Next period">
        <ChevronRight size={16} />
      </button>

      {popoverOpen && (
        <div className="date-range-popover">
          {!showCustomPicker ? (
            <>
              <div className="date-range-popover-options">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className={`date-range-popover-option ${selectedOption === opt.id ? 'is-active' : ''}`}
                    onClick={() => handleOptionClick(opt)}
                  >
                    {opt.label}
                    {selectedOption === opt.id && <span className="date-range-check">✓</span>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="date-range-custom">
              <div className="date-range-custom-fields">
                <div className="date-range-custom-field">
                  <label>Start</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="date-range-custom-field">
                  <label>End</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="date-range-custom-actions">
                <Button variant="ghost" size="sm" onClick={() => setShowCustomPicker(false)}>
                  Back
                </Button>
                <Button variant="primary" size="sm" onClick={handleApplyCustom}>
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
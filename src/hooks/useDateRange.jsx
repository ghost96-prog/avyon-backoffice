// src/hooks/useDateRange.jsx
import { useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'bo_dashboard_date_range';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DATE_OPTIONS = [
  { id: 'today', label: 'Today', type: 'day', value: 1 },
  { id: 'this_week', label: 'This Week', type: 'week', value: 1 },
  { id: 'last_week', label: 'Last Week', type: 'week', value: 1 },
  { id: 'this_month', label: 'This Month', type: 'month', value: 1 },
  { id: 'last_month', label: 'Last Month', type: 'month', value: 1 },
  { id: 'this_year', label: 'This Year', type: 'year', value: 1 },
  { id: 'custom', label: 'Custom Range', type: 'custom', value: 0 },
];

// Inclusive number of CALENDAR days from a to b (ignores time of day).
// A raw ms difference rounded up turns a 7-day range into 8 when the two dates
// carry different times of day (date pickers keep the previous date's time).
function inclusiveDays(a, b) {
  const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d1 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(Math.abs(d1 - d0) / 86400000) + 1;
}

// Local calendar date (YYYY-MM-DD). NOT toISOString(): that converts local midnight to UTC,
// which shifts the date back a day in any timezone ahead of UTC (e.g. Harare, UTC+2).
export function toApiDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateDisplay(d) {
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDateRangeLabel(start, end) {
  if (!start || !end) return '';
  return `${MONTHS[start.getMonth()]} ${start.getDate()} - ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function computeRangeForOption(optionId, currentStart, currentEnd) {
  const today = new Date();
  let start = new Date(today);
  let end = new Date(today);
  let type = 'day';
  let value = 1;

  switch (optionId) {
    case 'today':
      start = new Date(today);
      end = new Date(today);
      break;
    case 'this_week': {
      const day = today.getDay();
      start = new Date(today);
      start.setDate(today.getDate() - day);
      end = new Date(today);
      end.setDate(today.getDate() + (6 - day));
      type = 'week';
      break;
    }
    case 'last_week':
      start = new Date(today);
      start.setDate(today.getDate() - today.getDay() - 7);
      end = new Date(today);
      end.setDate(today.getDate() - today.getDay() - 1);
      type = 'week';
      break;
    case 'this_month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      type = 'month';
      break;
    case 'last_month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      type = 'month';
      break;
    case 'this_year':
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), 11, 31);
      type = 'year';
      break;
    case 'custom':
      start = currentStart || today;
      end = currentEnd || today;
      type = 'custom';
      value = inclusiveDays(start, end);
      break;
    default:
      break;
  }

  return { start, end, type, value };
}

function readStoredRange() {
  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return { start: today, end: today, option: 'today', type: 'day', value: 1, isNew: true };
    }

    const data = JSON.parse(saved);
    let start = new Date(data.startDate);
    let end = new Date(data.endDate);
    const option = data.option || 'today';

    if (option === 'today') {
      // Only snap back to the real today if this was saved on a *previous*
      // calendar day (session left open overnight). If it was saved today —
      // even if the user had navigated the prev/next arrows to a different
      // day while still on the 'today' option — trust the stored date as-is.
      const savedAtRef = data.savedAt ? new Date(data.savedAt) : start;
      const savedAtStart = new Date(savedAtRef);
      savedAtStart.setHours(0, 0, 0, 0);
      if (savedAtStart.getTime() !== todayStart.getTime()) {
        start = new Date(today);
        end = new Date(today);
      }
    }

    return { start, end, option, type: data.type || 'day', value: data.value || 1, isNew: false };
  } catch (e) {
    console.error('Error loading date range:', e);
    return { start: today, end: today, option: 'today', type: 'day', value: 1, isNew: false };
  }
}

export function useDateRange(initialOption = 'today') {
  // Read localStorage synchronously so the very first render — and
  // therefore the very first data fetch — already uses the persisted date,
  // instead of rendering 'today' first and correcting a moment later.
  const initialRef = useRef(null);
  if (initialRef.current === null) {
    initialRef.current = readStoredRange();
  }

  const [startDate, setStartDate] = useState(initialRef.current.start);
  const [endDate, setEndDate] = useState(initialRef.current.end);
  const [selectedOption, setSelectedOption] = useState(initialRef.current.option);
  const [dateRangeType, setDateRangeType] = useState(initialRef.current.type);
  const [dateRangeValue, setDateRangeValue] = useState(initialRef.current.value);
  const isReloading = useRef(false);

  const saveToStorage = useCallback((option, start, end, type, value) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          option,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          type,
          value,
          // Records the calendar day this was saved on. Used on load to tell
          // "session left open past midnight, should snap back to real today"
          // apart from "user deliberately navigated to a different day today"
          // — both look identical if we only compare the stored startDate.
          savedAt: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error('Error saving date range:', e);
    }
  }, []);

  const loadFromStorage = useCallback(() => {
    if (isReloading.current) return null;
    isReloading.current = true;

    const result = readStoredRange();

    setStartDate(result.start);
    setEndDate(result.end);
    setSelectedOption(result.option);
    setDateRangeType(result.type);
    setDateRangeValue(result.value);

    if (result.isNew) {
      // Nothing was in storage yet — persist the default so subsequent
      // reads (and other screens) have something consistent to find.
      saveToStorage(result.option, result.start, result.end, result.type, result.value);
    }

    isReloading.current = false;
    return { start: result.start, end: result.end, option: result.option, type: result.type, value: result.value };
  }, [saveToStorage]);

  const reload = useCallback(() => {
    const loaded = loadFromStorage();
    return loaded;
  }, [loadFromStorage]);

  const updateDateRange = useCallback(
    (option, start, end, type, value) => {
      setStartDate(start);
      setEndDate(end);
      setSelectedOption(option);
      setDateRangeType(type);
      setDateRangeValue(value);
      saveToStorage(option, start, end, type, value);
    },
    [saveToStorage]
  );

  const handleOptionSelect = useCallback(
    (optionId, customStart, customEnd) => {
      if (optionId === 'custom' && customStart && customEnd) {
        const days = inclusiveDays(customStart, customEnd);
        updateDateRange('custom', customStart, customEnd, 'custom', days);
        return;
      }
      
      const { start, end, type, value } = computeRangeForOption(optionId, startDate, endDate);
      updateDateRange(optionId, start, end, type, value);
    },
    [startDate, endDate, updateDateRange]
  );

  const navigateDate = useCallback(
    (direction) => {
      const newStart = new Date(startDate);
      const newEnd = new Date(endDate);
      const sign = direction === 'prev' ? -1 : 1;

      if (dateRangeType === 'day') {
        const days = dateRangeValue * sign;
        newStart.setDate(newStart.getDate() + days);
        newEnd.setDate(newEnd.getDate() + days);
      } else if (dateRangeType === 'week') {
        const days = dateRangeValue * 7 * sign;
        newStart.setDate(newStart.getDate() + days);
        newEnd.setDate(newEnd.getDate() + days);
      } else if (dateRangeType === 'month') {
        const months = dateRangeValue * sign;
        // Whole calendar months: first day of the target month to its LAST day.
        // (Adding a month to each date separately gives Oct 30 / "Sep 31" -> Oct 1.)
        const _mStart = new Date(newStart.getFullYear(), newStart.getMonth() + (months), 1);
        const _mEnd = new Date(_mStart.getFullYear(), _mStart.getMonth() + dateRangeValue, 0);
        newStart.setTime(_mStart.getTime());
        newEnd.setTime(_mEnd.getTime());
      } else if (dateRangeType === 'year') {
        const years = dateRangeValue * sign;
        // Whole calendar years: Jan 1 to Dec 31.
        const _yStart = new Date(newStart.getFullYear() + (years), 0, 1);
        const _yEnd = new Date(_yStart.getFullYear() + dateRangeValue - 1, 11, 31);
        newStart.setTime(_yStart.getTime());
        newEnd.setTime(_yEnd.getTime());
      } else if (dateRangeType === 'custom') {
        const diffDays = (inclusiveDays(startDate, endDate)) * sign;
        newStart.setDate(newStart.getDate() + diffDays);
        newEnd.setDate(newEnd.getDate() + diffDays);
      }

      updateDateRange(selectedOption, newStart, newEnd, dateRangeType, dateRangeValue);
    },
    [startDate, endDate, dateRangeType, dateRangeValue, selectedOption, updateDateRange]
  );

  return {
    startDate,
    endDate,
    selectedOption,
    dateRangeType,
    dateRangeValue,
    updateDateRange,
    handleOptionSelect,
    navigateDate,
    reload,
    loadFromStorage,
    saveToStorage,
    formatLabel: formatDateRangeLabel,
    toApiDate,
  };
}
import { useState, useCallback } from 'react';

// Simple shared state via module-level singleton + listeners pattern.
// We avoid a full Zustand/Redux dependency — just use React context at App level.

export const initialState = {
  sessions: [],
  tags: [],
  tasks: [],
  focusSettings: {
    duration: 50,
    task: 'desk',
    tag: null,
    autostart: false,
    autostartBreaks: false,
    breakDuration: 5,
    initial: null,
  },
  calOffset: 0,
  selectedSlot: null,
  confirmingCancel: null,
  view: 'calendar',
  newTagColor: '#6366f1',
  statsPeriod: 'weekly',
  statsPeriodOffset: 0,
};

'use strict';

// Layout topology constants — all size ratios and timing values in one place.
// Tweak these to experiment with layout behavior without touching layout.js.

module.exports = {
  // Pane size ratios (relative units, not percentages)
  LEFT_COLUMN_SIZE: 2,
  RIGHT_COLUMN_SIZE: 4,
  PROBLEM_PANE_SIZE: 2,
  BOTTOM_ROW_SIZE: 2,
  INPUT_PANE_SIZE: 1,
  OUTPUT_PANE_SIZE: 1,

  // Timing constants
  CLOSE_TABS_BUFFER_MS: 150,
  SAVE_ALL_BUFFER_MS: 100,
  LAYOUT_CONFIRM_BUFFER_MS: 50,
  NUCLEAR_FALLBACK_BUFFER_MS: 400,

  // Polling intervals/timeouts
  POLL_INTERVAL_MS: 80,
  RESET_LAYOUT_TIMEOUT_MS: 3000,
  CONFIRM_LAYOUT_TIMEOUT_MS: 4000,

  // Tab wait timeouts
  TAB_WAIT_TIMEOUT_PROBLEM_MS: 1500,
  TAB_WAIT_TIMEOUT_INPUT_MS: 1500,
  TAB_WAIT_TIMEOUT_OUTPUT_MS: 1500,
  TAB_WAIT_TIMEOUT_SOLUTION_MS: 1000,
  TAB_WAIT_TIMEOUT_PREVIEW_MS: 2500,  // preview webview takes longer to initialize
};

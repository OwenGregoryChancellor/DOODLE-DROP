const DEFAULTS = {
  status: "idle", // idle | running | paused
  mode: "work", // work | break
  durations: { work: 25 * 60, break: 5 * 60 },
  startTime: null,
  endTime: null,
  remaining: 25 * 60
};

async function getState() {
  const { pomodoroState } = await chrome.storage.local.get("pomodoroState");
  return pomodoroState || { ...DEFAULTS };
}

async function setState(state) {
  await chrome.storage.local.set({ pomodoroState: state });
}

function secondsLeft(state) {
  if (state.status === "running" && state.endTime) {
    return Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
  }
  return state.remaining ?? DEFAULTS.durations[state.mode];
}

async function startTimer() {
  const state = await getState();
  const duration = state.status === "paused" ? secondsLeft(state) : state.durations[state.mode];
  const now = Date.now();
  const endTime = now + duration * 1000;
  const next = {
    ...state,
    status: "running",
    startTime: now,
    endTime,
    remaining: duration
  };
  await setState(next);
  chrome.alarms.create("pomodoroFinished", { when: endTime });
  return next;
}

async function pauseTimer() {
  const state = await getState();
  const remaining = secondsLeft(state);
  const next = {
    ...state,
    status: "paused",
    endTime: null,
    remaining
  };
  await setState(next);
  chrome.alarms.clear("pomodoroFinished");
  return next;
}

async function resetTimer() {
  const state = await getState();
  const duration = state.durations[state.mode];
  const next = {
    ...state,
    status: "idle",
    startTime: null,
    endTime: null,
    remaining: duration
  };
  await setState(next);
  chrome.alarms.clear("pomodoroFinished");
  return next;
}

async function switchMode(mode) {
  const state = await getState();
  const duration = state.durations[mode];
  const next = {
    ...state,
    mode,
    status: "idle",
    startTime: null,
    endTime: null,
    remaining: duration
  };
  await setState(next);
  chrome.alarms.clear("pomodoroFinished");
  return next;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "getState") {
      const state = await getState();
      sendResponse({ ok: true, state });
      return;
    }
    if (msg?.type === "start") {
      const state = await startTimer();
      sendResponse({ ok: true, state });
      return;
    }
    if (msg?.type === "pause") {
      const state = await pauseTimer();
      sendResponse({ ok: true, state });
      return;
    }
    if (msg?.type === "reset") {
      const state = await resetTimer();
      sendResponse({ ok: true, state });
      return;
    }
    if (msg?.type === "switch") {
      const state = await switchMode(msg.mode);
      sendResponse({ ok: true, state });
      return;
    }
    sendResponse({ ok: false, error: "Unknown message" });
  })();
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "pomodoroFinished") return;
  const state = await getState();
  const next = {
    ...state,
    status: "idle",
    startTime: null,
    endTime: null,
    remaining: 0
  };
  await setState(next);
});

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  if (!state) {
    await setState({ ...DEFAULTS });
  }
});

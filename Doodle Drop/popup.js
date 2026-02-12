/* ========================================
   Doodle Drop — Popup Logic
   ======================================== */

// === DOM References ===
const canvas = document.getElementById("doodleCanvas");
const ctx = canvas.getContext("2d");
const colorPicker = document.getElementById("colorPicker");
const sizePicker = document.getElementById("sizePicker");
const sizePreview = document.getElementById("sizePreview");
const eraserBtn = document.getElementById("eraserBtn");
const clearBtn = document.getElementById("clearBtn");
const saveBtn = document.getElementById("saveBtn");
const sendBtn = document.getElementById("sendBtn");
const sendNowBtn = document.getElementById("sendNowBtn");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const sendInExtensionBtn = document.getElementById("sendInExtension");
const sendSmsBtn = document.getElementById("sendSms");
const friendSelect = document.getElementById("friendSelect");
const friendsList = document.getElementById("friendsList");
const friendForm = document.getElementById("friendForm");
const friendName = document.getElementById("friendName");
const friendCode = document.getElementById("friendCode");
const friendPhone = document.getElementById("friendPhone");
const gallery = document.getElementById("gallery");
const inbox = document.getElementById("inbox");
const messagePreview = document.getElementById("messagePreview");
const yourName = document.getElementById("yourName");
const backendUrl = document.getElementById("backendUrl");
const myCode = document.getElementById("myCode");
const copyMyCodeBtn = document.getElementById("copyMyCodeBtn");
const syncInboxBtn = document.getElementById("syncInboxBtn");
const toast = document.getElementById("toast");
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");

// === State ===
const DEFAULT_STATE = {
  yourName: "",
  friends: [],
  doodles: [],
  inbox: [],
  backendUrl: "http://localhost:3000",
  myCode: ""
};

let state = { ...DEFAULT_STATE };
let isDrawing = false;
let lastPoint = null;
let usingEraser = false;
let sendMode = "link";
let canvasCssWidth = 0;
let canvasCssHeight = 0;

// === Toast ===
let toastTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

// === Tabs ===
function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
  const panel = document.getElementById(`tab-${tabName}`);
  const btn = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (panel) panel.classList.add("active");
  if (btn) btn.classList.add("active");
  if (tabName === "draw") {
    requestAnimationFrame(() => resizeCanvas());
  }
}

function switchGalleryTab(name) {
  document.querySelectorAll(".gallery-tab").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".gallery-content").forEach((el) => el.classList.remove("active"));
  const tab = document.querySelector(`.gallery-tab[data-gallery="${name}"]`);
  const content = document.getElementById(`gallery-${name}`);
  if (tab) tab.classList.add("active");
  if (content) content.classList.add("active");
}

function toggleSettings() {
  settingsPanel.classList.toggle("open");
  settingsToggle.classList.toggle("active");
}

// === Canvas ===
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvasCssWidth = rect.width;
  canvasCssHeight = rect.height;
  canvas.width = canvasCssWidth * ratio;
  canvas.height = canvasCssHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  fillCanvas();
}

function fillCanvas() {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasCssWidth, canvasCssHeight);
  ctx.restore();
}

function getPointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function setBrush() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Number(sizePicker.value);
  ctx.strokeStyle = usingEraser ? "#ffffff" : colorPicker.value;
}

function startDraw(event) {
  isDrawing = true;
  lastPoint = getPointerPos(event);
  setBrush();
}

function draw(event) {
  if (!isDrawing) return;
  const point = getPointerPos(event);
  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  lastPoint = point;
}

function endDraw() {
  isDrawing = false;
  lastPoint = null;
}

function updateSizePreview() {
  const size = Number(sizePicker.value);
  sizePreview.style.width = size + "px";
  sizePreview.style.height = size + "px";
}

// === Helpers ===
function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function buildInboxLink(code) {
  const base = (state.backendUrl || "").replace(/\/$/, "");
  return `${base}/inbox/${code}`;
}

// === State Persistence ===
async function loadState() {
  const { doodleState } = await chrome.storage.local.get("doodleState");
  state = { ...DEFAULT_STATE, ...(doodleState || {}) };
  if (!state.myCode) state.myCode = generateInviteCode();
  yourName.value = state.yourName || "";
  backendUrl.value = state.backendUrl || "http://localhost:3000";
  myCode.value = state.myCode;
}

async function saveState() {
  await chrome.storage.local.set({ doodleState: state });
}

// === Rendering ===
function renderFriends() {
  friendsList.innerHTML = "";
  friendSelect.innerHTML = "";

  if (state.friends.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add a friend first";
    friendSelect.appendChild(option);

    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No friends added yet";
    friendsList.appendChild(li);
  }

  state.friends.forEach((friend) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "friend-info";

    const nameEl = document.createElement("div");
    nameEl.className = "friend-name";
    nameEl.textContent = friend.name;

    const meta = document.createElement("div");
    meta.className = "friend-meta";
    meta.textContent = friend.code + (friend.phone ? " \u00b7 " + friend.phone : "");

    info.appendChild(nameEl);
    info.appendChild(meta);
    li.appendChild(info);

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-icon-sm";
    removeBtn.title = "Remove friend";
    removeBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>';
    removeBtn.addEventListener("click", () => removeFriend(friend.id));
    li.appendChild(removeBtn);

    friendsList.appendChild(li);

    const option = document.createElement("option");
    option.value = friend.id;
    option.textContent = friend.name;
    friendSelect.appendChild(option);
  });
}

function renderGallery(container, items, emptyText) {
  container.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = "Doodle";
    img.addEventListener("click", () => {
      loadDoodle(item.dataUrl);
      switchTab("draw");
    });

    const del = document.createElement("button");
    del.className = "card-delete";
    del.title = "Delete";
    del.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>';
    del.addEventListener("click", () => removeDoodle(item.id, container === inbox));

    card.appendChild(img);
    card.appendChild(del);
    container.appendChild(card);
  });
}

function renderMessagePreview() {
  const friend = state.friends.find((f) => f.id === friendSelect.value);
  const name = state.yourName || "Me";
  const link = friend?.code ? buildInboxLink(friend.code) : "";
  if (sendMode === "sms") {
    const phone = friend?.phone ? `to ${friend.phone}` : "";
    messagePreview.textContent = link
      ? `Doodle from ${name} ${phone}: ${link}`
      : "Add a friend to generate a link.";
  } else {
    messagePreview.textContent = link
      ? `Share this link with ${friend?.name || "friend"}: ${link}`
      : "Add a friend to generate a link.";
  }
}

function loadDoodle(dataUrl) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
    ctx.drawImage(img, 0, 0, canvasCssWidth, canvasCssHeight);
  };
  img.src = dataUrl;
}

// === Actions ===
async function addFriend(name, code, phone) {
  state.friends.push({ id: makeId(), name, code, phone: phone || "" });
  await saveState();
  renderFriends();
  renderMessagePreview();
  showToast(`${name} added!`);
}

async function removeFriend(id) {
  state.friends = state.friends.filter((f) => f.id !== id);
  await saveState();
  renderFriends();
  renderMessagePreview();
}

async function saveDoodle() {
  const dataUrl = canvas.toDataURL("image/png");
  state.doodles.unshift({ id: makeId(), dataUrl, createdAt: Date.now() });
  state.doodles = state.doodles.slice(0, 12);
  await saveState();
  renderGallery(gallery, state.doodles, "No doodles yet.");
  showToast("Doodle saved!");
}

async function removeDoodle(id, fromInbox) {
  if (fromInbox) {
    state.inbox = state.inbox.filter((d) => d.id !== id);
  } else {
    state.doodles = state.doodles.filter((d) => d.id !== id);
  }
  await saveState();
  renderGallery(gallery, state.doodles, "No doodles yet.");
  renderGallery(inbox, state.inbox, "Nothing in inbox yet.");
}

async function copyText(value, fallbackLabel) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (err) {
    alert(`Could not copy. ${fallbackLabel}:\n${value}`);
    return false;
  }
}

async function copyShareLink() {
  const friend = state.friends.find((f) => f.id === friendSelect.value);
  if (!friend?.code) {
    showToast("Add a friend with an invite code first");
    return;
  }
  const ok = await copyText(buildInboxLink(friend.code), "Link");
  if (ok) showToast("Link copied!");
}

async function postDoodle(toCode) {
  const payload = {
    toCode,
    fromCode: state.myCode,
    fromName: state.yourName || "",
    dataUrl: canvas.toDataURL("image/png")
  };
  const base = (state.backendUrl || "").replace(/\/$/, "");
  const url = `${base}/api/doodles`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Server ${response.status}: ${text}`);
  }
}

async function sendNow() {
  const friend = state.friends.find((f) => f.id === friendSelect.value);
  if (!friend?.code) {
    showToast("Select a friend first");
    return;
  }

  try {
    await postDoodle(friend.code);
  } catch (err) {
    console.error("Send failed:", err);
    showToast(err.message || "Could not send. Check backend.");
    return;
  }

  const link = buildInboxLink(friend.code);
  if (sendMode === "sms") {
    const body = `Doodle from ${state.yourName || "Me"}: ${link}`;
    if (friend.phone) {
      const smsUrl = `sms:${friend.phone}?&body=${encodeURIComponent(body)}`;
      window.open(smsUrl, "_blank");
      showToast("Opening SMS...");
    } else {
      const ok = await copyText(body, "SMS text");
      if (ok) showToast("SMS text copied!");
    }
  } else {
    const ok = await copyText(link, "Link");
    if (ok) showToast("Sent! Link copied.");
  }
}

async function syncInbox() {
  const base = (state.backendUrl || "").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/api/inbox/${state.myCode}`);
    const data = await response.json();
    if (!data.ok) throw new Error("bad response");
    state.inbox = (data.items || []).map((item) => ({
      id: String(item.id),
      dataUrl: item.dataUrl,
      createdAt: item.createdAt,
      from: item.fromName || ""
    }));
    await saveState();
    renderGallery(inbox, state.inbox, "Nothing in inbox yet.");
    const count = state.inbox.length;
    showToast(`Synced! ${count} doodle${count !== 1 ? "s" : ""}`);
  } catch (err) {
    showToast("Sync failed. Check backend URL.");
  }
}

function setSendMode(mode) {
  sendMode = mode;
  sendInExtensionBtn.classList.toggle("active", mode === "link");
  sendSmsBtn.classList.toggle("active", mode === "sms");
  renderMessagePreview();
}

// === Event Wiring ===
function wireEvents() {
  // Canvas drawing
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    startDraw(event);
  });
  canvas.addEventListener("pointermove", draw);
  canvas.addEventListener("pointerup", endDraw);
  canvas.addEventListener("pointerleave", endDraw);

  // Drawing tools
  eraserBtn.addEventListener("click", () => {
    usingEraser = !usingEraser;
    eraserBtn.classList.toggle("active", usingEraser);
  });
  clearBtn.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
    fillCanvas();
  });
  sizePicker.addEventListener("input", updateSizePreview);

  // Draw actions
  saveBtn.addEventListener("click", saveDoodle);
  sendBtn.addEventListener("click", sendNow);

  // Share actions
  sendNowBtn.addEventListener("click", sendNow);
  copyCodeBtn.addEventListener("click", copyShareLink);
  sendInExtensionBtn.addEventListener("click", () => setSendMode("link"));
  sendSmsBtn.addEventListener("click", () => setSendMode("sms"));
  friendSelect.addEventListener("change", renderMessagePreview);

  // Friend form
  friendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!friendName.value.trim() || !friendCode.value.trim()) return;
    await addFriend(friendName.value.trim(), friendCode.value.trim(), friendPhone.value.trim());
    friendName.value = "";
    friendCode.value = "";
    friendPhone.value = "";
  });

  // Settings
  yourName.addEventListener("input", async () => {
    state.yourName = yourName.value.trim();
    await saveState();
    renderMessagePreview();
  });
  backendUrl.addEventListener("change", async () => {
    state.backendUrl = backendUrl.value.trim() || "http://localhost:3000";
    backendUrl.value = state.backendUrl;
    await saveState();
    renderMessagePreview();
  });
  copyMyCodeBtn.addEventListener("click", async () => {
    const ok = await copyText(state.myCode, "Invite code");
    if (ok) showToast("Code copied!");
  });
  syncInboxBtn.addEventListener("click", syncInbox);
  settingsToggle.addEventListener("click", toggleSettings);

  // Tab navigation
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Gallery sub-tabs
  document.querySelectorAll(".gallery-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchGalleryTab(btn.dataset.gallery));
  });
}

// === Init ===
async function init() {
  await loadState();
  resizeCanvas();
  updateSizePreview();
  renderFriends();
  renderGallery(gallery, state.doodles, "No doodles yet.");
  renderGallery(inbox, state.inbox, "Nothing in inbox yet.");
  setSendMode("link");
  wireEvents();
  renderMessagePreview();
}

init();

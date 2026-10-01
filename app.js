const $ = id => document.getElementById(id);
let user = null, registering = false;

// Escape user text to prevent XSS
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function show(text, ok = false) {
  const m = $("msg");
  m.textContent = text; m.className = ok ? "ok" : "err";
  setTimeout(() => (m.textContent = ""), 3500);
}

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { show(data.error || "Something went wrong"); throw new Error(data.error); }
  return data;
}

function setUser(u) {
  user = u;
  $("auth").hidden = !!u; $("nav").hidden = !u;
  document.querySelectorAll(".tab").forEach(t => (t.hidden = true));
  document.querySelectorAll(".admin-only").forEach(e => (e.hidden = !(u && u.role === "admin")));
  if (u) { $("who").textContent = u.name; openTab("notices"); }
}

function openTab(name) {
  document.querySelectorAll(".tab").forEach(t => (t.hidden = t.id !== name));
  document.querySelectorAll("nav [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  ({ notices: loadNotices, events: loadEvents, items: loadItems })[name]();
}

document.querySelectorAll("nav [data-tab]").forEach(b => (b.onclick = () => openTab(b.dataset.tab)));

// ----- Auth -----
$("toggleAuth").onclick = e => {
  e.preventDefault(); registering = !registering;
  $("authTitle").textContent = $("authBtn").textContent = registering ? "Register" : "Login";
  $("a_name").hidden = $("a_dept").hidden = !registering;
  $("toggleAuth").textContent = registering ? "Have an account? Login" : "New here? Register";
};
$("authBtn").onclick = async () => {
  const email = $("a_email").value, password = $("a_pass").value;
  try {
    if (registering) {
      await api("/api/register", "POST", { name: $("a_name").value, department: $("a_dept").value, email, password });
      show("Registered! Please login.", true); $("toggleAuth").click();
    } else {
      await api("/api/login", "POST", { email, password });
      setUser((await api("/api/me")).user);
    }
  } catch (_) {}
};
$("logout").onclick = async () => { await api("/api/logout", "POST"); setUser(null); };

// ----- Notices -----
async function loadNotices() {
  const list = await api("/api/notices");
  $("n_list").innerHTML = list.map(n => `
    <div class="card"><span class="tag">${esc(n.category)}</span>
    <h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>
    <div class="meta">By ${esc(n.author)} · ${esc(n.created_at)}</div>
    ${user.role === "admin" ? `<button class="danger" onclick="delNotice(${n.id})">Delete</button>` : ""}</div>`).join("") || "<p>No notices yet.</p>";
}
$("n_add").onclick = async () => {
  await api("/api/notices", "POST", { title: $("n_title").value, category: $("n_cat").value, body: $("n_body").value });
  ["n_title", "n_cat", "n_body"].forEach(i => ($(i).value = "")); show("Notice posted", true); loadNotices();
};
window.delNotice = async id => { await api("/api/notices/" + id, "DELETE"); loadNotices(); };

// ----- Events -----
async function loadEvents() {
  const list = await api("/api/events");
  $("e_list").innerHTML = list.map(e => `
    <div class="card"><h3>${esc(e.title)}</h3>
    <div class="meta">📅 ${esc(e.event_date)} · 📍 ${esc(e.venue)} · 👥 ${e.attendees} going</div>
    <p>${esc(e.description)}</p>
    <button onclick="rsvp(${e.id})">${e.joined ? "Cancel RSVP" : "RSVP"}</button></div>`).join("") || "<p>No events yet.</p>";
}
$("e_add").onclick = async () => {
  await api("/api/events", "POST", { title: $("e_title").value, venue: $("e_venue").value, event_date: $("e_date").value, description: $("e_desc").value });
  ["e_title", "e_venue", "e_date", "e_desc"].forEach(i => ($(i).value = "")); show("Event created", true); loadEvents();
};
window.rsvp = async id => { await api(`/api/events/${id}/rsvp`, "POST"); loadEvents(); };

// ----- Lost & Found -----
async function loadItems() {
  const list = await api("/api/items");
  $("i_list").innerHTML = list.map(i => `
    <div class="card"><span class="tag ${i.status === "resolved" ? "resolved" : i.kind}">${i.status === "resolved" ? "resolved" : i.kind}</span>
    <h3>${esc(i.item)}</h3><p>${esc(i.description)}</p>
    <div class="meta">Posted by ${esc(i.poster)} · Contact: ${esc(i.contact)}</div>
    ${i.status === "open" && (i.user_id === user.id || user.role === "admin") ? `<button onclick="resolveItem(${i.id})">Mark resolved</button>` : ""}</div>`).join("") || "<p>Nothing reported.</p>";
}
$("i_add").onclick = async () => {
  await api("/api/items", "POST", { kind: $("i_kind").value, item: $("i_item").value, contact: $("i_contact").value, description: $("i_desc").value });
  ["i_item", "i_contact", "i_desc"].forEach(i => ($(i).value = "")); show("Item posted", true); loadItems();
};
window.resolveItem = async id => { await api(`/api/items/${id}/resolve`, "POST"); loadItems(); };

// ----- Start -----
api("/api/me").then(r => setUser(r.user));

const socket = io();
const $ = id => document.getElementById(id);
let roomId = null, localStream = null, muted = false;
const peers = new Map();
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function showRoom() { $("welcome").classList.add("hidden"); $("room").classList.remove("hidden"); }
function makeId() { return Math.random().toString(36).slice(2, 9).toUpperCase(); }
async function enter(id) {
  const name = $("name").value.trim();
  if (!name) return alert("اكتب اسمك أولاً.");
  roomId = id;
  $("status").textContent = "نطلب إذن استخدام المايك…";
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch (e) {
    $("status").textContent = "لم يتم تشغيل المايك. اسمح للمتصفح باستخدام المايك ثم أعد المحاولة.";
    return;
  }
  showRoom();
  $("roomTitle").textContent = "غرفة " + roomId;
  $("inviteLink").value = location.origin + "/?room=" + roomId;
  socket.emit("join-room", { roomId, name });
}
function addPeer(id, offerer) {
  if (peers.has(id)) return peers.get(id);
  const pc = new RTCPeerConnection(config);
  peers.set(id, pc);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = e => {
    let audio = document.getElementById("audio-" + id);
    if (!audio) { audio = document.createElement("audio"); audio.id = "audio-" + id; audio.autoplay = true; audio.playsInline = true; document.body.appendChild(audio); }
    audio.srcObject = e.streams[0];
    audio.play().catch(()=>{});
  };
  pc.onicecandidate = e => { if (e.candidate) socket.emit("signal", { to:id, data:{ candidate:e.candidate } }); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") $("status").textContent = "أنت متصل بالغرفة. شارك رابط الدعوة مع صديقك.";
  };
  if (offerer) pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>socket.emit("signal",{to:id,data:{description:pc.localDescription}})).catch(console.error);
  return pc;
}
$("createBtn").onclick = () => enter(makeId());
$("joinBtn").onclick = () => {
  let id = $("roomInput").value.trim();
  try { if (id.includes("room=")) id = new URL(id).searchParams.get("room"); } catch {}
  if (!id) return alert("الصق رابط الدعوة أو رمز الغرفة.");
  enter(id.toUpperCase());
};
$("copyBtn").onclick = async () => {
  try { await navigator.clipboard.writeText($("inviteLink").value); $("copyBtn").textContent="تم النسخ ✓"; }
  catch { $("inviteLink").select(); document.execCommand("copy"); $("copyBtn").textContent="تم النسخ ✓"; }
};
$("muteBtn").onclick = () => {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach(t=>t.enabled=!muted);
  $("muteBtn").innerHTML = (muted ? "🔇<small>تشغيل المايك</small>" : "🎙️<small>كتم المايك</small>");
  socket.emit("mute-state", muted);
};
$("leaveBtn").onclick = () => {
  if (localStream) localStream.getTracks().forEach(t=>t.stop());
  peers.forEach(pc=>pc.close()); peers.clear();
  document.querySelectorAll("audio[id^='audio-']").forEach(a=>a.remove());
  location.href = location.pathname;
};
socket.on("joined", ({peers: existing}) => {
  $("status").textContent = "تم دخول الغرفة. بانتظار صديقك…";
  existing.forEach(id=>addPeer(id,true));
});
socket.on("peer-joined", ({id}) => addPeer(id,false));
socket.on("signal", async ({from,data}) => {
  const pc = addPeer(from,false);
  try {
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      if (data.description.type === "offer") {
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.emit("signal",{to:from,data:{description:pc.localDescription}});
      }
    } else if (data.candidate) await pc.addIceCandidate(data.candidate);
  } catch(e) { console.error(e); }
});
socket.on("peer-left", ({id}) => {
  if (peers.has(id)) { peers.get(id).close(); peers.delete(id); }
  const audio=$("audio-"+id); if(audio) audio.remove();
});
socket.on("join-error", msg => { alert(msg); location.href=location.pathname; });
socket.on("users", users => {
  $("count").textContent = users.length + " / 8";
  $("people").innerHTML = users.map(u=>`<div class="person"><div class="avatar">👤</div><strong>${escapeHtml(u.name)}${u.id===socket.id?" (أنت)":""}</strong><small>${u.muted?"الميكروفون مكتوم":"داخل الغرفة"}</small></div>`).join("");
});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("chatForm").onsubmit = e => { e.preventDefault(); const text=$("chatInput").value.trim(); if(text){socket.emit("chat",{text});$("chatInput").value="";} };
socket.on("chat", m => { const d=document.createElement("div");d.className="msg";d.innerHTML=`<b>${escapeHtml(m.name)}</b>: ${escapeHtml(m.text)}`; $("messages").appendChild(d);$("messages").scrollTop=$("messages").scrollHeight; });
const invite = new URLSearchParams(location.search).get("room");
if(invite){$("roomInput").value=invite;$("eyebrow");}
